import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnnodiaCore } from "./core";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";
import { FileHistorySink } from "./history";
import type { RoutePlan } from "./planner";

describe("EnnodiaCore", () => {
  it("keeps manager state isolated per core instance", async () => {
    const first = createFixtureCore();
    const second = createFixtureCore();

    const started = await first.startRun({
      prompt: "hello core",
      harnessId: "core-agent",
      compare: false,
      timeoutMs: 5_000,
    });
    const finished = await waitForRun(first, started.id);

    expect(finished.status).toBe("succeeded");
    expect(finished.finalAnswer).toBe("core:hello core");
    expect(first.listTasks()).toHaveLength(1);
    expect(second.listTasks()).toHaveLength(0);

    await first.shutdown();
    await second.shutdown();
  });

  it("resolves runnable harnesses through the core adapter registry", async () => {
    const core = createFixtureCore();

    const resolved = await core.resolveRunnableHarness("core-agent");

    expect(resolved.adapter.id).toBe("core-agent");
    expect(resolved.discovery.runnable).toBe(true);

    await core.shutdown();
  });

  it("waits for a run to reach a terminal state", async () => {
    const core = createFixtureCore();

    const started = await core.startRun({
      prompt: "wait for me",
      compare: false,
      timeoutMs: 5_000,
    });
    const finished = await core.waitForRun(started.id, 10_000);

    expect(finished?.status).toBe("succeeded");
    expect(finished?.finalAnswer).toBe("core:wait for me");

    await core.shutdown();
  });

  it("estimates a run without starting child processes", async () => {
    const core = createFixtureCore();

    const estimate = await core.estimateRun({ prompt: "estimate me" });

    expect(estimate.selectedHarnessIds).toEqual(["core-agent"]);
    expect(estimate.budget.exceeded).toBe(false);
    expect(estimate.budget.estimate.estimatedTotalInputTokens).toBeGreaterThan(0);
    expect(core.listTasks()).toHaveLength(0);

    await core.shutdown();
  });

  it("rejects unknown harnesses in run estimates", async () => {
    const core = createFixtureCore();

    await expect(
      core.estimateRun({ prompt: "estimate me", harnessId: "missing-harness" }),
    ).rejects.toThrow("Unknown harness: missing-harness");

    await core.shutdown();
  });

  it("starts raw task batches behind a budget preflight", async () => {
    const core = createFixtureCore();

    await expect(
      core.startTasks({
        prompt: "too many tasks",
        budget: { maxChildTasks: 0 },
      }),
    ).rejects.toThrow("Budget limit exceeded");
    expect(core.listTasks()).toHaveLength(0);

    const started = await core.startTasks({
      prompt: "start me",
      timeoutMs: 5_000,
    });

    expect(started.tasks).toHaveLength(1);
    expect(started.budget.exceeded).toBe(false);

    const task = await core.taskManager.waitForTerminal(
      started.tasks[0].id,
      10_000,
    );
    expect(task?.status).toBe("succeeded");

    await core.shutdown();
  });

  it("flags skills discoverable in cwd but not requested by this task batch", async () => {
    const core = createFixtureCore();
    const cwd = await mkdtemp(join(tmpdir(), "ennodia-unrequested-skill-"));

    try {
      const skillDir = join(cwd, ".agents", "skills", "leftover-skill");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        [
          "---",
          "name: leftover-skill",
          "description: A skill left over from another run.",
          "---",
          "Instructions.",
        ].join("\n"),
      );

      const started = await core.startTasks({
        prompt: "start me",
        cwd,
        timeoutMs: 5_000,
      });

      expect(started.unrequestedSkillsPresent).toEqual(["leftover-skill"]);

      await core.taskManager.waitForTerminal(started.tasks[0].id, 10_000);
    } finally {
      await core.shutdown();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("does not flag a skill as unrequested once it's part of skillIds", async () => {
    const core = createFixtureCore();
    const cwd = await mkdtemp(join(tmpdir(), "ennodia-requested-skill-"));

    try {
      const skillDir = join(cwd, ".agents", "skills", "wanted-skill");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        [
          "---",
          "name: wanted-skill",
          "description: A skill this run actually wants.",
          "---",
          "Instructions.",
        ].join("\n"),
      );

      const started = await core.startTasks({
        prompt: "start me",
        cwd,
        skillIds: ["wanted-skill"],
        timeoutMs: 5_000,
      });

      expect(started.unrequestedSkillsPresent).toEqual([]);

      await core.taskManager.waitForTerminal(started.tasks[0].id, 10_000);
    } finally {
      await core.shutdown();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("runs compositional slices and reports Compare readiness", async () => {
    const core = createFixtureCore();

    await expect(
      core.startCompositional({
        prompt: "overall goal",
        slices: [
          { id: "dup", prompt: "first" },
          { id: "dup", prompt: "second" },
        ],
      }),
    ).rejects.toThrow("Duplicate compositional slice ID: dup");

    const started = await core.startCompositional({
      prompt: "overall goal",
      slices: [
        { id: "alpha", title: "Alpha", prompt: "look at alpha" },
        { prompt: "look at beta" },
      ],
      timeoutMs: 5_000,
    });

    expect(started.tasks.map((item) => item.sliceId)).toEqual([
      "alpha",
      "slice-2",
    ]);
    expect(started.compareNext.taskIds).toHaveLength(2);

    for (const taskId of started.compareNext.taskIds) {
      await core.taskManager.waitForTerminal(taskId, 10_000);
    }

    const status = core.getCompositionalStatus({
      taskIds: [...started.compareNext.taskIds, "missing-task"],
      prompt: "overall goal",
    });

    expect(status.missingTaskIds).toEqual(["missing-task"]);
    expect(status.readyTaskIds).toHaveLength(2);
    expect(status.compareReady).toBe(true);
    expect(status.compareNext?.taskIds).toEqual(status.readyTaskIds);

    await core.shutdown();
  });

  it("persists terminal run history across core restarts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ennodia-core-history-"));
    try {
      const first = createHistoryFixtureCore(new FileHistorySink({ dir }));
      const started = await first.startRun({
        prompt: "compare the fixture outputs",
        mode: "parallel",
        compare: true,
        judgeHarnessId: "history-a",
        synthesizerHarnessId: "history-a",
        timeoutMs: 5_000,
      });
      const finished = await first.waitForRun(started.id, 10_000);

      expect(finished?.status).toBe("succeeded");
      expect(finished?.finalAnswer).toBe("synthesized history answer");
      await first.shutdown();

      const second = createHistoryFixtureCore(new FileHistorySink({ dir }));
      const history = await second.listRunHistory({ limit: 1 });

      expect(history).toHaveLength(1);
      expect(history[0].run.finalAnswer).toBe("synthesized history answer");
      expect(history[0].compare?.analysis?.consensus).toEqual([
        "Both agents completed the fixture.",
      ]);
      expect(history[0].tasks.every((task) => !("env" in task))).toBe(true);

      await second.shutdown();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function createFixtureCore(): EnnodiaCore {
  return new EnnodiaCore({
    discoverHarnesses: async () => [coreDiscovery],
    findHarnessAdapter: (id) => id === coreAdapter.id ? coreAdapter : undefined,
    planRoute: () => coreRoutePlan,
  });
}

function createHistoryFixtureCore(historySink: FileHistorySink): EnnodiaCore {
  const adapters = [historyAdapter("history-a"), historyAdapter("history-b")];
  return new EnnodiaCore({
    historySink,
    discoverHarnesses: async () =>
      adapters.map((adapter) => ({
        id: adapter.id,
        name: adapter.name,
        kind: adapter.kind,
        available: true,
        runnable: true,
        commandPath: "/bin/sh",
        capabilities: adapter.capabilities,
        notes: [],
      })),
    findHarnessAdapter: (id) => adapters.find((adapter) => adapter.id === id),
    planRoute: () => ({
      category: "general",
      reasons: ["test compare route"],
      candidates: ["history-a", "history-b"],
      selected: "history-a",
      parallelSuggested: true,
      compareSuggested: true,
    }),
  });
}

const coreAdapter: HarnessAdapter = {
  id: "core-agent",
  name: "Core Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["core-test"],
  buildCommand: (commandPath, input) => ({
    command: commandPath,
    args: [
      "-c",
      "printf 'core:%s' \"$1\"",
      "core-agent",
      input.prompt,
    ],
  }),
};

function historyAdapter(id: string): HarnessAdapter {
  return {
    id,
    name: id,
    kind: "cli",
    commandCandidates: ["sh"],
    capabilities: ["core-test"],
    buildCommand: (commandPath, input) => ({
      command: commandPath,
      args: [
        "-c",
        [
          "case \"$1\" in",
          "*ENNODIA_COMPARE_JUDGE*) printf '%s' '{\"consensus\":[\"Both agents completed the fixture.\"],\"contradictions\":[],\"partial_coverage\":[],\"unique_insights\":[],\"blind_spots\":[],\"risks\":[],\"confidence\":\"high\"}' ;;",
          "*ENNODIA_COMPARE_SYNTHESIZER*) printf '%s' 'synthesized history answer' ;;",
          "*) printf '%s:%s' \"$2\" \"$1\" ;;",
          "esac",
        ].join("\n"),
        "history-agent",
        input.prompt,
        id,
      ],
    }),
  };
}

const coreDiscovery: HarnessDiscovery = {
  id: coreAdapter.id,
  name: coreAdapter.name,
  kind: coreAdapter.kind,
  available: true,
  runnable: true,
  commandPath: "/bin/sh",
  capabilities: coreAdapter.capabilities,
  notes: [],
};

const coreRoutePlan: RoutePlan = {
  category: "general",
  reasons: ["test route"],
  candidates: ["core-agent"],
  selected: "core-agent",
  parallelSuggested: false,
  compareSuggested: false,
};

async function waitForRun(
  core: EnnodiaCore,
  runId: string,
): Promise<NonNullable<ReturnType<EnnodiaCore["getRun"]>>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = core.getRun(runId);
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
