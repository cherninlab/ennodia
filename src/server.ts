import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CompareManager,
  type CompareCandidateInput,
} from "./compare";
import {
  discoverHarnesses,
  findHarnessAdapter,
} from "./harnesses";
import { planRoute } from "./planner";
import { RunManager } from "./runs";
import { TaskManager } from "./tasks";
import { ENNODIA_VERSION } from "./version";

const taskManager = new TaskManager();
const compareManager = new CompareManager(taskManager, resolveRunnableHarness);
const runManager = new RunManager({
  taskManager,
  compareManager,
  discoverHarnesses,
  findHarnessAdapter,
  planRoute,
});

export type EnnodiaShutdownOptions = {
  deadlineMs?: number;
};

export function createEnnodiaServer(): McpServer {
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
    async ({ refresh }) => jsonResult(await discoverHarnesses({ refresh })),
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
        refresh: z
          .boolean()
          .default(false)
          .describe("Re-scan harnesses before planning."),
      },
    },
    async ({ prompt, refresh }) => {
      const harnesses = await discoverHarnesses({ refresh });
      return jsonResult(planRoute(prompt, harnesses));
    },
  );

  server.registerTool(
    "ennodia_start",
    {
      title: "Start an Ennodia task",
      description:
        "Start raw child harness tasks without run-level Compare or final synthesis. Use for debugging, direct harness calls, or manual Compare workflows; prefer ennodia_run for normal end-to-end use.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .describe("The task to send to the selected local harness or harnesses."),
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
      },
    },
    async ({ prompt, harnessId, mode, cwd, model, timeoutMs, refresh }) => {
      const harnesses = await discoverHarnesses({ refresh });
      const plan = planRoute(prompt, harnesses);
      const selectedIds = harnessId
        ? [harnessId]
        : mode === "parallel"
          ? plan.candidates
          : plan.selected
            ? [plan.selected]
            : [];

      if (selectedIds.length === 0) {
        throw new Error("No runnable harnesses were found.");
      }

      const tasks = selectedIds.map((id) => {
        const adapter = findHarnessAdapter(id);
        const discovery = harnesses.find((harness) => harness.id === id);

        if (!adapter || !discovery) {
          throw new Error(`Unknown harness: ${id}`);
        }

        return taskManager.start(adapter, discovery, {
          prompt,
          cwd,
          model,
          timeoutMs,
        }).task;
      });

      return jsonResult({ plan, tasks });
    },
  );

  server.registerTool(
    "ennodia_run",
    {
      title: "Run Ennodia",
      description:
        "Start a high-level Ennodia orchestration. Use this as the default entrypoint: it plans routing, starts one or more local harness tasks, optionally compares successful outputs, and returns a run ID to inspect with ennodia_get_run.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .describe("The user task to route to local AI harnesses."),
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
            "Whether to run Compare after tasks finish. auto compares when the planner sees value and at least two tasks produce output.",
          ),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for child harness commands."),
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
            "Harness to use as the Compare judge. Omit to use the default priority: claude-code, codex, antigravity, then opencode.",
          ),
        judgeModel: z
          .string()
          .optional()
          .describe("Optional model override for the Compare judge."),
        synthesizerHarnessId: z
          .string()
          .optional()
          .describe(
            "Harness that writes the final synthesized answer. Defaults to the judge harness selection.",
          ),
        synthesizerModel: z
          .string()
          .optional()
          .describe("Optional model override for the Compare synthesizer."),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .optional()
          .describe(
            "Maximum characters from each successful task output to pass into Compare. Use 0 to suppress candidate text.",
          ),
      },
    },
    async ({
      prompt,
      harnessId,
      mode,
      compare,
      cwd,
      model,
      timeoutMs,
      refresh,
      judgeHarnessId,
      judgeModel,
      synthesizerHarnessId,
      synthesizerModel,
      maxOutputChars,
    }) =>
      jsonResult(
        await runManager.start({
          prompt,
          harnessId,
          mode,
          compare,
          cwd,
          model,
          timeoutMs,
          refresh,
          judgeHarnessId,
          judgeModel,
          synthesizerHarnessId,
          synthesizerModel,
          maxOutputChars,
        }),
      ),
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
    async ({ includeEvents, maxEvents, maxAnswerChars }) =>
      jsonResult(
        runManager.listViews({
          includeEvents,
          maxEvents,
          maxAnswerChars,
        }),
      ),
  );

  server.registerTool(
    "ennodia_get_run",
    {
      title: "Get Ennodia run",
      description:
        "Inspect run status, selected harnesses, child task IDs, Compare ID, final answer, events, and ETA.",
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
    async ({ runId, includeEvents, maxEvents, maxAnswerChars }) => {
      const run = runManager.get(runId, {
        includeEvents,
        maxEvents,
        maxAnswerChars,
      });
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
      description: "Cancel a high-level run and any active child task or Compare.",
      inputSchema: {
        runId: z.string().min(1).describe("Run ID returned by ennodia_run."),
      },
    },
    async ({ runId }) => jsonResult(runManager.cancel(runId)),
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
    async ({ includeOutput, includeEvents, maxOutputChars, maxEvents }) =>
      jsonResult(
        taskManager.listViews({
          includeOutput,
          includeEvents,
          maxOutputChars,
          maxEvents,
        }),
      ),
  );

  server.registerTool(
    "ennodia_start_compare",
    {
      title: "Start Ennodia Compare",
      description:
        "Compare completed Ennodia task outputs or caller-supplied responses. Runs a judge pass, then a synthesizer pass, and returns a Compare ID to inspect with ennodia_get_compare.",
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
            "Harness to use as the Compare judge. Omit to use the default priority: claude-code, codex, antigravity, then opencode.",
          ),
        judgeModel: z
          .string()
          .optional()
          .describe("Optional model override for the Compare judge."),
        synthesizerHarnessId: z
          .string()
          .optional()
          .describe(
            "Harness that writes the final synthesized answer. Defaults to the judge harness selection.",
          ),
        synthesizerModel: z
          .string()
          .optional()
          .describe("Optional model override for the Compare synthesizer."),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for judge and synthesizer child tasks."),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .max(60 * 60 * 1000)
          .optional()
          .describe(
            "Per-child timeout for judge and synthesizer tasks in milliseconds, capped at one hour.",
          ),
        maxOutputChars: z
          .number()
          .int()
          .nonnegative()
          .max(200_000)
          .optional()
          .describe(
            "Maximum characters from each task output to include as a Compare candidate. Use 0 to suppress task output text.",
          ),
      },
    },
    async ({
      prompt,
      taskIds,
      responses,
      judgeHarnessId,
      judgeModel,
      synthesizerHarnessId,
      synthesizerModel,
      cwd,
      timeoutMs,
      maxOutputChars,
    }) =>
      jsonResult(
        await compareManager.start({
          prompt,
          taskIds,
          responses: responses as CompareCandidateInput[],
          judgeHarnessId,
          judgeModel,
          synthesizerHarnessId,
          synthesizerModel,
          cwd,
          timeoutMs,
          maxOutputChars,
        }),
      ),
  );

  server.registerTool(
    "ennodia_list_compares",
    {
      title: "List Ennodia compares",
      description: "List Compare runs started by this Ennodia MCP server process.",
      inputSchema: {
        includeCandidates: z
          .boolean()
          .default(false)
          .describe("Include bounded candidate response previews for each Compare."),
        includeEvents: z
          .boolean()
          .default(false)
          .describe("Include bounded Compare event history."),
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
            "Maximum Compare events to include when includeEvents is true.",
          ),
      },
    },
    async ({ includeCandidates, includeEvents, maxCandidateChars, maxEvents }) =>
      jsonResult(
        compareManager.listViews({
          includeCandidates,
          includeEvents,
          maxCandidateChars,
          maxEvents,
        }),
      ),
  );

  server.registerTool(
    "ennodia_get_compare",
    {
      title: "Get Ennodia Compare",
      description:
        "Inspect Compare status, candidate inputs, judge analysis, final synthesis, child task IDs, and ETA.",
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
          .describe("Include bounded Compare event history."),
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
          .describe("Maximum Compare events to include. Use 0 to omit events."),
      },
    },
    async ({
      compareId,
      includeCandidates,
      includeEvents,
      maxCandidateChars,
      maxEvents,
    }) => {
      const compare = compareManager.get(compareId, {
        includeCandidates,
        includeEvents,
        maxCandidateChars,
        maxEvents,
      });
      if (!compare) {
        throw new Error(`Unknown compare: ${compareId}`);
      }

      return jsonResult(compare);
    },
  );

  server.registerTool(
    "ennodia_cancel_compare",
    {
      title: "Cancel Ennodia Compare",
      description: "Cancel a running Compare and its active child task.",
      inputSchema: {
        compareId: z
          .string()
          .min(1)
          .describe("Compare ID returned by ennodia_start_compare or ennodia_run."),
      },
    },
    async ({ compareId }) => jsonResult(compareManager.cancel(compareId)),
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
          .describe("Task ID returned by ennodia_start, ennodia_run, or Compare."),
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
    async ({ taskId, includeOutput, includeEvents, maxOutputChars, maxEvents }) => {
      const task = taskManager.get(taskId, {
        includeOutput,
        includeEvents,
        maxOutputChars,
        maxEvents,
      });
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
          .describe("Task ID returned by ennodia_start, ennodia_run, or Compare."),
      },
    },
    async ({ taskId }) => jsonResult(taskManager.cancel(taskId)),
  );

  return server;
}

export async function shutdownEnnodia(
  options: EnnodiaShutdownOptions = {},
): Promise<void> {
  await runManager.shutdown(options);
  await compareManager.shutdown(options);
  await taskManager.shutdown(options);
}

async function resolveRunnableHarness(harnessId?: string) {
  const harnesses = await discoverHarnesses();
  const preferredIds = harnessId
    ? [harnessId]
    : ["claude-code", "codex", "antigravity", "opencode"];

  for (const id of preferredIds) {
    const adapter = findHarnessAdapter(id);
    const discovery = harnesses.find((harness) => harness.id === id);

    if (adapter?.buildCommand && discovery?.runnable) {
      return { adapter, discovery };
    }
  }

  throw new Error(
    harnessId
      ? `Harness is not runnable: ${harnessId}`
      : "No runnable harness was found for Compare.",
  );
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
