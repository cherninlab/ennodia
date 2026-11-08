import { pragmaticSchema } from "./pragmatic";
import { McpServer, type RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { compositionalSliceSchema } from "./compositional";
import {
  createDefaultEnnodiaCore,
  type EnnodiaCore,
  type EnnodiaCoreShutdownOptions,
} from "./core";
import { renderPlanMermaid } from "./planner";
import { formatHarnessPriorityList } from "./priority";
import { ENNODIA_VERSION } from "./version";
import { REASONING_EFFORTS, type HarnessDiscovery } from "./harnesses";
import { HarnessReadinessError, harnessAttention, type HarnessAttention, type HarnessCheckInput } from "./readiness";
import type { InstallationReport } from "./installation";

const defaultCore = createDefaultEnnodiaCore();
const comparePriorityText = formatHarnessPriorityList();

const categorySchema = z
  .enum(["code", "research", "browser", "image", "general"])
  .describe(
    "Optional caller-provided route category. Pass this when you know the task category; Ennodia then skips keyword classification.",
  );

const reasoningEffortSchema = z
  .enum(REASONING_EFFORTS)
  .describe(
    "Optional reasoning effort for a Codex worker. Other harnesses reject explicit effort settings; omit to preserve native defaults.",
  );

const budgetSchema = z
  .object({
    maxEstimatedInputTokens: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Fail before starting if the estimated run input tokens exceed this value.",
      ),
    maxChildTasks: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Fail before starting if routing selects more child harness tasks than this value.",
      ),
  })
  .describe("Optional preflight budget limits for an Ennodia operation.");

export type EnnodiaShutdownOptions = EnnodiaCoreShutdownOptions;

/** Every tool definition is loaded into each session of every agent that
 * has Ennodia configured, even when Ennodia is never called. The core set
 * covers handing work to one agent or a team, Compare, waiting, and
 * cancelling. The full set adds raw tasks, compositional slices, Plan
 * Advisor, budget estimates, and skill installation. */
export const CORE_TOOL_NAMES: readonly string[] = [
  "ennodia_run",
  "ennodia_get_run",
  "ennodia_cancel_run",
  "ennodia_list_harnesses",
  "ennodia_setup",
  "ennodia_check_harnesses",
  "ennodia_list_skills",
  "ennodia_history",
];

/** Clients such as Codex run read-only tools without an approval prompt,
 * so polling a run never stops for approval. Tools that start agents reach
 * model providers, and their workers can change files when the caller allows
 * it, so they claim neither read-only nor harmless. */
