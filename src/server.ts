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
    version: "0.0.0",
  });

  server.registerTool(
    "ennodia_list_harnesses",
    {
      title: "List Ennodia harnesses",
      description: "Discover local AI tools that Ennodia can see.",
      inputSchema: {
        refresh: z.boolean().default(false),
      },
    },
    async ({ refresh }) => jsonResult(await discoverHarnesses({ refresh })),
  );

  server.registerTool(
    "ennodia_plan",
    {
      title: "Plan an Ennodia route",
      description: "Classify a prompt and preview the route Ennodia would take.",
      inputSchema: {
        prompt: z.string().min(1),
        refresh: z.boolean().default(false),
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
        "Start one or more local AI tool tasks and return task IDs for monitoring.",
      inputSchema: {
        prompt: z.string().min(1),
        harnessId: z.string().optional(),
        mode: z.enum(["single", "parallel"]).default("single"),
        cwd: z.string().optional(),
        model: z.string().optional(),
        timeoutMs: z.number().int().positive().max(60 * 60 * 1000).optional(),
        refresh: z.boolean().default(false),
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
        "Plan a request, start child tasks, optionally Compare successful outputs, and return a monitorable run.",
      inputSchema: {
        prompt: z.string().min(1),
        harnessId: z.string().optional(),
        mode: z.enum(["auto", "single", "parallel"]).default("auto"),
        compare: z.union([z.literal("auto"), z.boolean()]).default("auto"),
        cwd: z.string().optional(),
        model: z.string().optional(),
        timeoutMs: z.number().int().positive().max(60 * 60 * 1000).optional(),
        refresh: z.boolean().default(false),
        judgeHarnessId: z.string().optional(),
        judgeModel: z.string().optional(),
        synthesizerHarnessId: z.string().optional(),
        synthesizerModel: z.string().optional(),
        maxOutputChars: z.number().int().positive().max(200_000).optional(),
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
        includeEvents: z.boolean().default(false),
        maxEvents: z.number().int().nonnegative().max(300).default(25),
        maxAnswerChars: z.number().int().nonnegative().max(200_000).default(2_000),
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
        runId: z.string().min(1),
        includeEvents: z.boolean().default(true),
        maxEvents: z.number().int().nonnegative().max(300).default(100),
        maxAnswerChars: z.number().int().nonnegative().max(200_000).default(80_000),
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
        runId: z.string().min(1),
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
        includeOutput: z.boolean().default(false),
        includeEvents: z.boolean().default(false),
        maxOutputChars: z.number().int().nonnegative().max(200_000).default(4_000),
        maxEvents: z.number().int().nonnegative().max(300).default(25),
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
        "Run an LLM judge and synthesizer over completed task outputs or supplied responses.",
      inputSchema: {
        prompt: z.string().min(1),
        taskIds: z.array(z.string().min(1)).default([]),
        responses: z
          .array(
            z.object({
              id: z.string().min(1),
              label: z.string().optional(),
              text: z.string(),
              metadata: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .default([]),
        judgeHarnessId: z.string().optional(),
        judgeModel: z.string().optional(),
        synthesizerHarnessId: z.string().optional(),
        synthesizerModel: z.string().optional(),
        cwd: z.string().optional(),
        timeoutMs: z.number().int().positive().max(60 * 60 * 1000).optional(),
        maxOutputChars: z.number().int().positive().max(200_000).optional(),
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
        includeCandidates: z.boolean().default(false),
        includeEvents: z.boolean().default(false),
        maxCandidateChars: z.number().int().nonnegative().max(200_000).default(2_000),
        maxEvents: z.number().int().nonnegative().max(300).default(25),
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
        compareId: z.string().min(1),
        includeCandidates: z.boolean().default(true),
        includeEvents: z.boolean().default(true),
        maxCandidateChars: z.number().int().nonnegative().max(200_000).default(8_000),
        maxEvents: z.number().int().nonnegative().max(300).default(100),
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
        compareId: z.string().min(1),
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
        taskId: z.string().min(1),
        includeOutput: z.boolean().default(true),
        includeEvents: z.boolean().default(true),
        maxOutputChars: z.number().int().nonnegative().max(200_000).default(20_000),
        maxEvents: z.number().int().nonnegative().max(300).default(100),
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
        taskId: z.string().min(1),
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
