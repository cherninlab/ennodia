import { describe, expect, it } from "bun:test";
import {
  checkBudgetLimits,
  estimateCompareBudget,
  estimateRunBudget,
  estimateTaskBatchBudget,
} from "./budget";
import { buildJudgePrompt, MAX_PROMPT_CANDIDATE_CHARS } from "./compare";
import { harnessAdapters, type HarnessAdapter } from "./harnesses";
import { TaskManager } from "./tasks";

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

  it("budgets run and batch prompts against guidance actually received by no-skill workers", async () => {
    const prompt = "Compare native audio in /tmp/original.mp3 and /tmp/cleaned.mp3.";
    const tasks = [
      { harnessId: "antigravity", prompt },
      { harnessId: "codex", prompt },
      { harnessId: "antigravity", prompt: "Inspect /tmp/third.mp3." },
    ];
    const manager = new TaskManager();
    const receivedPrompts: string[] = [];

    try {
      for (const input of tasks) {
        const adapter: HarnessAdapter = {
          ...harnessAdapters.find((candidate) => candidate.id === input.harnessId)!,
          buildCommand: (command, runInput) => ({
            command,
            args: ["-c", 'printf "%s" "$1"', "budget-fixture", runInput.prompt],
          }),
        };
        const { task } = manager.start(adapter, {
          id: adapter.id,
          name: adapter.name,
          kind: adapter.kind,
          available: true,
          runnable: true,
          commandPath: "/bin/sh",
          capabilities: adapter.capabilities,
          notes: [],
        }, { prompt: input.prompt, timeoutMs: 5_000 });
        const result = await manager.waitForTerminal(task.id, 5_000);
        expect(result?.status).toBe("succeeded");
        expect(result?.stdout).toContain("Ennodia media input guidance");
        receivedPrompts.push(result!.stdout);
      }

      expect(receivedPrompts[0].length).toBeGreaterThan(receivedPrompts[1].length);
      const run = estimateRunBudget({
        prompt,
        selectedHarnessIds: ["antigravity", "codex", "antigravity"],
        comparePlanned: false,
      });
      const batch = estimateTaskBatchBudget({ tasks, comparePlanned: false });

      for (const [estimate, workerPrompts, rawPrompts] of [
        [run, receivedPrompts.slice(0, 2), tasks.slice(0, 2)],
        [batch, receivedPrompts, tasks],
      ] as const) {
        const actualPromptTokens = workerPrompts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
        // Preserve the existing skill allowance when recreating the old raw-only ceiling.
        const rawOnlyCeiling = rawPrompts.reduce((sum, task) => sum + Math.ceil((task.prompt.length + 220) / 4), 0);
        expect(actualPromptTokens).toBeGreaterThan(rawOnlyCeiling);
        expect(estimate.estimatedChildTaskInputTokens).toBeGreaterThanOrEqual(actualPromptTokens);
        expect(estimate.estimatedTotalInputTokens).toBe(estimate.estimatedChildTaskInputTokens);
        expect(estimate.selectedHarnessCount).toBe(workerPrompts.length);
        const check = checkBudgetLimits(estimate, { maxEstimatedInputTokens: rawOnlyCeiling });
        expect(check.exceeded).toBe(true);
        expect(check.issues.join(" ")).toContain(`maxEstimatedInputTokens ${rawOnlyCeiling}`);
      }
    } finally {
      await manager.shutdown();
    }
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