export function toolAnnotations(name: string): { readOnlyHint: boolean; openWorldHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean } {
  if (name === "ennodia_setup") return { readOnlyHint: true, openWorldHint: true };
  if (/^ennodia_(?:list_|get_|history$|plan$|estimate_)/.test(name)) return { readOnlyHint: true, openWorldHint: false };
  if (name.startsWith("ennodia_cancel_")) return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  if (name === "ennodia_install_skills") return { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  return { readOnlyHint: false, openWorldHint: true };
}

export const TOOL_SETS = ["core", "all"] as const;
export type ToolSet = (typeof TOOL_SETS)[number];

export type EnnodiaServerOptions = {
  /** Defaults to "core". */
  tools?: ToolSet;
};

export function createEnnodiaServer(
  core: EnnodiaCore = defaultCore,
  options: EnnodiaServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: "ennodia",
    version: ENNODIA_VERSION,
  }, { instructions: `When the user asks to set up Ennodia or recover a blocked route, call ennodia_setup to open native setup controls inside the current harness session. Clients without form elicitation receive the Markdown fallback. The user selects a route and recovery guidance, native recheck, or model verification. Do not repeat the form after dismissal unless requested. A decline may be automatic: report it without claiming the host displayed controls or a person clicked them. Discovery, recheck and preflight errors include an ennodia://setup Markdown resource: render it as a compact card with route, access state, next action and recheck. Do not stop at a generic healthy/unverified status summary. Never claim buttons or commands executed unless they did. Explain the native sign-in or provider configuration step, then recheck the same harness/model after the user completes it. Never collect credentials in chat or silently switch account/provider/model. Unverified means unchecked, not failed. ennodia_run verifies its selected routes automatically; checking every installed harness is not a prerequisite. A verified default route does not prove access to other models. Report blockers affecting requested routes and installation limitations before starting reviews; unrelated blockers must not hold up authorized work on usable routes. Follow existing user authorization and the host's approval policy; do not invent an additional approval step. The following local installation self-check does not verify provider access or latest registry versions. Run ennodia_check_harnesses after recovery or installation changes.\n${JSON.stringify(core.getInstallation?.())}` });

  // Keep each registration, so the core set can drop the others below, and
  // add the annotations that tell clients which calls only read.
  const registered = new Map<string, RegisteredTool>();
  const registerTool = server.registerTool.bind(server) as (name: string, config: { annotations?: object }, ...rest: unknown[]) => RegisteredTool;
  server.registerTool = ((name: string, config: { annotations?: object }, ...rest: unknown[]) => {
    const handler = rest[rest.length - 1] as (...args: unknown[]) => Promise<unknown>;
    rest[rest.length - 1] = async (...args: unknown[]) => {
      try { return await handler(...args); }
      catch (error) {
        if (error instanceof HarnessReadinessError) {
          const installation = core.getInstallation?.();
          return { ...setupResult({ error: error.message, installation, actionRequired: error.actionRequired, coverage: { started: 0 } }, error.actionRequired, installation), isError: true };
        }
        throw error;
      }
    };
    const tool = registerTool(name, { ...config, annotations: { ...toolAnnotations(name), ...config.annotations } }, ...rest);
    registered.set(name, tool);
    return tool;
  }) as McpServer["registerTool"];

  server.registerTool(
    "ennodia_list_harnesses",
    {
      title: "List Ennodia harnesses",
      description:
        "Discover supported harness entries, installation status and cached readiness/recovery actions. Unverified means unchecked, not failed; ennodia_run verifies selected routes automatically. Report blockers with their specific recovery actions. Read inputGuidance before media work.",
      inputSchema: {
        refresh: z
          .boolean()
          .default(false)
          .describe(
            "Re-scan available harnesses instead of returning the short-lived discovery cache.",
          ),
      },
    },
    async ({ refresh }) => {
      const harnesses = await core.listHarnesses({ refresh });
      return setupResult(harnesses, harnesses, core.getInstallation?.());
    },
  );

  server.registerTool("ennodia_setup", {
    title: "Open Ennodia setup",
    description: "Open native route/action choices in this harness session, with Markdown fallback. Show recovery steps, recheck native status, or verify model access only when selected (uses provider capacity). Never installs, upgrades, signs in, changes credentials, or starts reviewers.",
    inputSchema: {
      harnessIds: z.array(z.string().min(1)).min(1).optional().describe("Limit choices to these harnesses. Pass one to open its action form directly."),
      model: z.string().min(1).optional().describe("Exact model to retain during the selected recheck or verification."),
      cwd: z.string().optional().describe("Workspace identity for readiness evidence."),
    },
  }, async (input, extra) => interactiveSetup(server, core, { ...input, refresh: true }, extra.signal));

  server.registerTool("ennodia_check_harnesses", {
    title: "Recheck or upgrade Ennodia harnesses",
    description: "Recheck Ennodia's installation and recover affected harnesses. Return installation scope, runtime/package/storage limitations, native recovery commands and actionRequired. Target affected harnessIds; unrelated blockers do not prevent authorized work on usable routes. verify makes a small real model call; upgrade runs supported updaters before rechecking. Never switch account/provider/model silently.",
    inputSchema: {
      harnessIds: z.array(z.string().min(1)).min(1).optional().describe("Harnesses to recheck. Omit for all installed harnesses."),
      model: z.string().min(1).optional().describe("Exact model to verify on the selected route."),
      cwd: z.string().optional().describe("Workspace identity for the readiness receipt; probes run in an empty temporary directory."),
      refresh: z.boolean().default(true).describe("Invalidate cached readiness and recheck native status."),
      verify: z.boolean().default(false).describe("Verify each selected route with a bounded real model request. Uses provider capacity."),
      upgrade: z.boolean().default(false).describe("Run supported updaters now, then rediscover and recheck. Deferred while Ennodia tasks are active."),
    },
  }, async input => {
    const result = await core.checkHarnesses(input);
    return setupResult(result, result.harnesses, result.installation, input.cwd);
  });

  server.registerTool(
    "ennodia_list_skills",
    {
      title: "List Ennodia skills",
      description:
        "Discover prompt-only skills from project, user, and built-in skill directories without returning full instruction text.",
      inputSchema: {
        cwd: z
          .string()
          .optional()
          .describe("Optional working directory to locate project-specific skills."),
      },
    },
    async ({ cwd }) => jsonResult(await core.listSkills(cwd)),
  );

  server.registerTool(
    "ennodia_install_skills",
    {
      title: "Install Ennodia skills",
      description:
        "Install bundled Ennodia Agent Skills into native harness skill directories. Defaults to dryRun so clients can inspect planned writes before applying them.",
      inputSchema: {
        skillIds: z
          .array(z.string())
          .optional()
          .describe(
            "Bundled skill IDs to install. Omit to install every bundled Ennodia skill.",
          ),
        harnessIds: z
          .array(z.enum(["codex", "claude-code", "opencode", "antigravity"]))
          .optional()
          .describe(
            "Native harness skill locations to install into. Omit to target Codex, Claude Code, OpenCode, and Antigravity.",
          ),
        scope: z
          .enum(["project", "user"])
          .default("project")
          .describe("Install into project-local or user-global skill directories."),
        cwd: z
          .string()
          .optional()
          .describe("Project directory used when scope is project."),
        overwrite: z
          .boolean()
          .default(false)
          .describe("Replace an existing skill folder at the target path."),
        dryRun: z
          .boolean()
          .default(true)
          .describe("Preview planned writes without copying files. Set false to install."),
      },
    },
    async (input) => jsonResult(await core.installSkills(input)),
  );

  server.registerTool(
    "ennodia_plan",
    {
      title: "Plan an Ennodia route",
      description:
        "Classify a prompt and preview the route Ennodia would take without starting any child process. Use before ennodia_run when you want to inspect routing.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .describe("The task to classify and route."),
        category: categorySchema.optional(),
        refresh: z
          .boolean()
          .default(false)
          .describe("Re-scan harnesses before planning."),
        includeMermaid: z
          .boolean()
          .default(true)
          .describe("Include the presentational Mermaid route diagram."),
      },
    },
    async ({ prompt, category, refresh, includeMermaid }) => {
      const plan = await core.plan(prompt, { category, refresh });
      return jsonResult(includeMermaid
        ? { ...plan, mermaid: renderPlanMermaid(plan) }
        : plan);
    },
  );

  server.registerTool(
    "ennodia_start_plan_advice",
    {
      title: "Start Ennodia Plan Advisor",
      description:
        "Ask one Advisor to propose a bounded team of harness, model, and skill assignments. This starts only the Advisor task: its output is strict, inert plan data that Ennodia validates and never executes automatically. Poll ennodia_get_plan_advice, then explicitly call ennodia_start_advised_plan with the returned digest.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .describe("The work for which the Advisor should propose a team."),
        cwd: z
          .string()
          .optional()
          .describe(
            "Optional target working directory used only to discover available skills. The Advisor task runs in a separate empty temporary directory.",
          ),
        refresh: z
          .boolean()
          .default(false)
          .describe(
            "Re-scan harnesses before freezing the Advisor inventory snapshot.",
          ),
        advisorHarnessId: z
          .string()
          .optional()
          .describe(
            `Harness to run the Plan Advisor. Omit to use the default priority: ${comparePriorityText}.`,
          ),
        advisorModel: z
          .string()
          .optional()
          .describe("Optional model override for the Plan Advisor task."),
        allowedHarnessIds: z
          .array(z.string().min(1))
          .min(1)
          .max(64)
          .optional()
          .describe(
            "Worker harness IDs the Advisor may select. Omit to allow every runnable public Ennodia adapter.",
          ),
        allowedModels: z
          .record(z.string().min(1), z.array(z.string().min(1)).max(128))
          .optional()
          .describe(
            "Exact caller-approved worker model IDs by harness. A model omitted by the Advisor uses that harness's default.",
          ),
        maxSlices: z
          .number()
          .int()
          .min(1)
          .max(64)
          .optional()
          .describe("Maximum explicit worker slices the Advisor may propose."),
        maxSkillsPerSlice: z
          .number()
          .int()
          .min(0)
          .max(64)
          .optional()
          .describe("Maximum installed native skills assigned to one slice."),
        maxTotalSkillAssignments: z
          .number()
          .int()
          .min(0)
          .max(1_024)
          .optional()
          .describe("Maximum skill assignments across the complete plan."),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .max(60 * 60 * 1000)
          .optional()
          .describe(
            "Timeout for the single Plan Advisor task in milliseconds, capped at one hour.",
          ),
        budget: budgetSchema.optional(),
      },
    },
    async (input) => jsonResult(await core.startPlanAdvice(input)),
  );

  server.registerTool(
    "ennodia_list_plan_advice",
    {
      title: "List Ennodia plan advice",
      description:
        "List recent Plan Advisor requests started by this Ennodia MCP server process.",
      inputSchema: {
        includeProposal: z
          .boolean()
          .default(false)
          .describe("Include the untrusted model-authored proposal when available."),
        includePlan: z
          .boolean()
          .default(false)
          .describe("Include the validated inert execution plan when ready."),
        includeEvents: z
          .boolean()
          .default(false)
          .describe("Include bounded Plan Advisor event history."),
        maxEvents: z
          .number()
          .int()
          .nonnegative()
          .max(300)
          .default(25)
          .describe(
            "Maximum Plan Advisor events per item when includeEvents is true.",
          ),
      },
    },
    async (options) => jsonResult(core.listPlanAdvice(options)),
  );

  server.registerTool(
    "ennodia_get_plan_advice",
    {
      title: "Get Ennodia plan advice",
      description:
        "Inspect Plan Advisor status, validation issues, frozen inventory identity, proposal, validated plan, digest, budgets, events, and ETA. A plan can be launched only when status is ready. An authorized plan has status consumed and cannot run again.",
      inputSchema: {
        adviceId: z
          .string()
          .min(1)
          .describe("Plan advice ID returned by ennodia_start_plan_advice."),
        includeProposal: z
          .boolean()
          .default(true)
          .describe("Include the untrusted model-authored proposal when available."),
        includePlan: z
          .boolean()
          .default(true)
          .describe("Include the validated inert execution plan when ready."),
        includeEvents: z
          .boolean()
          .default(true)
          .describe("Include bounded Plan Advisor event history."),
        maxEvents: z
          .number()
          .int()
          .nonnegative()
          .max(300)
          .default(100)
          .describe("Maximum Plan Advisor events to include. Use 0 to omit events."),
      },
    },
    async ({ adviceId, ...options }) => {
      const advice = core.getPlanAdvice(adviceId, options);
      if (!advice) {
        throw new Error(`Unknown plan advice: ${adviceId}`);
      }

      return jsonResult(advice);
    },
  );

  server.registerTool(
    "ennodia_cancel_plan_advice",
    {
      title: "Cancel Ennodia plan advice",
      description: "Cancel a running Plan Advisor request and its Advisor task.",
      inputSchema: {
        adviceId: z
          .string()
          .min(1)
          .describe("Plan advice ID returned by ennodia_start_plan_advice."),
      },
    },
    async ({ adviceId }) => jsonResult(core.cancelPlanAdvice(adviceId)),
  );

  server.registerTool(
    "ennodia_start_advised_plan",
    {
      title: "Start an Ennodia advised plan",
      description:
        "Explicitly launch the exact validated worker plan from a ready Plan Advisor request. Ennodia re-checks the caller-supplied digest, current harness and skill inventory, caller allowlisted model assignments, and budget before starting the first worker task; any mismatch fails closed with zero launches. A plan is single-use after authorization. Provider model availability remains unverified until the harness runs.",
      inputSchema: {
        adviceId: z
          .string()
          .min(1)
          .describe("Ready plan advice ID returned by ennodia_start_plan_advice."),
        expectedPlanDigest: z
          .string()
          .min(1)
          .describe(
            "Exact planDigest returned by ennodia_get_plan_advice for explicit, stale-plan-safe execution.",
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Working directory for worker tasks. Omit to reuse the directory whose skills were inventoried.",
          ),
        isolateCwd: z
          .boolean()
          .optional()
          .describe(
            "Run each worker against an ephemeral isolated copy of cwd so parallel writes cannot clobber each other. Isolation fails before task spawn if the copied tree contains a symbolic link. The execution path is reported as the task cwd for traceability and deleted when the task becomes terminal.",
          ),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .max(60 * 60 * 1000)
          .optional()
          .describe(
            "Per-worker timeout in milliseconds, capped at one hour.",
          ),
        budget: budgetSchema.optional(),
      },
    },
    async (input) => jsonResult(await core.startAdvisedPlan(input)),
  );

  server.registerTool(
    "ennodia_estimate_budget",
    {
      title: "Estimate Ennodia budget",
      description:
        "Estimate the input-token budget for a planned Ennodia run and report whether optional limits would be exceeded before starting child tasks.",
      inputSchema: {
        model: z.string().optional().describe("Optional model override. Omit to use the selected harness default."),
        pragmatic: pragmaticSchema.optional(),
        prompt: z
          .string()
          .min(1)
          .describe("The user task to route and estimate."),
        category: categorySchema.optional(),
        harnessId: z
          .string()
          .optional()
          .describe(
            "Force one harness by ID for the estimate, such as opencode or claude-code.",
          ),
        mode: z
          .enum(["auto", "single", "parallel"])
          .default("auto")
          .describe(
            "auto follows the planner; single estimates one selected harness; parallel estimates all candidate harnesses.",
          ),
        compare: z
          .union([z.literal("auto"), z.boolean()])
          .default("auto")
          .describe(
            "Whether the Judge + Result Advisor comparison should be included in the estimate. auto follows the planner.",
          ),
        refresh: z
          .boolean()
          .default(false)
          .describe("Re-scan harnesses before planning the estimate."),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .optional()
          .describe(
            "Maximum characters from each successful task output assumed for Judge + Result Advisor input.",
          ),
        budget: budgetSchema.optional(),
      },
    },
    async (input) => jsonResult(await core.estimateRun(input)),
  );

  server.registerTool(
    "ennodia_estimate_compositional_budget",
    {
      title: "Estimate compositional Ennodia budget",
      description:
        "Resolve focused compositional slices to harnesses and estimate child-task and later Judge + Result Advisor budget without starting child processes.",
      inputSchema: {
        pragmatic: pragmaticSchema.optional(),
        prompt: z
          .string()
          .min(1)
          .describe(
            "Overall task or question that every slice belongs to.",
          ),
        slices: z
          .array(compositionalSliceSchema)
          .min(1)
          .max(50)
          .describe(
            "Focused work slices. Each slice resolves to at most one child task.",
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Optional working directory used to validate requested native skills.",
          ),
        refresh: z
          .boolean()
          .default(false)
          .describe("Re-scan harnesses before resolving slice routes."),
        skillIds: z
          .array(z.string())
          .optional()
          .describe(
            "Default installed native skill IDs for slices that omit slice.skillIds. A slice-level list, including [], replaces this default.",
          ),
        includeCompareEstimate: z
          .boolean()
          .default(true)
          .describe(
            "Include a later Judge + Result Advisor pass in the returned preflight budget estimate.",
          ),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .optional()
          .describe(
            "Maximum characters per successful slice output assumed for a later Judge + Result Advisor estimate.",
          ),
        budget: budgetSchema.optional(),
      },
    },
    async (input) => jsonResult(await core.estimateCompositional(input)),
  );

  server.registerTool(
    "ennodia_start",
    {
      title: "Start an Ennodia task",
      description:
        "Start raw child harness tasks without a run-level Judge + Result Advisor pass. Use for debugging, direct harness calls, or manual comparison workflows; prefer ennodia_run for normal end-to-end use.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .describe("The task to send to the selected local harness or harnesses. For native media, first read ennodia_list_harnesses inputGuidance, specify local paths and a harness/model, then verify one small sample before comparison. Ennodia sends text, not media attachments."),
        category: categorySchema.optional(),
        harnessId: z
          .string()
          .optional()
          .describe(
            "Force one harness by ID, such as codex or claude-code. Omit to let Ennodia pick from the plan.",
          ),
        mode: z
          .enum(["single", "parallel"])
          .default("single")
          .describe(
            "single starts the selected or top-ranked harness; parallel starts every planned candidate.",
          ),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for child harness commands."),
        isolateCwd: z
          .boolean()
          .optional()
          .describe(
            "Run each task against an ephemeral isolated copy of cwd instead of cwd itself. Use this whenever starting more than one task against the same cwd (e.g. comparing skills or harnesses), so concurrent file writes cannot clobber each other. Isolation fails before task spawn if the copied tree contains a symbolic link. The reported task cwd is an execution trace; its temporary directory is deleted when the task becomes terminal.",
          ),
        model: z
          .string()
          .optional()
          .describe("Optional model override passed through to harnesses that support it."),
        reasoningEffort: reasoningEffortSchema.optional(),
        nativeSubagents: z.literal("disabled").optional().describe("Disable Codex built-in subagent tools for workers. Other harnesses reject this setting. Does not block external commands or affect Judge/Advisor tasks."),
        nativeSandbox: z.enum(["read-only", "workspace-write"]).optional().describe("Codex worker native sandbox. Defaults to read-only on every turn, including continuation. Request workspace-write only for authorized edits. Other harnesses reject this setting; Judge/Advisor settings are unchanged."),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .max(60 * 60 * 1000)
          .optional()
          .describe(
            "Per-task timeout in milliseconds. Defaults to the task manager timeout and is capped at one hour.",
          ),
        refresh: z
          .boolean()
          .default(false)
          .describe("Re-scan harnesses before planning and starting tasks."),
        skillIds: z
          .array(z.string())
          .optional()
          .describe(
            "Installed native skill IDs to request from the selected harness. Returned metadata does not prove that the agent loaded the skill.",
          ),
        budget: budgetSchema.optional(),
      },
    },
    async (input) => jsonResult(await core.startTasks(input)),
  );

  server.registerTool(
    "ennodia_start_compositional",
    {
      title: "Start compositional Ennodia tasks",
      description:
        "Start one focused child task per slice for compositional reviews. Poll the returned task IDs, then pass useful completed task IDs to ennodia_start_compare for a Judge + Result Advisor comparison.",
      inputSchema: {
        pragmatic: pragmaticSchema.optional(),
        prompt: z
          .string()
          .min(1)
          .describe(
            "Overall task or question that every slice belongs to.",
          ),
        slices: z
          .array(compositionalSliceSchema)
          .min(1)
          .max(50)
          .describe(
            "Focused work slices. Each slice starts at most one child task.",
          ),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for child harness commands."),
        isolateCwd: z
          .boolean()
          .optional()
          .describe(
            "Run each slice's task against an ephemeral isolated copy of cwd instead of cwd itself, so slices that write files cannot clobber each other. Isolation fails before task spawn if the copied tree contains a symbolic link. The reported task cwd is an execution trace; its temporary directory is deleted when the task becomes terminal.",
          ),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .max(60 * 60 * 1000)
          .optional()
          .describe(
            "Per-slice task timeout in milliseconds. Defaults to the task manager timeout and is capped at one hour.",
          ),
        refresh: z
          .boolean()
          .default(false)
          .describe("Re-scan harnesses before resolving slice routes."),
        skillIds: z
          .array(z.string())
          .optional()
          .describe(
            "Default installed native skill IDs for slices that omit slice.skillIds. A slice-level list, including [], replaces this default.",
          ),
        includeCompareEstimate: z
          .boolean()
          .default(true)
          .describe(
            "Include a later Judge + Result Advisor pass in the returned preflight budget estimate.",
          ),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .optional()
          .describe(
            "Maximum characters per successful slice output assumed for a later Judge + Result Advisor estimate.",
          ),
        budget: budgetSchema.optional(),
      },
    },
    async (input) => {
      const result = await core.startCompositional(input);

      return jsonResult({
        ...result,
        compareNext: {
          tool: "ennodia_start_compare",
          ...result.compareNext,
        },
      });
    },
  );

  server.registerTool(
    "ennodia_run",
    {
      title: "Run Ennodia",
      description:
        "Start a high-level Ennodia orchestration. Set pragmatic for evidence-focused investigation or patch proposals with one or more independent workers. Use Plan Advisor for tailored model and skill assignments. Use this as the default entrypoint: it plans routing, starts one or more local harness tasks, optionally compares successful outputs, and returns a run ID. Runs usually take minutes; use ennodia_get_run with waitMs: 30000 and includeEvents: false until terminal, then consume and verify its answer. A wait timeout does not cancel or finish the run.",
      inputSchema: {
        pragmatic: pragmaticSchema.optional(),
        prompt: z
          .string()
          .min(1)
          .describe("The user task to route to local AI harnesses. For native media, first read ennodia_list_harnesses inputGuidance, specify local paths and a harness/model, then verify one small sample with mode single and compare false. Ennodia sends text, not media attachments."),
        category: categorySchema.optional(),
        harnessId: z
          .string()
          .optional()
          .describe(
            "Force one harness by ID, such as codex or claude-code. Omit to let Ennodia plan.",
          ),
        mode: z
          .enum(["auto", "single", "parallel"])
          .default("auto")
          .describe(
            "auto follows the planner; single runs one selected harness; parallel runs all candidate harnesses.",
          ),
        compare: z
          .union([z.literal("auto"), z.boolean()])
          .default("auto")
          .describe(
            "Whether to run the Judge + Result Advisor after tasks finish. auto compares when the planner sees value and at least two tasks produce output.",
          ),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for child harness commands."),
        isolateCwd: z
          .boolean()
          .optional()
          .describe(
            "Run each selected harness against an ephemeral isolated copy of cwd instead of cwd itself. Use this in parallel mode or whenever comparing skills/harnesses against the same cwd, so concurrent file writes cannot clobber each other. Isolation fails before task spawn if the copied tree contains a symbolic link. The reported task cwd is an execution trace; its temporary directory is deleted when the task becomes terminal.",
          ),
        model: z
          .string()
          .optional()
          .describe("Optional model override passed to the selected task harnesses."),
        persistSession: z.boolean().optional().describe("Opt in to native Codex session persistence. Requires one explicit harness and a persistent cwd. Default tasks remain ephemeral."),
        continueTaskId: z.string().optional().describe("Continue the latest settled persistent task owned by this server. Use its Ennodia task ID. The working directory and harness stay the same. Each follow-up gets a new task and execution allowance."),
        reasoningEffort: reasoningEffortSchema.optional(),
        nativeSubagents: z.literal("disabled").optional().describe("Disable Codex built-in subagent tools for workers. Other harnesses reject this setting. Does not block external commands or affect Judge/Advisor tasks."),
        nativeSandbox: z.enum(["read-only", "workspace-write"]).optional().describe("Codex worker native sandbox. Defaults to read-only on every turn, including continuation. Request workspace-write only for authorized edits. Other harnesses reject this setting; Judge/Advisor settings are unchanged."),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .max(60 * 60 * 1000)
          .optional()
          .describe(
            "Per-task timeout in milliseconds. Defaults to the task manager timeout and is capped at one hour.",
          ),
        refresh: z
          .boolean()
          .default(false)
          .describe("Re-scan harnesses before planning the run."),
        judgeHarnessId: z
          .string()
          .optional()
          .describe(
            `Harness to use as the comparison Judge. Omit to use the default priority: ${comparePriorityText}.`,
          ),
        judgeModel: z
          .string()
          .optional()
          .describe("Optional model override for the comparison Judge."),
        advisorHarnessId: z
          .string()
          .optional()
          .describe(
            "Harness that runs the Result Advisor after the Judge. Defaults to the judge harness selection.",
          ),
        advisorModel: z
          .string()
          .optional()
          .describe("Optional model override for the Result Advisor."),
        synthesizerHarnessId: z
          .string()
          .optional()
          .describe(
            "Deprecated alias for advisorHarnessId. Do not send both fields with different values.",
          ),
        synthesizerModel: z
          .string()
          .optional()
          .describe(
            "Deprecated alias for advisorModel. Do not send both fields with different values.",
          ),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .optional()
          .describe(
            "Maximum characters from each successful task output to pass into the Judge + Result Advisor workflow. Use 0 to suppress candidate text.",
          ),
        skillIds: z
          .array(z.string())
          .optional()
          .describe(
            "Installed native skill IDs to request from child harnesses. Returned metadata does not prove that an agent loaded the skill.",
          ),
        budget: budgetSchema.optional(),
      },
    },
    async (input) => jsonResult(await core.startRun(input)),
  );

  server.registerTool(
    "ennodia_list_runs",
    {
      title: "List Ennodia runs",
      description: "List high-level Ennodia runs started by this MCP server process.",
      inputSchema: {
        includeEvents: z
          .boolean()
          .default(false)
          .describe("Include bounded run event history for each listed run."),
        maxEvents: z
          .number()
          .int()
          .nonnegative()
          .max(300)
          .default(25)
          .describe("Maximum run events to include per run when includeEvents is true."),
        maxAnswerChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .default(2_000)
          .describe(
            "Maximum final-answer characters to include per run. Use 0 to omit answer text.",
          ),
      },
    },
    async (options) => jsonResult(core.listRuns(options)),
  );

  server.registerTool(
    "ennodia_history",
    {
      title: "List durable Ennodia run history",
      description:
        "Read terminal run receipts persisted under the local Ennodia history directory. Use after a restart to inspect previous final answers and Judge disagreement analysis.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .default(20)
          .describe("Maximum persisted run snapshots to return, newest first."),
      },
    },
    async ({ limit }) => jsonResult(await core.listRunHistory({ limit })),
  );

  server.registerTool(
    "ennodia_get_run",
    {
      title: "Get Ennodia run",
      description:
        "Inspect a run or wait up to waitMs for completion. Prefer waitMs: 30000, compact: true and includeEvents: false while awaiting results. A nonterminal response means work continues; do not claim its findings were consumed.",
      inputSchema: {
        runId: z.string().min(1).describe("Run ID returned by ennodia_run."),
        compact: z.boolean().default(false).describe("Omit repeated routing, budget, prompt preview and skill metadata. Preserve status, timing, task IDs, answers and errors. Answer and event limits still apply. Use false for full diagnostics."),
        waitMs: z.number().int().min(0).max(300000).default(0).describe("Wait for a terminal state without cancelling or extending the run. Use 30000 for ordinary polling. Longer waits require a client tool timeout greater than waitMs."),
        includeEvents: z
          .boolean()
          .default(true)
          .describe("Include bounded run event history."),
        maxEvents: z
          .number()
          .int()
          .nonnegative()
          .max(300)
          .default(100)
          .describe("Maximum run events to include. Use 0 to omit events."),
        maxAnswerChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .default(80_000)
          .describe(
            "Maximum final-answer characters to include. Use 0 to omit answer text.",
          ),
      },
    },
    async ({ runId, waitMs, compact, ...options }) => {
      const run = waitMs > 0
        ? await core.waitForRun(runId, waitMs, options)
        : core.getRun(runId, options);
      if (!run) {
        throw new Error(`Unknown run: ${runId}`);
      }

      const result = compact
        ? Object.fromEntries(Object.entries(run).filter(([key]) =>
          !["plan", "budget", "promptPreview", "appliedSkills", "unrequestedSkillsPresent"].includes(key)
        ))
        : run;
      return jsonResult(result);
    },
  );

  server.registerTool(
    "ennodia_cancel_run",
    {
      title: "Cancel Ennodia run",
      description:
        "Cancel a high-level run and any active child task, Judge, or Result Advisor.",
      inputSchema: {
        runId: z.string().min(1).describe("Run ID returned by ennodia_run."),
      },
    },
    async ({ runId }) => jsonResult(core.cancelRun(runId)),
  );

  server.registerTool(
    "ennodia_list_tasks",
    {
      title: "List Ennodia tasks",
      description: "List tasks started by this Ennodia MCP server process.",
      inputSchema: {
        includeOutput: z
          .boolean()
          .default(false)
          .describe("Include bounded stdout, stderr, and finalMessage previews for each task."),
        includeEvents: z
          .boolean()
          .default(false)
          .describe("Include bounded task event history for each task."),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .default(4_000)
          .describe(
            "Maximum characters in each task output field: stdout, stderr, and finalMessage. Use 0 to omit output text.",
          ),
        maxEvents: z
          .number()
          .int()
          .nonnegative()
          .max(300)
          .default(25)
          .describe("Maximum task events to include per task when includeEvents is true."),
      },
    },
    async (options) => jsonResult(core.listTasks(options)),
  );

  server.registerTool(
    "ennodia_get_compositional_status",
    {
      title: "Get compositional Ennodia status",
      description:
        "Inspect a batch of compositional shard tasks, group running and terminal states, and return successful task IDs ready for Judge + Result Advisor comparison.",
      inputSchema: {
        taskIds: z
          .array(z.string().min(1).describe("Task ID returned by a compositional start."))
          .min(1)
          .max(100)
          .describe("Shard task IDs to inspect."),
        prompt: z
          .string()
          .optional()
          .describe(
            "Optional comparison prompt to include in the returned compareNext object.",
          ),
        minSuccessfulTasksForCompare: z
          .number()
          .int()
          .positive()
          .max(100)
          .default(2)
          .describe(
            "Minimum successful non-empty task outputs required before compareReady is true.",
          ),
        includeOutput: z
          .boolean()
          .default(false)
          .describe("Include bounded stdout, stderr, and finalMessage previews for each known task."),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .default(2_000)
          .describe(
            "Maximum characters in each task output field when includeOutput is true, including finalMessage.",
          ),
      },
    },
    async (input) => {
      const status = core.getCompositionalStatus(input);

      return jsonResult({
        ...status,
        compareNext: status.compareNext
          ? {
            tool: "ennodia_start_compare",
            ...status.compareNext,
          }
          : undefined,
      });
    },
  );

  server.registerTool(
    "ennodia_start_compare",
    {
      title: "Start Ennodia Judge + Result Advisor",
      description:
        "Compare completed Ennodia task outputs or caller-supplied responses. The Judge maps agreements, contradictions, and risks; the Result Advisor then combines that analysis into the final answer. Returns a Compare ID to inspect with ennodia_get_compare.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .describe("Original user task or question the candidate responses answer. Compare judges candidate text, not attached media. For media quality, first obtain native inspection evidence with files/ranges/tool details; keep transcription or DSP scores distinct from listening or viewing."),
        taskIds: z
          .array(z.string().min(1).describe("Completed Ennodia task ID."))
          .default([])
          .describe(
            "IDs of completed tasks from this server session to include as candidates.",
          ),
        responses: z
          .array(
            z.object({
              id: z
                .string()
                .min(1)
                .describe("Stable candidate ID used in judge analysis."),
              label: z
                .string()
                .optional()
                .describe("Human-readable candidate label."),
              text: z.string().describe("Candidate response text to compare."),
              metadata: z
                .record(z.string(), z.unknown())
                .optional()
                .describe("Optional structured metadata to retain with the candidate."),
            }),
          )
          .default([])
          .describe(
            "Freeform text responses to compare directly when you do not have task IDs.",
          ),
        judgeHarnessId: z
          .string()
          .optional()
          .describe(
            `Harness to use as the comparison Judge. Omit to use the default priority: ${comparePriorityText}.`,
          ),
        judgeModel: z
          .string()
          .optional()
          .describe("Optional model override for the comparison Judge."),
        advisorHarnessId: z
          .string()
          .optional()
          .describe(
            "Harness that runs the Result Advisor after the Judge. Defaults to the judge harness selection.",
          ),
        advisorModel: z
          .string()
          .optional()
          .describe("Optional model override for the Result Advisor."),
        synthesizerHarnessId: z
          .string()
          .optional()
          .describe(
            "Deprecated alias for advisorHarnessId. Do not send both fields with different values.",
          ),
        synthesizerModel: z
          .string()
          .optional()
          .describe(
            "Deprecated alias for advisorModel. Do not send both fields with different values.",
          ),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for Judge and Result Advisor child tasks."),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .max(60 * 60 * 1000)
          .optional()
          .describe(
            "Per-child timeout for Judge and Result Advisor tasks in milliseconds, capped at one hour.",
          ),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .optional()
          .describe(
            "Maximum characters from each task output to include as a comparison candidate. Use 0 to suppress task output text.",
          ),
        budget: budgetSchema.optional(),
      },
    },
    async (input) => jsonResult(await core.startCompare(input)),
  );

  server.registerTool(
    "ennodia_list_compares",
    {
      title: "List Ennodia Judge + Advisor comparisons",
      description:
        "List Judge + Result Advisor comparisons started by this Ennodia MCP server process.",
      inputSchema: {
        includeCandidates: z
          .boolean()
          .default(false)
          .describe("Include bounded candidate response previews for each comparison."),
        includeEvents: z
          .boolean()
          .default(false)
          .describe("Include bounded Judge + Result Advisor event history."),
        maxCandidateChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .default(2_000)
          .describe(
            "Maximum characters to include per candidate. Use 0 to omit candidate text.",
          ),
        maxEvents: z
          .number()
          .int()
          .nonnegative()
          .max(300)
          .default(25)
          .describe(
            "Maximum comparison events to include when includeEvents is true.",
          ),
      },
    },
    async (options) => jsonResult(core.listCompares(options)),
  );

  server.registerTool(
    "ennodia_get_compare",
    {
      title: "Get Ennodia Judge + Result Advisor comparison",
      description:
        "Inspect comparison status, candidate inputs, Judge analysis, Result Advisor answer, child task IDs, degradation state, and ETA.",
      inputSchema: {
        compareId: z
          .string()
          .min(1)
          .describe("Compare ID returned by ennodia_start_compare or ennodia_run."),
        includeCandidates: z
          .boolean()
          .default(true)
          .describe("Include bounded candidate response previews."),
        includeEvents: z
          .boolean()
          .default(true)
          .describe("Include bounded Judge + Result Advisor event history."),
        maxCandidateChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .default(8_000)
          .describe(
            "Maximum characters to include per candidate. Use 0 to omit candidate text.",
          ),
        maxEvents: z
          .number()
          .int()
          .nonnegative()
          .max(300)
          .default(100)
          .describe("Maximum comparison events to include. Use 0 to omit events."),
      },
    },
    async ({ compareId, ...options }) => {
      const compare = core.getCompare(compareId, options);
      if (!compare) {
        throw new Error(`Unknown compare: ${compareId}`);
      }

      return jsonResult(compare);
    },
  );

  server.registerTool(
    "ennodia_cancel_compare",
    {
      title: "Cancel Ennodia Judge + Result Advisor comparison",
      description:
        "Cancel a running Judge + Result Advisor comparison and its active child task.",
      inputSchema: {
        compareId: z
          .string()
          .min(1)
          .describe("Compare ID returned by ennodia_start_compare or ennodia_run."),
      },
    },
    async ({ compareId }) => jsonResult(core.cancelCompare(compareId)),
  );

  server.registerTool(
    "ennodia_get_task",
    {
      title: "Get Ennodia task",
      description: "Inspect task status, captured output, events, and ETA.",
      inputSchema: {
        taskId: z
          .string()
          .min(1)
          .describe(
            "Task ID returned by a raw, compositional, advised-plan, run, Plan Advisor, or Compare start.",
          ),
        includeOutput: z
          .boolean()
          .default(true)
          .describe("Include bounded stdout, stderr, and finalMessage previews."),
        includeEvents: z
          .boolean()
          .default(true)
          .describe("Include bounded task event history."),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .default(20_000)
          .describe(
            "Maximum characters in each output field: stdout, stderr, and finalMessage. Use 0 to omit output text.",
          ),
        maxEvents: z
          .number()
          .int()
          .nonnegative()
          .max(300)
          .default(100)
          .describe("Maximum task events to include. Use 0 to omit events."),
      },
    },
    async ({ taskId, ...options }) => {
      const task = core.getTask(taskId, options);
      if (!task) {
        throw new Error(`Unknown task: ${taskId}`);
      }

      return jsonResult(task);
    },
  );

  server.registerTool(
    "ennodia_cancel_task",
    {
      title: "Cancel Ennodia task",
      description: "Cancel a running task by task ID.",
      inputSchema: {
        taskId: z
          .string()
          .min(1)
          .describe(
            "Task ID returned by a raw, compositional, advised-plan, run, Plan Advisor, or Compare start.",
          ),
      },
    },
    async ({ taskId }) => jsonResult(core.cancelTask(taskId)),
  );

  // Removing before connect sends no list-changed notification.
  if ((options.tools ?? "core") === "core") {
    for (const [name, tool] of registered) {
      if (!CORE_TOOL_NAMES.includes(name)) tool.remove();
    }
  }

  return server;
}

