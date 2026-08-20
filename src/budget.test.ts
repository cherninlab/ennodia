import { describe, expect, it } from "bun:test";
import {
  checkBudgetLimits,
  estimateCompareBudget,
  estimateRunBudget,
  estimateTaskBatchBudget,
} from "./budget";
import { buildJudgePrompt, MAX_PROMPT_CANDIDATE_CHARS } from "./compare";

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

  it("treats direct Compare as Judge plus Result Advisor child tasks", () => {
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
    expect(estimate.assumptions.join(" ")).toContain(
      "one Judge task and one Result Advisor task",
    );
  });

  it("prefers advisorHarnessId while accepting the deprecated alias", () => {
    const preferred = estimateCompareBudget({
      prompt: "Pick the best answer.",
      taskCandidateCount: 1,
      responseCandidateChars: 100,
      judgeHarnessId: "claude-code",
      advisorHarnessId: "codex",
    });
    const legacy = estimateCompareBudget({
      prompt: "Pick the best answer.",
      taskCandidateCount: 1,
      responseCandidateChars: 100,
      judgeHarnessId: "claude-code",
      synthesizerHarnessId: "codex",
    });

    expect(preferred.selectedHarnessCount).toBe(2);
    expect(preferred.selectedHarnessIds).toEqual(["claude-code", "codex"]);
    expect(legacy.selectedHarnessIds).toEqual(preferred.selectedHarnessIds);
  });

  it("rejects conflicting Result Advisor harness aliases", () => {
    expect(() => estimateCompareBudget({
      prompt: "Pick the best answer.",
      taskCandidateCount: 1,
      responseCandidateChars: 100,
      advisorHarnessId: "codex",
      synthesizerHarnessId: "claude-code",
    })).toThrow(
      "Conflicting Compare fields: advisorHarnessId and deprecated synthesizerHarnessId.",
    );
  });

  it("counts compositional batch slices as child tasks even when harnesses repeat", () => {
    const estimate = estimateTaskBatchBudget({
      tasks: [
        { prompt: "Audit docs.", harnessId: "opencode" },
        { prompt: "Audit website.", harnessId: "opencode" },
        { prompt: "Audit security.", harnessId: "antigravity" },
      ],
      comparePlanned: true,
      maxOutputChars: 1_000,
    });
    const check = checkBudgetLimits(estimate, { maxChildTasks: 2 });

    expect(estimate.selectedHarnessCount).toBe(3);
    expect(estimate.selectedHarnessIds).toEqual([
      "opencode",
      "opencode",
      "antigravity",
    ]);
    expect(estimate.estimatedChildTaskInputTokens).toBeGreaterThan(0);
    expect(estimate.estimatedCompareInputTokens).toBeGreaterThan(0);
    expect(estimate.subscriptionLimitChecks.map((limit) => limit.harnessId))
      .toEqual(["opencode", "antigravity"]);
    expect(check.exceeded).toBe(true);
    expect(check.issues.join(" ")).toContain("maxChildTasks 2");
  });

  it("caps task candidate Compare estimates at the judge prompt truncation bound", () => {
    const estimate = estimateCompareBudget({
      prompt: "Judge this.",
      taskCandidateCount: 1,
      responseCandidateChars: 0,
      maxOutputChars: 80_000,
    });
    const judgePrompt = buildJudgePrompt("Judge this.", [
      { id: "task:one", content: "x".repeat(80_000) },
    ]);

    expect(estimate.maxOutputCharsPerCandidate).toBe(
      MAX_PROMPT_CANDIDATE_CHARS,
    );
    expect(judgePrompt).toContain("x".repeat(MAX_PROMPT_CANDIDATE_CHARS - 3));
    expect(judgePrompt).not.toContain("x".repeat(MAX_PROMPT_CANDIDATE_CHARS));
    expect(estimate.assumptions.join(" ")).toContain(
      `${MAX_PROMPT_CANDIDATE_CHARS} characters`,
    );
  });
});
