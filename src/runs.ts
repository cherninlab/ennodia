import { randomUUID } from "node:crypto";
import type { CompareManager, CompareView } from "./compare";
import { diagnoseTasks, type TaskDiagnosis } from "./diagnosis";
import type {
  DiscoverHarnessesOptions,
  HarnessAdapter,
  HarnessDiscovery,
} from "./harnesses";
import type { RoutePlan } from "./planner";
import type { TaskManager, TaskView } from "./tasks";

export type RunMode = "auto" | "single" | "parallel";
export type RunCompareMode = "auto" | boolean;
export type RunStatus =
  | "executing"
  | "comparing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type RunEvent = {
  at: string;
  type:
    | "started"
    | "task-started"
    | "task-succeeded"
    | "task-failed"
    | "task-cancelled"
    | "compare-skipped"
    | "compare-started"
    | "compare-succeeded"
    | "compare-failed"
    | "succeeded"
    | "failed"
    | "cancelled";
  message?: string;
  taskId?: string;
  compareId?: string;
  harnessId?: string;
  elapsedMs?: number;
  remainingMs?: number | null;
};

export type RunStartInput = {
  prompt: string;
  harnessId?: string;
  mode?: RunMode;
  compare?: RunCompareMode;
  cwd?: string;
  model?: string;
  timeoutMs?: number;
  refresh?: boolean;
  judgeHarnessId?: string;
  judgeModel?: string;
  synthesizerHarnessId?: string;
  synthesizerModel?: string;
  maxOutputChars?: number;
};

export type RunView = {
  id: string;
  status: RunStatus;
  mode: RunMode;
  compareMode: RunCompareMode;
  promptPreview: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  elapsedMs: number;
  plan: RoutePlan;
  selectedHarnessIds: string[];
  taskIds: string[];
  compareId?: string;
  activeTaskId?: string;
  remainingMs: number | null;
  etaConfidence: "timeout-budget" | "unknown" | "complete";
  finalAnswer?: string;
  finalAnswerChars: number;
  error?: string;
  diagnosis?: TaskDiagnosis;
  failedTaskDiagnosis?: TaskDiagnosis;
  eventCount: number;
  events: RunEvent[];
};

export type RunViewOptions = {
  includeEvents?: boolean;
  maxEvents?: number;
  maxAnswerChars?: number;
};

export type DiscoverHarnesses = (
  options?: DiscoverHarnessesOptions,
) => Promise<HarnessDiscovery[]>;

export type FindHarnessAdapter = (id: string) => HarnessAdapter | undefined;
export type PlanRoute = (
  prompt: string,
  harnesses: HarnessDiscovery[],
) => RoutePlan;

export type RunManagerDependencies = {
  taskManager: TaskManager;
  compareManager: CompareManager;
  discoverHarnesses: DiscoverHarnesses;
  findHarnessAdapter: FindHarnessAdapter;
  planRoute: PlanRoute;
};

export type RunManagerShutdownOptions = {
  deadlineMs?: number;
};

type InternalRun = {
  id: string;
  status: RunStatus;
  mode: RunMode;
  compareMode: RunCompareMode;
  prompt: string;
  plan: RoutePlan;
  selectedHarnessIds: string[];
  taskIds: string[];
  compareId?: string;
  finalAnswer?: string;
  error?: string;
  diagnosis?: TaskDiagnosis;
  failedTaskDiagnosis?: TaskDiagnosis;
  createdAtMs: number;
  updatedAtMs: number;
  endedAtMs?: number;
  events: RunEvent[];
};

type EtaSnapshot = {
  activeTaskId?: string;
  remainingMs: number | null;
  etaConfidence: "timeout-budget" | "unknown" | "complete";
};

const DEFAULT_MAX_EVENTS = 100;
const DEFAULT_MAX_ANSWER_CHARS = 80_000;
const DEFAULT_SHUTDOWN_DEADLINE_MS = 5_000;
const POLL_MS = 500;

export class RunManager {
  private readonly runs = new Map<string, InternalRun>();
  private shuttingDown = false;
  private shutdownPromise?: Promise<void>;

