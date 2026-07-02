import { describe, expect, it } from "bun:test";
import { CompareManager } from "./compare";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";
import { planRoute } from "./planner";
import { RunManager } from "./runs";
import { TaskManager } from "./tasks";

describe("RunManager", () => {
  it("runs one task and returns its output without Compare", async () => {
    const fixture = createFixture([echoDiscovery("agent-a", "Agent A")]);

    const started = await fixture.manager.start({
      prompt: "hello",
      harnessId: "agent-a",
      compare: false,
      timeoutMs: 5_000,
    });
    const result = await waitForRun(fixture.manager, started.id);

    expect(result.status).toBe("succeeded");
    expect(result.taskIds).toHaveLength(1);
    expect(result.compareId).toBeUndefined();
    expect(result.finalAnswer).toBe("agent-a:hello");
    expect(result.events.map((event) => event.type)).toContain("task-succeeded");
  });

  it("bounds run events and final answers at zero and tiny limits", async () => {
    const fixture = createFixture([echoDiscovery("agent-a", "Agent A")]);

    const started = await fixture.manager.start({
      prompt: "hello",
      harnessId: "agent-a",
      compare: false,
      timeoutMs: 5_000,
    });
    await waitForRun(fixture.manager, started.id);

    expect(fixture.manager.get(started.id, { maxEvents: 0 })?.events).toEqual([]);
    expect(fixture.manager.get(started.id, { maxAnswerChars: 0 })?.finalAnswer)
      .toBe("");
    expect(fixture.manager.get(started.id, { maxAnswerChars: 1 })?.finalAnswer)
      .toHaveLength(1);
    expect(fixture.manager.get(started.id, { maxAnswerChars: 2 })?.finalAnswer)
      .toHaveLength(2);
    expect(fixture.manager.get(started.id, { maxAnswerChars: 3 })?.finalAnswer)
      .toHaveLength(3);
  });

  it("compares successful parallel task outputs", async () => {
    const fixture = createFixture([
      echoDiscovery("agent-a", "Agent A"),
      echoDiscovery("agent-b", "Agent B"),
    ]);

    const started = await fixture.manager.start({
      prompt: "Compare several code approaches.",
      mode: "parallel",
      compare: true,
      timeoutMs: 5_000,
    });
    const result = await waitForRun(fixture.manager, started.id);

    expect(result.status).toBe("succeeded");
    expect(result.taskIds).toHaveLength(2);
    expect(typeof result.compareId).toBe("string");
    expect(result.finalAnswer).toContain("Final answer from synthesizer");
    expect(result.events.map((event) => event.type)).toContain("compare-started");
    expect(result.events.map((event) => event.type)).toContain("compare-succeeded");
  });

  it("includes run budget estimates and budget-checked events", async () => {
    const fixture = createFixture([echoDiscovery("agent-a", "Agent A")]);

    const started = await fixture.manager.start({
      prompt: "hello budget",
      harnessId: "agent-a",
      compare: false,
      timeoutMs: 5_000,
      budget: {
        maxEstimatedInputTokens: 1_000,
        maxChildTasks: 1,
      },
    });
    const result = await waitForRun(fixture.manager, started.id);

    expect(result.status).toBe("succeeded");
    expect(result.budget.exceeded).toBe(false);
    expect(result.budget.estimate.selectedHarnessIds).toEqual(["agent-a"]);
    expect(result.budget.estimate.estimatedTotalInputTokens).toBeGreaterThan(0);
    expect(result.events.some((event) => event.type === "budget-checked")).toBe(true);
  });

  it("evicts old terminal runs after the configured history cap", async () => {
    const fixture = createFixture([echoDiscovery("agent-a", "Agent A")], {
      maxRuns: 1,
    });

    const first = await fixture.manager.start({
      prompt: "first",
      harnessId: "agent-a",
      compare: false,
      timeoutMs: 5_000,
    });
    await waitForRun(fixture.manager, first.id);

    const second = await fixture.manager.start({
      prompt: "second",
      harnessId: "agent-a",
      compare: false,
      timeoutMs: 5_000,
    });
    await waitForRun(fixture.manager, second.id);

    expect(fixture.manager.get(first.id)).toBeUndefined();
    expect(fixture.manager.get(second.id)?.status).toBe("succeeded");
  });

  it("fails before starting tasks when budget limits are exceeded", async () => {
    const fixture = createFixture([
      echoDiscovery("agent-a", "Agent A"),
      echoDiscovery("agent-b", "Agent B"),
    ]);

    await expect(fixture.manager.start({
      prompt: "Compare several code approaches.",
      mode: "parallel",
      compare: true,
      timeoutMs: 5_000,
      budget: {
        maxChildTasks: 1,
      },
    })).rejects.toThrow("Budget limit exceeded");

    expect(fixture.taskManager.list()).toHaveLength(0);
  });

  it("compares surviving outputs when one parallel task fails", async () => {
    const fixture = createFixture([
      echoDiscovery("agent-a", "Agent A"),
      failingDiscovery,
      echoDiscovery("agent-b", "Agent B"),
    ]);

    const started = await fixture.manager.start({
      prompt: "Compare several implementation options.",
      mode: "parallel",
      compare: true,
      timeoutMs: 5_000,
    });
    const result = await waitForRun(fixture.manager, started.id);

    expect(result.status).toBe("succeeded");
    expect(result.taskIds).toHaveLength(3);
    expect(typeof result.compareId).toBe("string");
    expect(result.finalAnswer).toContain("Final answer from synthesizer");
    expect(result.events.map((event) => event.type)).toContain("task-failed");
    expect(result.failedTaskDiagnosis?.summary).toContain("Failing Agent failed");
    expect(result.failedTaskDiagnosis?.likelyCause).toBe(
      "Provider command error or bad configuration.",
    );
  });

  it("fails visibly when no task succeeds", async () => {
    const fixture = createFixture([failingDiscovery]);

    const started = await fixture.manager.start({
      prompt: "This should fail.",
      harnessId: "failing-agent",
      compare: false,
      timeoutMs: 5_000,
    });
    const result = await waitForRun(fixture.manager, started.id);

    expect(result.status).toBe("failed");
    expect(result.compareId).toBeUndefined();
    expect(result.error).toBe("All child tasks failed or were cancelled.");
    expect(result.diagnosis?.summary).toContain("Failing Agent failed");
    expect(result.diagnosis?.suggestions).toContain(
      "Inspect stderr and task events with ennodia_get_task.",
    );
    expect(result.events.map((event) => event.type)).toContain("failed");
  });

  it("diagnoses all-timeout run failures", async () => {
    const fixture = createFixture([slowDiscovery]);

    const started = await fixture.manager.start({
      prompt: "This should time out.",
      harnessId: "slow-agent",
      compare: false,
      timeoutMs: 30,
    });
    const result = await waitForRun(fixture.manager, started.id);

    expect(result.status).toBe("failed");
    expect(result.diagnosis?.summary).toContain("Slow Agent timed out");
    expect(result.diagnosis?.suggestions).toContain(
      "Retry the timed-out provider with a longer timeoutMs.",
    );
  });

  it("keeps user-cancelled runs free of failure diagnosis", async () => {
    const fixture = createFixture([slowDiscovery]);

    const started = await fixture.manager.start({
      prompt: "Wait here.",
      harnessId: "slow-agent",
      timeoutMs: 10_000,
    });
    fixture.manager.cancel(started.id);
    await waitForTask(fixture.taskManager, started.taskIds[0]);
    const result = fixture.manager.get(started.id);

    expect(result?.status).toBe("cancelled");
    expect(result?.diagnosis).toBeUndefined();
    expect(result?.failedTaskDiagnosis).toBeUndefined();
  });

  it("emits events incrementally as parallel tasks complete", async () => {
    const fixture = createFixture([
      echoDiscovery("agent-a", "Agent A"),
      slowDiscovery,
    ]);

    const started = await fixture.manager.start({
      prompt: "Wait here.",
      mode: "parallel",
      compare: false,
      timeoutMs: 10_000,
    });

    let fastTaskDone = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const run = fixture.manager.get(started.id);
      const hasFastTaskEvent = run?.events.some(
        (e) => e.type === "task-succeeded" && e.harnessId === "agent-a"
      );

      if (hasFastTaskEvent) {
        expect(run?.status).toBe("executing");
        fastTaskDone = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(fastTaskDone).toBe(true);

    fixture.manager.cancel(started.id);
  });

  it("cancels active child tasks", async () => {
    const fixture = createFixture([slowDiscovery]);

    const started = await fixture.manager.start({
      prompt: "Wait here.",
      harnessId: "slow-agent",
      timeoutMs: 10_000,
    });
    const cancelling = fixture.manager.cancel(started.id);
    const task = await waitForTask(fixture.taskManager, started.taskIds[0]);
    const result = fixture.manager.get(started.id);

    expect(cancelling.status).toBe("cancelled");
    expect(result?.status).toBe("cancelled");
    expect(task.status).toBe("cancelled");
    expect(task.cancelRequested).toBe(true);
  });

  it("propagates skills to run tracing and child tasks", async () => {
    const fixture = createFixture([echoDiscovery("agent-a", "Agent A")]);
    const skills = [
      {
        id: "test-skill-r",
        name: "test-skill-r",
        version: "1.0.0",
        description: "Verify run behavior",
        instructions: "Run guidelines instructions.",
        hash: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        source: "project" as const,
        path: "/tmp/test-skill-r.md",
        harnessIds: ["agent-a"],
        installations: [],
        native: true,
      },
    ];

    const started = await fixture.manager.start({
      prompt: "run hello",
      harnessId: "agent-a",
      compare: false,
      timeoutMs: 5_000,
      skills,
    });

    const result = await waitForRun(fixture.manager, started.id);

    expect(result.status).toBe("succeeded");
    expect(result.appliedSkills).toBeDefined();
    expect(result.appliedSkills).toHaveLength(1);
    expect(result.appliedSkills?.[0].id).toBe("test-skill-r");
    expect(result.appliedSkills?.[0].name).toBe("test-skill-r");
    expect(result.appliedSkills?.[0].version).toBe("1.0.0");
    expect(result.appliedSkills?.[0].hash).toBe("abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(result.appliedSkills?.[0].source).toBe("project");
    expect(result.appliedSkills?.[0].harnessIds).toContain("agent-a");
    expect(result.appliedSkills?.[0].native).toBe(true);
    expect(result.events.some((event) =>
      event.type === "skills-applied" && event.skillIds?.includes("test-skill-r")
    )).toBe(true);

    expect(result.finalAnswer).toContain("Use the installed Agent Skills named: test-skill-r.");
    expect(result.finalAnswer).not.toContain("Run guidelines instructions.");
    expect(result.finalAnswer).toContain("run hello");
  });

  it("rejects requested skills that are not installed for the selected harness", async () => {
    const fixture = createFixture([echoDiscovery("agent-a", "Agent A")]);
    const skills = [
      {
        id: "other-skill",
        name: "other-skill",
        version: "1.0.0",
        description: "Not installed for agent-a",
        instructions: "Other harness only.",
        hash: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        source: "project" as const,
        path: "/tmp/other-skill.md",
        harnessIds: ["agent-b"],
        installations: [],
        native: true,
      },
    ];

    await expect(fixture.manager.start({
      prompt: "run hello",
      harnessId: "agent-a",
      compare: false,
      timeoutMs: 5_000,
      skills,
    })).rejects.toThrow("Skill is not installed for agent-a: other-skill");
  });
});

function createFixture(discoveries: HarnessDiscovery[], options: {
  maxRuns?: number;
} = {}): {
  manager: RunManager;
  taskManager: TaskManager;
} {
  const taskManager = new TaskManager();
  const adapters = new Map<string, HarnessAdapter>(
    [
      echoAdapter("agent-a", "Agent A"),
      echoAdapter("agent-b", "Agent B"),
      failingAdapter,
      slowAdapter,
    ].map((adapter) => [adapter.id, adapter]),
  );
  const compareManager = new CompareManager(taskManager, async () => ({
    adapter: compareAdapter,
    discovery: compareDiscovery,
  }));
  const manager = new RunManager({
    taskManager,
    compareManager,
    discoverHarnesses: async () => discoveries,
    findHarnessAdapter: (id) => adapters.get(id),
    planRoute,
  }, options);

  return { manager, taskManager };
}

function echoAdapter(id: string, name: string): HarnessAdapter {
  return {
    id,
    name,
    kind: "cli",
    commandCandidates: ["sh"],
    capabilities: ["run-test"],
    buildCommand: (commandPath, input) => ({
      command: commandPath,
      args: [
        "-c",
        "printf '%s:%s\\n' \"$1\" \"$2\"",
        id,
        id,
        input.prompt,
      ],
    }),
  };
}

function echoDiscovery(id: string, name: string): HarnessDiscovery {
  return {
    id,
    name,
    kind: "cli",
    available: true,
    runnable: true,
    commandPath: "/bin/sh",
    capabilities: ["run-test"],
    notes: [],
  };
}

const failingAdapter: HarnessAdapter = {
  id: "failing-agent",
  name: "Failing Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["run-test"],
  buildCommand: (commandPath) => ({
    command: commandPath,
    args: ["-c", "printf 'failed\\n' >&2; exit 7"],
  }),
};

const failingDiscovery: HarnessDiscovery = {
  id: failingAdapter.id,
  name: failingAdapter.name,
  kind: failingAdapter.kind,
  available: true,
  runnable: true,
  commandPath: "/bin/sh",
  capabilities: failingAdapter.capabilities,
  notes: [],
};

const slowAdapter: HarnessAdapter = {
  id: "slow-agent",
  name: "Slow Agent",
  kind: "cli",
  commandCandidates: [process.execPath],
  capabilities: ["run-test"],
  buildCommand: (commandPath) => ({
    command: commandPath,
    args: ["-e", "setTimeout(() => {}, 10_000);"],
  }),
};

const slowDiscovery: HarnessDiscovery = {
  id: slowAdapter.id,
  name: slowAdapter.name,
  kind: slowAdapter.kind,
  available: true,
  runnable: true,
  commandPath: process.execPath,
  capabilities: slowAdapter.capabilities,
  notes: [],
};

const compareAdapter: HarnessAdapter = {
  id: "compare-agent",
  name: "Compare Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["compare-test"],
  buildCommand: (commandPath, input) => ({
    command: commandPath,
    args: [
      "-c",
      [
        "if printf '%s' \"$1\" | grep -q ENNODIA_COMPARE_JUDGE; then",
        "  printf '%s\\n' '{\"consensus\":[\"Use the successful outputs.\"],\"contradictions\":[],\"partial_coverage\":[],\"unique_insights\":[],\"blind_spots\":[],\"risks\":[],\"confidence\":\"high\"}'",
        "else",
        "  printf '%s\\n' 'Final answer from synthesizer.'",
        "fi",
      ].join("\n"),
      "compare-agent",
      input.prompt,
    ],
  }),
};

const compareDiscovery: HarnessDiscovery = {
  id: compareAdapter.id,
  name: compareAdapter.name,
  kind: compareAdapter.kind,
  available: true,
  runnable: true,
  commandPath: "/bin/sh",
  capabilities: compareAdapter.capabilities,
  notes: [],
};

async function waitForRun(
  manager: RunManager,
  runId: string,
): Promise<NonNullable<ReturnType<RunManager["get"]>>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = manager.get(runId);
    if (
      run &&
      run.status !== "executing" &&
      run.status !== "comparing"
    ) {
      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for run ${runId}`);
}

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
