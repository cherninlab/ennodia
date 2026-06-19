import { describe, expect, it } from "bun:test";
import { diagnoseTasks } from "./diagnosis";
import type { TaskView } from "./tasks";

describe("diagnoseTasks", () => {
  it("diagnoses timed-out tasks with no output", () => {
    const diagnosis = diagnoseTasks([
      taskView({
        harnessName: "OpenCode",
        status: "failed",
        timedOut: true,
      }),
    ]);

    expect(diagnosis?.summary).toContain("OpenCode timed out");
    expect(diagnosis?.likelyCause).toContain("Provider timeout");
    expect(diagnosis?.suggestions).toContain(
      "Retry the timed-out provider with a longer timeoutMs.",
    );
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

    expect(diagnosis?.likelyCause).toContain("Task needed more time");
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
