import { expect, it } from "bun:test";
import { TaskManager } from "./tasks";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";

it("continues only the latest settled owned session and preserves its directory", async () => {
  const ids: Array<string | undefined> = [];
  const controls: Array<string | undefined> = [];
  const adapter: HarnessAdapter = {
    id: "session-fixture", name: "Session fixture", kind: "cli", commandCandidates: [], capabilities: [],
    supportsSessionContinuation: true,
    supportsNativeSubagentControl: true,
    extractSessionId: stdout => stdout.includes("SESSION:owned") ? "owned" : undefined,
    buildCommand: (_path, input) => {
      ids.push(input.nativeSessionId);
      controls.push(input.nativeSubagents);
      return { command: process.execPath, cwd: input.cwd,
        args: ["-e", "console.log('SESSION:owned'); await Bun.sleep(80); console.log('finding')"] };
    },
  };
  const discovery: HarnessDiscovery = { ...adapter, available: true, runnable: true, notes: [], commandPath: process.execPath };
  const manager = new TaskManager();
  try {
    expect(() => manager.start(adapter, discovery, { prompt: "x", continueTaskId: "foreign" })).toThrow("owned");
    expect(() => manager.start(adapter, discovery, { prompt: "x", nativeSessionId: "foreign" })).toThrow("continueTaskId");
    expect(() => manager.start(adapter, discovery, { prompt: "x", persistSession: true, isolateCwd: true })).toThrow("persistent working directory");
    const first = manager.start(adapter, discovery, { prompt: "investigate", cwd: "/tmp", persistSession: true, nativeSubagents: "disabled" }).task;
    expect(() => manager.start(adapter, discovery, { prompt: "continue", continueTaskId: first.id })).toThrow("settled");
    expect((await manager.waitForTerminal(first.id))?.canContinue).toBe(true);
    expect(() => manager.start(adapter, discovery, { prompt: "continue", continueTaskId: first.id, cwd: "/" })).toThrow("same working directory");
    const next = manager.start(adapter, discovery, { prompt: "continue", continueTaskId: first.id }).task;
    expect(next.cwd).toBe("/tmp");
    expect(ids).toEqual([undefined, "owned"]);
    expect(controls).toEqual(["disabled", "disabled"]);
    expect(next.nativeSubagents).toBe("disabled");
    expect(manager.get(first.id)?.canContinue).toBe(false);
    expect(manager.get(first.id)?.continuationTaskId).toBe(next.id);
    expect(() => manager.start(adapter, discovery, { prompt: "overlap", continueTaskId: first.id })).toThrow("latest task");
    expect((await manager.waitForTerminal(next.id))?.canContinue).toBe(true);
  } finally { await manager.shutdown(); }
});

it("keeps a native session reference from an interrupted worker", async () => {
  const adapter: HarnessAdapter = {
    id: "interrupted-session", name: "Interrupted session", kind: "cli", commandCandidates: [], capabilities: [],
    supportsSessionContinuation: true,
    extractSessionId: stdout => stdout.includes("SESSION:partial") ? "partial" : undefined,
    buildCommand: (_path, input) => ({ command: process.execPath,
      args: ["-e", input.nativeSessionId
        ? "console.log('continued')"
        : "console.log('SESSION:partial'); console.log('checkpoint'); await Bun.sleep(2000)"] }),
  };
  const discovery: HarnessDiscovery = { ...adapter, available: true, runnable: true, notes: [], commandPath: process.execPath };
  const manager = new TaskManager();
  try {
    const first = manager.start(adapter, discovery, { prompt: "investigate", persistSession: true, timeoutMs: 100 }).task;
    const stopped = await manager.waitForTerminal(first.id);
    expect(stopped?.timedOut).toBe(true);
    expect(stopped?.stdout).toContain("checkpoint");
    expect(stopped?.canContinue).toBe(true);
    const followup = manager.start(adapter, discovery, { prompt: "continue", continueTaskId: first.id }).task;
    expect((await manager.waitForTerminal(followup.id))?.stdout).toContain("continued");
  } finally { await manager.shutdown(); }
});
