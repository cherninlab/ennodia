import { describe, expect, it } from "bun:test";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";
import { TaskManager } from "./tasks";

describe("TaskManager", () => {
  it("captures stdout, stderr, exit status, and task events", async () => {
    const manager = new TaskManager();
    const { task } = manager.start(echoAdapter, echoDiscovery, {
      prompt: "hello",
      timeoutMs: 5_000,
    });

    const result = await waitForTask(manager, task.id);

    expect(result.status).toBe("succeeded");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("stdout:hello\n");
    expect(result.stderr).toBe("stderr:trace\n");
    expect(result.stdoutChars).toBe(result.stdout.length);
    expect(result.stderrChars).toBe(result.stderr.length);
    expect(result.events.map((event) => event.type)).toContain("started");
    expect(result.events.map((event) => event.type)).toContain("exit");
  });

  it("returns lightweight task list views by default", async () => {
    const manager = new TaskManager();
    const { task } = manager.start(echoAdapter, echoDiscovery, {
      prompt: "compact",
      timeoutMs: 5_000,
    });

    await waitForTask(manager, task.id);
    const [listed] = manager.list();

    expect(listed).toBeDefined();
    expect(listed.stdout).toBe("");
    expect(listed.stderr).toBe("");
    expect(listed.events).toEqual([]);
    expect(listed.stdoutChars).toBeGreaterThan(0);
    expect(listed.eventCount).toBeGreaterThan(0);
  });

  it("can return bounded output and events", async () => {
    const manager = new TaskManager();
    const { task } = manager.start(echoAdapter, echoDiscovery, {
      prompt: "abcdef",
      timeoutMs: 5_000,
    });

    await waitForTask(manager, task.id);
    const bounded = manager.get(task.id, {
      includeOutput: true,
      includeEvents: true,
      maxOutputChars: 4,
      maxEvents: 1,
    });

    expect(bounded?.stdout).toBe("def\n");
    expect(bounded?.events).toHaveLength(1);

    const withoutEvents = manager.get(task.id, {
      includeEvents: true,
      maxEvents: 0,
    });
    expect(withoutEvents?.events).toEqual([]);
  });

  it("only marks a task terminal after stdout and stderr drain", async () => {
    const manager = new TaskManager();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { task } = manager.start(largeOutputAdapter, bunDiscovery, {
        prompt: "",
        timeoutMs: 10_000,
      });

      const result = await waitForTask(manager, task.id);

      expect(result.status).toBe("succeeded");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBe(LARGE_STDOUT_CHARS);
      expect(result.stdoutChars).toBe(LARGE_STDOUT_CHARS);
      expect(result.stdout.slice(0, 8)).toBe("xxxxxxxx");
      expect(result.stdout.slice(-8)).toBe("xxxxxxxx");
    }
  }, 20_000);

  it("exposes cancel requests without marking the task terminal early", async () => {
    const manager = new TaskManager();
    const { task } = manager.start(cancellableAdapter, bunDiscovery, {
      prompt: "",
      timeoutMs: 5_000,
    });

    const cancelling = manager.cancel(task.id);
    expect(cancelling.status).toBe("running");
    expect(cancelling.cancelRequested).toBe(true);

    const result = await waitForTask(manager, task.id);
    expect(result.status).toBe("cancelled");
    expect(result.cancelRequested).toBe(true);
    expect(result.timedOut).toBe(false);
  });

  it("fails visibly instead of hanging when output drain times out", async () => {
    const manager = new TaskManager({ drainTimeoutMs: 100 });
    const { task } = manager.start(heldOpenOutputAdapter, shellDiscovery, {
      prompt: "",
      timeoutMs: 5_000,
    });

    const result = await waitForTask(manager, task.id);

    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(0);
    expect(result.drainTimedOut).toBe(true);
    expect(result.events.some((event) =>
      event.message?.includes("Output drain timed out"),
    )).toBe(true);
  }, 10_000);

  it("rejects new starts and cancels running tasks during shutdown", async () => {
    const manager = new TaskManager();
    const { task } = manager.start(cancellableAdapter, bunDiscovery, {
      prompt: "",
      timeoutMs: 10_000,
    });

    const shutdown = manager.shutdown({ deadlineMs: 1_000 });
    expect(() =>
      manager.start(echoAdapter, echoDiscovery, {
        prompt: "late",
        timeoutMs: 5_000,
      })
    ).toThrow("TaskManager is shutting down.");

    await shutdown;
    const result = manager.get(task.id);

    expect(result?.status).toBe("cancelled");
    expect(result?.cancelRequested).toBe(true);
    expect(result?.events.some((event) =>
      event.message === "Cancellation requested by shutdown.",
    )).toBe(true);
  });

  it("force-kills tasks that ignore graceful shutdown", async () => {
    const manager = new TaskManager({ drainTimeoutMs: 50 });
    const { task } = manager.start(ignoreTerminationAdapter, shellDiscovery, {
      prompt: "",
      timeoutMs: 10_000,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    await manager.shutdown({ deadlineMs: 50 });
    const result = manager.get(task.id);

    expect(result?.status).toBe("cancelled");
    expect(result?.cancelRequested).toBe(true);
    expect(result?.events.some((event) =>
      event.message?.includes("force-killing task"),
    )).toBe(true);
  }, 10_000);
});

const echoAdapter: HarnessAdapter = {
  id: "echo-agent",
  name: "Echo Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath, input) => ({
    command: commandPath,
    args: [
      "-c",
      "printf 'stdout:%s\\n' \"$1\"; printf 'stderr:trace\\n' >&2",
      "echo-agent",
      input.prompt,
    ],
  }),
};