  constructor(private readonly dependencies: RunManagerDependencies) {}

  async start(input: RunStartInput): Promise<RunView> {
    if (this.shuttingDown) {
      throw new Error("RunManager is shutting down.");
    }

    const harnesses = await this.dependencies.discoverHarnesses({
      refresh: input.refresh,
    });
    const plan = this.dependencies.planRoute(input.prompt, harnesses);
    const mode = input.mode ?? "auto";
    const compareMode = input.compare ?? "auto";
    const selectedHarnessIds = selectHarnessIds(input.harnessId, mode, plan);

    if (selectedHarnessIds.length === 0) {
      throw new Error("No runnable harnesses were found.");
    }

    const now = Date.now();
    const run: InternalRun = {
      id: randomUUID(),
      status: "executing",
      mode,
      compareMode,
      prompt: input.prompt,
      plan,
      selectedHarnessIds,
      taskIds: [],
      createdAtMs: now,
      updatedAtMs: now,
      events: [],
    };

    this.runs.set(run.id, run);
    this.pushEvent(run, {
      type: "started",
      message: `Run started with ${selectedHarnessIds.length} selected harness(es).`,
    });

    for (const harnessId of selectedHarnessIds) {
      this.startChildTask(run, harnessId, harnesses, input);
    }

    if (run.taskIds.length === 0) {
      this.failRun(run, "No selected harness could start a task.");
      return this.toView(run);
    }

    void this.run(run, input);
    return this.toView(run);
  }

  listViews(options: RunViewOptions = {}): RunView[] {
    return [...this.runs.values()]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .map((run) => this.toView(run, options));
  }

  get(id: string, options: RunViewOptions = {}): RunView | undefined {
    const run = this.runs.get(id);
    return run ? this.toView(run, options) : undefined;
  }

  cancel(id: string): RunView {
    const run = this.requireRun(id);

    if (!isTerminalRun(run)) {
      this.cancelRun(run, "Run cancelled.");
    }

    return this.toView(run);
  }

  async shutdown(options: RunManagerShutdownOptions = {}): Promise<void> {
    this.shuttingDown = true;
    this.shutdownPromise ??= this.performShutdown(
      options.deadlineMs ?? DEFAULT_SHUTDOWN_DEADLINE_MS,
    );
    await this.shutdownPromise;
  }

  private startChildTask(
    run: InternalRun,
    harnessId: string,
    harnesses: HarnessDiscovery[],
    input: RunStartInput,
  ): void {
    const adapter = this.dependencies.findHarnessAdapter(harnessId);
    const discovery = harnesses.find((harness) => harness.id === harnessId);

    if (!adapter || !discovery?.runnable) {
      this.pushEvent(run, {
        type: "task-failed",
        harnessId,
        message: `Harness is not runnable: ${harnessId}.`,
      });
      return;
    }

    try {
      const started = this.dependencies.taskManager.start(adapter, discovery, {
        prompt: input.prompt,
        cwd: input.cwd,
        model: input.model,
        timeoutMs: input.timeoutMs,
      }).task;

      run.taskIds.push(started.id);
      this.pushEvent(run, {
        type: "task-started",
        taskId: started.id,
        harnessId,
        message: `Task started through ${started.harnessName}.`,
      });
    } catch (error) {
      this.pushEvent(run, {
        type: "task-failed",
        harnessId,
        message: errorMessage(error),
      });
    }
  }

  private async waitForChildTasks(run: InternalRun): Promise<TaskView[]> {
    const promises = run.taskIds.map(async (taskId) => {
      const task = await this.dependencies.taskManager.waitForTerminal(taskId);
      if (task && run.status !== "cancelled") {
        this.pushEvent(run, eventFromTask(task));
      }
      return task;
    });

    const tasks = await Promise.all(promises);
    return tasks.filter(isTaskView);
  }

