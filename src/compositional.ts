import { z } from "zod";
import {
  checkBudgetLimits,
  estimateTaskBatchBudget,
  type BudgetCheck,
  type BudgetLimits,
} from "./budget";
import type { HarnessDiscovery } from "./harnesses";
import type { RoutePlan } from "./planner";
import type { RouteCategory } from "./priority";
import type { TaskView } from "./tasks";

export type CompositionalSliceInput = {
  id?: string;
  title?: string;
  prompt: string;
  category?: RouteCategory;
  harnessId?: string;
  model?: string;
};

export const compositionalSliceSchema: z.ZodType<CompositionalSliceInput> = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional()
      .describe(
        "Optional stable slice ID returned with the started task. Must be unique when supplied.",
      ),
    title: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .describe("Optional short human-readable label for this slice."),
    prompt: z
      .string()
      .min(1)
      .describe("Focused task prompt for this slice."),
    category: z
      .enum(["code", "research", "browser", "image", "general"])
      .optional()
      .describe(
        "Optional caller-provided route category for this slice. When supplied, Ennodia skips keyword classification.",
      ),
    harnessId: z
      .string()
      .optional()
      .describe(
        "Optional harness ID for this slice. Omit to let Ennodia plan this slice independently.",
      ),
    model: z
      .string()
      .optional()
      .describe(
        "Optional model override for this slice, passed only to harnesses that support model selection.",
      ),
  })
  .describe("One focused unit of compositional work.");

export type ResolvedCompositionalSlice = {
  index: number;
  id: string;
  title?: string;
  prompt: string;
  category?: RouteCategory;
  harnessId: string;
  model?: string;
  plan: RoutePlan;
};

export type CompositionalSliceSummary = {
  index: number;
  sliceId: string;
  sliceTitle?: string;
  harnessId: string;
  model?: string;
  routeCategory: RoutePlan["category"];
  routeReasons: string[];
  routeCandidates: string[];
};

export type CompositionalCompareNext = {
  prompt: string;
  taskIds: string[];
  maxOutputChars?: number;
};

export type CompositionalTaskSnapshot = {
  id: string;
  harnessId: string;
  harnessName: string;
  status: TaskView["status"];
  elapsedMs: number;
  remainingMs: number | null;
  etaConfidence: TaskView["etaConfidence"];
  stdoutChars: number;
  stderrChars: number;
  stdout?: string;
  stderr?: string;
};

export type CompositionalStatusView = {
  requestedTaskIds: string[];
  missingTaskIds: string[];
  readyTaskIds: string[];
  runningTaskIds: string[];
  failedTaskIds: string[];
  cancelledTaskIds: string[];
  emptySucceededTaskIds: string[];
  compareReady: boolean;
  counts: {
    requested: number;
    known: number;
    ready: number;
    running: number;
    failed: number;
    cancelled: number;
    emptySucceeded: number;
    missing: number;
  };
  tasks: CompositionalTaskSnapshot[];
  compareNext?: CompositionalCompareNext;
};

export function assertUniqueSliceIds(
  slices: CompositionalSliceInput[],
): void {
  const seen = new Set<string>();

  for (const slice of slices) {
    if (!slice.id) {
      continue;
    }

    if (seen.has(slice.id)) {
      throw new Error(`Duplicate compositional slice ID: ${slice.id}`);
    }

    seen.add(slice.id);
  }
}

export function resolveCompositionalSlices(
  originalPrompt: string,
  slices: CompositionalSliceInput[],
  harnesses: HarnessDiscovery[],
  planRoute: (
    prompt: string,
    harnesses: HarnessDiscovery[],
    options?: { category?: RouteCategory },
  ) => RoutePlan,
): ResolvedCompositionalSlice[] {
  return slices.map((slice, index) => {
    const plan = planRoute(slice.prompt, harnesses, {
      category: slice.category,
    });
    const harnessId = slice.harnessId ?? plan.selected;

    if (!harnessId) {
      throw new Error(`No runnable harness was found for slice ${index + 1}.`);
    }

    return {
      index,
      id: slice.id ?? `slice-${index + 1}`,
      title: slice.title,
      prompt: compositionalPrompt(originalPrompt, slice, index),
      category: slice.category,
      harnessId,
      model: slice.model,
      plan,
    };
  });
}

