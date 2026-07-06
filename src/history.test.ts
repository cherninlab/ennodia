import { describe, expect, it } from "bun:test";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDefaultHistorySink,
  FileHistorySink,
  noopHistorySink,
  type RunHistorySnapshot,
} from "./history";

describe("run history", () => {
  it("persists terminal run snapshots in newest-first order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ennodia-history-"));
    try {
      const sink = new FileHistorySink({ dir, maxRuns: 2 });
      await sink.recordRun(snapshot("old", "older answer", 1));
      await sink.recordRun(snapshot("new", "newer answer", 2));

      const freshSink = new FileHistorySink({ dir, maxRuns: 2 });
      const runs = await freshSink.listRuns({ limit: 2 });

      expect(runs.map((item) => item.run.id)).toEqual(["new", "old"]);
      expect(runs[0].run.finalAnswer).toBe("newer answer");
      expect(runs[0].compare?.analysis?.consensus).toEqual(["new consensus"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("honors the ENNODIA_HISTORY=0 opt-out", async () => {
    const sink = createDefaultHistorySink({ ENNODIA_HISTORY: "0" });

    expect(sink).toBe(noopHistorySink);
    expect(await sink.listRuns()).toEqual([]);
  });

  it("skips a truncated trailing line without losing earlier snapshots", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ennodia-history-"));
    try {
      const sink = new FileHistorySink({ dir, maxRuns: 10 });
      await sink.recordRun(snapshot("intact", "intact answer", 1));
      await appendFile(
        join(dir, "runs.jsonl"),
        '{"version":1,"kind":"run","recordedAt":"2026-',
      );

      const runs = await sink.listRuns();

      expect(runs.map((item) => item.run.id)).toEqual(["intact"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps every run when two sinks record into the same directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ennodia-history-"));
    try {
      const first = new FileHistorySink({ dir, maxRuns: 20 });
      const second = new FileHistorySink({ dir, maxRuns: 20 });
      await Promise.all([
        first.recordRun(snapshot("run-a", "a", 1)),
        second.recordRun(snapshot("run-b", "b", 2)),
        first.recordRun(snapshot("run-c", "c", 3)),
        second.recordRun(snapshot("run-d", "d", 4)),
      ]);

      const runs = await first.listRuns();

      expect(runs.map((item) => item.run.id).sort()).toEqual([
        "run-a",
        "run-b",
        "run-c",
        "run-d",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("compacts the file to maxRuns and dedupes re-recorded run IDs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ennodia-history-"));
    try {
      const sink = new FileHistorySink({ dir, maxRuns: 2 });
      await sink.recordRun(snapshot("run-1", "first", 1));
      await sink.recordRun(snapshot("run-1", "first updated", 2));
      await sink.recordRun(snapshot("run-2", "second", 3));
      await sink.recordRun(snapshot("run-3", "third", 4));
      await sink.recordRun(snapshot("run-4", "fourth", 5));

      const runs = await sink.listRuns();
      expect(runs.map((item) => item.run.id)).toEqual(["run-4", "run-3"]);

      const lines = (await readFile(join(dir, "runs.jsonl"), "utf8"))
        .split("\n")
        .filter((line) => line.trim().length > 0);
      expect(lines.length).toBeLessThanOrEqual(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prefers the newest snapshot when a run ID appears twice", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ennodia-history-"));
    try {
      const sink = new FileHistorySink({ dir, maxRuns: 10 });
      await sink.recordRun(snapshot("run-1", "stale answer", 1));
      await sink.recordRun(snapshot("run-1", "fresh answer", 2));

      const runs = await sink.listRuns();

      expect(runs).toHaveLength(1);
      expect(runs[0].run.finalAnswer).toBe("fresh answer");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function snapshot(id: string, answer: string, offset: number): RunHistorySnapshot {
  const recordedAt = new Date(offset * 1_000).toISOString();
  return {
    version: 1,
    kind: "run",
    recordedAt,
    run: {
      id,
      status: "succeeded",
      mode: "single",
      compareMode: false,
      promptPreview: "history prompt",
      createdAt: recordedAt,
      updatedAt: recordedAt,
      endedAt: recordedAt,
      elapsedMs: 1,
      plan: {
        category: "general",
        reasons: ["test"],
        candidates: ["codex"],
        selected: "codex",
        parallelSuggested: false,
        compareSuggested: false,
      },
      selectedHarnessIds: ["codex"],
      taskIds: [],
      remainingMs: 0,
      etaConfidence: "complete",
      finalAnswer: answer,
      finalAnswerChars: answer.length,
      eventCount: 0,
      events: [],
      budget: {
        estimate: {
          selectedHarnessCount: 1,
          selectedHarnessIds: ["codex"],
          comparePlanned: false,
          maxOutputCharsPerCandidate: 24_000,
          estimatedPromptTokensPerTask: 1,
          estimatedChildTaskInputTokens: 1,
          estimatedCompareInputTokens: 0,
          estimatedTotalInputTokens: 1,
          tokenEstimateRatio: "1 token ~= 4 characters",
          assumptions: [],
          subscriptionLimitChecks: [],
        },
        exceeded: false,
        issues: [],
      },
    },
    tasks: [],
    compare: {
      id: `compare-${id}`,
      status: "succeeded",
      promptPreview: "history prompt",
      createdAt: recordedAt,
      updatedAt: recordedAt,
      endedAt: recordedAt,
      elapsedMs: 1,
      candidateCount: 2,
      candidates: [],
      remainingMs: 0,
      etaConfidence: "complete",
      analysis: {
        consensus: [`${id} consensus`],
        contradictions: [],
        partial_coverage: [],
        unique_insights: [],
        blind_spots: [],
        risks: [],
        confidence: "high",
      },
      analysisAvailable: true,
      events: [],
    },
  };
}
