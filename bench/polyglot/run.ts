// Aider polyglot pilot. Four agents each solve the same exercises alone, then
// Ennodia's Compare reads their four answers and returns a final one. Every
// answer is graded by the exercise's own tests, run in a macOS sandbox with
// no network and writes limited to the trial directory.
//
//   bun bench/polyglot/run.ts --repo path/to/polyglot-benchmark --runner path/to/js-runner \
//     --out bench/results/polyglot/<run-name> [--per-language 10] [--exercises python/affine-cipher,...]
//
// The runner directory holds node_modules for the JavaScript tests, installed
// from bench/polyglot/js-runner.package.json. Workers see the instructions and
// the starting file, never the tests or the reference solution.

import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDefaultEnnodiaCore } from "../../src/index";

const args = Object.fromEntries(Bun.argv.slice(2).reduce<[string, string][]>((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1] ?? ""]);
  return pairs;
}, []));
const repo = path.resolve(args.repo ?? "");
const runner = path.resolve(args.runner ?? "");
const out = path.resolve(args.out ?? `bench/results/polyglot/run-${new Date().toISOString().slice(0, 10)}`);
const perLanguage = Number(args["per-language"] ?? 10);
const seed = Number(args.seed ?? 20260926);
const languages = (args.languages ?? "python,javascript").split(",");
const concurrency = Number(args.concurrency ?? 2);
const WORKER_TIMEOUT_MS = 600_000;
const TEST_TIMEOUT_MS = 180_000;

const AGENTS = [
  { key: "claude", harnessId: "claude-code", model: "claude-opus-5-5" },
  { key: "codex", harnessId: "codex", model: "gpt-6-astra" },
  { key: "gemini", harnessId: "antigravity", model: "gemini-3.8-flash-medium" },
  { key: "kimi", harnessId: "opencode", model: "opencode-go/kimi-k3" },
];
// Declared before the run. Codex judges and Claude advises, so neither role
// is a single model grading only its own answer.
const COMPARE = { judgeHarnessId: "codex", judgeModel: "gpt-6-astra", advisorHarnessId: "claude-code", advisorModel: "claude-opus-5-5" };

type Exercise = { language: string; name: string; dir: string; solution: string; test: string; example: string; instructions: string; stub: string };
type Result = { exercise: string; language: string; condition: string; pass: boolean; extracted: boolean; status: string; elapsedMs: number; testMs?: number; error?: string; taskId?: string };