  private async run(run: InternalRun, input: RunStartInput): Promise<void> {
    try {
      const terminalTasks = await this.waitForChildTasks(run);

      if (run.status === "cancelled") {
        return;
      }

      const successfulTasks = terminalTasks.filter((task) =>
        task.status === "succeeded"
      );

      if (successfulTasks.length === 0) {
        this.failRun(
          run,
          "All child tasks failed or were cancelled.",
          safeDiagnoseTasks(terminalTasks),
        );
        return;
      }

      run.failedTaskDiagnosis = safeDiagnoseTasks(
        terminalTasks.filter((task) => task.status !== "succeeded"),
      );

      const comparableTaskIds = successfulTasks
        .filter(hasComparableOutput)
        .map((task) => task.id);

      if (this.shouldCompare(run, comparableTaskIds.length)) {
        await this.compareSuccessfulTasks(run, input, comparableTaskIds);
        return;
      }

      if (compareWasExpected(run) && comparableTaskIds.length < 2) {
        this.pushEvent(run, {
          type: "compare-skipped",
          message: "Compare skipped because fewer than two tasks produced output.",
        });
      }

      this.succeedRun(run, formatTaskOutputs(successfulTasks));
    } catch (error) {
      if (run.status !== "cancelled") {
        this.failRun(run, errorMessage(error));
      }
    } finally {
      this.touch(run);
    }
  }

  private async compareSuccessfulTasks(
    run: InternalRun,
    input: RunStartInput,
    taskIds: string[],
  ): Promise<void> {
    run.status = "comparing";
    this.touch(run);

    const compare = await this.dependencies.compareManager.start({
      prompt: input.prompt,
      taskIds,
      judgeHarnessId: input.judgeHarnessId,
      judgeModel: input.judgeModel,
      synthesizerHarnessId: input.synthesizerHarnessId,
      synthesizerModel: input.synthesizerModel,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      maxOutputChars: input.maxOutputChars,
    });

    run.compareId = compare.id;
    this.pushEvent(run, {
      type: "compare-started",
      compareId: compare.id,
      message: "Compare started for successful task outputs.",
    });

    const result = await this.waitForCompare(run, compare.id);
    if (isRunStatus(run, "cancelled")) {
      return;
    }

    if (result.status === "succeeded" && result.synthesis?.text.trim()) {
      this.pushEvent(run, {
        type: "compare-succeeded",
        compareId: compare.id,
        message: "Compare returned the final answer.",
      });
      this.succeedRun(run, result.synthesis.text.trim());
      return;
    }

    this.pushEvent(run, {
      type: "compare-failed",
      compareId: compare.id,
      message: `Compare ended with status ${result.status}.`,
    });
    this.failRun(run, `Compare ended with status ${result.status}.`);
  }

  private async waitForCompare(
    run: InternalRun,
    compareId: string,
  ): Promise<CompareView> {
    while (true) {
      const compare = this.dependencies.compareManager.get(compareId, {
        includeCandidates: false,
        includeEvents: true,
        maxEvents: 25,
      });

      if (!compare) {
        throw new Error(`Run child compare disappeared: ${compareId}`);
      }

      if (isTerminalCompare(compare) || run.status === "cancelled") {
        return compare;
      }

      await sleep(POLL_MS);
      this.touch(run);
    }
  }

  private shouldCompare(run: InternalRun, comparableTaskCount: number): boolean {
    if (comparableTaskCount < 2) {
      return false;
    }

    if (run.compareMode === true) {
      return true;
    }

    if (run.compareMode === false) {
      return false;
    }

    return run.plan.compareSuggested;
  }

