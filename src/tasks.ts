import { existsSync } from "node:fs";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  HarnessAdapter,
  HarnessDiscovery,
  HarnessRunInput,
} from "./harnesses";

export type TaskStatus = "running" | "succeeded" | "failed" | "cancelled";

export type TaskEvent = {
  at: string;
  type: "started" | "stdout" | "stderr" | "tick" | "exit" | "cancel" | "error";
  message?: string;
  elapsedMs?: number;
  remainingMs?: number | null;
};

export type TaskView = {
  id: string;
  harnessId: string;
  harnessName: string;
  status: TaskStatus;
  cancelRequested: boolean;
  pid?: number;
  cwd: string;
  command: string[];
  promptPreview: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  elapsedMs: number;
  timeoutMs: number;
  remainingMs: number | null;
  etaConfidence: "timeout-budget" | "unknown" | "complete";
  lastOutputAt?: string;
  exitCode?: number | null;
  timedOut: boolean;
  drainTimedOut: boolean;
  stdoutChars: number;
  stderrChars: number;
  eventCount: number;
  stdout: string;
  stderr: string;
  events: TaskEvent[];
};

export type TaskViewOptions = {
  includeOutput?: boolean;
  includeEvents?: boolean;
  maxOutputChars?: number;
  maxEvents?: number;
};

type InternalTask = Omit<
  TaskView,
  | "createdAt"
  | "updatedAt"
  | "endedAt"
  | "elapsedMs"
  | "remainingMs"
  | "etaConfidence"
  | "lastOutputAt"
  | "stdoutChars"
  | "stderrChars"
  | "eventCount"
> & {
  createdAtMs: number;
  updatedAtMs: number;
  endedAtMs?: number;
  lastOutputAtMs?: number;
  process?: Bun.Subprocess<"ignore", "pipe", "pipe">;
  streamsDone?: Promise<void>;
  settled?: Promise<void>;
  streamReaders: Set<ReadableStreamDefaultReader<Uint8Array>>;
  tick?: Timer;
  timeout?: Timer;
};

export type StartTaskResult = {
  task: TaskView;
};

export type TaskManagerOptions = {
  drainTimeoutMs?: number;
};

export type TaskManagerShutdownOptions = {
  deadlineMs?: number;
};

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_DRAIN_TIMEOUT_MS = 1_000;
const DEFAULT_SHUTDOWN_DEADLINE_MS = 5_000;
const MAX_CAPTURE_CHARS = 200_000;
const MAX_EVENT_MESSAGE_CHARS = 4_000;
const MAX_EVENTS = 300;

export class TaskManager {
  private readonly tasks = new Map<string, InternalTask>();
  private readonly drainTimeoutMs: number;
  private shuttingDown = false;
  private shutdownPromise?: Promise<void>;

  constructor(options: TaskManagerOptions = {}) {
    this.drainTimeoutMs = options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;
  }

