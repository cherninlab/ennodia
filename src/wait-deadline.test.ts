import { expect, it } from "bun:test";
import { EnnodiaCore } from "./core";
import type { HarnessAdapter } from "./harnesses";

it("shares one wait deadline between worker completion and pending history", async () => {
  let releaseHistory!: () => void;
  const history = new Promise<void>(resolve => { releaseHistory = resolve; });
  let recording = false;
  const adapter: HarnessAdapter = {
    id: "deadline-fixture", name: "Deadline fixture", kind: "cli",
    commandCandidates: [], capabilities: [],
    buildCommand: () => ({ command: process.execPath,
      args: ["-e", "await Bun.sleep(300); console.log('done')"] }),
  };
  const core = new EnnodiaCore({
    findHarnessAdapter: () => adapter,
    discoverHarnesses: async () => [{ ...adapter, notes: [], available: true, runnable: true, commandPath: process.execPath }],
    historySink: { recordRun: () => { recording = true; return history; }, listRuns: () => [] },
  });
  try {
    const run = await core.startRun({ prompt: "deadline", harnessId: adapter.id, compare: false });
    const start = performance.now();
    const result = await core.waitForRun(run.id, 600);
    const elapsed = performance.now() - start;
    expect(result?.status).toBe("succeeded");
    expect(recording).toBe(true);
    // The old two-budget implementation takes at least 900 ms here.
    expect(elapsed).toBeLessThan(850);
    releaseHistory();
    expect((await core.waitForRun(run.id, 1000))?.finalAnswer).toBe("done");
  } finally {
    releaseHistory();
    await core.shutdown();
  }
});

it("records cancellation after the worker flushes its final partial findings", async () => {
  const snapshots: import("./history").RunHistorySnapshot[] = [];
  const adapter: HarnessAdapter = {
    id: "cancel-evidence", name: "Cancel evidence", kind: "cli",
    commandCandidates: [], capabilities: [],
    buildCommand: () => ({ command: process.execPath, args: ["-e", `
      process.on('SIGTERM', async () => {
        await Bun.sleep(60);
        console.log('checkpoint: useful finding');
        process.exit(0);
      });
      console.log('ready');
      setInterval(() => {}, 1000);
    `] }),
  };
  const core = new EnnodiaCore({
    findHarnessAdapter: () => adapter,
    discoverHarnesses: async () => [{ ...adapter, notes: [], available: true, runnable: true, commandPath: process.execPath }],
    historySink: { recordRun: snapshot => { snapshots.push(snapshot); }, listRuns: () => snapshots },
  });
  try {
    const run = await core.startRun({ prompt: "investigate", harnessId: adapter.id, compare: false });
    const limit = Date.now() + 2000;
    while (!core.getTask(run.taskIds[0]!)?.stdout.includes('ready') && Date.now() < limit) await Bun.sleep(10);
    expect(core.getTask(run.taskIds[0]!)?.stdout).toContain('ready');
    core.cancelRun(run.id);
    await core.waitForRun(run.id, 2000);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.tasks[0]!.status).toBe('cancelled');
    expect(snapshots[0]!.tasks[0]!.stdout).toContain('checkpoint: useful finding');
  } finally { await core.shutdown(); }
});
