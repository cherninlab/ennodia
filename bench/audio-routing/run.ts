// Audio routing study. Can an agent that cannot hear answer questions about
// audio clips once Ennodia lets it hand each clip to an agent that can?
//
//   bun bench/audio-routing/run.ts --data bench/results/audio-routing/data \
//     --out bench/results/audio-routing/<run-name> \
//     [--conditions codex-alone,codex-ennodia,claude-alone,gemini-direct] [--clips clip-01,clip-02]
//
// Conditions:
//   codex-alone     Codex with GPT-6 Astra and no MCP servers.
//   codex-ennodia   The same Codex with only Ennodia's server, and one sentence saying so.
//   claude-alone    Claude Code with Opus 5.5 and no MCP servers.
//   gemini-direct   Gemini 3.8 Flash in Antigravity, started by Ennodia. The handoff's ceiling.
//
// Each trial gets a fresh directory holding only its clip. The answer key is
// read only after the trial ends. A failure, timeout, or unreadable reply
// counts as a wrong answer, and every attempt is kept.

import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDefaultEnnodiaCore } from "../../src/index";

type Clip = { clip: string; id: string; task: string; difficulty: string; seconds: number; question: string; choices: string[] };
type ToolCall = { tool: string; harnessId?: string; model?: string };
type Output = { exitCode: number | null; timedOut: boolean; text: string; elapsedMs: number; toolCalls: ToolCall[]; tokens?: number; error?: string };
type Trial = Output & { condition: string; clip: string; task: string; answer?: string; listened?: string; correct: boolean };

const args = Object.fromEntries(Bun.argv.slice(2).reduce<[string, string][]>((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1] ?? ""]);
  return pairs;
}, []));
const data = path.resolve(args.data ?? "bench/results/audio-routing/data");
const out = path.resolve(args.out ?? `bench/results/audio-routing/run-${new Date().toISOString().slice(0, 10)}`);
const conditions = (args.conditions ?? "codex-alone,codex-ennodia,claude-alone,gemini-direct").split(",");
const TIMEOUT_MS = 300_000;
const MODELS = { codex: "gpt-6-astra", claude: "claude-opus-5-5", gemini: "gemini-3.8-flash-medium" };

const manifest = (await Bun.file(path.join(data, "manifest.json")).json()) as Clip[];
const clips = args.clips ? manifest.filter((clip) => args.clips.split(",").includes(clip.clip)) : manifest;

const ennodiaHint = "Ennodia is available in this session. It can hand the file to an agent that can listen, such as Gemini in Antigravity.";

function prompt(clip: Clip, file: string, hint: boolean): string {
  return [
    `The audio file at ${file} is ${clip.seconds} seconds long.`,
    clip.question,
    `Choices:\n${clip.choices.join("\n")}`,
    ...(hint ? [ennodiaHint] : []),
    "Listen to the file if you can. If you cannot, say so, and still choose the most likely answer.\nEnd your reply with exactly these two lines:\nANSWER: <the full text of one choice>\nLISTENED: yes or no",
  ].join("\n\n");
}

