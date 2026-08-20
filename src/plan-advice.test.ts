import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import type { AdvisorInventorySnapshot, AdvisorPlanProposal } from "./advisor";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";
import { PlanAdviceManager } from "./plan-advice";
import { TaskManager } from "./tasks";

describe("PlanAdviceManager", () => {
  it("launches only one Advisor task and freezes a validated plan", async () => {
    const taskManager = new TaskManager();
    const manager = new PlanAdviceManager(taskManager);
    const started = manager.start({
      prompt: "Review the implementation.",
      inventory: inventory(),
      inventoryCwd: "/sensitive-target-workspace",
      advisor: {
        adapter: advisorAdapter(validProposal()),
        discovery: discovery,
      },
      timeoutMs: 5_000,
    });

    expect(taskManager.list()).toHaveLength(1);
    const scratchCwd = taskManager.get(started.advisorTaskId)?.cwd;
    expect(scratchCwd).toBeDefined();
    expect(scratchCwd).not.toBe(process.cwd());
    expect(scratchCwd).not.toBe("/sensitive-target-workspace");
    const ready = await manager.waitForTerminal(started.id, 10_000);

    expect(ready?.status).toBe("ready");
    expect(ready?.plan?.slices).toHaveLength(1);
    expect(ready?.planDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ready?.executionBudget?.estimate.selectedHarnessCount).toBe(1);
    expect(taskManager.list()).toHaveLength(1);
    expect(existsSync(scratchCwd!)).toBe(false);

    const authorized = manager.authorizeExecution(
      started.id,
      ready!.planDigest!,
      inventory(),
      (plan) => {
        plan.slices[0]!.prompt = "mutated by validation callback";
      },
    );
    expect(authorized.slices[0]?.prompt).toBe("EXACT_WORK_PROMPT");
    authorized.slices[0]!.prompt = "mutated by caller";
    expect(manager.get(started.id)?.plan?.slices[0]?.prompt).toBe(
      "EXACT_WORK_PROMPT",
    );
    expect(manager.get(started.id)?.status).toBe("consumed");
    expect(() =>
      manager.authorizeExecution(started.id, ready!.planDigest!, inventory())
    ).toThrow("already been executed");
  });

  it("does not consume advice when caller validation fails", async () => {
    const taskManager = new TaskManager();
    const manager = new PlanAdviceManager(taskManager);
    const started = manager.start({
      prompt: "Review.",
      inventory: inventory(),
      advisor: { adapter: advisorAdapter(validProposal()), discovery },
      timeoutMs: 5_000,
    });
    const ready = await manager.waitForTerminal(started.id, 10_000);

    expect(() =>
      manager.authorizeExecution(
        started.id,
        ready!.planDigest!,
        inventory(),
        () => {
          throw new Error("caller validation failed");
        },
      )
    ).toThrow("caller validation failed");
    expect(manager.get(started.id)?.status).toBe("ready");

    manager.authorizeExecution(started.id, ready!.planDigest!, inventory());
    expect(manager.get(started.id)?.status).toBe("consumed");
    await manager.shutdown();
    await taskManager.shutdown();
  });

  it("fails closed on invalid model output and digest or inventory drift", async () => {
    const taskManager = new TaskManager();
    const invalidManager = new PlanAdviceManager(taskManager);
    const invalid = invalidManager.start({
      prompt: "Review.",
      inventory: inventory(),
      advisor: {
        adapter: rawAdvisorAdapter("```json\n{}\n```"),
        discovery,
      },
      timeoutMs: 5_000,
    });
    const rejected = await invalidManager.waitForTerminal(invalid.id, 10_000);
    expect(rejected?.status).toBe("invalid");
    expect(rejected?.issues[0]?.code).toBe("invalid-json");
    expect(rejected?.plan).toBeUndefined();

    const manager = new PlanAdviceManager(taskManager);
    const started = manager.start({
      prompt: "Review.",
      inventory: inventory(),
      advisor: { adapter: advisorAdapter(validProposal()), discovery },
      timeoutMs: 5_000,
    });
    const ready = await manager.waitForTerminal(started.id, 10_000);
    expect(ready?.status).toBe("ready");

    expect(() =>
      manager.authorizeExecution(started.id, "sha256:wrong", inventory())
    ).toThrow("digest mismatch");
    const drifted = inventory();
    drifted.snapshotId = "snapshot-drifted";
    expect(() =>
      manager.authorizeExecution(started.id, ready!.planDigest!, drifted)
    ).toThrow("inventory changed");
  });

  it("rejects an over-budget proposal instead of silently dropping slices", async () => {
    const taskManager = new TaskManager();
    const manager = new PlanAdviceManager(taskManager);
    const started = manager.start({
      prompt: "Review.",
      inventory: inventory(),
      advisor: { adapter: advisorAdapter(validProposal()), discovery },
      timeoutMs: 5_000,
      budget: { maxEstimatedInputTokens: 10_000, maxChildTasks: 1 },
    });
    const ready = await manager.waitForTerminal(started.id, 10_000);
    expect(ready?.status).toBe("ready");

    const proposal = validProposal();
    proposal.slices.push({
      id: "second-review",
      prompt: "Another review.",
      harnessId: "worker",
      skillIds: [],
    });
    const second = manager.start({
      prompt: "Review.",
      inventory: inventory(),
      advisor: { adapter: advisorAdapter(proposal), discovery },
      timeoutMs: 5_000,
      budget: { maxEstimatedInputTokens: 10_000, maxChildTasks: 1 },
    });
    const rejected = await manager.waitForTerminal(second.id, 10_000);

    expect(rejected?.status).toBe("invalid");
    expect(rejected?.issues.map((issue) => issue.code)).toContain(
      "execution-budget-exceeded",
    );
    expect(rejected?.plan).toBeUndefined();
  });

  it("cancels its active Advisor task during explicit cancellation and shutdown", async () => {
    for (const viaShutdown of [false, true]) {
      const taskManager = new TaskManager();
      const manager = new PlanAdviceManager(taskManager);
      const started = manager.start({
        prompt: "Review slowly.",
        inventory: inventory(),
        advisor: { adapter: slowAdvisorAdapter, discovery: slowDiscovery },
        timeoutMs: 10_000,
      });

      if (viaShutdown) {
        await manager.shutdown({ deadlineMs: 1_000 });
      } else {
        manager.cancel(started.id);
      }
      const advice = await manager.waitForTerminal(started.id, 1_000);
      const task = await taskManager.waitForTerminal(started.advisorTaskId, 1_000);

      expect(advice?.status).toBe("cancelled");
      expect(task?.status).toBe("cancelled");
      expect(task?.cancelRequested).toBe(true);
      await taskManager.shutdown();
    }
  });

  it("evicts the oldest terminal advice after its retention cap", async () => {
    const taskManager = new TaskManager();
    const manager = new PlanAdviceManager(taskManager, { maxAdvice: 1 });
    const first = manager.start({
      prompt: "First.",
      inventory: inventory(),
      advisor: { adapter: advisorAdapter(validProposal()), discovery },
    });
    await manager.waitForTerminal(first.id, 10_000);
    const second = manager.start({
      prompt: "Second.",
      inventory: inventory(),
      advisor: { adapter: advisorAdapter(validProposal()), discovery },
    });
    await manager.waitForTerminal(second.id, 10_000);

    expect(manager.get(first.id)).toBeUndefined();
    expect(manager.get(second.id)?.status).toBe("ready");
    await manager.shutdown();
    await taskManager.shutdown();
  });
});

