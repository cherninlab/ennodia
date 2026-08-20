import { describe, expect, it } from "bun:test";
import { EnnodiaCore } from "./core";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";

describe("EnnodiaCore Result Advisor aliases", () => {
  it("routes a distinct preferred Result Advisor harness", async () => {
    const core = createCompareCore();
    const started = await core.startCompare({
      prompt: "Choose the safest answer.",
      responses: [{ id: "candidate", text: "Use explicit validation." }],
      judgeHarnessId: "judge",
      judgeModel: "judge-only-model",
      advisorHarnessId: "advisor",
      timeoutMs: 5_000,
    });
    const finished = await core.compareManager.waitForTerminal(
      started.id,
      10_000,
    );

    expect(finished?.status).toBe("succeeded");
    expect(finished?.advisor?.answer).toBe("Advisor chose the safe answer.");
    expect(core.listTasks().map((task) => task.harnessId).sort()).toEqual([
      "advisor",
      "judge",
    ]);
    expect(
      core.listTasks().find((task) => task.harnessId === "advisor")?.command.at(-1),
    ).toBe("__harness-default__");
    expect(started.budget.estimate.selectedHarnessIds.sort()).toEqual([
      "advisor",
      "judge",
    ]);

    await core.shutdown();
  });

  it("accepts legacy or matching dual aliases and rejects conflicts pre-launch", async () => {
    for (const fields of [
      { synthesizerHarnessId: "advisor" },
      {
        advisorHarnessId: "advisor",
        synthesizerHarnessId: "advisor",
      },
    ]) {
      const core = createCompareCore();
      const started = await core.startCompare({
        prompt: "Choose.",
        responses: [{ id: "candidate", text: "Validate." }],
        judgeHarnessId: "judge",
        timeoutMs: 5_000,
        ...fields,
      });
      expect((await core.compareManager.waitForTerminal(started.id, 10_000))
        ?.status).toBe("succeeded");
      await core.shutdown();
    }

    const core = createCompareCore();
    await expect(core.startCompare({
      prompt: "Choose.",
      responses: [{ id: "candidate", text: "Validate." }],
      advisorHarnessId: "advisor",
      synthesizerHarnessId: "judge",
    })).rejects.toThrow("Conflicting Compare fields");
    await expect(core.startCompare({
      prompt: "Choose.",
      responses: [{ id: "candidate", text: "Validate." }],
      advisorModel: "new-model",
      synthesizerModel: "old-model",
    })).rejects.toThrow("Conflicting Compare fields");
    expect(core.listTasks()).toHaveLength(0);
    await core.shutdown();
  });
});

function createCompareCore(): EnnodiaCore {
  const adapters = [adapter("judge"), adapter("advisor")];
  return new EnnodiaCore({
    discoverHarnesses: async () => adapters.map(discovery),
    findHarnessAdapter: (id) => adapters.find((entry) => entry.id === id),
    planRoute: () => ({
      category: "general",
      reasons: ["fixture"],
      candidates: adapters.map((entry) => entry.id),
      selected: "judge",
      parallelSuggested: false,
      compareSuggested: false,
    }),
  });
}

function adapter(id: string): HarnessAdapter {
  return {
    id,
    name: id,
    kind: "cli",
    commandCandidates: ["sh"],
    capabilities: ["reasoning"],
    buildCommand: (commandPath, input) => ({
      command: commandPath,
      args: [
        "-c",
        [
          "case \"$1\" in",
          "*ENNODIA_COMPARE_JUDGE*) printf '%s' '{\"consensus\":[\"Validate first.\"],\"contradictions\":[],\"partial_coverage\":[],\"unique_insights\":[],\"blind_spots\":[],\"risks\":[],\"confidence\":\"high\"}' ;;",
          "*) printf '%s' '{\"answer\":\"Advisor chose the safe answer.\",\"basis\":\"judge-analysis\",\"confidence\":\"high\",\"openQuestions\":[]}' ;;",
          "esac",
        ].join("\n"),
        id,
        input.prompt,
        input.model ?? "__harness-default__",
      ],
    }),
  };
}

function discovery(adapter: HarnessAdapter): HarnessDiscovery {
  return {
    id: adapter.id,
    name: adapter.name,
    kind: adapter.kind,
    available: true,
    runnable: true,
    commandPath: "/bin/sh",
    capabilities: adapter.capabilities,
    notes: [],
  };
}