  start(
    adapter: HarnessAdapter,
    discovery: HarnessDiscovery,
    input: HarnessRunInput,
  ): StartTaskResult {
    if (this.shuttingDown) {
      throw new Error("TaskManager is shutting down.");
    }

    if (!adapter.buildCommand || !discovery.commandPath || !discovery.runnable) {
      throw new Error(`${adapter.name} is not runnable through Ennodia yet.`);
    }

    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const commandSpec = adapter.buildCommand(discovery.commandPath, input);
    const cwd = commandSpec.cwd ?? process.cwd();

    if (!existsSync(cwd)) {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }

    const now = Date.now();
    const task: InternalTask = {
      id: randomUUID(),
      harnessId: adapter.id,
      harnessName: adapter.name,
      status: "running",
      cwd,
      command: [
        basename(commandSpec.command),
        ...commandSpec.args.map((arg) => arg === input.prompt ? "<prompt>" : arg),
      ],
      promptPreview: preview(input.prompt),
      createdAtMs: now,
      updatedAtMs: now,
      timeoutMs,
      cancelRequested: false,
      drainTimedOut: false,
      timedOut: false,
      stdout: "",
      stderr: "",
      events: [],
      streamReaders: new Set(),
    };

    this.tasks.set(task.id, task);
    this.pushEvent(task, { type: "started", message: "Task started." });

    const child = Bun.spawn({
      cmd: [commandSpec.command, ...commandSpec.args],
      cwd,
      env: { ...process.env, ...commandSpec.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    task.process = child;
    task.pid = child.pid;

    task.streamsDone = Promise.all([
      this.pipeStreamSafely(task, "stdout", child.stdout),
      this.pipeStreamSafely(task, "stderr", child.stderr),
    ]).then(() => undefined);

    task.tick = setInterval(() => {
      this.touch(task);
      const view = this.toView(task);
      this.pushEvent(task, {
        type: "tick",
        elapsedMs: view.elapsedMs,
        remainingMs: view.remainingMs,
      });
    }, 1_000);

    task.timeout = setTimeout(() => {
      if (task.cancelRequested) {
        child.kill();
        return;
      }

      task.timedOut = true;
      this.pushEvent(task, {
        type: "error",
        message: `Timed out after ${timeoutMs}ms.`,
      });
      child.kill();
    }, timeoutMs);

    task.settled = this.watchExit(task, child);
    void task.settled;

    return { task: this.toView(task) };
  }

  list(): TaskView[] {
    return this.listViews({
      includeOutput: false,
      includeEvents: false,
    });
  }

  listViews(options: TaskViewOptions = {}): TaskView[] {
    return [...this.tasks.values()]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .map((task) => this.toView(task, options));
  }

  get(taskId: string, options: TaskViewOptions = {}): TaskView | undefined {
    const task = this.tasks.get(taskId);
    return task ? this.toView(task, options) : undefined;
  }

  cancel(taskId: string): TaskView {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }

    if (task.status !== "running") {
      return this.toView(task);
    }

    this.requestCancel(task, "Cancellation requested.");
    return this.toView(task);
  }

  async waitForTerminal(
    taskId: string,
    timeoutMs?: number,
  ): Promise<TaskView | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    if (task.status === "running" && task.settled) {
      await this.waitForSettled([task], timeoutMs);
    }

    return this.toView(task);
  }

  async shutdown(options: TaskManagerShutdownOptions = {}): Promise<void> {
    this.shuttingDown = true;
    this.shutdownPromise ??= this.performShutdown(
      options.deadlineMs ?? DEFAULT_SHUTDOWN_DEADLINE_MS,
    );
    await this.shutdownPromise;
  }

  private async performShutdown(deadlineMs: number): Promise<void> {
    const runningTasks = [...this.tasks.values()].filter((task) =>
      task.status === "running"
    );

    for (const task of runningTasks) {
      this.requestCancel(task, "Cancellation requested by shutdown.");
    }

    await this.waitForSettled(runningTasks, deadlineMs);

    const stillRunning = runningTasks.filter((task) =>
      task.status === "running"
    );
    for (const task of stillRunning) {
      this.pushEvent(task, {
        type: "error",
        message: `Shutdown deadline exceeded after ${deadlineMs}ms; force-killing task.`,
      });
      task.process?.kill("SIGKILL");
    }

    await Promise.allSettled(
      stillRunning.map((task) => task.settled ?? Promise.resolve()),
    );

    for (const task of this.tasks.values()) {
      this.clearTimers(task);
    }
  }

  private async watchExit(
    task: InternalTask,
    child: Bun.Subprocess<"ignore", "pipe", "pipe">,
  ): Promise<void> {
    try {
      const exitCode = await child.exited;
      await this.waitForOutputDrain(task);
      task.exitCode = exitCode;

      if (task.cancelRequested) {
        task.status = "cancelled";
      } else if (task.status === "running") {
        task.status =
          exitCode === 0 && !task.timedOut && !task.drainTimedOut
            ? "succeeded"
            : "failed";
      }

      task.endedAtMs = Date.now();
      this.pushEvent(task, {
        type: "exit",
        message: `Process exited with code ${exitCode}.`,
      });
    } catch (error) {
      await this.waitForOutputDrain(task);

      if (task.cancelRequested) {
        task.status = "cancelled";
      } else if (task.status === "running") {
        task.status = "failed";
      }

      task.endedAtMs = Date.now();
      this.pushEvent(task, {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.clearTimers(task);
      this.touch(task);
    }
  }

  private requestCancel(task: InternalTask, message: string): void {
    if (!task.cancelRequested) {
      task.cancelRequested = true;
      this.pushEvent(task, { type: "cancel", message });
    }

    task.process?.kill();
  }

  private async waitForSettled(
    tasks: InternalTask[],
    timeoutMs?: number,
  ): Promise<void> {
    const waiting = tasks
      .filter((task) => task.status === "running")
      .map((task) => task.settled ?? Promise.resolve());

    if (waiting.length === 0) {
      return;
    }

    const allSettled = Promise.allSettled(waiting).then(() => undefined);
    if (timeoutMs === undefined) {
      await allSettled;
      return;
    }

    let timeout: Timer | undefined;
    await Promise.race([
      allSettled,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);

    if (timeout) {
      clearTimeout(timeout);
    }
  }

  private async waitForOutputDrain(task: InternalTask): Promise<void> {
    if (!task.streamsDone) {
      return;
    }

    let timeout: Timer | undefined;
    const drained = await Promise.race([
      task.streamsDone.then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), this.drainTimeoutMs);
      }),
    ]);

    if (timeout) {
      clearTimeout(timeout);
    }

    if (drained) {
      return;
    }

    task.drainTimedOut = true;
    this.pushEvent(task, {
      type: "error",
      message: `Output drain timed out after ${this.drainTimeoutMs}ms; captured output may be incomplete.`,
    });
    this.cancelStreamReaders(task);
  }

