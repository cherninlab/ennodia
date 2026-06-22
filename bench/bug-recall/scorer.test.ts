import { describe, expect, it } from "bun:test";
import { scoreBenchmark, scoreCase, type BenchmarkCase, type Oracle } from "./scorer";

const oracle: Oracle = {
  id: "001-example",
  title: "Example",
  prompt: "Find bugs.",
  requiredFindings: [
    {
      id: "missing-await",
      severity: "high",
      line: 4,
      description: "Missing await before loadUser.",
      keywords: ["await", "loadUser"],
    },
    {
      id: "zero-limit",
      severity: "medium",
      line: 8,
      description: "maxEvents 0 is treated as default.",
      keywords: ["maxEvents", "0"],
    },
  ],
  knownFalsePositives: [
    {
      id: "permission-bypass",
      description: "Hallucinated permission bypass flag.",
      terms: ["permission", "bypass"],
    },
  ],
};

describe("bug-recall scorer", () => {
  it("scores structured JSON findings", () => {
    const score = scoreCase(oracle, {
      caseId: oracle.id,
      condition: "agent-a",
      text: JSON.stringify({
        findings: [
          { line: 4, summary: "Missing await before loadUser." },
          { line: 99, summary: "Use a permission bypass flag." },
        ],
      }),
    });

    expect(score.matchedFindingIds).toEqual(["missing-await"]);
    expect(score.missedFindingIds).toEqual(["zero-limit"]);
    expect(score.falsePositiveTrapIds).toEqual(["permission-bypass"]);
    expect(score.recall).toBe(0.5);
    expect(score.precision).toBe(0.5);
    expect(score.highRecall).toBe(1);
  });

  it("summarizes conditions and fixture wins", async () => {
    const cases: BenchmarkCase[] = [
      {
        id: oracle.id,
        title: oracle.title,
        inputPath: "/tmp/input.ts",
        input: "const x = 1;",
        oracle,
      },
    ];
    const summary = await scoreBenchmark({
      cases,
      mode: "fixture",
      outputs: [
        {
          caseId: oracle.id,
          condition: "solo",
          text: '{"findings":[{"line":4,"summary":"Missing await loadUser"}]}',
        },
        {
          caseId: oracle.id,
          condition: "ennodia",
          text: '{"findings":[{"line":4,"summary":"Missing await loadUser"},{"line":8,"summary":"maxEvents 0 incorrectly uses the default"}]}',
        },
      ],
    });

    expect(summary.conditions.find((item) => item.condition === "solo")?.recall)
      .toBe(0.5);
    expect(summary.conditions.find((item) => item.condition === "ennodia")?.recall)
      .toBe(1);
    expect(summary.wins).toEqual([{ condition: "ennodia", fixtures: 1 }]);
  });
});
