// Reads a run's trials and writes results.md: scores, failures, handoffs,
// time, tokens, and where Codex's answers with Ennodia differ from Gemini's
// own. Question text stays out of the report because of the dataset licence.
//
//   bun bench/audio-routing/analyze.ts --run bench/results/audio-routing/<run-name> --data bench/results/audio-routing/data

import path from "node:path";

type Trial = {
  condition: string; clip: string; task: string; correct: boolean; answer?: string; listened?: string;
  exitCode: number | null; timedOut: boolean; elapsedMs: number; tokens?: number; error?: string; text: string;
  toolCalls: { tool: string; harnessId?: string }[];
};

const args = Object.fromEntries(Bun.argv.slice(2).reduce<[string, string][]>((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1] ?? ""]);
  return pairs;
}, []));
const run = path.resolve(args.run ?? "");
const data = path.resolve(args.data ?? "bench/results/audio-routing/data");
const trials = (await Bun.file(path.join(run, "trials.jsonl")).text()).trim().split("\n").map((line) => JSON.parse(line) as Trial);
const manifest = (await Bun.file(path.join(data, "manifest.json")).json()) as { clip: string; choices: string[] }[];
const chance = manifest.reduce((sum, clip) => sum + 1 / clip.choices.length, 0);

const order = ["codex-alone", "codex-ennodia", "claude-alone", "gemini-direct"];
const labels: Record<string, string> = {
  "codex-alone": "Codex alone", "codex-ennodia": "Codex with Ennodia", "claude-alone": "Claude Code alone", "gemini-direct": "Gemini in Antigravity",
};
const failed = (trial: Trial) => trial.exitCode !== 0 || trial.timedOut;
const denied = (trial: Trial) => /headless mode cannot prompt|permission that headless|auto-denied/i.test(`${trial.error ?? ""} ${trial.text}`);
const median = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]! : 0;
const pct = (part: number, whole: number) => whole ? `${Math.round((part / whole) * 100)}%` : "–";

const lines = [
  `# Audio routing pilot`,
  "",
  `${manifest.length} clips from MMAU test-mini. Expected by chance: ${chance.toFixed(1)} right (${pct(chance, manifest.length)}).`,
  "",
  "| Condition | Right | Right when the run finished | Failed runs | Said it listened | Handed off | Median time | Median tokens |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  // Tokens are shown where the agent reports cached input in its total. Codex does.
];
for (const condition of order) {
  const rows = trials.filter((trial) => trial.condition === condition);
  if (!rows.length) continue;
  const finished = rows.filter((trial) => !failed(trial));
  const tokens = condition.startsWith("codex-") || args["all-tokens"] ? rows.map((trial) => trial.tokens ?? 0).filter(Boolean) : [];
  lines.push(`| ${labels[condition]} | ${rows.filter((t) => t.correct).length}/${rows.length} (${pct(rows.filter((t) => t.correct).length, rows.length)}) | ${finished.filter((t) => t.correct).length}/${finished.length} | ${rows.filter(failed).length}${rows.some(denied) ? ` (${rows.filter(denied).length} permission)` : ""} | ${rows.filter((t) => t.listened === "yes").length} | ${condition === "codex-ennodia" ? rows.filter((t) => t.toolCalls.some((c) => c.tool === "ennodia.ennodia_run")).length : "–"} | ${Math.round(median(rows.map((t) => t.elapsedMs)) / 1000)} s | ${tokens.length ? median(tokens).toLocaleString("en-US") : "not reported"} |`);
}

// Where the relay changes the result: the same clip, Gemini on its own versus
// Gemini through Codex.
const direct = new Map(trials.filter((t) => t.condition === "gemini-direct").map((t) => [t.clip, t]));
const relayed = trials.filter((t) => t.condition === "codex-ennodia");
if (relayed.length && direct.size) {
  const both = relayed.filter((t) => direct.has(t.clip));
  const agree = both.filter((t) => t.correct === direct.get(t.clip)!.correct).length;
  lines.push("", "## Codex with Ennodia against Gemini on its own", "",
    `Same clip, ${both.length} pairs. Both right: ${both.filter((t) => t.correct && direct.get(t.clip)!.correct).length}. Both wrong: ${both.filter((t) => !t.correct && !direct.get(t.clip)!.correct).length}. Only Codex with Ennodia right: ${both.filter((t) => t.correct && !direct.get(t.clip)!.correct).length}. Only Gemini on its own right: ${both.filter((t) => !t.correct && direct.get(t.clip)!.correct).length}. Same outcome: ${agree}/${both.length}.`);
}

lines.push("", "## By task", "", "| Condition | Sound | Music | Speech |", "| --- | --- | --- | --- |");
for (const condition of order) {
  const rows = trials.filter((trial) => trial.condition === condition);
  if (!rows.length) continue;
  const cell = (task: string) => { const r = rows.filter((t) => t.task === task); return `${r.filter((t) => t.correct).length}/${r.length}`; };
  lines.push(`| ${labels[condition]} | ${cell("sound")} | ${cell("music")} | ${cell("speech")} |`);
}

lines.push("", "## Clip by clip", "", `| Clip | ${order.filter((c) => trials.some((t) => t.condition === c)).map((c) => labels[c]).join(" | ")} |`, `| --- | ${order.filter((c) => trials.some((t) => t.condition === c)).map(() => "---").join(" | ")} |`);
for (const clip of manifest.map((entry) => entry.clip)) {
  const cells = order.filter((c) => trials.some((t) => t.condition === c)).map((condition) => {
    const trial = trials.find((t) => t.condition === condition && t.clip === clip);
    if (!trial) return "";
    if (failed(trial)) return denied(trial) ? "failed (permission)" : "failed";
    return trial.correct ? "right" : "wrong";
  });
  lines.push(`| ${clip} | ${cells.join(" | ")} |`);
}

await Bun.write(path.join(run, "results.md"), `${lines.join("\n")}\n`);
console.log(lines.slice(0, 12).join("\n"));
