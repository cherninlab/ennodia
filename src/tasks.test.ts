import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  symlinkSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";
import { TaskManager, type TaskSpawn } from "./tasks";

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

  it("can send prompts through stdin for CLIs that do not accept prompt args", async () => {
    const manager = new TaskManager();
    const { task } = manager.start(stdinEchoAdapter, shellDiscovery, {
      prompt: "from stdin",
      timeoutMs: 5_000,
    });

    const result = await waitForTask(manager, task.id);

    expect(result.status).toBe("succeeded");
    expect(result.stdout).toBe("stdin:from stdin\n");
    expect(result.command).toContain("<stdin-prompt>");
    expect(result.command).not.toContain("from stdin");
  });

  it("settles and kills the child process when a stdin write fails", async () => {
    let killed = false;
    let resolveExited: (exitCode: number) => void = () => undefined;
    const exited = new Promise<number>((resolve) => {
      resolveExited = resolve;
    });
    const emptyStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    const manager = new TaskManager({
      spawn: () =>
        ({
          pid: 123,
          stdin: {
            write: () => {
              throw new Error("stdin write failed");
            },
            end: () => undefined,
          },
          stdout: emptyStream(),
          stderr: emptyStream(),
          exited,
          kill: () => {
            killed = true;
            resolveExited(1);
            return true;
          },
        }) as unknown as ReturnType<TaskSpawn>,
    });

    const { task } = manager.start(stdinEchoAdapter, shellDiscovery, {
      prompt: "from stdin",
      timeoutMs: 5_000,
    });
    const result = await manager.waitForTerminal(task.id, 1_000);

    expect(killed).toBe(true);
    expect(result?.status).toBe("failed");
    expect(result?.events.some((event) =>
      event.type === "error" && event.message === "stdin write failed"
    )).toBe(true);
  });

  it("does not publish a phantom task when spawning fails synchronously", () => {
    const sourceCwd = mkdtempSync(join(tmpdir(), "ennodia-spawn-failure-"));
    let isolatedCwd: string | undefined;
    let finalMessagePath: string | undefined;
    const adapter: HarnessAdapter = {
      id: "spawn-failure",
      name: "Spawn Failure",
      kind: "cli",
      commandCandidates: ["missing-command"],
      capabilities: ["reasoning"],
      buildCommand: (_commandPath, input) => {
        isolatedCwd = input.cwd;
        finalMessagePath = input.finalMessagePath;
        writeFileSync(finalMessagePath!, "partial output");
        return {
          command: "missing-command",
          args: [],
          cwd: input.cwd,
        };
      },
    };
    const discovery: HarnessDiscovery = {
      id: adapter.id,
      name: adapter.name,
      kind: adapter.kind,
      available: true,
      runnable: true,
      commandPath: "/missing-command",
      capabilities: adapter.capabilities,
      notes: [],
    };
    const manager = new TaskManager({
      spawn: () => {
        throw new Error("spawn failed");
      },
    });

    try {
      expect(() => manager.start(adapter, discovery, {
        prompt: "review",
        cwd: sourceCwd,
        isolateCwd: true,
      })).toThrow("spawn failed");
      expect(manager.list()).toEqual([]);
      expect(isolatedCwd).toBeDefined();
      expect(existsSync(isolatedCwd!)).toBe(false);
      expect(finalMessagePath).toBeDefined();
      expect(existsSync(finalMessagePath!)).toBe(false);
    } finally {
      rmSync(sourceCwd, { recursive: true, force: true });
    }
  });

  it("refuses an absolute symlink before spawning an isolated task", () => {
    const sourceCwd = mkdtempSync(join(tmpdir(), "ennodia-absolute-link-source-"));
    const outsideCwd = mkdtempSync(join(tmpdir(), "ennodia-absolute-link-target-"));
    const outsideFile = join(outsideCwd, "outside.txt");
    writeFileSync(outsideFile, "unchanged");
    symlinkSync(outsideFile, join(sourceCwd, "outside-link"));
    let spawned = false;
    const manager = new TaskManager({
      spawn: (input) => {
        spawned = true;
        return Bun.spawn(input);
      },
    });

    try {
      expect(() => manager.start(writeMarkerAdapter, echoDiscovery, {
        prompt: "absolute link",
        cwd: sourceCwd,
        isolateCwd: true,
      })).toThrow("Cannot isolate working directory containing symbolic link");
      expect(spawned).toBe(false);
      expect(manager.list()).toEqual([]);
      expect(readFileSync(outsideFile, "utf8")).toBe("unchanged");
    } finally {
      rmSync(sourceCwd, { recursive: true, force: true });
      rmSync(outsideCwd, { recursive: true, force: true });
    }
  });

  it("refuses a parent-relative symlink before spawning an isolated task", () => {
    const parentCwd = mkdtempSync(join(tmpdir(), "ennodia-relative-link-"));
    const sourceCwd = mkdtempSync(join(parentCwd, "source-"));
    const outsideFile = join(parentCwd, "outside.txt");
    writeFileSync(outsideFile, "unchanged");
    symlinkSync("../outside.txt", join(sourceCwd, "outside-link"));
    let spawned = false;
    const manager = new TaskManager({
      spawn: (input) => {
        spawned = true;
        return Bun.spawn(input);
      },
    });

    try {
      expect(() => manager.start(writeMarkerAdapter, echoDiscovery, {
        prompt: "relative link",
        cwd: sourceCwd,
        isolateCwd: true,
      })).toThrow("Cannot isolate working directory containing symbolic link");
      expect(spawned).toBe(false);
      expect(manager.list()).toEqual([]);
      expect(readFileSync(outsideFile, "utf8")).toBe("unchanged");
    } finally {
      rmSync(parentCwd, { recursive: true, force: true });
    }
  });

  it("does not store periodic ticks as task events", async () => {
    const manager = new TaskManager();
    const { task } = manager.start(cancellableAdapter, bunDiscovery, {
      prompt: "",
      timeoutMs: 5_000,
    });

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const running = manager.get(task.id);
    manager.cancel(task.id);
    await waitForTask(manager, task.id);

    expect(running?.status).toBe("running");
    expect(running?.events.map((event) => event.type)).toEqual(["started"]);
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

  it("evicts old terminal tasks after the configured history cap", async () => {
    const manager = new TaskManager({ maxTasks: 1 });

    const first = manager.start(echoAdapter, echoDiscovery, {
      prompt: "first",
      timeoutMs: 5_000,
    }).task;
    await waitForTask(manager, first.id);

    const second = manager.start(echoAdapter, echoDiscovery, {
      prompt: "second",
      timeoutMs: 5_000,
    }).task;
    await waitForTask(manager, second.id);

    expect(manager.get(first.id)).toBeUndefined();
    expect(manager.get(second.id)?.status).toBe("succeeded");
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

  it("augments prompts with skills and exposes them in the trace", async () => {
    const manager = new TaskManager();
    const skills = [
      {
        id: "test-skill-1",
        name: "test-skill-1",
        version: "1.0.0",
        description: "Test description",
        instructions: "Always add tests.",
        hash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        source: "project" as const,
        path: "/tmp/test-skill-1.md",
        harnessIds: ["echo-agent"],
        installations: [],
        native: true,
      },
    ];

    const { task } = manager.start(echoAdapter, echoDiscovery, {
      prompt: "hello",
      timeoutMs: 5_000,
      skills,
    });

    const result = await waitForTask(manager, task.id);

    expect(result.status).toBe("succeeded");
    expect(result.promptPreview).toBe("hello");
    expect(result.appliedSkills).toBeDefined();
    expect(result.appliedSkills).toHaveLength(1);
    expect(result.appliedSkills?.[0].id).toBe("test-skill-1");
    expect(result.appliedSkills?.[0].name).toBe("test-skill-1");
    expect(result.appliedSkills?.[0].version).toBe("1.0.0");
    expect(result.appliedSkills?.[0].hash).toBe("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
    expect(result.appliedSkills?.[0].source).toBe("project");
    expect(result.appliedSkills?.[0].harnessIds).toContain("echo-agent");
    expect(result.appliedSkills?.[0].native).toBe(true);
    expect(result.stdout).toContain("Use the installed Agent Skills named: test-skill-1.");
    expect(result.stdout).not.toContain("Always add tests.");
    expect(result.stdout).toContain("hello");
  });

  it("isolates cwd so concurrent tasks writing the same filename don't clobber each other", async () => {
    const sharedCwd = mkdtempSync(join(tmpdir(), "ennodia-isolate-test-"));
    writeFileSync(join(sharedCwd, "marker.txt"), "original");

    const manager = new TaskManager();
    const isolatedCwds: string[] = [];
    try {
      const first = manager.start(writeMarkerAdapter, echoDiscovery, {
        prompt: "first",
        cwd: sharedCwd,
        isolateCwd: true,
        timeoutMs: 5_000,
      }).task;
      const second = manager.start(writeMarkerAdapter, echoDiscovery, {
        prompt: "second",
        cwd: sharedCwd,
        isolateCwd: true,
        timeoutMs: 5_000,
      }).task;
      isolatedCwds.push(first.cwd, second.cwd);

      expect(first.cwd).not.toBe(second.cwd);
      expect(existsSync(first.cwd)).toBe(true);
      expect(existsSync(second.cwd)).toBe(true);

      const firstResult = await waitForTask(manager, first.id);
      const secondResult = await waitForTask(manager, second.id);

      expect(firstResult.status).toBe("succeeded");
      expect(secondResult.status).toBe("succeeded");
      expect(firstResult.isolatedFrom).toBe(sharedCwd);
      expect(secondResult.isolatedFrom).toBe(sharedCwd);
      expect(firstResult.stdout).toBe("first");
      expect(secondResult.stdout).toBe("second");
      expect(existsSync(firstResult.cwd)).toBe(false);
      expect(existsSync(secondResult.cwd)).toBe(false);
      expect(readFileSync(join(sharedCwd, "marker.txt"), "utf8")).toBe("original");
    } finally {
      await manager.shutdown();
      for (const isolatedCwd of isolatedCwds) {
        rmSync(isolatedCwd, { recursive: true, force: true });
      }
      rmSync(sharedCwd, { recursive: true, force: true });
    }
  });

  it("removes an isolated cwd when a task fails", async () => {
    const sharedCwd = mkdtempSync(join(tmpdir(), "ennodia-isolate-failure-"));
    const manager = new TaskManager();
    let isolatedCwd: string | undefined;

    try {
      const task = manager.start(failingAdapter, echoDiscovery, {
        prompt: "fail",
        cwd: sharedCwd,
        isolateCwd: true,
        timeoutMs: 5_000,
      }).task;
      isolatedCwd = task.cwd;

      const result = await waitForTask(manager, task.id);

      expect(result.status).toBe("failed");
      expect(result.exitCode).toBe(7);
      expect(existsSync(isolatedCwd)).toBe(false);
      expect(existsSync(sharedCwd)).toBe(true);
    } finally {
      await manager.shutdown();
      if (isolatedCwd) {
        rmSync(isolatedCwd, { recursive: true, force: true });
      }
      rmSync(sharedCwd, { recursive: true, force: true });
    }
  });

  it("removes an isolated cwd when a task times out", async () => {
    const sharedCwd = mkdtempSync(join(tmpdir(), "ennodia-isolate-timeout-"));
    const manager = new TaskManager();
    let isolatedCwd: string | undefined;

    try {
      const task = manager.start(isolatedCancellableAdapter, bunDiscovery, {
        prompt: "timeout",
        cwd: sharedCwd,
        isolateCwd: true,
        timeoutMs: 25,
      }).task;
      isolatedCwd = task.cwd;

      const result = await waitForTask(manager, task.id);

      expect(result.status).toBe("failed");
      expect(result.timedOut).toBe(true);
      expect(existsSync(isolatedCwd)).toBe(false);
      expect(existsSync(sharedCwd)).toBe(true);
    } finally {
      await manager.shutdown();
      if (isolatedCwd) {
        rmSync(isolatedCwd, { recursive: true, force: true });
      }
      rmSync(sharedCwd, { recursive: true, force: true });
    }
  });

  it("removes an isolated cwd when a task is cancelled", async () => {
    const sharedCwd = mkdtempSync(join(tmpdir(), "ennodia-isolate-cancel-"));
    const manager = new TaskManager();
    let isolatedCwd: string | undefined;

    try {
      const task = manager.start(isolatedCancellableAdapter, bunDiscovery, {
        prompt: "cancel",
        cwd: sharedCwd,
        isolateCwd: true,
        timeoutMs: 5_000,
      }).task;
      isolatedCwd = task.cwd;
      manager.cancel(task.id);

      const result = await waitForTask(manager, task.id);

      expect(result.status).toBe("cancelled");
      expect(existsSync(isolatedCwd)).toBe(false);
      expect(existsSync(sharedCwd)).toBe(true);
    } finally {
      await manager.shutdown();
      if (isolatedCwd) {
        rmSync(isolatedCwd, { recursive: true, force: true });
      }
      rmSync(sharedCwd, { recursive: true, force: true });
    }
  });

  it("removes an isolated cwd during shutdown", async () => {
    const sharedCwd = mkdtempSync(join(tmpdir(), "ennodia-isolate-shutdown-"));
    const manager = new TaskManager();
    let isolatedCwd: string | undefined;

    try {
      const task = manager.start(isolatedCancellableAdapter, bunDiscovery, {
        prompt: "shutdown",
        cwd: sharedCwd,
        isolateCwd: true,
        timeoutMs: 10_000,
      }).task;
      isolatedCwd = task.cwd;

      await manager.shutdown({ deadlineMs: 1_000 });

      expect(manager.get(task.id)?.status).toBe("cancelled");
      expect(existsSync(isolatedCwd)).toBe(false);
      expect(existsSync(sharedCwd)).toBe(true);
    } finally {
      await manager.shutdown();
      if (isolatedCwd) {
        rmSync(isolatedCwd, { recursive: true, force: true });
      }
      rmSync(sharedCwd, { recursive: true, force: true });
    }
  });

  it("removes only its owned isolated cwd when an adapter overrides cwd", async () => {
    const sharedCwd = mkdtempSync(join(tmpdir(), "ennodia-isolate-source-"));
    const adapterCwd = mkdtempSync(join(tmpdir(), "ennodia-adapter-cwd-"));
    const manager = new TaskManager();
    let isolatedCwd: string | undefined;
    const overridingAdapter: HarnessAdapter = {
      id: "cwd-override-agent",
      name: "CWD Override Agent",
      kind: "cli",
      commandCandidates: ["sh"],
      capabilities: ["smoke-test"],
      buildCommand: (commandPath, input) => {
        isolatedCwd = input.cwd;
        return {
          command: commandPath,
          args: ["-c", "exit 0"],
          cwd: adapterCwd,
        };
      },
    };

    try {
      const task = manager.start(overridingAdapter, echoDiscovery, {
        prompt: "override",
        cwd: sharedCwd,
        isolateCwd: true,
        timeoutMs: 5_000,
      }).task;

      expect(task.cwd).toBe(adapterCwd);
      expect(isolatedCwd).toBeDefined();
      expect(isolatedCwd).not.toBe(adapterCwd);

      const result = await waitForTask(manager, task.id);

      expect(result.status).toBe("succeeded");
      expect(existsSync(isolatedCwd!)).toBe(false);
      expect(existsSync(sharedCwd)).toBe(true);
      expect(existsSync(adapterCwd)).toBe(true);
    } finally {
      await manager.shutdown();
      if (isolatedCwd) {
        rmSync(isolatedCwd, { recursive: true, force: true });
      }
      rmSync(sharedCwd, { recursive: true, force: true });
      rmSync(adapterCwd, { recursive: true, force: true });
    }
  });

  it("keeps cleanup ownership when pruning cannot remove an isolated cwd", async () => {
    const sharedCwd = mkdtempSync(join(tmpdir(), "ennodia-isolate-retry-"));
    let firstIsolatedCwd: string | undefined;
    let secondIsolatedCwd: string | undefined;
    let firstCleanupAttempts = 0;
    const manager = new TaskManager({
      maxTasks: 1,
      removeIsolatedCwd: (path) => {
        if (path === firstIsolatedCwd) {
          firstCleanupAttempts += 1;
          if (firstCleanupAttempts <= 3) {
            throw new Error("injected cleanup failure");
          }
        }
        rmSync(path, { recursive: true, force: true });
      },
    });

    try {
      const first = manager.start(writeMarkerAdapter, echoDiscovery, {
        prompt: "first",
        cwd: sharedCwd,
        isolateCwd: true,
        timeoutMs: 5_000,
      }).task;
      firstIsolatedCwd = first.cwd;
      const firstResult = await manager.waitForTerminal(first.id, 1_000);

      expect(firstResult?.status).toBe("succeeded");
      expect(firstCleanupAttempts).toBe(1);
      expect(existsSync(firstIsolatedCwd)).toBe(true);

      const second = manager.start(isolatedCancellableAdapter, bunDiscovery, {
        prompt: "second",
        cwd: sharedCwd,
        isolateCwd: true,
        timeoutMs: 10_000,
      }).task;
      secondIsolatedCwd = second.cwd;

      expect(firstCleanupAttempts).toBe(2);
      expect(manager.get(first.id)).toBeDefined();
      expect(existsSync(firstIsolatedCwd)).toBe(true);

      await manager.shutdown({ deadlineMs: 1_000 });

      expect(firstCleanupAttempts).toBe(4);
      expect(manager.get(first.id)).toBeDefined();
      expect(existsSync(firstIsolatedCwd)).toBe(false);
      expect(existsSync(secondIsolatedCwd)).toBe(false);
    } finally {
      await manager.shutdown();
      if (firstIsolatedCwd) {
        rmSync(firstIsolatedCwd, { recursive: true, force: true });
      }
      if (secondIsolatedCwd) {
        rmSync(secondIsolatedCwd, { recursive: true, force: true });
      }
      rmSync(sharedCwd, { recursive: true, force: true });
    }
  });

  it("does not isolate cwd when isolateCwd is not requested", async () => {
    const sharedCwd = mkdtempSync(join(tmpdir(), "ennodia-no-isolate-test-"));

    const manager = new TaskManager();
    try {
      const { task } = manager.start(writeMarkerAdapter, echoDiscovery, {
        prompt: "hello",
        cwd: sharedCwd,
        timeoutMs: 5_000,
      });
      const result = await waitForTask(manager, task.id);

      expect(result.cwd).toBe(sharedCwd);
      expect(result.isolatedFrom).toBeUndefined();
    } finally {
      rmSync(sharedCwd, { recursive: true, force: true });
    }
  });

  it("isolates the process cwd when cwd is omitted", async () => {
    const manager = new TaskManager();
    let isolatedCwd: string | undefined;

    try {
      const { task } = manager.start(writeMarkerAdapter, echoDiscovery, {
        prompt: "default cwd",
        isolateCwd: true,
        timeoutMs: 5_000,
      });
      isolatedCwd = task.cwd;

      expect(task.cwd).not.toBe(process.cwd());
      expect(task.isolatedFrom).toBe(process.cwd());

      const result = await waitForTask(manager, task.id);

      expect(result.status).toBe("succeeded");
      expect(result.stdout).toBe("default cwd");
      expect(result.isolatedFrom).toBe(process.cwd());
      expect(existsSync(result.cwd)).toBe(false);
    } finally {
      await manager.shutdown();
      if (isolatedCwd) {
        rmSync(isolatedCwd, { recursive: true, force: true });
      }
    }
  });

  it("captures a clean final message from an adapter-written file, separate from raw stdout", async () => {
    const manager = new TaskManager();
    const { task } = manager.start(finalMessageAdapter, echoDiscovery, {
      prompt: "hello",
      timeoutMs: 5_000,
    });

    const result = await waitForTask(manager, task.id);

    expect(result.status).toBe("succeeded");
    expect(result.finalMessage).toBe("clean answer");
    expect(result.stdout).toContain("noisy transcript");
    expect(result.stdout).not.toBe("clean answer");
  });

  it("extracts best-effort usage via the adapter's extractUsage hook", async () => {
    const manager = new TaskManager();
    const { task } = manager.start(usageReportingAdapter, echoDiscovery, {
      prompt: "hello",
      timeoutMs: 5_000,
    });

    const result = await waitForTask(manager, task.id);

    expect(result.status).toBe("succeeded");
    expect(result.usage?.tokensUsed).toBe(42586);
  });
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

const writeMarkerAdapter: HarnessAdapter = {
  id: "write-marker-agent",
  name: "Write Marker Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath, input) => ({
    command: commandPath,
    args: [
      "-c",
      'printf "%s" "$1" > marker.txt; printf "%s" "$1"',
      "write-marker-agent",
      input.prompt,
    ],
    cwd: input.cwd,
  }),
};

const failingAdapter: HarnessAdapter = {
  id: "failing-agent",
  name: "Failing Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath, input) => ({
    command: commandPath,
    args: ["-c", "exit 7"],
    cwd: input.cwd,
  }),
};

const finalMessageAdapter: HarnessAdapter = {
  id: "final-message-agent",
  name: "Final Message Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath, input) => ({
    command: commandPath,
    args: [
      "-c",
      'printf "noisy transcript\\n"; [ -n "$1" ] && printf "%s" "clean answer" > "$1"',
      "final-message-agent",
      input.finalMessagePath ?? "",
    ],
  }),
};

const usageReportingAdapter: HarnessAdapter = {
  id: "usage-reporting-agent",
  name: "Usage Reporting Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath) => ({
    command: commandPath,
    args: ["-c", 'printf "tokens used\\n42,586\\n"'],
  }),
  extractUsage: (stdout) => {
    const match = /tokens used\s*\n\s*([\d,]+)/i.exec(stdout);
    if (!match) {
      return undefined;
    }

    const tokensUsed = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(tokensUsed) ? { tokensUsed } : undefined;
  },
};

const stdinEchoAdapter: HarnessAdapter = {
  id: "stdin-echo-agent",
  name: "Stdin Echo Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath, input) => ({
    command: commandPath,
    args: ["-c", "IFS= read -r line; printf 'stdin:%s\\n' \"$line\""],
    stdin: input.prompt,
  }),
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

const isolatedCancellableAdapter: HarnessAdapter = {
  ...cancellableAdapter,
  id: "isolated-cancellable-agent",
  name: "Isolated Cancellable Agent",
  buildCommand: (commandPath, input) => ({
    command: commandPath,
    args: ["-e", "setTimeout(() => {}, 10_000);"],
    cwd: input.cwd,
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