  private cancelStreamReaders(task: InternalTask): void {
    for (const reader of task.streamReaders) {
      void reader.cancel("Output drain timed out.").catch((error) => {
        this.pushEvent(task, {
          type: "error",
          message: `Output reader cancellation failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      });
    }
  }

  private async pipeStreamSafely(
    task: InternalTask,
    streamName: "stdout" | "stderr",
    stream: ReadableStream<Uint8Array> | null,
  ): Promise<void> {
    try {
      await this.pipeStream(task, streamName, stream);
    } catch (error) {
      this.pushEvent(task, {
        type: "error",
        message: `${streamName} read failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  private async pipeStream(
    task: InternalTask,
    streamName: "stdout" | "stderr",
    stream: ReadableStream<Uint8Array> | null,
  ): Promise<void> {
    if (!stream) {
      return;
    }

    const decoder = new TextDecoder();
    const reader = stream.getReader();
    task.streamReaders.add(reader);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        task[streamName] = appendLimited(task[streamName], chunk);
        task.lastOutputAtMs = Date.now();
        this.pushEvent(task, { type: streamName, message: chunk });
        this.touch(task);
      }

      const finalChunk = decoder.decode();
      if (finalChunk) {
        task[streamName] = appendLimited(task[streamName], finalChunk);
        task.lastOutputAtMs = Date.now();
        this.pushEvent(task, { type: streamName, message: finalChunk });
        this.touch(task);
      }
    } finally {
      task.streamReaders.delete(reader);
      reader.releaseLock();
    }
  }

  private toView(task: InternalTask, options: TaskViewOptions = {}): TaskView {
    const now = Date.now();
    const end = task.endedAtMs ?? now;
    const elapsedMs = Math.max(0, end - task.createdAtMs);
    const running = task.status === "running";
    const remainingMs = running
      ? Math.max(0, task.timeoutMs - elapsedMs)
      : 0;
    const includeOutput = options.includeOutput ?? true;
    const includeEvents = options.includeEvents ?? true;
    const maxOutputChars = options.maxOutputChars ?? MAX_CAPTURE_CHARS;
    const maxEvents = options.maxEvents ?? MAX_EVENTS;

    return {
      id: task.id,
      harnessId: task.harnessId,
      harnessName: task.harnessName,
      status: task.status,
      cancelRequested: task.cancelRequested,
      pid: task.pid,
      cwd: task.cwd,
      command: task.command,
      promptPreview: task.promptPreview,
      createdAt: new Date(task.createdAtMs).toISOString(),
      updatedAt: new Date(task.updatedAtMs).toISOString(),
      endedAt: task.endedAtMs ? new Date(task.endedAtMs).toISOString() : undefined,
      elapsedMs,
      timeoutMs: task.timeoutMs,
      remainingMs,
      etaConfidence: running ? "timeout-budget" : "complete",
      lastOutputAt: task.lastOutputAtMs
        ? new Date(task.lastOutputAtMs).toISOString()
        : undefined,
      exitCode: task.exitCode,
      timedOut: task.timedOut,
      drainTimedOut: task.drainTimedOut,
      stdoutChars: task.stdout.length,
      stderrChars: task.stderr.length,
      eventCount: task.events.length,
      stdout: includeOutput ? tail(task.stdout, maxOutputChars) : "",
      stderr: includeOutput ? tail(task.stderr, maxOutputChars) : "",
      events: includeEvents ? tailItems(task.events, maxEvents) : [],
    };
  }

  private pushEvent(
    task: InternalTask,
    event: Omit<TaskEvent, "at">,
  ): void {
    task.events.push({
      at: new Date().toISOString(),
      ...event,
      message: event.message ? trimEventMessage(event.message) : undefined,
    });
    if (task.events.length > MAX_EVENTS) {
      task.events.splice(0, task.events.length - MAX_EVENTS);
    }
    this.touch(task);
  }

  private touch(task: InternalTask): void {
    task.updatedAtMs = Date.now();
  }

  private clearTimers(task: InternalTask): void {
    if (task.tick) {
      clearInterval(task.tick);
      task.tick = undefined;
    }

    if (task.timeout) {
      clearTimeout(task.timeout);
      task.timeout = undefined;
    }
  }
}

function appendLimited(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= MAX_CAPTURE_CHARS) {
    return next;
  }

  return next.slice(next.length - MAX_CAPTURE_CHARS);
}

function tail(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }

  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(text.length - maxChars);
}

function preview(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 160 ? clean : `${clean.slice(0, 157)}...`;
}

function trimEventMessage(message: string): string {
  if (message.length <= MAX_EVENT_MESSAGE_CHARS) {
    return message;
  }

  return `${message.slice(0, MAX_EVENT_MESSAGE_CHARS)}...`;
}

function tailItems<T>(items: T[], maxItems: number): T[] {
  if (maxItems <= 0) {
    return [];
  }

  return items.slice(-maxItems);
}
