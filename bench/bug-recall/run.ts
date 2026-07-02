import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  buildPrompt,
  DEFAULT_FIXTURES_ROOT,
  formatConditionTable,
  loadCases,
  scoreBenchmark,
  type BenchmarkCase,
  type BenchmarkSummary,
  type OutputRecord,
} from "./scorer";
import { ENNODIA_VERSION } from "../../src/version";

type CliOptions = {
  live: boolean;
  fixtureIds: string[];
  harnessIds: string[];
  timeoutMs: number;
  outDir?: string;
  judgeHarnessId?: string;
  synthesizerHarnessId?: string;
};

type McpTextContent = {
  type: "text";
  text: string;
};

type RunView = {
  id: string;
  status: "executing" | "comparing" | "succeeded" | "failed" | "cancelled";
  finalAnswer?: string;
  selectedHarnessIds?: string[];
  taskIds?: string[];
  compareId?: string;
  elapsedMs?: number;
  error?: string;
};

const DEFAULT_LIVE_HARNESSES = ["codex", "claude-code"];

const options = parseArgs(Bun.argv.slice(2));
const cases = await selectCases(await loadCases(), options.fixtureIds);
const outputs = options.live
  ? await runLiveBenchmark(cases, options)
  : await loadFixtureOutputs(cases);
const summary = await scoreBenchmark({
  cases,
  outputs,
  mode: options.live ? "live" : "fixture",
});
const outDir = await resolveOutDir(options, summary);

await writeSummary(outDir, summary, outputs);

console.log(formatConditionTable(summary));
console.log("");
console.log(`Wrote benchmark results to ${outDir}`);

async function loadFixtureOutputs(cases: BenchmarkCase[]): Promise<OutputRecord[]> {
  const outputs: OutputRecord[] = [];

  for (const benchmarkCase of cases) {
    const responseDir = new URL(
      `${benchmarkCase.id}/responses/`,
      DEFAULT_FIXTURES_ROOT,
    );
    const entries = await readdir(responseDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();

    for (const file of files) {
      outputs.push({
        caseId: benchmarkCase.id,
        condition: basename(file, ".md"),
        text: await Bun.file(new URL(file, responseDir)).text(),
        metadata: { mode: "fixture", source: file },
      });
    }
  }

  return outputs;
}

async function runLiveBenchmark(
  cases: BenchmarkCase[],
  options: CliOptions,
): Promise<OutputRecord[]> {
  const client = new Client({
    name: "ennodia-benchmark",
    version: ENNODIA_VERSION,
  });
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", "src/cli.ts"],
    cwd: new URL("../../", import.meta.url).pathname,
    stderr: "pipe",
  });
  await client.connect(transport);

  try {
    const outputs: OutputRecord[] = [];
    const harnessIds = options.harnessIds.length > 0
      ? options.harnessIds
      : DEFAULT_LIVE_HARNESSES;

    for (const benchmarkCase of cases) {
      const prompt = buildPrompt(benchmarkCase);

      for (const harnessId of harnessIds) {
        const run = await startAndWaitForRun(client, {
          prompt,
          harnessId,
          mode: "single",
          compare: false,
          timeoutMs: options.timeoutMs,
        });
        outputs.push(runToOutput(benchmarkCase.id, `${harnessId}-solo`, run));
      }

      const parallelRun = await startAndWaitForRun(client, {
        prompt,
        mode: "parallel",
        compare: true,
        timeoutMs: options.timeoutMs,
        judgeHarnessId: options.judgeHarnessId,
        synthesizerHarnessId: options.synthesizerHarnessId,
        maxOutputChars: 16_000,
      });
      outputs.push(runToOutput(
        benchmarkCase.id,
        "ennodia-parallel-compare",
        parallelRun,
      ));
    }

    return outputs;
  } finally {
    await client.close();
  }
}

async function startAndWaitForRun(
  client: Client,
  args: Record<string, unknown>,
): Promise<RunView> {
  const started = parseTextResult(await client.callTool({
    name: "ennodia_run",
    arguments: args,
  })) as RunView;

  let run = started;
  while (run.status === "executing" || run.status === "comparing") {
    await Bun.sleep(1_000);
    run = parseTextResult(await client.callTool({
      name: "ennodia_get_run",
      arguments: {
        runId: started.id,
        includeEvents: true,
        maxEvents: 80,
        maxAnswerChars: 120_000,
      },
    })) as RunView;
  }

  if (run.status !== "succeeded") {
    throw new Error(`Run ${started.id} ended as ${run.status}: ${run.error ?? ""}`);
  }

  return run;
}

function runToOutput(
  caseId: string,
  condition: string,
  run: RunView,
): OutputRecord {
  return {
    caseId,
    condition,
    text: run.finalAnswer ?? "",
    metadata: {
      mode: "live",
      runId: run.id,
      elapsedMs: run.elapsedMs,
      selectedHarnessIds: run.selectedHarnessIds,
      taskIds: run.taskIds,
      compareId: run.compareId,
    },
  };
}

async function writeSummary(
  outDir: string,
  summary: BenchmarkSummary,
  outputs: OutputRecord[],
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "summary.json"),
    `${JSON.stringify({ ...summary, outputs }, null, 2)}\n`,
  );
  await writeFile(
    join(outDir, "summary.md"),
    [
      `# ${summary.benchmark}`,
      "",
      `Mode: ${summary.mode}`,
      "",
      formatConditionTable(summary),
      "",
      "## Wins",
      "",
      ...summary.wins.map((win) =>
        `- ${win.condition}: ${win.fixtures} fixture(s)`
      ),
      "",
    ].join("\n"),
  );
}

async function resolveOutDir(
  options: CliOptions,
  summary: BenchmarkSummary,
): Promise<string> {
  if (options.outDir) {
    return options.outDir;
  }

  const stamp = summary.createdAt.replace(/[:.]/g, "-");
  return join(
    new URL("../results/bug-recall/", import.meta.url).pathname,
    `${summary.mode}-${stamp}`,
  );
}

async function selectCases(
  cases: BenchmarkCase[],
  fixtureIds: string[],
): Promise<BenchmarkCase[]> {
  if (fixtureIds.length === 0) {
    return cases;
  }

  const selected = cases.filter((benchmarkCase) =>
    fixtureIds.includes(benchmarkCase.id)
  );
  const missing = fixtureIds.filter((fixtureId) =>
    !selected.some((benchmarkCase) => benchmarkCase.id === fixtureId)
  );

  if (missing.length > 0) {
    throw new Error(`Unknown fixture id(s): ${missing.join(", ")}`);
  }

  return selected;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    live: false,
    fixtureIds: [],
    harnessIds: [],
    timeoutMs: 300_000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--live") {
      options.live = true;
    } else if (arg === "--fixture") {
      options.fixtureIds.push(requireValue(args, ++index, arg));
    } else if (arg === "--harness") {
      options.harnessIds.push(requireValue(args, ++index, arg));
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(requireValue(args, ++index, arg));
    } else if (arg === "--out") {
      options.outDir = requireValue(args, ++index, arg);
    } else if (arg === "--judge-harness") {
      options.judgeHarnessId = requireValue(args, ++index, arg);
    } else if (arg === "--synthesizer-harness") {
      options.synthesizerHarnessId = requireValue(args, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }

  return options;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function parseTextResult(result: unknown): unknown {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new Error("MCP response did not include content.");
  }

  const text = content
    .filter(isMcpTextContent)
    .map((item) => item.text)
    .join("\n");

  return JSON.parse(text);
}

function isMcpTextContent(value: unknown): value is McpTextContent {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "text" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}