async function spawn(cmd: string[], cwd: string): Promise<{ exitCode: number | null; timedOut: boolean; stdout: string; stderr: string; elapsedMs: number }> {
  const started = Date.now();
  const child = Bun.spawn(cmd, { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, TIMEOUT_MS);
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  clearTimeout(timer);
  return { exitCode, timedOut, stdout, stderr, elapsedMs: Date.now() - started };
}

// Turn off every server Codex lets a command-line override turn off, except
// Ennodia when the condition includes it. Servers that plugins provide reject
// the override; they stay on in every Codex condition and are recorded.
async function codexServerOverrides(): Promise<{ off: string[]; kept: string[] }> {
  const enabled = ((await Bun.$`codex mcp list --json`.json()) as { name: string; enabled: boolean }[])
    .filter((server) => server.enabled).map((server) => server.name);
  const off: string[] = [];
  const kept: string[] = [];
  for (const name of enabled) {
    const check = await Bun.$`codex -c ${`mcp_servers.${name}.enabled=false`} mcp list --json`.quiet().nothrow();
    (check.exitCode === 0 ? off : kept).push(name);
  }
  return { off, kept };
}
const codexServers = conditions.some((condition) => condition.startsWith("codex-")) ? await codexServerOverrides() : { off: [], kept: [] };

async function runCodex(clip: Clip, dir: string, withEnnodia: boolean): Promise<Output> {
  const off = codexServers.off.filter((name) => !(withEnnodia && name === "ennodia"));
  const final = path.join(dir, ".final.txt");
  // Headless Codex never asks, so a tool that needs approval fails. Allowing
  // ennodia_run matches choosing "always allow" for it in Codex. The sandbox
  // stays read-only, and read-only Ennodia tools need no approval.
  const approve = withEnnodia ? ["-c", 'mcp_servers.ennodia.tools.ennodia_run.approval_mode="approve"'] : [];
  const run = await spawn(["codex", "exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "--ephemeral",
    "-m", MODELS.codex, "-C", dir, "-o", final, ...off.flatMap((name) => ["-c", `mcp_servers.${name}.enabled=false`]), ...approve,
    "--", prompt(clip, path.join(dir, `${clip.clip}.mp3`), withEnnodia)], dir);
  await Bun.write(path.join(out, "events", `${withEnnodia ? "codex-ennodia" : "codex-alone"}-${clip.clip}.jsonl`), run.stdout);
  const events = run.stdout.split("\n").flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const toolCalls = events.filter((event) => event.type === "item.completed" && event.item?.type === "mcp_tool_call")
    .map((event) => ({ tool: `${event.item.server}.${event.item.tool}`, harnessId: event.item.arguments?.harnessId, model: event.item.arguments?.model }));
  const tokens = events.filter((event) => event.type === "turn.completed" && event.usage)
    .reduce((sum, event) => sum + (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0), 0) || undefined;
  const text = await readFile(final, "utf8").catch(() => "");
  return { exitCode: run.exitCode, timedOut: run.timedOut, text, elapsedMs: run.elapsedMs, toolCalls, tokens,
    error: run.exitCode === 0 ? undefined : run.stderr.slice(-800) };
}

async function runClaude(clip: Clip, dir: string): Promise<Output> {
  const run = await spawn(["claude", "-p", "--model", MODELS.claude, "--output-format", "json", "--no-session-persistence",
    "--strict-mcp-config", "--", prompt(clip, path.join(dir, `${clip.clip}.mp3`), false)], dir);
  let result: { result?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } } = {};
  try { result = JSON.parse(run.stdout); } catch { /* reported below */ }
  // Count cached input too, as Codex's own totals do, so the two compare.
  const usage = result.usage ?? {};
  const tokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.output_tokens ?? 0) || undefined;
  return { exitCode: run.exitCode, timedOut: run.timedOut, text: result.result ?? "", elapsedMs: run.elapsedMs, toolCalls: [], tokens,
    error: run.exitCode === 0 ? undefined : (run.stderr || run.stdout).slice(-800) };
}

const core = conditions.includes("gemini-direct") ? createDefaultEnnodiaCore() : undefined;
// Workers run in their own process groups, so a stopped runner must shut
// them down itself, or they keep running and using quota.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void (core?.shutdown({ deadlineMs: 5_000 }) ?? Promise.resolve()).finally(() => process.exit(130));
  });
}
async function runGemini(clip: Clip, dir: string): Promise<Output> {
  const started = Date.now();
  try {
    const run = await core!.startRun({ prompt: prompt(clip, path.join(dir, `${clip.clip}.mp3`), false), harnessId: "antigravity",
      model: MODELS.gemini, mode: "single", compare: false, cwd: dir, timeoutMs: TIMEOUT_MS });
    const done = await core!.waitForRun(run.id, TIMEOUT_MS + 30_000, { includeEvents: false, maxEvents: 0, maxAnswerChars: 20_000 });
    // Keep Ennodia's diagnosis, which names the cause, such as a permission denial.
    const diagnosis = done?.diagnosis ? ` ${done.diagnosis.likelyCause} ${done.diagnosis.partialOutputPreviews?.map((entry) => entry.preview).join(" ") ?? ""}` : "";
    return { exitCode: done?.status === "succeeded" ? 0 : 1, timedOut: false, text: done?.finalAnswer ?? "", elapsedMs: Date.now() - started,
      toolCalls: [], error: done?.status === "succeeded" ? undefined : `${String(done?.error ?? done?.status)}${diagnosis}` };
  } catch (error) {
    return { exitCode: null, timedOut: false, text: "", elapsedMs: Date.now() - started, toolCalls: [], error: String(error) };
  }
}

const runners: Record<string, (clip: Clip, dir: string) => Promise<Output>> = {
  "codex-alone": (clip, dir) => runCodex(clip, dir, false),
  "codex-ennodia": (clip, dir) => runCodex(clip, dir, true),
  "claude-alone": runClaude,
  "gemini-direct": runGemini,
};