export async function shutdownEnnodia(
  options: EnnodiaShutdownOptions = {},
): Promise<void> {
  await defaultCore.shutdown(options);
}

/** Keep the JSON text contract intact for clients that parse tool text. */
async function interactiveSetup(server: McpServer, core: EnnodiaCore, input: HarnessCheckInput, signal: AbortSignal) {
  let harnesses = await core.listHarnesses({ refresh: input.refresh });
  if (input.harnessIds) {
    for (const id of input.harnessIds) if (!harnesses.some(h => h.id === id)) throw new Error(`Unknown harness: ${id}`);
    harnesses = harnesses.filter(h => input.harnessIds!.includes(h.id));
  }
  const installation = core.getInstallation?.(input.refresh);
  const native = Boolean(server.server.getClientCapabilities()?.elicitation?.form);
  const finish = (action: string) => setupResult({ installation, harnesses, actionRequired: harnessAttention(harnesses), setup: { presentation: native ? "native" : "markdown", action } }, harnesses, installation, input.cwd, input.model);
  if (!native || !harnesses.length) return finish(!native ? "unsupported" : "no-routes");
  if (harnesses.length > 1) {
    const selected = await server.server.elicitInput({
      mode: "form",
      message: "Ennodia setup: choose the route to configure or recheck. No credentials are collected here.",
      requestedSchema: { type: "object", properties: {
        harnessId: { type: "string", title: "Route", oneOf: harnesses.map(h => ({ const: h.id, title: `${h.name} — ${!h.runnable ? "CLI unavailable" : h.readiness?.state ?? "unverified"}` })) },
      }, required: ["harnessId"] },
    }, { signal, timeout: 300_000 });
    if (selected.action !== "accept") return finish(selected.action);
    harnesses = harnesses.filter(h => h.id === selected.content?.harnessId);
    if (!harnesses.length) throw new Error("Setup selection is not a discovered route.");
  }
  const route = harnesses[0]!;
  // Discovery evidence for a default model must not authorize another model.
  const model = input.model ?? route.readiness?.model;
  const status = model !== route.readiness?.model ? "Access to this model has not been verified." : route.readiness?.message ?? "Model access is unchecked.";
  const selected = await server.server.elicitInput({
    mode: "form",
    message: `Ennodia setup: ${route.name}${model ? ` / ${model}` : " / default model"}. ${status} Sign-in and credential changes stay in the native tool.`,
    requestedSchema: { type: "object", properties: {
      action: { type: "string", title: "Next step", oneOf: [
        { const: "recovery", title: "Show sign-in / installation / recovery steps" },
        { const: "recheck", title: "Recheck native status (no model request)" },
        ...(route.runnable ? [{ const: "verify", title: "Verify model access (uses provider capacity)" }] : []),
      ] },
    }, required: ["action"] },
  }, { signal, timeout: 300_000 });
  if (selected.action !== "accept") return finish(selected.action);
  if (selected.content?.action === "recovery") return finish("recovery");
  if (selected.content?.action !== "recheck" && selected.content?.action !== "verify") throw new Error("Unknown setup action.");
  const result = await core.checkHarnesses({ harnessIds: [route.id], ...(model ? { model } : {}), cwd: input.cwd, refresh: true, verify: selected.content.action === "verify", upgrade: false });
  return setupResult({ ...result, setup: { presentation: "native", action: selected.content.action, harnessId: route.id } }, result.harnesses, result.installation, input.cwd);
}

