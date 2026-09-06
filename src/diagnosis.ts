import type { TaskView } from "./tasks";
import { truncate } from "./internal";

export type TaskOutputPreview = {
  harnessId: string;
  chars: number;
  preview: string;
};

export type TaskDiagnosis = {
  summary: string;
  likelyCause: string;
  suggestions: string[];
  partialOutputPreviews?: TaskOutputPreview[];
};

const PREVIEW_CHARS = 240;

export function diagnoseTasks(tasks: TaskView[]): TaskDiagnosis | undefined {
  const failedTasks = tasks.filter((task) => task.status !== "succeeded");
  if (failedTasks.length === 0) {
    return undefined;
  }

  if (failedTasks.every((task) => task.status === "cancelled")) {
    return undefined;
  }

  const summary = failedTasks.map(summaryLine).join(" ");
  const partialOutputPreviews = failedTasks
    .map(outputPreview)
    .filter(isTaskOutputPreview);

  return {
    summary,
    likelyCause: likelyCause(failedTasks),
    suggestions: suggestions(failedTasks, partialOutputPreviews.length > 0),
    partialOutputPreviews: partialOutputPreviews.length > 0
      ? partialOutputPreviews
      : undefined,
  };
}

function likelyCause(tasks: TaskView[]): string {
  if (tasks.every(hasAuthenticationError)) {
    return "Agent authentication failed. This attempt did not establish how the selected model would handle the task.";
  }
  if (tasks.every((task) => task.timedOut)) {
    if (tasks.some(outputChars) && tasks.some(hasRecentOutput)) {
      return "The task produced output near its deadline but did not return a completed result.";
    }

    if (tasks.some(outputChars)) {
      return "Provider timeout after partial progress.";
    }

    return "Provider timeout before useful output; this may be slow startup, a model hang, or provider configuration.";
  }

  if (tasks.some((task) => task.drainTimedOut)) {
    return "Output drain timed out; captured output may be incomplete.";
  }

  if (tasks.some((task) => task.exitCode !== undefined && task.exitCode !== 0)) {
    return "Provider command error or bad configuration.";
  }

  if (tasks.some((task) => task.status === "cancelled")) {
    return "Some providers were cancelled before returning an answer.";
  }

  return "Provider failure; inspect task events and captured output for details.";
}

function suggestions(
  tasks: TaskView[],
  hasPartialOutput: boolean,
): string[] {
  const result = new Set<string>();

  if (tasks.some(hasAuthenticationError)) {
    result.add("Sign in through the affected agent's supported CLI, then retry the same task.");
  }

  if (tasks.some((task) => task.timedOut)) {
    result.add("Inspect the attempt before retrying. Narrow the task, adjust its execution settings, or allow more time if justified.");
  }

  if (hasPartialOutput) {
    result.add("Inspect partial output and events with ennodia_get_task.");
  }

  if (tasks.some((task) => task.exitCode !== undefined && task.exitCode !== 0)) {
    result.add("Inspect stderr and task events with ennodia_get_task.");
    if (!tasks.every(hasAuthenticationError)) {
      result.add("Check the requested model and command configuration before retrying.");
    }
  }

  if (tasks.some((task) => task.drainTimedOut)) {
    result.add("Inspect captured output; the process exited but output capture did not fully drain.");
  }

  if (result.size === 0) {
    result.add("Inspect task events with ennodia_get_task.");
  }

  return [...result];
}

function hasAuthenticationError(task: TaskView): boolean {
  return !task.timedOut && /^(?:Error: )?(?:Failed to authenticate:|OAuth session expired|Authentication failed:|Not logged in\b)/im
    .test(`${task.stdout}\n${task.stderr}`);
}

function summaryLine(task: TaskView): string {
  const status = task.timedOut ? "timed out" : task.status;
  const facts = [
    `${task.harnessName} ${status} after ${formatDuration(task.elapsedMs)}.`,
    `${task.stdoutChars + task.stderrChars} chars captured.`,
  ];

  if (task.exitCode !== undefined && task.exitCode !== null) {
    facts.push(`Exit code ${task.exitCode}.`);
  }

  return facts.join(" ");
}

function outputPreview(task: TaskView): TaskOutputPreview | undefined {
  const output = `${task.stdout.trim()}\n${task.stderr.trim()}`.trim();
  if (!output) {
    return undefined;
  }

  return {
    harnessId: task.harnessId,
    chars: task.stdoutChars + task.stderrChars,
    preview: truncate(output.replace(/\s+/g, " "), PREVIEW_CHARS),
  };
}

function outputChars(task: TaskView): number {
  return task.stdoutChars + task.stderrChars;
}

function hasRecentOutput(task: TaskView): boolean {
  if (!task.lastOutputAt || !task.endedAt) {
    return false;
  }

  return new Date(task.endedAt).getTime() - new Date(task.lastOutputAt).getTime() <
    10_000;
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${Math.round(ms / 1_000)}s`;
}

function isTaskOutputPreview(
  preview: TaskOutputPreview | undefined,
): preview is TaskOutputPreview {
  return Boolean(preview);
}