  private toView(
    run: InternalRun,
    options: RunViewOptions = {},
  ): RunView {
    const now = Date.now();
    const end = run.endedAtMs ?? now;
    const eta = this.eta(run);
    const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
    const maxAnswerChars = options.maxAnswerChars ?? DEFAULT_MAX_ANSWER_CHARS;
    const finalAnswer = run.finalAnswer;

    return {
      id: run.id,
      status: run.status,
      mode: run.mode,
      compareMode: run.compareMode,
      promptPreview: preview(run.prompt),
      createdAt: new Date(run.createdAtMs).toISOString(),
      updatedAt: new Date(run.updatedAtMs).toISOString(),
      endedAt: run.endedAtMs ? new Date(run.endedAtMs).toISOString() : undefined,
      elapsedMs: Math.max(0, end - run.createdAtMs),
      plan: run.plan,
      selectedHarnessIds: run.selectedHarnessIds,
      taskIds: run.taskIds,
      compareId: run.compareId,
      activeTaskId: eta.activeTaskId,
      remainingMs: eta.remainingMs,
      etaConfidence: eta.etaConfidence,
      finalAnswer: finalAnswer ? truncate(finalAnswer, maxAnswerChars) : undefined,
      finalAnswerChars: finalAnswer?.length ?? 0,
      error: run.error,
      diagnosis: run.diagnosis,
      failedTaskDiagnosis: run.failedTaskDiagnosis,
      eventCount: run.events.length,
      events: options.includeEvents === false ? [] : tailItems(run.events, maxEvents),
    };
  }

  private eta(run: InternalRun): EtaSnapshot {
    if (isTerminalRun(run)) {
      return {
        remainingMs: 0,
        etaConfidence: "complete",
      };
    }

    if (run.status === "comparing" && run.compareId) {
      const compare = this.dependencies.compareManager.get(run.compareId, {
        includeCandidates: false,
        includeEvents: false,
      });

      return {
        activeTaskId: compare?.activeTaskId,
        remainingMs: compare?.remainingMs ?? null,
        etaConfidence: compare?.etaConfidence ?? "unknown",
      };
    }

    const runningTasks = run.taskIds
      .map((taskId) =>
        this.dependencies.taskManager.get(taskId, {
          includeOutput: false,
          includeEvents: false,
        })
      )
      .filter(isRunningTask);

    if (runningTasks.length === 0) {
      return {
        remainingMs: null,
        etaConfidence: "unknown",
      };
    }

    const slowest = runningTasks.reduce((previous, current) =>
      (current.remainingMs ?? 0) > (previous.remainingMs ?? 0) ? current : previous
    );

    return {
      activeTaskId: slowest.id,
      remainingMs: slowest.remainingMs,
      etaConfidence: slowest.etaConfidence,
    };
  }

  private async performShutdown(deadlineMs: number): Promise<void> {
    const taskIds = new Set<string>();

    for (const run of this.runs.values()) {
      if (isTerminalRun(run)) {
        continue;
      }

      for (const taskId of run.taskIds) {
        taskIds.add(taskId);
      }

      if (run.compareId) {
        const compare = this.dependencies.compareManager.get(run.compareId, {
          includeCandidates: false,
          includeEvents: false,
        });

        for (const taskId of compareTaskIds(compare)) {
          taskIds.add(taskId);
        }
      }

      this.cancelRun(run, "Run cancelled by shutdown.");
    }

    await Promise.allSettled(
      [...taskIds].map((taskId) =>
        this.dependencies.taskManager.waitForTerminal(taskId, deadlineMs)
      ),
    );
  }

  private cancelRun(run: InternalRun, message: string): void {
    run.status = "cancelled";
    run.endedAtMs = Date.now();
    this.pushEvent(run, { type: "cancelled", message });

    for (const taskId of run.taskIds) {
      const task = this.dependencies.taskManager.get(taskId, {
        includeOutput: false,
        includeEvents: false,
      });
      if (task?.status === "running") {
        this.dependencies.taskManager.cancel(taskId);
      }
    }

    if (run.compareId) {
      this.dependencies.compareManager.cancel(run.compareId);
    }
  }

  private succeedRun(run: InternalRun, finalAnswer: string): void {
    run.status = "succeeded";
    run.finalAnswer = finalAnswer;
    run.endedAtMs = Date.now();
    this.pushEvent(run, {
      type: "succeeded",
      message: "Run completed.",
    });
  }

  private failRun(
    run: InternalRun,
    message: string,
    diagnosis?: TaskDiagnosis,
  ): void {
    run.status = "failed";
    run.error = message;
    run.diagnosis = diagnosis;
    run.endedAtMs = Date.now();
    this.pushEvent(run, {
      type: "failed",
      message,
    });
  }

  private requireRun(id: string): InternalRun {
    const run = this.runs.get(id);
    if (!run) {
      throw new Error(`Unknown run: ${id}`);
    }

    return run;
  }

