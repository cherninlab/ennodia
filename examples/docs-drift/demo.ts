import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

// Opt-in live example. This starts one real agent and uses its configured access.
if (!process.argv.includes("--live")) {
  console.log("Run: bun examples/docs-drift/demo.ts --live <harness-id>");
  console.log("Example: bun examples/docs-drift/demo.ts --live antigravity");
  process.exit(0);
}
const harnessId = process.argv[process.argv.indexOf("--live") + 1];
if (!harnessId) throw new Error("Select an installed, authenticated harness ID.");
const root = resolve(import.meta.dir, "../..");
const client = new Client({ name: "ennodia-docs-demo", version: "1" });
const transport = new StdioClientTransport({
  command: "bun", args: ["run", "src/cli.ts"], cwd: root, stderr: "pipe",
});
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text?: string }[])
    .filter((item) => item.type === "text").map((item) => item.text).join("\n");
  if (result.isError) throw new Error(text);
  return JSON.parse(text);
}
try {
  console.log("Ennodia live example: find stale documentation");
  console.log(`Agent: ${harnessId}; configured default model; no model override.`);
  console.log("Read-only task: check README against config.ts; preserve labeled history.");
  await client.connect(transport);
  const run = await call("ennodia_run", {
    harnessId, mode: "single", compare: false, cwd: import.meta.dir, timeoutMs: 120000,
    prompt: "Read only README.md, config.ts, and archive/migration.md. Compare current README claims with config.ts. Return each conflict and its correction in plain text, with relative file names only. Explain if the labeled historical migration record needs changes. Do not read other files or edit anything. Keep the response under 180 words.",
  });
  console.log(`Run: ${run.id}\nStatus: ${run.status}`);
  const deadline = Date.now() + 135000;
  for (;;) {
    await Bun.sleep(2000);
    const result = await call("ennodia_get_run", { runId: run.id, includeEvents: false, maxAnswerChars: 5000 });
    if (["succeeded", "failed", "cancelled"].includes(result.status)) {
      console.log(`Status: ${result.status}\nElapsed: ${result.elapsedMs} ms`);
      console.log(result.finalAnswer || JSON.stringify(result.diagnosis ?? "No answer returned."));
      console.log("Check each finding against config.ts before using it.");
      console.log("This is one live attempt, without a speed or cost comparison.");
      if (result.status !== "succeeded") process.exitCode = 1;
      break;
    }
    if (Date.now() > deadline) {
      await call("ennodia_cancel_run", { runId: run.id });
      throw new Error("The bounded demo wait expired.");
    }
  }
} finally {
  await client.close();
}