export function compositionalSliceSummaries(
  slices: ResolvedCompositionalSlice[],
): CompositionalSliceSummary[] {
  return slices.map((slice) => ({
    index: slice.index,
    sliceId: slice.id,
    sliceTitle: slice.title,
    harnessId: slice.harnessId,
    model: slice.model,
    routeCategory: slice.plan.category,
    routeReasons: slice.plan.reasons,
    routeCandidates: slice.plan.candidates,
  }));
}

export function estimateCompositionalBudget(
  slices: ResolvedCompositionalSlice[],
  includeCompareEstimate: boolean,
  maxOutputChars: number | undefined,
  budget: BudgetLimits | undefined,
): BudgetCheck {
  return checkBudgetLimits(
    estimateTaskBatchBudget({
      tasks: slices.map((slice) => ({
        prompt: slice.prompt,
        harnessId: slice.harnessId,
      })),
      comparePlanned: includeCompareEstimate,
      maxOutputChars,
    }),
    budget,
  );
}

export function uniqueTaskIds(taskIds: string[]): string[] {
  return [...new Set(taskIds.map((id) => id.trim()).filter(Boolean))];
}

export function summarizeCompositionalTasks(input: {
  requestedTaskIds: string[];
  tasks: TaskView[];
  prompt?: string;
  minSuccessfulTasksForCompare?: number;
  includeOutput?: boolean;
  maxOutputChars?: number;
}): CompositionalStatusView {
  const tasks = input.tasks;
  const knownIds = new Set(tasks.map((task) => task.id));
  const missingTaskIds = input.requestedTaskIds.filter((taskId) =>
    !knownIds.has(taskId)
  );
  const readyTaskIds = tasks
    .filter((task) => task.status === "succeeded" && task.stdoutChars > 0)
    .map((task) => task.id);
  const runningTaskIds = tasks
    .filter((task) => task.status === "running")
    .map((task) => task.id);
  const failedTaskIds = tasks
    .filter((task) => task.status === "failed")
    .map((task) => task.id);
  const cancelledTaskIds = tasks
    .filter((task) => task.status === "cancelled")
    .map((task) => task.id);
  const emptySucceededTaskIds = tasks
    .filter((task) => task.status === "succeeded" && task.stdoutChars === 0)
    .map((task) => task.id);
  const compareReady = readyTaskIds.length >=
    (input.minSuccessfulTasksForCompare ?? 2);

  return {
    requestedTaskIds: input.requestedTaskIds,
    missingTaskIds,
    readyTaskIds,
    runningTaskIds,
    failedTaskIds,
    cancelledTaskIds,
    emptySucceededTaskIds,
    compareReady,
    counts: {
      requested: input.requestedTaskIds.length,
      known: tasks.length,
      ready: readyTaskIds.length,
      running: runningTaskIds.length,
      failed: failedTaskIds.length,
      cancelled: cancelledTaskIds.length,
      emptySucceeded: emptySucceededTaskIds.length,
      missing: missingTaskIds.length,
    },
    tasks: tasks.map((task) => ({
      id: task.id,
      harnessId: task.harnessId,
      harnessName: task.harnessName,
      status: task.status,
      elapsedMs: task.elapsedMs,
      remainingMs: task.remainingMs,
      etaConfidence: task.etaConfidence,
      stdoutChars: task.stdoutChars,
      stderrChars: task.stderrChars,
      stdout: input.includeOutput ? task.stdout : undefined,
      stderr: input.includeOutput ? task.stderr : undefined,
    })),
    compareNext: input.prompt && compareReady
      ? {
        prompt: input.prompt,
        taskIds: readyTaskIds,
        maxOutputChars: input.maxOutputChars,
      }
      : undefined,
  };
}

function compositionalPrompt(
  originalPrompt: string,
  slice: CompositionalSliceInput,
  index: number,
): string {
  const lines = [
    "ENNODIA_COMPOSITIONAL_SLICE",
    "",
    "You are one focused shard in a larger Ennodia review.",
    "Stay inside this slice. Keep the answer compact enough for a later Compare pass.",
    "",
    "Overall task:",
    originalPrompt,
    "",
    `Slice ${index + 1}${slice.id ? ` (${slice.id})` : ""}:${
      slice.title ? ` ${slice.title}` : ""
    }`,
    slice.prompt,
  ];

  return lines.join("\n");
}
