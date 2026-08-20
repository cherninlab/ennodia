import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

const defaultCore = createDefaultEnnodiaCore();
const comparePriorityText = formatHarnessPriorityList();

const categorySchema = z
  .enum(["code", "research", "browser", "image", "general"])
  .describe(
    "Optional caller-provided route category. Pass this when you know the task category; Ennodia then skips keyword classification.",
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

export function createEnnodiaServer(core: EnnodiaCore = defaultCore): McpServer {
  const server = new McpServer({
    name: "ennodia",
    version: ENNODIA_VERSION,
  });

  server.registerTool(
    "ennodia_list_harnesses",
    {
      title: "List Ennodia harnesses",
      description:
        "Discover supported local AI harnesses and report availability, runnable state, command path, version, capabilities, and adapter notes. Use first when setup or routing fails.",
      inputSchema: {
        refresh: z
          .boolean()
          .default(false)
          .describe(
            "Re-scan available harnesses instead of returning the short-lived discovery cache.",
          ),
      },
    },
    async ({ refresh }) => jsonResult(await core.listHarnesses({ refresh })),
  );

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
          .describe("The task to send to the selected local harness or harnesses."),
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
            "Optional list of skill IDs to apply to the prompt before starting the task.",
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
        "Start a high-level Ennodia orchestration. Use this as the default entrypoint: it plans routing, starts one or more local harness tasks, optionally compares successful outputs, and returns a run ID. Runs usually take minutes; poll ennodia_get_run with sensible spacing and trust remainingMs/etaConfidence instead of aborting early.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .describe("The user task to route to local AI harnesses."),
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
            "Optional list of skill IDs to apply to the prompt before planning and running child tasks.",
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
        "Inspect run status, selected harnesses, child task IDs, comparison ID, final Advisor answer, events, and ETA.",
      inputSchema: {
        runId: z.string().min(1).describe("Run ID returned by ennodia_run."),
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
    async ({ runId, ...options }) => {
      const run = core.getRun(runId, options);
      if (!run) {
        throw new Error(`Unknown run: ${runId}`);
      }

      return jsonResult(run);
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
          .describe("Include bounded stdout and stderr previews for each task."),
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
            "Maximum stdout and stderr characters to include per task. Use 0 to omit output text.",
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
          .describe("Include bounded stdout and stderr previews for each known task."),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .default(2_000)
          .describe(
            "Maximum stdout and stderr characters to include per task when includeOutput is true.",
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
          .describe("Original user task or question the candidate responses answer."),
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
          .describe("Include bounded stdout and stderr previews."),
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
            "Maximum stdout and stderr characters to include. Use 0 to omit output text.",
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

  return server;
}

export async function shutdownEnnodia(
  options: EnnodiaShutdownOptions = {},
): Promise<void> {
  await defaultCore.shutdown(options);
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