function setupResult(value: unknown, routes: (HarnessDiscovery | HarnessAttention)[], installation?: InstallationReport, cwd?: string, requestedModel?: string) {
  const lines = ["## Ennodia setup", "", "Choose a route for your task. Model verification uses provider capacity. Unchecked routes are verified automatically when selected for a run."];
  if (installation) {
    lines.push("", `Ennodia ${installation.version} · ${installation.scope} · installation ${installation.status}. This does not establish model access.`);
    if (installation.limitations.length) {
      lines.push("", ...installation.limitations.map(limit => `- ${limit}`), "", "Use the [installation guide](https://ennodia.cherninlab.com/docs/install/) to repair the reported installation. Preserve the current installation method and client configuration, then refresh the check. Restart the MCP connection after changing its installed code.");
    }
  }
  lines.push("", "| Route | Access | Next step |", "| --- | --- | --- |");
  const actions: string[] = [];
  for (const route of routes) {
    const discovered = "id" in route;
    const id = discovered ? route.id : route.harnessId;
    const name = discovered ? route.name : route.harnessName;
    const readiness = route.readiness;
    const model = requestedModel ?? readiness?.model;
    const missing = discovered && !route.runnable;
    const state = missing ? "CLI unavailable" : readiness?.state === "ready" && model !== readiness.model ? "unverified" : readiness?.state ?? "unverified";
    const label = `${name} (${id}${model ? ` / ${model}` : " / default model"})`;
    const next = missing ? "Install/configure the supported native CLI if you need this route."
      : state === "ready" ? "Continue your task on this verified route."
      : state === "unverified" ? "Choose this route for your task, or verify it now."
      : readiness?.recovery?.instruction ?? readiness?.message ?? "Recheck this route.";
    const cell = (text: string) => text.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
    lines.push(`| ${cell(label)} | ${cell(state)} | ${cell(next)} |`);
    if (state === "ready") continue;
    actions.push("", `### ${cell(label)}`);
    if (missing) {
      actions.push("Install or configure the CLI using the [supported harness guide](https://ennodia.cherninlab.com/docs/reference/supported-harnesses/). Recheck after installation.");
    } else if (state !== "unverified") {
      actions.push(readiness?.message ?? "Recheck this route.", next);
      // Only a login blocker calls for running a login command. Other states
      // require the recovery instruction (e.g. credits or key replacement).
      if (state === "login-required" && readiness?.recovery?.command.length) {
        const command = readiness.recovery.command.map(arg => /^[A-Za-z0-9_./:@=+-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`).join(" ");
        const fence = "`".repeat(Math.max(3, ...[...command.matchAll(/`+/g)].map(match => match[0].length + 1)));
        actions.push("Run in an interactive terminal:", `${fence}sh\n${command}\n${fence}`);
      }
    }
    const recheck = { harnessIds: [id], ...(model ? { model } : {}), ...(cwd ? { cwd } : {}), refresh: true, verify: true };
    actions.push("Recheck with `ennodia_check_harnesses`:", `\`\`\`json\n${JSON.stringify(recheck)}\n\`\`\``);
  }
  if (!routes.length) lines.push("", "No routes were returned. Refresh discovery with ennodia_list_harnesses, then use the [supported harness guide](https://ennodia.cherninlab.com/docs/reference/supported-harnesses/) to install a route.");
  lines.push(...actions, "", "Complete sign-in and credential changes in the native tool. Never paste credentials into chat. After recovery, recheck the same route and resume the original task when ready.");
  return { content: [...jsonResult(value).content, { type: "resource" as const, resource: { uri: "ennodia://setup", mimeType: "text/markdown", text: lines.join("\n") } }] };
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
