import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export type Severity = "low" | "medium" | "high";

export type RequiredFinding = {
  id: string;
  severity: Severity;
  line: number;
  description: string;
  keywords: string[];
};

export type FalsePositiveTrap = {
  id: string;
  description: string;
  terms: string[];
};

export type Oracle = {
  id: string;
  title: string;
  prompt: string;
  requiredFindings: RequiredFinding[];
  knownFalsePositives: FalsePositiveTrap[];
};

export type BenchmarkCase = {
  id: string;
  title: string;
  inputPath: string;
  input: string;
  oracle: Oracle;
};

export type OutputRecord = {
  caseId: string;
  condition: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export type CaseScore = {
  caseId: string;
  condition: string;
  matchedFindingIds: string[];
  missedFindingIds: string[];
  falsePositiveTrapIds: string[];
  claimedFindingCount: number;
  requiredFindingCount: number;
  highFindingCount: number;
  highMatchedCount: number;
  recall: number;
  precision: number;
  f1: number;
  highRecall: number;
  outputChars: number;
  metadata?: Record<string, unknown>;
};

export type ConditionSummary = {
  condition: string;
  cases: number;
  matchedFindings: number;
  requiredFindings: number;
  falsePositiveTraps: number;
  claimedFindings: number;
  highMatchedFindings: number;
  highRequiredFindings: number;
  recall: number;
  precision: number;
  f1: number;
  highRecall: number;
};

export type BenchmarkSummary = {
  benchmark: "multi-model-bug-recall";
  mode: "fixture" | "live";
  createdAt: string;
  scorerHash: string;
  caseScores: CaseScore[];
  conditions: ConditionSummary[];
  wins: {
    condition: string;
    fixtures: number;
  }[];
};

export const DEFAULT_FIXTURES_ROOT = new URL(
  "../fixtures/bug-recall/",
  import.meta.url,
);

export async function loadCases(
  fixturesRoot = DEFAULT_FIXTURES_ROOT,
): Promise<BenchmarkCase[]> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  const caseDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const cases: BenchmarkCase[] = [];

  for (const caseId of caseDirs) {
    const caseUrl = new URL(`${caseId}/`, fixturesRoot);
    const inputUrl = new URL("input.ts", caseUrl);
    const oracleUrl = new URL("oracle.json", caseUrl);
    const input = await Bun.file(inputUrl).text();
    const oracle = await Bun.file(oracleUrl).json() as Oracle;
    validateOracle(caseId, oracle);

    cases.push({
      id: oracle.id,
      title: oracle.title,
      inputPath: inputUrl.pathname,
      input,
      oracle,
    });
  }

  return cases;
}

export async function scoreBenchmark(input: {
  cases: BenchmarkCase[];
  outputs: OutputRecord[];
  mode: "fixture" | "live";
}): Promise<BenchmarkSummary> {
  const caseScores = input.outputs.map((output) => {
    const benchmarkCase = input.cases.find((candidate) =>
      candidate.id === output.caseId
    );
    if (!benchmarkCase) {
      throw new Error(`Unknown benchmark case: ${output.caseId}`);
    }

    return scoreCase(benchmarkCase.oracle, output);
  });

  return {
    benchmark: "multi-model-bug-recall",
    mode: input.mode,
    createdAt: new Date().toISOString(),
    scorerHash: await hashScorerSource(),
    caseScores,
    conditions: summarizeConditions(caseScores),
    wins: summarizeWins(input.cases, caseScores),
  };
}

export function scoreCase(oracle: Oracle, output: OutputRecord): CaseScore {
  const claims = extractClaims(output.text);
  const normalizedOutput = normalize(output.text);
  const claimTexts = claims.length > 0
    ? claims.map((claim) => normalize(claim))
    : splitFallbackClaims(output.text).map((claim) => normalize(claim));
  const matchTexts = claimTexts.length > 0 ? claimTexts : [normalizedOutput];
  const matchedFindingIds = oracle.requiredFindings
    .filter((finding) => matchesFinding(finding, matchTexts))
    .map((finding) => finding.id);
  const missedFindingIds = oracle.requiredFindings
    .filter((finding) => !matchedFindingIds.includes(finding.id))
    .map((finding) => finding.id);
  const falsePositiveTrapIds = oracle.knownFalsePositives
    .filter((trap) => matchesTerms(trap.terms, [normalizedOutput]))
    .map((trap) => trap.id);
  const highFindings = oracle.requiredFindings.filter((finding) =>
    finding.severity === "high"
  );
  const highMatchedCount = highFindings.filter((finding) =>
    matchedFindingIds.includes(finding.id)
  ).length;
  const claimedFindingCount = Math.max(
    claimTexts.length,
    matchedFindingIds.length + falsePositiveTrapIds.length,
  );
  const precision = safeRatio(matchedFindingIds.length, claimedFindingCount);
  const recall = safeRatio(
    matchedFindingIds.length,
    oracle.requiredFindings.length,
  );

  return {
    caseId: oracle.id,
    condition: output.condition,
    matchedFindingIds,
    missedFindingIds,
    falsePositiveTrapIds,
    claimedFindingCount,
    requiredFindingCount: oracle.requiredFindings.length,
    highFindingCount: highFindings.length,
    highMatchedCount,
    recall,
    precision,
    f1: f1(precision, recall),
    highRecall: safeRatio(highMatchedCount, highFindings.length),
    outputChars: output.text.length,
    metadata: output.metadata,
  };
}