// Match the reply's last ANSWER line to a choice, by full text or by letter.
function score(clip: Clip, text: string, key: string): { answer?: string; listened?: string; correct: boolean } {
  const normalize = (value: string) => value.toLowerCase().replace(/[*`"“”]/g, "").replace(/\s+/g, " ").trim();
  const answerLine = [...text.matchAll(/^\s*\**ANSWER\**\s*:\s*(.+)$/gim)].at(-1)?.[1];
  const listened = [...text.matchAll(/^\s*\**LISTENED\**\s*:\s*(\w+)/gim)].at(-1)?.[1]?.toLowerCase();
  if (!answerLine) return { listened, correct: false };
  const said = normalize(answerLine);
  const letter = said.match(/^\(?([a-h])\)/)?.[1];
  const choice = clip.choices.find((option) => normalize(option) === said)
    ?? clip.choices.find((option) => letter && normalize(option).startsWith(`(${letter})`))
    ?? clip.choices.find((option) => said.includes(normalize(option).replace(/^\([a-h]\)\s*/, "")));
  return { answer: choice ?? answerLine.trim(), listened, correct: choice !== undefined && normalize(choice) === normalize(key) };
}

await mkdir(path.join(out, "events"), { recursive: true });
const protocol = {
  dataset: "gamma-lab-umd/MMAU-test-mini",
  revision: "ccd9696c0111ea7060827598f310558df0b71b0a",
  manifestSha256: createHash("sha256").update(await readFile(path.join(data, "manifest.json"))).digest("hex"),
  clips: clips.map((clip) => clip.clip),
  conditions,
  models: MODELS,
  timeoutMs: TIMEOUT_MS,
  codexServersLeftOn: codexServers.kept,
  codexEnnodiaApproval: "mcp_servers.ennodia.tools.ennodia_run.approval_mode=approve",
  ennodia: {
    commit: (await Bun.$`git rev-parse HEAD`.text()).trim(),
    uncommittedChanges: (await Bun.$`git status --porcelain`.text()).trim().length > 0,
  },
  versions: {
    codex: (await Bun.$`codex --version`.text()).trim(),
    claude: (await Bun.$`claude --version`.text()).trim(),
    antigravity: (await Bun.$`agy --version`.text()).trim(),
  },
  promptTemplate: prompt({ clip: "<clip>", id: "", task: "", difficulty: "", seconds: 0, question: "<question>", choices: ["<choices>"] }, "<file>", false),
  ennodiaHint,
  started: new Date().toISOString(),
};
await writeFile(path.join(out, "protocol.json"), `${JSON.stringify(protocol, null, 2)}\n`);
console.log(`protocol sha256 ${createHash("sha256").update(JSON.stringify(protocol)).digest("hex")}`);

const key = (await Bun.file(path.join(data, "answer-key.json")).json()) as Record<string, string>;
const trials: Trial[] = [];
// Conditions run side by side; clips within a condition run one at a time.
await Promise.all(conditions.map(async (condition) => {
  for (const clip of clips) {
    const dir = await mkdtemp(path.join(tmpdir(), `ennodia-audio-${condition}-`));
    await copyFile(path.join(data, "clips", `${clip.clip}.mp3`), path.join(dir, `${clip.clip}.mp3`));
    const output = await runners[condition]!(clip, dir);
    await rm(dir, { recursive: true, force: true });
    const trial = { condition, clip: clip.clip, task: clip.task, ...output, ...score(clip, output.text, key[clip.clip]!) };
    trials.push(trial);
    await Bun.write(path.join(out, "trials.jsonl"), trials.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    console.log(`${condition} ${clip.clip} ${trial.correct ? "correct" : "wrong"} ${trial.answer ?? "(no answer)"} ${Math.round(trial.elapsedMs / 1000)}s${trial.toolCalls.length ? ` tools: ${trial.toolCalls.map((call) => call.tool + (call.harnessId ? `→${call.harnessId}` : "")).join(",")}` : ""}${trial.error ? " error" : ""}`);
  }
}));

const summary = conditions.map((condition) => {
  const rows = trials.filter((trial) => trial.condition === condition);
  const byTask = Object.fromEntries(["sound", "music", "speech"].map((task) => {
    const taskRows = rows.filter((row) => row.task === task);
    return [task, `${taskRows.filter((row) => row.correct).length}/${taskRows.length}`];
  }));
  return {
    condition,
    correct: rows.filter((row) => row.correct).length,
    trials: rows.length,
    byTask,
    failed: rows.filter((row) => row.exitCode !== 0 || row.timedOut).length,
    handedOff: rows.filter((row) => row.toolCalls.some((call) => call.tool.startsWith("ennodia."))).length,
    claimedListening: rows.filter((row) => row.listened === "yes").length,
    medianSeconds: Math.round(rows.map((row) => row.elapsedMs).sort((a, b) => a - b)[Math.floor(rows.length / 2)]! / 1000),
  };
});
const chance = clips.reduce((sum, clip) => sum + 1 / clip.choices.length, 0);
await writeFile(path.join(out, "summary.json"), `${JSON.stringify({ chance: Number(chance.toFixed(1)), summary }, null, 2)}\n`);
console.log(JSON.stringify({ chance: Number(chance.toFixed(1)), summary }, null, 2));
await core?.shutdown({ deadlineMs: 5_000 });
process.exit(0);
