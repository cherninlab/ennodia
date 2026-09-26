import { describe, expect, it } from "bun:test";
import { estimateRunBudget } from "../../../src/budget";
import { estimateStages } from "./budget-model";

const harnesses = ["codex", "claude-code", "opencode", "antigravity"];

describe("website budget model", () => {
  for (const promptChars of [400, 4_000, 12_000]) {
    for (const workers of [1, 2, 3, 4]) {
      for (const compare of [false, true]) {
        it(`matches the core estimate for ${promptChars} characters, ${workers} worker(s), compare ${compare}`, () => {
          const core = estimateRunBudget({
            prompt: "x".repeat(promptChars),
            selectedHarnessIds: harnesses.slice(0, workers),
            comparePlanned: compare,
          });
          const site = estimateStages({ promptChars, workers, compare });
          expect(site.workers).toBe(core.estimatedChildTaskInputTokens);
          expect(site.judge + site.advisor).toBe(core.estimatedCompareInputTokens);
          expect(site.total).toBe(core.estimatedTotalInputTokens);
        });
      }
    }
  }
});
