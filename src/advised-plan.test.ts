import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AdvisorPlanProposal } from "./advisor";
import { EnnodiaCore } from "./core";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";
import { TaskManager } from "./tasks";

describe("EnnodiaCore advised plans", () => {
  it("revalidates a frozen plan and launches its exact repeated slices", async () => {
    let harnessVersion = "1.0.0";
    const core = createAdvisorCore(() => harnessVersion);
    const started = await core.startPlanAdvice({
      prompt: "Review two independent aspects.",
      advisorHarnessId: "core-agent",
      allowedHarnessIds: ["core-agent"],
      allowedModels: { "core-agent": ["approved-model"] },
      maxSlices: 2,
      timeoutMs: 5_000,
      budget: { maxChildTasks: 2, maxEstimatedInputTokens: 20_000 },
    });

    expect(core.listTasks()).toHaveLength(1);
    const ready = await core.waitForPlanAdvice(started.id, 10_000);
    expect(ready?.status).toBe("ready");
    expect(ready?.plan?.slices.map((slice) => slice.prompt)).toEqual([
      "EXACT_ALPHA_PROMPT",
      "EXACT_BETA_PROMPT",
    ]);
    const digest = ready?.planDigest;
    if (!digest) {
      throw new Error("Expected a frozen plan digest.");
    }

    await expect(core.startAdvisedPlan({
      adviceId: started.id,
      expectedPlanDigest: "sha256:tampered",
    })).rejects.toThrow("digest mismatch");
    expect(core.listTasks()).toHaveLength(1);

    await expect(core.startAdvisedPlan({
      adviceId: started.id,
      expectedPlanDigest: digest,
      budget: { maxChildTasks: 1 },
    })).rejects.toThrow("Budget limit exceeded");
    expect(core.listTasks()).toHaveLength(1);

    harnessVersion = "2.0.0";
    await expect(core.startAdvisedPlan({
      adviceId: started.id,
      expectedPlanDigest: digest,
    })).rejects.toThrow("inventory changed");
    expect(core.listTasks()).toHaveLength(1);

    harnessVersion = "1.0.0";
    const execution = await core.startAdvisedPlan({
      adviceId: started.id,
      expectedPlanDigest: digest,
      timeoutMs: 5_000,
      budget: { maxChildTasks: 2, maxEstimatedInputTokens: 20_000 },
    });

    expect(execution.planDigest).toBe(digest);
    expect(execution.tasks.map((task) => task.harnessId)).toEqual([
      "core-agent",
      "core-agent",
    ]);
    expect(execution.tasks.map((task) => task.model)).toEqual([
      "approved-model",
      "approved-model",
    ]);
    expect(execution.tasks.map((task) => task.task.promptPreview)).toEqual([
      "EXACT_ALPHA_PROMPT",
      "EXACT_BETA_PROMPT",
    ]);
    expect(execution.budget.estimate.selectedHarnessCount).toBe(2);
    expect(core.listTasks()).toHaveLength(3);

    const completed = await Promise.all(
      execution.tasks.map((item) =>
        core.taskManager.waitForTerminal(item.task.id, 10_000)
      ),
    );
    expect(completed.map((task) => task?.stdout)).toEqual([
      "worker:EXACT_ALPHA_PROMPT",
      "worker:EXACT_BETA_PROMPT",
    ]);

    await expect(core.startAdvisedPlan({
      adviceId: started.id,
      expectedPlanDigest: digest,
    })).rejects.toThrow("already been executed");
    expect(core.listTasks()).toHaveLength(3);

    await core.shutdown();
  });

  it("cancels earlier workers when a later slice cannot start", async () => {
    const taskManager = new TaskManager();
    const originalStart = taskManager.start.bind(taskManager);
    let starts = 0;
    taskManager.start = ((...args: Parameters<TaskManager["start"]>) => {
      starts += 1;
      if (starts === 3) {
        throw new Error("fixture worker start failed");
      }
      return originalStart(...args);
    }) as TaskManager["start"];
    const core = createAdvisorCore(() => "1.0.0", undefined, taskManager);

    const started = await core.startPlanAdvice({
      prompt: "Review two independent aspects.",
      advisorHarnessId: "core-agent",
      allowedHarnessIds: ["core-agent"],
      allowedModels: { "core-agent": ["approved-model"] },
      maxSlices: 2,
      timeoutMs: 5_000,
    });
    const ready = await core.waitForPlanAdvice(started.id, 10_000);

    await expect(core.startAdvisedPlan({
      adviceId: started.id,
      expectedPlanDigest: ready!.planDigest!,
      timeoutMs: 5_000,
    })).rejects.toThrow("fixture worker start failed");

    const tasks = core.listTasks();
    expect(tasks).toHaveLength(2);
    const worker = tasks.find((task) => task.id !== started.advisorTaskId);
    expect(worker?.cancelRequested).toBe(true);
    const cancelled = await core.taskManager.waitForTerminal(
      worker!.id,
      10_000,
    );
    expect(cancelled?.status).toBe("cancelled");
    expect(core.getPlanAdvice(started.id)?.status).toBe("consumed");

    await core.shutdown();
  });

  it("launches from the same runtime bundle that passed inventory authorization", async () => {
    let discoveryCalls = 0;
    const core = createAdvisorCore(
      () => "1.0.0",
      (base, call) => {
        discoveryCalls = call;
        return call >= 4
          ? { ...base, commandPath: "/usr/bin/printf", version: "2.0.0" }
          : base;
      },
    );

    const started = await core.startPlanAdvice({
      prompt: "Review two independent aspects.",
      advisorHarnessId: "core-agent",
      allowedHarnessIds: ["core-agent"],
      allowedModels: { "core-agent": ["approved-model"] },
      maxSlices: 2,
      timeoutMs: 5_000,
    });
    const ready = await core.waitForPlanAdvice(started.id, 10_000);
    expect(ready?.status).toBe("ready");

    const execution = await core.startAdvisedPlan({
      adviceId: started.id,
      expectedPlanDigest: ready!.planDigest!,
      timeoutMs: 5_000,
    });

    expect(discoveryCalls).toBe(3);
    const terminal = await core.taskManager.waitForTerminal(
      execution.tasks[0]!.task.id,
      10_000,
    );
    expect(terminal?.stdout).toBe("worker:EXACT_ALPHA_PROMPT");

    await core.shutdown();
  });

  it("detects assigned skill content drift before launching workers", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ennodia-advised-skill-"));
    const skillPath = join(cwd, ".agents", "skills", "audit-skill", "SKILL.md");
    mkdirSync(join(cwd, ".agents", "skills", "audit-skill"), {
      recursive: true,
    });
    writeSkill(skillPath, "Check version one.");
    const core = createSkillAdvisorCore();

    try {
      const started = await core.startPlanAdvice({
        prompt: "Audit with the installed skill.",
        cwd,
        advisorHarnessId: "codex",
        allowedHarnessIds: ["codex"],
        timeoutMs: 5_000,
      });
      const ready = await core.waitForPlanAdvice(started.id, 10_000);
      expect(ready?.status).toBe("ready");
      expect(ready?.plan?.slices[0]?.skillIds).toEqual(["audit-skill"]);

      writeSkill(skillPath, "Check changed version two.");
      await expect(core.startAdvisedPlan({
        adviceId: started.id,
        expectedPlanDigest: ready!.planDigest!,
        cwd,
      })).rejects.toThrow("inventory changed");
      expect(core.listTasks()).toHaveLength(1);
    } finally {
      await core.shutdown();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("does not let an identical legacy skill duplicate wildcard native support", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ennodia-advised-legacy-skill-"));
    const nativePath = join(cwd, ".agents", "skills", "audit-skill", "SKILL.md");
    const legacyPath = join(cwd, ".ennodia", "skills", "audit-skill.json");
    mkdirSync(join(cwd, ".agents", "skills", "audit-skill"), {
      recursive: true,
    });
    mkdirSync(join(cwd, ".ennodia", "skills"), { recursive: true });
    writeSkill(nativePath, "Check version one.");
    writeFileSync(legacyPath, JSON.stringify({
      id: "audit-skill",
      name: "audit-skill",
      version: "local",
      description: "Legacy duplicate.",
      instructions: "Check version one.",
    }));

    const proposal: AdvisorPlanProposal = {
      schemaVersion: 1,
      title: "Legacy duplicate check",
      rationale: "A legacy duplicate must not add native harness support.",
      slices: [{
        id: "claude-review",
        prompt: "Run the focused audit.",
        harnessId: "claude-code",
        skillIds: ["audit-skill"],
      }],
    };
    const core = createLegacyDuplicateAdvisorCore(proposal);

    try {
      const started = await core.startPlanAdvice({
        prompt: "Audit with the duplicated skill.",
        cwd,
        advisorHarnessId: "codex",
        allowedHarnessIds: ["codex", "claude-code"],
        timeoutMs: 5_000,
      });
      const result = await core.waitForPlanAdvice(started.id, 10_000);

      expect(result?.status).toBe("invalid");
      expect(result?.issues.map((issue) => issue.code)).toContain(
        "slice-skill-not-supported",
      );
    } finally {
      await core.shutdown();
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

function createAdvisorCore(
  version: () => string,
  mutateDiscovery?: (
    base: HarnessDiscovery,
    call: number,
  ) => HarnessDiscovery,
  taskManager?: TaskManager,
): EnnodiaCore {
  const adapter: HarnessAdapter = {
    id: "core-agent",
    name: "Core Agent",
    kind: "cli",
    commandCandidates: ["sh"],
    capabilities: ["reasoning", "code"],
    buildCommand: (commandPath, input) => ({
      command: commandPath,
      args: [
        "-c",
        [
          "case \"$1\" in",
          "*\"You are Ennodia's Plan Advisor.\"*) printf '%s' \"$2\" ;;",
          "*) printf 'worker:%s' \"$1\" ;;",
          "esac",
        ].join("\n"),
        "core-agent",
        input.prompt,
        JSON.stringify(proposal()),
      ],
    }),
  };

  let discoveryCalls = 0;
  return new EnnodiaCore({
    taskManager,
    discoverHarnesses: async () => {
      const base = discovery(adapter, version());
      discoveryCalls += 1;
      return [mutateDiscovery?.(base, discoveryCalls) ?? base];
    },
    findHarnessAdapter: (id) => id === adapter.id ? adapter : undefined,
    planRoute: () => ({
      category: "general",
      reasons: ["fixture"],
      candidates: [adapter.id],
      selected: adapter.id,
      parallelSuggested: false,
      compareSuggested: false,
    }),
  });
}

function discovery(
  adapter: HarnessAdapter,
  version: string,
): HarnessDiscovery {
  return {
    id: adapter.id,
    name: adapter.name,
    kind: adapter.kind,
    available: true,
    runnable: true,
    commandPath: "/bin/sh",
    version,
    capabilities: adapter.capabilities,
    notes: [],
  };
}

function proposal(): AdvisorPlanProposal {
  return {
    schemaVersion: 1,
    title: "Two independent reviews",
    rationale: "Use two explicit launches of the available worker.",
    slices: [
      {
        id: "alpha-review",
        prompt: "EXACT_ALPHA_PROMPT",
        harnessId: "core-agent",
        model: "approved-model",
        skillIds: [],
      },
      {
        id: "beta-review",
        prompt: "EXACT_BETA_PROMPT",
        harnessId: "core-agent",
        model: "approved-model",
        skillIds: [],
      },
    ],
  };
}

function createSkillAdvisorCore(): EnnodiaCore {
  const skillProposal: AdvisorPlanProposal = {
    schemaVersion: 1,
    title: "Skill-backed review",
    rationale: "Use the explicitly inventoried audit skill.",
    slices: [{
      id: "skill-review",
      prompt: "Run the focused audit.",
      harnessId: "codex",
      skillIds: ["audit-skill"],
    }],
  };
  const adapter: HarnessAdapter = {
    id: "codex",
    name: "Codex fixture",
    kind: "cli",
    commandCandidates: ["sh"],
    capabilities: ["reasoning", "code"],
    buildCommand: (commandPath, input) => ({
      command: commandPath,
      args: [
        "-c",
        [
          "case \"$1\" in",
          "*ENNODIA_PLAN_ADVISOR*) printf '%s' \"$2\" ;;",
          "*) printf 'worker:%s' \"$1\" ;;",
          "esac",
        ].join("\n"),
        "codex-fixture",
        input.prompt,
        JSON.stringify(skillProposal),
      ],
    }),
  };

  return new EnnodiaCore({
    discoverHarnesses: async () => [discovery(adapter, "1.0.0")],
    findHarnessAdapter: (id) => id === adapter.id ? adapter : undefined,
    planRoute: () => ({
      category: "code",
      reasons: ["fixture"],
      candidates: [adapter.id],
      selected: adapter.id,
      parallelSuggested: false,
      compareSuggested: false,
    }),
  });
}

function createLegacyDuplicateAdvisorCore(
  proposal: AdvisorPlanProposal,
): EnnodiaCore {
  const adapters: HarnessAdapter[] = [
    advisorFixtureAdapter("codex", proposal),
    advisorFixtureAdapter("claude-code", proposal),
  ];

  return new EnnodiaCore({
    discoverHarnesses: async () => adapters.map((adapter) =>
      discovery(adapter, "1.0.0")
    ),
    findHarnessAdapter: (id) => adapters.find((adapter) => adapter.id === id),
    planRoute: () => ({
      category: "code",
      reasons: ["fixture"],
      candidates: adapters.map((adapter) => adapter.id),
      selected: "codex",
      parallelSuggested: false,
      compareSuggested: false,
    }),
  });
}

function advisorFixtureAdapter(
  id: string,
  proposal: AdvisorPlanProposal,
): HarnessAdapter {
  return {
    id,
    name: `${id} fixture`,
    kind: "cli",
    commandCandidates: ["sh"],
    capabilities: ["reasoning", "code"],
    buildCommand: (commandPath) => ({
      command: commandPath,
      args: [
        "-c",
        "printf '%s' \"$1\"",
        `${id}-fixture`,
        JSON.stringify(proposal),
      ],
    }),
  };
}

function writeSkill(path: string, instructions: string): void {
  writeFileSync(
    path,
    [
      "---",
      "name: audit-skill",
      "description: Audit the implementation.",
      "---",
      instructions,
    ].join("\n"),
  );
}