const echoDiscovery: HarnessDiscovery = {
  id: echoAdapter.id,
  name: echoAdapter.name,
  kind: echoAdapter.kind,
  available: true,
  runnable: true,
  commandPath: "/bin/sh",
  capabilities: echoAdapter.capabilities,
  notes: [],
};

const LARGE_STDOUT_CHARS = 180_000;

const largeOutputAdapter: HarnessAdapter = {
  id: "large-output-agent",
  name: "Large Output Agent",
  kind: "cli",
  commandCandidates: [process.execPath],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath) => ({
    command: commandPath,
    args: [
      "-e",
      `process.stdout.write("x".repeat(${LARGE_STDOUT_CHARS}));`,
    ],
  }),
};

const cancellableAdapter: HarnessAdapter = {
  id: "cancellable-agent",
  name: "Cancellable Agent",
  kind: "cli",
  commandCandidates: [process.execPath],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath) => ({
    command: commandPath,
    args: ["-e", "setTimeout(() => {}, 10_000);"],
  }),
};

const heldOpenOutputAdapter: HarnessAdapter = {
  id: "held-open-output-agent",
  name: "Held Open Output Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath) => ({
    command: commandPath,
    args: ["-c", "sleep 1 & exit 0"],
  }),
};

const ignoreTerminationAdapter: HarnessAdapter = {
  id: "ignore-termination-agent",
  name: "Ignore Termination Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath) => ({
    command: commandPath,
    args: ["-c", "trap '' TERM; while :; do :; done"],
  }),
};

const bunDiscovery: HarnessDiscovery = {
  id: "bun-test-runner",
  name: "Bun Test Runner",
  kind: "cli",
  available: true,
  runnable: true,
  commandPath: process.execPath,
  capabilities: ["smoke-test"],
  notes: [],
};

const shellDiscovery: HarnessDiscovery = {
  id: "shell-test-runner",
  name: "Shell Test Runner",
  kind: "cli",
  available: true,
  runnable: true,
  commandPath: "/bin/sh",
  capabilities: ["smoke-test"],
  notes: [],
};

async function waitForTask(
  manager: TaskManager,
  taskId: string,
): Promise<NonNullable<ReturnType<TaskManager["get"]>>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const task = manager.get(taskId);
    if (task && task.status !== "running") {
      return task;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for task ${taskId}`);
}