  private pushEvent(run: InternalRun, event: Omit<RunEvent, "at">): void {
    run.events.push({
      at: new Date().toISOString(),
      ...event,
    });
    this.touch(run);
  }

  private touch(run: InternalRun): void {
    run.updatedAtMs = Date.now();
  }
}

function selectHarnessIds(
  harnessId: string | undefined,
  mode: RunMode,
  plan: RoutePlan,
): string[] {
  if (harnessId) {
    return [harnessId];
  }

  if (mode === "parallel") {
    return plan.candidates;
  }

  if (mode === "single") {
    return plan.selected ? [plan.selected] : [];
  }

  if (plan.parallelSuggested) {
    return plan.candidates;
  }

  return plan.selected ? [plan.selected] : [];
}

function eventFromTask(task: TaskView): Omit<RunEvent, "at"> {
  if (task.status === "succeeded") {
    return {
      type: "task-succeeded",
      taskId: task.id,
      harnessId: task.harnessId,
      message: `${task.harnessName} succeeded.`,
      elapsedMs: task.elapsedMs,
      remainingMs: task.remainingMs,
    };
  }

  if (task.status === "cancelled") {
    return {
      type: "task-cancelled",
      taskId: task.id,
      harnessId: task.harnessId,
      message: `${task.harnessName} was cancelled.`,
      elapsedMs: task.elapsedMs,
      remainingMs: task.remainingMs,
    };
  }

  return {
    type: "task-failed",
    taskId: task.id,
    harnessId: task.harnessId,
    message: `${task.harnessName} ended with status ${task.status}.`,
    elapsedMs: task.elapsedMs,
    remainingMs: task.remainingMs,
  };
}

function hasComparableOutput(task: TaskView): boolean {
  return `${task.stdout.trim()}\n${task.stderr.trim()}`.trim().length > 0;
}

function formatTaskOutputs(tasks: TaskView[]): string {
  if (tasks.length === 1) {
    return `${tasks[0].stdout.trim()}\n${tasks[0].stderr.trim()}`.trim();
  }

  return tasks
    .map((task) =>
      [
        `## ${task.harnessName} (${task.id})`,
        `${task.stdout.trim()}\n${task.stderr.trim()}`.trim() ||
          "(no output)",
      ].join("\n\n")
    )
    .join("\n\n");
}

function compareWasExpected(run: InternalRun): boolean {
  return run.compareMode === true ||
    (run.compareMode === "auto" && run.plan.compareSuggested);
}

function safeDiagnoseTasks(tasks: TaskView[]): TaskDiagnosis | undefined {
  try {
    return diagnoseTasks(tasks);
  } catch {
    return undefined;
  }
}

function isTaskView(task: TaskView | undefined): task is TaskView {
  return Boolean(task);
}

function isRunningTask(task: TaskView | undefined): task is TaskView {
  return task?.status === "running";
}

function compareTaskIds(compare: CompareView | undefined): string[] {
  if (!compare) {
    return [];
  }

  return [compare.judgeTaskId, compare.synthesizerTaskId].filter(
    (taskId): taskId is string => Boolean(taskId),
  );
}

function isTerminalCompare(compare: CompareView): boolean {
  return (
    compare.status === "succeeded" ||
    compare.status === "failed" ||
    compare.status === "cancelled"
  );
}

function isTerminalRun(run: InternalRun): boolean {
  return (
    run.status === "succeeded" ||
    run.status === "failed" ||
    run.status === "cancelled"
  );
}

function isRunStatus(run: InternalRun, status: RunStatus): boolean {
  return run.status === status;
}

function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }

  if (text.length <= maxChars) {
    return text;
  }

  if (maxChars <= 3) {
    return ".".repeat(maxChars);
  }

  return `${text.slice(0, maxChars - 3)}...`;
}

function tailItems<T>(items: T[], maxItems: number): T[] {
  if (maxItems <= 0) {
    return [];
  }

  return items.slice(-maxItems);
}

function preview(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 160 ? clean : `${clean.slice(0, 157)}...`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