export function formatConditionTable(summary: BenchmarkSummary): string {
  const rows = [
    "| Condition | Cases | Recall | Precision | F1 | High recall | FP traps |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...summary.conditions.map((condition) =>
      `| ${condition.condition} | ${condition.cases} | ${
        formatPercent(condition.recall)
      } | ${formatPercent(condition.precision)} | ${formatPercent(condition.f1)} | ${
        formatPercent(condition.highRecall)
      } | ${condition.falsePositiveTraps} |`
    ),
  ];

  return rows.join("\n");
}

export function buildPrompt(benchmarkCase: BenchmarkCase): string {
  return [
    "You are reviewing one TypeScript fixture for correctness bugs.",
    "Return JSON only with this exact shape:",
    '{"findings":[{"line":12,"summary":"short bug description"}]}',
    "List real correctness, lifecycle, async, cancellation, schema, or boundary bugs.",
    "Do not include style comments or refactors.",
    "",
    `Fixture: ${benchmarkCase.id} - ${benchmarkCase.title}`,
    "```ts",
    benchmarkCase.input.trim(),
    "```",
  ].join("\n");
}

function validateOracle(caseId: string, oracle: Oracle): void {
  if (oracle.id !== caseId) {
    throw new Error(`Oracle id ${oracle.id} does not match directory ${caseId}.`);
  }

  for (const finding of oracle.requiredFindings) {
    if (finding.keywords.length === 0) {
      throw new Error(`${caseId}.${finding.id} must declare keywords.`);
    }
  }
}

function summarizeConditions(scores: CaseScore[]): ConditionSummary[] {
  const byCondition = new Map<string, CaseScore[]>();
  for (const score of scores) {
    const group = byCondition.get(score.condition) ?? [];
    group.push(score);
    byCondition.set(score.condition, group);
  }

  return [...byCondition.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([condition, group]) => {
      const matchedFindings = sum(group, "matchedFindingIds");
      const requiredFindings = sum(group, "requiredFindingCount");
      const claimedFindings = sum(group, "claimedFindingCount");
      const highMatchedFindings = sum(group, "highMatchedCount");
      const highRequiredFindings = sum(group, "highFindingCount");
      const falsePositiveTraps = sum(group, "falsePositiveTrapIds");
      const precision = safeRatio(matchedFindings, claimedFindings);
      const recall = safeRatio(matchedFindings, requiredFindings);

      return {
        condition,
        cases: group.length,
        matchedFindings,
        requiredFindings,
        falsePositiveTraps,
        claimedFindings,
        highMatchedFindings,
        highRequiredFindings,
        recall,
        precision,
        f1: f1(precision, recall),
        highRecall: safeRatio(highMatchedFindings, highRequiredFindings),
      };
    });
}

function summarizeWins(cases: BenchmarkCase[], scores: CaseScore[]) {
  const wins = new Map<string, number>();

  for (const benchmarkCase of cases) {
    const caseScores = scores.filter((score) => score.caseId === benchmarkCase.id);
    const best = caseScores.reduce<CaseScore | undefined>((winner, score) => {
      if (!winner) {
        return score;
      }

      if (score.f1 > winner.f1) {
        return score;
      }

      if (
        score.f1 === winner.f1 &&
        score.highRecall > winner.highRecall
      ) {
        return score;
      }

      if (
        score.f1 === winner.f1 &&
        score.highRecall === winner.highRecall &&
        score.falsePositiveTrapIds.length < winner.falsePositiveTrapIds.length
      ) {
        return score;
      }

      return winner;
    }, undefined);

    if (best) {
      wins.set(best.condition, (wins.get(best.condition) ?? 0) + 1);
    }
  }

  return [...wins.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([condition, fixtures]) => ({ condition, fixtures }));
}

function extractClaims(text: string): string[] {
  const json = parseJsonPayload(text);
  if (!json || typeof json !== "object") {
    return [];
  }

  const findings = (json as { findings?: unknown }).findings;
  if (!Array.isArray(findings)) {
    return [];
  }

  return findings
    .map((finding) => {
      if (!finding || typeof finding !== "object") {
        return "";
      }

      const line = (finding as { line?: unknown }).line;
      const summary = (finding as { summary?: unknown }).summary;
      return `${typeof line === "number" ? `line ${line}` : ""} ${
        typeof summary === "string" ? summary : ""
      }`.trim();
    })
    .filter(Boolean);
}

function parseJsonPayload(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.trim();
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");

  if (first < 0 || last < first) {
    return undefined;
  }

  try {
    return JSON.parse(candidate.slice(first, last + 1));
  } catch {
    return undefined;
  }
}

function splitFallbackClaims(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      /^[-*]\s+/.test(line) ||
      /^\d+[.)]\s+/.test(line) ||
      /\bline\s+\d+\b/i.test(line)
    );
}

function matchesFinding(finding: RequiredFinding, texts: string[]): boolean {
  return matchesTerms(finding.keywords, texts);
}

function matchesTerms(terms: string[], texts: string[]): boolean {
  return texts.some((text) =>
    terms.every((term) => text.includes(normalize(term)))
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function f1(precision: number, recall: number): number {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function sum(group: CaseScore[], key: keyof CaseScore): number {
  return group.reduce((total, score) => {
    const value = score[key];
    if (Array.isArray(value)) {
      return total + value.length;
    }

    if (typeof value === "number") {
      return total + value;
    }

    return total;
  }, 0);
}

async function hashScorerSource(): Promise<string> {
  const source = await Bun.file(fileURLToPath(import.meta.url)).text();
  return createHash("sha256").update(source).digest("hex");
}