function inventory(): AdvisorInventorySnapshot {
  return {
    schemaVersion: 1,
    snapshotId: "snapshot-1",
    harnesses: [{
      id: "worker",
      name: "Worker",
      runnable: true,
      capabilities: ["reasoning"],
      allowedModelIds: ["approved-model"],
    }],
    skills: [],
    limits: {
      maxSlices: 4,
      maxSkillsPerSlice: 2,
      maxTotalSkillAssignments: 4,
    },
  };
}

function validProposal(): AdvisorPlanProposal {
  return {
    schemaVersion: 1,
    title: "Focused review",
    rationale: "Use one focused worker.",
    slices: [{
      id: "focused-review",
      prompt: "EXACT_WORK_PROMPT",
      harnessId: "worker",
      model: "approved-model",
      skillIds: [],
    }],
  };
}

function advisorAdapter(proposal: AdvisorPlanProposal): HarnessAdapter {
  return rawAdvisorAdapter(JSON.stringify(proposal));
}

function rawAdvisorAdapter(output: string): HarnessAdapter {
  return {
    id: "advisor",
    name: "Advisor",
    kind: "cli",
    commandCandidates: ["sh"],
    capabilities: ["reasoning"],
    buildCommand: (commandPath) => ({
      command: commandPath,
      args: ["-c", "printf '%s' \"$1\"", "advisor", output],
    }),
  };
}

const discovery: HarnessDiscovery = {
  id: "advisor",
  name: "Advisor",
  kind: "cli",
  available: true,
  runnable: true,
  commandPath: "/bin/sh",
  capabilities: ["reasoning"],
  notes: [],
};

const slowAdvisorAdapter: HarnessAdapter = {
  id: "slow-advisor",
  name: "Slow Advisor",
  kind: "cli",
  commandCandidates: [process.execPath],
  capabilities: ["reasoning"],
  buildCommand: (commandPath) => ({
    command: commandPath,
    args: ["-e", "setTimeout(() => {}, 10_000);"],
  }),
};

const slowDiscovery: HarnessDiscovery = {
  id: slowAdvisorAdapter.id,
  name: slowAdvisorAdapter.name,
  kind: slowAdvisorAdapter.kind,
  available: true,
  runnable: true,
  commandPath: process.execPath,
  capabilities: slowAdvisorAdapter.capabilities,
  notes: [],
};
