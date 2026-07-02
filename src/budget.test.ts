import { describe, expect, it } from "bun:test";
import {
  checkBudgetLimits,
  estimateCompareBudget,
  estimateRunBudget,
} from "./budget";

describe("budget estimates", () => {
  it("estimates run fan-out and Compare input separately", () => {
    const estimate = estimateRunBudget({
      prompt: "Review a release plan.",
      selectedHarnessIds: ["agent-a", "agent-b"],
      comparePlanned: true,
      maxOutputChars: 2_000,
    });

    expect(estimate.selectedHarnessCount).toBe(2);
    expect(estimate.estimatedChildTaskInputTokens).toBeGreaterThan(0);
    expect(estimate.estimatedCompareInputTokens).toBeGreaterThan(0);
    expect(estimate.estimatedTotalInputTokens).toBe(
      estimate.estimatedChildTaskInputTokens +
        estimate.estimatedCompareInputTokens,
    );
  });

  it("treats direct Compare as judge plus synthesizer child tasks", () => {
    const estimate = estimateCompareBudget({
      prompt: "Pick the best answer.",
      taskCandidateCount: 1,
      responseCandidateChars: 100,
      judgeHarnessId: "claude-code",
      synthesizerHarnessId: "claude-code",
      maxOutputChars: 2_000,
    });
    const check = checkBudgetLimits(estimate, { maxChildTasks: 1 });

    expect(estimate.selectedHarnessCount).toBe(2);
    expect(estimate.selectedHarnessIds).toEqual(["claude-code"]);
    expect(estimate.estimatedTotalInputTokens).toBeGreaterThan(0);
    expect(check.exceeded).toBe(true);
    expect(check.issues.join(" ")).toContain("maxChildTasks 1");
  });
});
