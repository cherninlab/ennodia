import { describe, expect, it } from "bun:test";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";
import {
  buildJudgePrompt,
  buildSynthesizerPrompt,
  CompareManager,
  parseJudgeAnalysis,
} from "./compare";
import { TaskManager } from "./tasks";

describe("CompareManager", () => {
  it("runs a judge task and then a synthesizer task", async () => {
    const taskManager = new TaskManager();
    const manager = new CompareManager(taskManager, async () => ({
      adapter: compareAdapter,
      discovery: compareDiscovery,
    }));

    const started = await manager.start({
      prompt: "Choose the safest architecture.",
      responses: [
        {
          id: "agent-a",
          text: "Use visible task monitoring and structured judge output.",
        },
        {
          id: "agent-b",
          text: "Keep every judge and synthesizer call observable.",
        },
      ],
      timeoutMs: 5_000,
    });
    const result = await waitForCompare(manager, started.id);

    expect(result.status).toBe("succeeded");
    expect(typeof result.judgeTaskId).toBe("string");
    expect(typeof result.synthesizerTaskId).toBe("string");
    expect(result.analysisAvailable).toBe(true);
    expect(result.analysis?.consensus).toContain("Use visible task monitoring.");
    expect(result.synthesis?.text).toContain("Final answer from synthesizer");
    expect(result.events.map((event) => event.type)).toContain("judge-succeeded");
    expect(result.events.map((event) => event.type)).toContain(
      "synthesizer-succeeded",
    );

    expect(manager.get(started.id, { includeEvents: true, maxEvents: 0 })
      ?.events).toEqual([]);
    expect(
      manager.get(started.id, {
        includeCandidates: true,
        maxCandidateChars: 2,
      })?.candidates[0]?.content,
    ).toHaveLength(2);
  });

  it("degrades when judge output is invalid but still synthesizes", async () => {
    const taskManager = new TaskManager();
    const manager = new CompareManager(taskManager, async () => ({
      adapter: invalidJudgeAdapter,
      discovery: compareDiscovery,
    }));

    const started = await manager.start({
      prompt: "Summarize the candidates.",
      responses: [
        {
          id: "agent-a",
          text: "The result should still be produced from raw candidates.",
        },
      ],
      timeoutMs: 5_000,
    });
    const result = await waitForCompare(manager, started.id);

    expect(result.status).toBe("succeeded");
    expect(result.analysisAvailable).toBe(false);
    expect(result.synthesis?.text).toContain("Final answer from synthesizer");
    expect(result.events.map((event) => event.type)).toContain("judge-degraded");
  });

  it("cancels active child tasks during shutdown", async () => {
    const taskManager = new TaskManager();
    const manager = new CompareManager(taskManager, async () => ({
      adapter: slowCompareAdapter,
      discovery: slowCompareDiscovery,
    }));

    const started = await manager.start({
      prompt: "Choose a route.",
      responses: [{ id: "agent-a", text: "Use visible task monitoring." }],
      timeoutMs: 10_000,
    });
    const judging = await waitForCompareTask(manager, started.id);

    await manager.shutdown({ deadlineMs: 1_000 });
    const result = manager.get(started.id);
    const judgeTask = judging.judgeTaskId
      ? taskManager.get(judging.judgeTaskId)
      : undefined;

    expect(result?.status).toBe("cancelled");
    expect(result?.events.some((event) =>
      event.message === "Compare cancelled by shutdown.",
    )).toBe(true);
    expect(judgeTask?.status).toBe("cancelled");
    expect(judgeTask?.cancelRequested).toBe(true);
  });
});

describe("Compare prompts and parsing", () => {
  it("builds separate judge and synthesizer prompts", () => {
    const candidates = [{ id: "one", content: "First answer." }];

    expect(buildJudgePrompt("Prompt", candidates)).toContain(
      "ENNODIA_COMPARE_JUDGE",
    );
    expect(buildJudgePrompt("Prompt", candidates)).toContain(
      "Judge the candidate set against the original prompt",
    );
    expect(buildSynthesizerPrompt("Prompt", candidates)).toContain(
      "ENNODIA_COMPARE_SYNTHESIZER",
    );
  });

  it("parses judge JSON from a fenced response", () => {
    const parsed = parseJudgeAnalysis(`
      \`\`\`json
      {
        "consensus": ["Both candidates agree."],
        "contradictions": [],
        "partial_coverage": [],
        "unique_insights": [],
        "blind_spots": [],
        "risks": [],
        "confidence": "high"
      }
      \`\`\`
    `);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.analysis.confidence).toBe("high");
    }
  });
});

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
        "  printf '%s\\n' '{\"consensus\":[\"Use visible task monitoring.\"],\"contradictions\":[],\"partial_coverage\":[],\"unique_insights\":[{\"source_id\":\"agent-b\",\"insight\":\"Keep calls observable.\"}],\"blind_spots\":[],\"risks\":[],\"confidence\":\"high\"}'",
        "else",
        "  printf '%s\\n' 'Final answer from synthesizer.'",
        "fi",
      ].join("\n"),
      "compare-agent",
      input.prompt,
    ],
  }),
};

const invalidJudgeAdapter: HarnessAdapter = {
  ...compareAdapter,
  buildCommand: (commandPath, input) => ({
    command: commandPath,
    args: [
      "-c",
      [
        "if printf '%s' \"$1\" | grep -q ENNODIA_COMPARE_JUDGE; then",
        "  printf '%s\\n' 'not json'",
        "else",
        "  printf '%s\\n' 'Final answer from synthesizer after degradation.'",
        "fi",
      ].join("\n"),
      "compare-agent",
      input.prompt,
    ],
  }),
};

const slowCompareAdapter: HarnessAdapter = {
  id: "slow-compare-agent",
  name: "Slow Compare Agent",
  kind: "cli",
  commandCandidates: [process.execPath],
  capabilities: ["compare-test"],
  buildCommand: (commandPath) => ({
    command: commandPath,
    args: ["-e", "setTimeout(() => {}, 10_000);"],
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

const slowCompareDiscovery: HarnessDiscovery = {
  id: slowCompareAdapter.id,
  name: slowCompareAdapter.name,
  kind: slowCompareAdapter.kind,
  available: true,
  runnable: true,
  commandPath: process.execPath,
  capabilities: slowCompareAdapter.capabilities,
  notes: [],
};

async function waitForCompare(
  manager: CompareManager,
  compareId: string,
): Promise<NonNullable<ReturnType<CompareManager["get"]>>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const compare = manager.get(compareId);
    if (
      compare &&
      compare.status !== "judging" &&
      compare.status !== "synthesizing"
    ) {
      return compare;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for compare ${compareId}`);
}

async function waitForCompareTask(
  manager: CompareManager,
  compareId: string,
): Promise<NonNullable<ReturnType<CompareManager["get"]>>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const compare = manager.get(compareId);
    if (compare?.judgeTaskId || compare?.synthesizerTaskId) {
      return compare;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for compare task ${compareId}`);
}
