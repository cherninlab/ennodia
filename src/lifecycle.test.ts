import { describe, expect, it } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { summarizeCompositionalTasks } from "./compositional";
import { EnnodiaCore } from "./core";
import { discoverHarnesses, harnessAdapters, type HarnessAdapter, type HarnessDiscovery } from "./harnesses";
import { TaskManager } from "./tasks";

const discovery: HarnessDiscovery = {
  id: "fixture", name: "Fixture", kind: "cli", available: true, runnable: true,
  commandPath: process.execPath, capabilities: ["code"], notes: [],
};
function adapter(script: string): HarnessAdapter {
  return { id: "fixture", name: "Fixture", kind: "cli", commandCandidates: [], capabilities: ["code"],
    buildCommand: (command) => ({ command, args: ["-e", script] }) };
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
async function until(check: () => boolean, timeout = 3_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Fixture did not reach expected state.");
    await Bun.sleep(10);
  }
}

describe("owned task lifecycle", () => {
  it("settles when an adapter result check throws", async () => {
    const manager = new TaskManager();
    try {
      const fixture = { ...adapter("console.log('answer')"), failureReason: () => { throw new Error("broken result check"); } };
      const task = manager.start(fixture, discovery, { prompt: "fixture" }).task;
      const result = await manager.waitForTerminal(task.id, 2_000);
      expect(result?.status).toBe("failed");
      expect(result?.events.some((event) => event.message?.includes("broken result check"))).toBe(true);
    } finally { await manager.shutdown(); }
  });

  it("does not treat a zero-exit Antigravity permission denial as an answer", async () => {
    const manager = new TaskManager();
    const agy = harnessAdapters.find((h) => h.id === "antigravity")!;
    try {
      const fixture = { ...adapter("console.error('jetski: no output produced — a tool required read_file permission')"), failureReason: agy.failureReason };
      const task = manager.start(fixture, discovery, { prompt: "fixture" }).task;
      const result = await manager.waitForTerminal(task.id, 2_000);
      expect(result?.exitCode).toBe(0);
      expect(result?.status).toBe("failed");
      expect(result?.events.some((event) => event.message?.includes("returned no answer"))).toBe(true);
    } finally { await manager.shutdown(); }
  });

  it("recognizes a final-file answer in compact compositional status", async () => {
    const manager = new TaskManager();
    const finalAdapter: HarnessAdapter = {
      ...adapter(""), buildCommand: (command, input) => ({ command, args: ["-e", "await Bun.write(process.argv[1], 'final answer')", input.finalMessagePath!] }),
    };
    try {
      const task = manager.start(finalAdapter, discovery, { prompt: "fixture" }).task;
      await manager.waitForTerminal(task.id, 2_000);
      const compact = manager.get(task.id, { includeOutput: false })!;
      expect(compact.stdoutChars).toBe(0);
      expect(compact.finalMessage).toBeUndefined();
      const view = summarizeCompositionalTasks({ requestedTaskIds: [task.id], tasks: [compact], minSuccessfulTasksForCompare: 1 });
      expect(view.compareReady).toBe(true);
      expect(view.emptySucceededTaskIds).toEqual([]);
      expect(view.tasks[0]?.outputTruncated).toBe(true);
      expect(view.tasks[0]?.captureTruncated).toBe(false);
      const lost = summarizeCompositionalTasks({ requestedTaskIds: [task.id], tasks: [{ ...compact, captureTruncated: true }], minSuccessfulTasksForCompare: 1 });
      expect(lost.compareReady).toBe(false);
      expect(lost.truncatedTaskIds).toEqual([task.id]);
    } finally { await manager.shutdown(); }
  });

  it("cancels descendants even when the parent exits before a TERM-ignoring child", async () => {
    const manager = new TaskManager();
    let descendant: number | undefined;
    try {
      const script = `const child = Bun.spawn([process.execPath, '-e', "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"], { stdout: 'pipe', stderr: 'ignore' }); await child.stdout.getReader().read(); console.log(child.pid); setInterval(() => {}, 1000);`;
      const task = manager.start(adapter(script), discovery, { prompt: "fixture", timeoutMs: 10_000 }).task;
      await until(() => Boolean(manager.get(task.id)?.stdout.trim()));
      descendant = Number(manager.get(task.id)!.stdout.trim());
      expect(alive(descendant)).toBe(true);
      manager.cancel(task.id);
      const result = await manager.waitForTerminal(task.id, 2_000);
      expect(result?.status).toBe("cancelled");
      await until(() => !alive(descendant!));
    } finally {
      await manager.shutdown();
      if (descendant && alive(descendant)) process.kill(descendant, "SIGKILL");
    }
  });

  it("bounds timeouts when the harness ignores TERM", async () => {
    const manager = new TaskManager();
    try {
      const task = manager.start(adapter("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"), discovery, {
        prompt: "fixture", timeoutMs: 150,
      }).task;
      const result = await manager.waitForTerminal(task.id, 2_000);
      expect(result?.status).toBe("failed");
      expect(result?.timedOut).toBe(true);
      expect(alive(task.pid!)).toBe(false);
    } finally { await manager.shutdown(); }
  });

  for (const mode of ["raw", "compositional"] as const) {
    it(`rolls back a partially started ${mode} batch`, async () => {
      const manager = new TaskManager();
      const first = adapter("setInterval(() => {}, 1000)");
      const broken = { ...first, id: "broken", buildCommand: () => ({ command: "/nonexistent/ennodia-fixture", args: [] }) };
      const core = new EnnodiaCore({
        taskManager: manager,
        discoverHarnesses: async () => [discovery, { ...discovery, id: "broken" }],
        findHarnessAdapter: (id) => id === "broken" ? broken : first,
        planRoute: () => ({ category: "code", reasons: [], selected: "fixture", candidates: ["fixture", "broken"], parallelSuggested: true, compareSuggested: false }),
      });
      try {
        const result = mode === "raw"
          ? core.startTasks({ prompt: "fixture", mode: "parallel" })
          : core.startCompositional({ prompt: "fixture", slices: [
            { prompt: "first", harnessId: "fixture" }, { prompt: "second", harnessId: "broken" },
          ] });
        await expect(result).rejects.toThrow();
        const tasks = manager.list();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].cancelRequested).toBe(true);
        expect((await manager.waitForTerminal(tasks[0].id, 2_000))?.status).toBe("cancelled");
      } finally { await core.shutdown(); }
    });
  }

  it("bounds a stuck version probe without blocking other discoveries", async () => {
    const fixture = { ...adapter(""), id: "stuck-version", commandCandidates: [process.execPath],
      versionArgs: ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"] };
    harnessAdapters.push(fixture);
    try {
      const started = Date.now();
      const harnesses = await discoverHarnesses({ refresh: true });
      expect(Date.now() - started).toBeLessThan(4_000);
      const stuck = harnesses.find((h) => h.id === fixture.id);
      expect(stuck?.version).toBeUndefined();
      expect(stuck?.notes.join(" ")).toContain("timed out");
      expect(harnesses.length).toBeGreaterThan(1);
    } finally {
      harnessAdapters.splice(harnessAdapters.indexOf(fixture), 1);
      await discoverHarnesses({ refresh: true });
    }
  }, 7_000);

  it("shuts down the real MCP server and active worker on stdin EOF", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ennodia-eof-test-"));
    const pidFile = join(dir, "worker.pid");
    writeFileSync(join(dir, "codex"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo fixture; exit 0; fi\necho $$ > worker.pid\nexec /bin/sleep 30\n');
    chmodSync(join(dir, "codex"), 0o755);
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts")], {
      cwd: dir, env: { ...process.env, PATH: dir, ENNODIA_HISTORY: "0" }, stdin: "pipe", stdout: "pipe", stderr: "pipe",
    });
    const output = new Response(child.stdout).text();
    const errors = new Response(child.stderr).text();
    let exited = false;
    void child.exited.then(() => { exited = true; });
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    try {
      send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
        protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "fixture", version: "1" },
      } });
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ennodia_start", arguments: {
        prompt: "fixture", harnessId: "codex", cwd: dir, timeoutMs: 30_000,
      } } });
      await until(() => existsSync(pidFile));
      const worker = Number(readFileSync(pidFile, "utf8"));
      child.stdin.end();
      await until(() => exited);
      expect(alive(worker)).toBe(false);
      expect(await child.exited).toBe(0);
    } finally {
      child.kill("SIGTERM");
      await child.exited;
      await Promise.all([output, errors]);
      if (existsSync(pidFile)) {
        const pid = Number(readFileSync(pidFile, "utf8"));
        if (alive(pid)) process.kill(pid, "SIGKILL");
      }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 7_000);
});