// A small seeded generator, so the sample is the same on every machine.
function mulberry32(value: number): () => number {
  return () => {
    value |= 0; value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function load(language: string, name: string): Promise<Exercise> {
  const dir = path.join(repo, language, "exercises", "practice", name);
  const config = JSON.parse(await readFile(path.join(dir, ".meta", "config.json"), "utf8")) as { files: { solution: string[]; test: string[]; example: string[] } };
  const docs = path.join(dir, ".docs");
  const parts = [await readFile(path.join(docs, "instructions.md"), "utf8")];
  if (existsSync(path.join(docs, "instructions.append.md"))) parts.push(await readFile(path.join(docs, "instructions.append.md"), "utf8"));
  return {
    language, name, dir,
    solution: config.files.solution[0]!, test: config.files.test[0]!, example: config.files.example[0]!,
    instructions: parts.join("\n\n"),
    stub: await readFile(path.join(dir, config.files.solution[0]!), "utf8"),
  };
}

function prompt(exercise: Exercise): string {
  const fence = exercise.language === "python" ? "python" : "javascript";
  return [
    exercise.instructions.trim(),
    `Use this file as your starting point, and keep its names:\n\n${exercise.solution}\n\`\`\`${fence}\n${exercise.stub.trim()}\n\`\`\``,
    "Return the complete file in one fenced code block. Do not write tests. Do not ask questions.",
  ].join("\n\n");
}

// The last fenced block in the reply's language, or its largest block.
function extract(text: string, language: string): string | undefined {
  const blocks = [...text.matchAll(/```([\w+-]*)\n([\s\S]*?)```/g)].map((match) => ({ lang: match[1]!.toLowerCase(), code: match[2]! }));
  const wanted = language === "python" ? ["python", "py"] : ["javascript", "js", "mjs"];
  const typed = blocks.filter((block) => wanted.includes(block.lang));
  const chosen = typed.at(-1) ?? [...blocks].sort((a, b) => b.code.length - a.code.length)[0];
  return chosen?.code;
}

async function run(cmd: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; output: string; ms: number }> {
  const started = Date.now();
  const child = Bun.spawn(cmd, { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  clearTimeout(timer);
  return { code, output: `${stdout}\n${stderr}`.slice(-4000), ms: Date.now() - started };
}

// Tests run in a sandbox: no network, and writes only in the trial directory
// and the system temporary folders that test runners use for caches.
async function grade(exercise: Exercise, code: string, label: string): Promise<{ pass: boolean; output: string; ms: number }> {
  await mkdir(path.join(runner, "trials"), { recursive: true });
  const trial = await mkdtemp(path.join(runner, "trials", `${label}-`));
  await cp(exercise.dir, trial, { recursive: true, filter: (source) => !source.includes(`${path.sep}.meta`) });
  await writeFile(path.join(trial, exercise.solution), code);
  const profile = `(version 1)(allow default)(deny network*)(deny file-write*)(allow file-write* (subpath "${trial}") (subpath "/private/var/folders") (subpath "/private/tmp") (literal "/dev/null") (regex #"^/dev/tty"))`;
  let cmd: string[];
  if (exercise.language === "python") {
    cmd = ["sandbox-exec", "-p", profile, "/usr/bin/python3", "-m", "unittest", "-q", exercise.test.replace(/\.py$/, "")];
  } else {
    // Exercism skips all but the first test with xtest. The benchmark runs them all.
    const spec = path.join(trial, exercise.test);
    await writeFile(spec, (await readFile(spec, "utf8")).replace(/\bxtest\(/g, "test("));
    cmd = ["sandbox-exec", "-p", profile, "node", path.join(runner, "node_modules", "jest", "bin", "jest.js"), "--rootDir", trial, "--ci"];
  }
  const result = await run(cmd, trial, TEST_TIMEOUT_MS);
  await rm(trial, { recursive: true, force: true });
  return { pass: result.code === 0, output: result.output, ms: result.ms };
}

// Sample, then check every grader before any agent runs: the reference
// solution passes and the untouched starting file fails.
const names: { language: string; name: string }[] = [];
if (args.exercises) {
  for (const entry of args.exercises.split(",")) { const [language, name] = entry.split("/"); names.push({ language: language!, name: name! }); }
} else {
  for (const language of languages) {
    const all = (await readdir(path.join(repo, language, "exercises", "practice"))).sort();
    const random = mulberry32(seed + language.length);
    const shuffled = [...all].map((name) => ({ name, key: random() })).sort((a, b) => a.key - b.key).map((entry) => entry.name);
    names.push(...shuffled.slice(0, perLanguage).map((name) => ({ language, name })));
  }
}
await mkdir(out, { recursive: true });
const exercises: Exercise[] = [];
const dropped: { exercise: string; reason: string }[] = [];
for (const { language, name } of names) {
  const exercise = await load(language, name);
  const reference = await grade(exercise, await readFile(path.join(exercise.dir, exercise.example), "utf8"), `check-${name}`);
  const stub = await grade(exercise, exercise.stub, `check-${name}`);
  if (reference.pass && !stub.pass) exercises.push(exercise);
  else dropped.push({ exercise: `${language}/${name}`, reason: reference.pass ? "the starting file passes" : "the reference solution fails" });
}

const protocol = {
  benchmark: "Aider polyglot",
  repoCommit: (await Bun.$`git -C ${repo} rev-parse HEAD`.text()).trim(),
  seed, perLanguage,
  exercises: exercises.map((exercise) => `${exercise.language}/${exercise.name}`),
  dropped,
  agents: AGENTS, compare: COMPARE,
  workerTimeoutMs: WORKER_TIMEOUT_MS, testTimeoutMs: TEST_TIMEOUT_MS,
  grader: "exercise tests in sandbox-exec, no network, writes only in the trial directory; JavaScript xtest enabled",
  ennodia: { commit: (await Bun.$`git rev-parse HEAD`.text()).trim(), uncommittedChanges: (await Bun.$`git status --porcelain`.text()).trim().length > 0 },
  versions: {
    claude: (await Bun.$`claude --version`.text()).trim(), codex: (await Bun.$`codex --version`.text()).trim(),
    antigravity: (await Bun.$`agy --version`.text()).trim(), opencode: (await Bun.$`opencode --version`.text()).trim(),
  },
  started: new Date().toISOString(),
};
await writeFile(path.join(out, "protocol.json"), `${JSON.stringify(protocol, null, 2)}\n`);
console.log(`protocol sha256 ${createHash("sha256").update(JSON.stringify(protocol)).digest("hex")}, ${exercises.length} exercises, ${dropped.length} dropped`);
// --check-only stops after the grader checks, before any agent runs.
if (args["check-only"] !== undefined) {
  console.log(JSON.stringify({ exercises: protocol.exercises, dropped }, null, 2));
  process.exit(0);
}

const core = createDefaultEnnodiaCore();
// Workers run in their own process groups, so a stopped runner must shut
// them down itself, or they keep running and using quota.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void (core?.shutdown({ deadlineMs: 5_000 }) ?? Promise.resolve()).finally(() => process.exit(130));
  });
}
const results: Result[] = [];
const record = async (result: Result) => {
  results.push(result);
  await writeFile(path.join(out, "trials.jsonl"), results.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  console.log(`${result.exercise} ${result.condition} ${result.pass ? "pass" : "fail"}${result.extracted ? "" : " (no code)"} ${Math.round(result.elapsedMs / 1000)}s${result.error ? ` ${result.error.slice(0, 80)}` : ""}`);
};

// Every extracted answer is kept, so a review can read the code, not only the verdict.
async function save(exercise: Exercise, condition: string, code: string): Promise<void> {
  const dir = path.join(out, "solutions", exercise.language, exercise.name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${condition}${path.extname(exercise.solution)}`), code);
}

async function solve(exercise: Exercise): Promise<void> {
  const id = `${exercise.language}/${exercise.name}`;
  const workspace = await mkdtemp(path.join(tmpdir(), `ennodia-polyglot-${exercise.name}-`));
  await writeFile(path.join(workspace, exercise.solution.split("/").pop()!), exercise.stub);
  const text = prompt(exercise);
  const singles = await Promise.all(AGENTS.map(async (agent) => {
    const started = Date.now();
    try {
      const view = await core.startRun({ prompt: text, harnessId: agent.harnessId, model: agent.model, mode: "single", compare: false, cwd: workspace, timeoutMs: WORKER_TIMEOUT_MS });
      const done = await core.waitForRun(view.id, WORKER_TIMEOUT_MS + 60_000, { includeEvents: false, maxEvents: 0, maxAnswerChars: 200_000 });
      const answer = done?.finalAnswer ?? "";
      const code = extract(answer, exercise.language);
      if (code) await save(exercise, agent.key, code);
      const graded = code ? await grade(exercise, code, `${agent.key}-${exercise.name}`) : undefined;
      const result: Result = { exercise: id, language: exercise.language, condition: agent.key, pass: graded?.pass ?? false, extracted: Boolean(code),
        status: String(done?.status), elapsedMs: Date.now() - started, testMs: graded?.ms, taskId: done?.taskIds?.[0],
        error: done?.status === "succeeded" ? undefined : String(done?.diagnosis?.likelyCause ?? done?.error ?? done?.status) };
      await record(result);
      return result;
    } catch (error) {
      const result: Result = { exercise: id, language: exercise.language, condition: agent.key, pass: false, extracted: false, status: "error", elapsedMs: Date.now() - started, error: String(error) };
      await record(result);
      return result;
    }
  }));

  // The team: Compare over every single answer that finished.
  const taskIds = singles.filter((single) => single.status === "succeeded" && single.taskId).map((single) => single.taskId!);
  const started = Date.now();
  if (taskIds.length < 2) {
    await record({ exercise: id, language: exercise.language, condition: "team", pass: false, extracted: false, status: "skipped", elapsedMs: 0, error: `${taskIds.length} finished answers` });
  } else {
    try {
      const compare = await core.startCompare({ prompt: `${text}\n\nSeveral attempts follow. Choose or write the final solution, and return the complete final file in one fenced code block.`, taskIds, cwd: workspace, ...COMPARE });
      let view = core.getCompare(compare.id);
      while (view && !["succeeded", "failed", "cancelled"].includes(view.status) && Date.now() - started < 2 * WORKER_TIMEOUT_MS) {
        await Bun.sleep(5_000);
        view = core.getCompare(compare.id);
      }
      // A chosen candidate is used as it is. Otherwise the answer's own code block.
      const chosenTask = view?.advisor?.chosenSourceId?.replace(/^task:/, "");
      const chosen = singles.find((single) => single.taskId && single.taskId === chosenTask);
      const chosenFile = chosen ? path.join(out, "solutions", exercise.language, exercise.name, `${chosen.condition}${path.extname(exercise.solution)}`) : undefined;
      const code = chosenFile && existsSync(chosenFile) ? await readFile(chosenFile, "utf8")
        : view?.advisor?.answer ? extract(view.advisor.answer, exercise.language) : undefined;
      if (code) await save(exercise, "team", code);
      const graded = code ? await grade(exercise, code, `team-${exercise.name}`) : undefined;
      await record({ exercise: id, language: exercise.language, condition: "team", pass: graded?.pass ?? false, extracted: Boolean(code), status: String(view?.status), elapsedMs: Date.now() - started, testMs: graded?.ms, error: chosen ? `chose ${chosen.condition}` : undefined });
    } catch (error) {
      await record({ exercise: id, language: exercise.language, condition: "team", pass: false, extracted: false, status: "error", elapsedMs: Date.now() - started, error: String(error) });
    }
  }
  await rm(workspace, { recursive: true, force: true });
}

const queue = [...exercises];
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (queue.length) await solve(queue.shift()!);
}));

const conditions = [...AGENTS.map((agent) => agent.key), "team"];
const byExercise = new Map<string, Result[]>();
for (const result of results) byExercise.set(result.exercise, [...(byExercise.get(result.exercise) ?? []), result]);
const oracle = [...byExercise.values()].filter((rows) => rows.some((row) => row.condition !== "team" && row.pass)).length;
const summary = {
  exercises: byExercise.size,
  passes: Object.fromEntries(conditions.map((condition) => [condition, results.filter((r) => r.condition === condition && r.pass).length])),
  atLeastOneAgentPassed: oracle,
  teamPassedWhenSomeonePassed: [...byExercise.values()].filter((rows) => rows.some((row) => row.condition !== "team" && row.pass) && rows.some((row) => row.condition === "team" && row.pass)).length,
  teamFailedWhenTwoPassed: [...byExercise.values()].filter((rows) => rows.filter((row) => row.condition !== "team" && row.pass).length >= 2 && !rows.some((row) => row.condition === "team" && row.pass)).length,
};
await writeFile(path.join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
await core.shutdown({ deadlineMs: 5_000 });
process.exit(0);
