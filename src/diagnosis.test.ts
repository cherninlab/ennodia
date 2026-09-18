import { describe, expect, it } from "bun:test";
import { diagnoseTasks, hasCodexQuotaError } from "./diagnosis";
import type { TaskView } from "./tasks";

describe("diagnoseTasks", () => {
  it("distinguishes native capacity errors from model and configuration failures", () => {
    const message = "You've hit your usage limit. Try again later.";
    for (const event of [{type: "error", message}, {type: "turn.failed", error: {message}}]) {
      const stdout = JSON.stringify(event);
      expect(hasCodexQuotaError(stdout)).toBe(true);
      const diagnosis = diagnoseTasks([taskView({harnessId: "codex", stdout})]);
      expect(diagnosis?.likelyCause).toContain("capacity was exhausted");
      expect(diagnosis?.suggestions.join(" ")).not.toContain("Check the requested model");
    }
    expect(hasCodexQuotaError(JSON.stringify({type: "item.completed", item: {type: "command_execution", aggregated_output: message}}))).toBe(false);
    expect(hasCodexQuotaError(message)).toBe(false);
    expect(diagnoseTasks([taskView({harnessId: "codex", stderr: JSON.stringify({type:"error", message})})])?.likelyCause).toContain("capacity was exhausted");
  });
  it("diagnoses timed-out tasks with no output", () => {
    const diagnosis = diagnoseTasks([
      taskView({
        harnessName: "OpenCode",
        status: "failed",
        timedOut: true,
      }),
    ]);

    expect(diagnosis?.summary).toContain("OpenCode timed out");
    expect(diagnosis?.likelyCause).toContain("Ennodia stopped the task at its execution deadline");
    expect(diagnosis?.suggestions).toContain(
      "Review captured findings and partial changes before retrying. Check the assigned scope, deadline, tool access, and permissions; continue useful work with an adequate budget instead of repeating the investigation.",
    );
  });

  it("does not diagnose deadline termination as a bad command configuration", () => {
    const diagnosis = diagnoseTasks([taskView({ timedOut: true, exitCode: 143 })]);
    expect(diagnosis?.suggestions.join(" ")).not.toContain("Check the requested model and command configuration");
    expect(diagnosis?.likelyCause).not.toContain("Provider command error");
  });

  it("includes partial output previews for timed-out tasks with output", () => {
    const diagnosis = diagnoseTasks([
      taskView({
        harnessId: "opencode",
        harnessName: "OpenCode",
        status: "failed",
        timedOut: true,
        stdout: "partial recommendation",
        stdoutChars: "partial recommendation".length,
        lastOutputAt: "2026-06-21T12:00:09.000Z",
        endedAt: "2026-06-21T12:00:10.000Z",
      }),
    ]);

    expect(diagnosis?.likelyCause).toContain("produced output near its deadline");
    expect(diagnosis?.partialOutputPreviews?.[0]).toEqual({
      harnessId: "opencode",
      chars: "partial recommendation".length,
      preview: "partial recommendation",
    });
  });

  it("diagnoses non-zero exits with stderr", () => {
    const diagnosis = diagnoseTasks([
      taskView({
        harnessName: "Claude Code",
        status: "failed",
        exitCode: 7,
        stderr: "model not found",
        stderrChars: "model not found".length,
      }),
    ]);

    expect(diagnosis?.likelyCause).toBe(
      "Provider command error or bad configuration.",
    );
    expect(diagnosis?.suggestions).toContain(
      "Inspect stderr and task events with ennodia_get_task.",
    );
  });

  it("skips diagnosis for intentional user cancellation", () => {
    const diagnosis = diagnoseTasks([
      taskView({
        status: "cancelled",
        cancelRequested: true,
      }),
    ]);

    expect(diagnosis).toBeUndefined();
  });

  it("distinguishes an expired agent login from an unsuccessful model attempt", () => {
    const diagnosis = diagnoseTasks([taskView({
      stdout: "Failed to authenticate: OAuth session expired and could not be refreshed\n",
    })]);
    expect(diagnosis?.likelyCause).toContain("authentication failed");
    expect(diagnosis?.suggestions.join(" ")).toContain("Sign in");
  });
});

function taskView(overrides: Partial<TaskView> = {}): TaskView {
  const now = "2026-06-21T12:00:00.000Z";

  return {
    id: "task-1",
    harnessId: "agent",
    harnessName: "Agent",
    status: "failed",
    cancelRequested: false,
    cwd: "/tmp",
    command: ["agent"],
    promptPreview: "prompt",
    createdAt: now,
    updatedAt: now,
    endedAt: "2026-06-21T12:00:10.000Z",
    elapsedMs: 10_000,
    timeoutMs: 10_000,
    remainingMs: 0,
    etaConfidence: "complete",
    exitCode: 1,
    timedOut: false,
    drainTimedOut: false,
    stdoutChars: 0,
    stderrChars: 0,
    eventCount: 0,
    stdout: "",
    stderr: "",
    events: [],
    ...overrides,
  };
}
