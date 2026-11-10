import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnnodiaCore } from "./core";
import { harnessAdapters, type HarnessAdapter, type HarnessDiscovery } from "./harnesses";
import { HarnessReadinessError, HarnessReadinessManager, nativeReadinessFailure, readinessBlocked, runMaintenanceCommand, type MaintenanceCommandRunner, type CommandResult } from "./readiness";

const ok = (stdout = ""): CommandResult => ({ exitCode: 0, stdout, stderr: "", timedOut: false });
const adapter: HarnessAdapter = {
  id: "codex", name: "Fixture Codex", kind: "cli", commandCandidates: [], capabilities: [], supportsNativeSandbox: true,
  buildCommand: (_path, input) => ({ command: process.execPath, args: ["-e", "console.log('review complete')", input.prompt], cwd: input.cwd }),
};
const harness: HarnessDiscovery = { ...adapter, available: true, runnable: true, commandPath: "/fake/codex", version: "1", notes: [] };
const reply: MaintenanceCommandRunner = async spec => {
  const prompt = spec.args.find(arg => arg.includes("ENNODIA_READY_"));
  return ok(prompt ? /ENNODIA_READY_[a-f0-9]+/.exec(prompt)![0] : "Logged in using ChatGPT");
};
function fixture(runCommand: MaintenanceCommandRunner = reply) {
  return new EnnodiaCore({ discoverHarnesses: async () => [{ ...harness }], findHarnessAdapter: () => adapter, readinessOptions: { autoUpgrade: false, runCommand } });
}

describe("harness readiness", () => {
  it("keeps a timed-out model check unverified and allows the real task without another probe", async () => {
    let probes = 0;
    const core = fixture(async spec => {
      if (!spec.args.some(a => a.includes("ENNODIA_READY_"))) return reply(spec, 0);
      probes++;
      return { ...ok(), exitCode: null, timedOut: true };
    });
    try {
      const checked = await core.checkHarnesses({ harnessIds: ["codex"], model: "slow-model", verify: true });
      const readiness = checked.harnesses[0]?.readiness;
      expect(readiness?.state).toBe("unverified");
      expect(readiness?.message).toContain("timed out");
      expect(readinessBlocked(readiness)).toBe(false);
      expect(checked.actionRequired).toEqual([]);
      const run = await core.startRun({ prompt: "review", harnessId: "codex", model: "slow-model", compare: false, budget: { maxChildTasks: 1 } });
      expect((await core.waitForRun(run.id, 5_000))?.status).toBe("succeeded");
      expect(run.preflight?.modelProbes).toBe(0);
      expect(probes).toBe(1);
    } finally { await core.shutdown(); }
  });
  it("does not confuse a slow native sign-in check with a confirmed setup failure", async () => {
    const manager = new HarnessReadinessManager({ autoUpgrade: false, runCommand: async () => ({ ...ok(), timedOut: true, exitCode: null }) });
    try {
      const checked = await manager.check(harness, adapter);
      expect(checked.state).toBe("unverified");
      expect(readinessBlocked(checked)).toBe(false);
    } finally { await manager.shutdown(); }
  });
  it("recognizes Claude's five-hour capacity message during native verification", async () => {
    const core = fixture(async spec => spec.args.some(a => a.includes("ENNODIA_READY_"))
      ? { ...ok("You've hit your 5-hour limit · resets 6:20pm (Europe/Amsterdam)"), exitCode: 1 } : reply(spec, 0));
    try {
      const checked = await core.checkHarnesses({ harnessIds: ["codex"], model: "exact-model", verify: true });
      expect(checked.actionRequired[0]?.readiness.state).toBe("quota-exhausted");
    } finally { await core.shutdown(); }
  });
  it("verifies Cline's final JSON answer without accepting echoed or aborted events", async () => {
    const cline = harnessAdapters.find(a => a.id === "cline")!;
    const discovery = { ...harness, id: "cline", commandPath: "/fake/cline" };
    for (const kind of ["result", "echo", "aborted"] as const) {
      const manager = new HarnessReadinessManager({ autoUpgrade: false, runCommand: async spec => {
        const nonce = /ENNODIA_READY_[a-f0-9]+/.exec(spec.args.join(" "))![0];
        return ok(JSON.stringify(kind === "echo"
          ? { type: "run_start", text: nonce }
          : { type: "run_result", finishReason: kind === "aborted" ? "aborted" : "completed", text: nonce }));
      } });
      try {
        expect((await manager.check(discovery, cline, { verify: true })).state).toBe(kind === "result" ? "ready" : "unverified");
      } finally { await manager.shutdown(); }
    }
  });
  it("selects the full Hermes CLI, never the incompatible legacy runner", () => {
    const hermes = harnessAdapters.find(a => a.id === "hermes-agent")!;
    expect(hermes.commandCandidates).toEqual(["hermes"]);
    expect(hermes.buildCommand!("/bin/hermes", { prompt: "review" }).args).toContain("chat");
  });
  it("stops before any reviewer or probe starts when native login is expired", async () => {
    let calls = 0;
    const core = fixture(async () => { calls++; return { ...ok(), exitCode: 1, stderr: "Not logged in" }; });
    try {
      const error = await core.startRun({ prompt: "review", harnessId: "codex", compare: false }).catch(e => e);
      expect(error).toBeInstanceOf(HarnessReadinessError);
      expect(error.actionRequired[0].readiness.state).toBe("login-required");
      expect(error.actionRequired[0].readiness.recovery.command).toEqual(["/fake/codex", "login"]);
      expect(error.actionRequired[0].readiness.recovery.recheck).toMatchObject({ tool: "ennodia_check_harnesses", verify: true });
      expect(core.listTasks()).toHaveLength(0);
      expect(calls).toBe(1);
    } finally { await core.shutdown(); }
  });
  it("reports setup for a missing CLI rather than offering sign-in as a fix", async () => {
    const manager = new HarnessReadinessManager({ autoUpgrade: false, runCommand: reply });
    const value = await manager.check({ ...harness, runnable: false, commandPath: undefined }, adapter);
    expect(value.state).toBe("setup-required");
    expect(value.recovery?.instruction).toContain("Install");
  });
  it("rechecks after login and launches the original requested model without repeating the probe", async () => {
    let loggedIn = false;
    let probes = 0;
    const core = fixture(async spec => {
      if (!loggedIn) return { ...ok(), exitCode: 1, stderr: "OAuth session expired" };
      if (spec.args.some(a => a.includes("ENNODIA_READY_"))) probes++;
      return reply(spec, 0);
    });
    try {
      await expect(core.startRun({ prompt: "review", harnessId: "codex", model: "exact-model", compare: false })).rejects.toThrow("Review not started");
      loggedIn = true;
      const checked = await core.checkHarnesses({ harnessIds: ["codex"], model: "exact-model", refresh: true, verify: true });
      expect(checked.actionRequired).toHaveLength(0);
      expect(checked.harnesses[0]?.readiness?.state).toBe("ready");
      const started = await core.startRun({ prompt: "review", harnessId: "codex", model: "exact-model", compare: false });
      const result = await core.waitForRun(started.id, 5_000, { includeEvents: false });
      expect(result?.status).toBe("succeeded");
      expect(result?.model).toBe("exact-model");
      expect(probes).toBe(1);
      expect(result?.preflight?.modelProbes).toBe(0);
      expect(result?.coverage).toMatchObject({ requested: 1, succeeded: 1, failed: 0 });
      expect(started.installation?.scope).toBe("source-checkout");
      expect(result?.installation?.version).toBe(checked.installation.version);
    } finally { await core.shutdown(); }
  });
  it("coalesces concurrent route verification and keeps models separate", async () => {
    let probes = 0;
    const manager = new HarnessReadinessManager({ autoUpgrade: false, runCommand: async spec => {
      if (spec.args.some(a => a.includes("ENNODIA_READY_"))) probes++;
      return reply(spec, 0);
    } });
    const results = await Promise.all(Array.from({ length: 5 }, () => manager.check(harness, adapter, { verify: true, model: "one" })));
    expect(results.every(r => r.state === "ready")).toBe(true);
    expect(probes).toBe(1);
    await manager.check(harness, adapter, { verify: true, model: "two" });
    expect(probes).toBe(2);
  });
  it.each([
    { explicitCwd: false, model: undefined, expectedModel: "previous-model" },
    { explicitCwd: true, model: undefined, expectedModel: "previous-model" },
    { explicitCwd: false, model: "other-model", expectedModel: "other-model" },
  ])("uses the effective continuation model in preflight ($explicitCwd, $model)", async ({ explicitCwd, model, expectedModel }) => {
    const probedModels: string[] = [];
    const native: HarnessAdapter = {
      ...adapter, id: "session-fixture", supportsSessionContinuation: true,
      extractSessionId: stdout => stdout.includes("SESSION:owned") ? "owned" : undefined,
      buildCommand: (_path, input) => ({ command: process.execPath, cwd: input.cwd,
        args: ["-e", "console.log('SESSION:owned'); console.log(process.argv.at(-1))", input.prompt, input.model ?? "default"] }),
    };
    const core = new EnnodiaCore({ discoverHarnesses: async () => [{ ...harness, ...native }], findHarnessAdapter: () => native,
      readinessOptions: { autoUpgrade: false, runCommand: async spec => {
        const model = spec.args.at(-1)!;
        probedModels.push(model);
        if (model === "default") return { ...ok(), exitCode: 1, stderr: "unknown model" };
        const nonce = /ENNODIA_READY_[a-f0-9]+/.exec(spec.args.join(" "))![0];
        return ok(nonce);
      } } });
    try {
      const first = await core.startRun({ prompt: "first", harnessId: native.id, model: "previous-model", cwd: process.cwd(), persistSession: true });
      const settled = await core.waitForRun(first.id, 5_000);
      const next = await core.startRun({ prompt: "continue", harnessId: native.id, continueTaskId: settled!.taskIds[0], model, ...(explicitCwd ? { cwd: process.cwd() } : {}) });
      const continued = await core.waitForRun(next.id, 5_000);
      expect(continued?.status).toBe("succeeded");
      expect(continued?.model).toBe(expectedModel);
      expect(continued?.preflight?.checks[0]?.readiness.model).toBe(expectedModel);
      expect(core.getTask(continued!.taskIds[0])?.model).toBe(expectedModel);
      expect(continued?.finalAnswer).toContain(expectedModel);
      expect(probedModels).toEqual([]);
    } finally { await core.shutdown(); }
  });
  it("does not accept a prompt echo or zero-exit error as readiness", async () => {
    const echo = new HarnessReadinessManager({ autoUpgrade: false, runCommand: async spec => ok(spec.args.join(" ")) });
    expect((await echo.check(harness, adapter, { verify: true })).state).toBe("unverified");
    const zeroError = new HarnessReadinessManager({ autoUpgrade: false, runCommand: async spec => spec.args.includes("status") ? ok("Logged in") : ok('{"type":"turn.failed","error":{"message":"You\'ve hit your usage limit"}}') });
    expect((await zeroError.check(harness, adapter, { verify: true })).state).toBe("quota-exhausted");
  });
  it("accepts a standalone response with native terminal formatting", async () => {
    const manager = new HarnessReadinessManager({ autoUpgrade: false, runCommand: async spec => {
      const result = await reply(spec, 0);
      return { ...result, stdout: `\u001b[0m${result.stdout}\u001b[0m` };
    } });
    expect((await manager.check(harness, adapter, { verify: true })).state).toBe("ready");
  });
  it.each([
    { id: "opencode", stderr: "\u001b[0m\n> build · kimi-k3\n\u001b[0m\n\u001b[91m\u001b[1mError: \u001b[0mThis API key has expired. Create a new API key in OpenCode Console and replace it in your client or secret store. Signing in again will not renew this key.\n", state: "credentials-expired", message: "API key has expired", instruction: "Replace the expired API key" },
    { id: "kilo", stderr: "\u001b[0m\n> code · google/gemini-3-pro-image\n\u001b[0m\n\u001b[91m\u001b[1mError: \u001b[0mAdd credits to continue, or switch to a free model\n", state: "quota-exhausted", message: "credits are exhausted", instruction: "Restore credits or quota" },
  ])("reports $id's native blocker and recovery without relaunching it", async ({ id, stderr, state, message, instruction }) => {
    let probes = 0;
    const native = { ...adapter, id };
    const h = { ...harness, id, commandPath: `/fake/${id}` };
    const core = new EnnodiaCore({ discoverHarnesses: async () => [h], findHarnessAdapter: () => native,
      readinessOptions: { autoUpgrade: false, runCommand: async spec => {
        if (!spec.args.some(a => a.includes("ENNODIA_READY_"))) return ok();
        probes++;
        return { ...ok(), exitCode: 1, stderr };
      } } });
    try {
      const checked = await core.checkHarnesses({ harnessIds: [id], model: "original-model", verify: true });
      const readiness = checked.actionRequired[0]?.readiness;
      expect(readiness?.state).toBe(state);
      expect(readiness?.message).toContain(message);
      expect(readiness?.recovery?.instruction).toContain(instruction);
      expect(readiness?.recovery?.recheck).toMatchObject({ harnessIds: [id], model: "original-model", verify: true });
      await expect(core.startRun({ prompt: "review", harnessId: id, model: "original-model", compare: false })).rejects.toThrow("Review not started");
      expect(probes).toBe(1);
      expect(core.listTasks()).toHaveLength(0);
    } finally { await core.shutdown(); }
  });
  it("invalidates a successful route immediately on a native authentication failure", async () => {
    const manager = new HarnessReadinessManager({ autoUpgrade: false, runCommand: reply });
    await manager.check(harness, adapter, { verify: true });
    manager.observe(harness, {}, { status: "failed", stdout: "", stderr: "OAuth session expired", timedOut: false });
    expect((await manager.check(harness, adapter, { verify: true })).state).toBe("login-required");
  });
  it("does not treat successful answer content as an authentication failure", async () => {
    const manager = new HarnessReadinessManager({ autoUpgrade: false, runCommand: reply });
    manager.observe(harness, {}, { status: "succeeded", stdout: "Not logged in is the message shown by the old code", stderr: "", timedOut: false, hasOutput: true });
    expect((await manager.check(harness, adapter)).state).toBe("ready");
  });
  it("does not turn failed worker answer prose into a sign-in blocker", async () => {
    const failing = { ...adapter, buildCommand: (_path: string, input: { prompt: string; cwd?: string }) => ({ command: process.execPath, args: ["-e", "console.log('401 responses are not retried'); process.exit(1)", input.prompt], cwd: input.cwd }) };
    const core = new EnnodiaCore({ discoverHarnesses: async () => [harness], findHarnessAdapter: () => failing, readinessOptions: { autoUpgrade: false, runCommand: reply } });
    try {
      const started = await core.startRun({ prompt: "review", harnessId: "codex", compare: false });
      const terminal = await core.waitForRun(started.id, 5_000);
      expect(terminal?.status).toBe("failed");
      expect(terminal?.actionRequired).toBeUndefined();
      expect((await core.listHarnesses())[0]?.readiness?.state).toBe("unverified");
    } finally { await core.shutdown(); }
  });
  it("still recognizes plain stdout blockers during native status and model checks", async () => {
    for (const phase of ["auth", "probe"] as const) {
      const manager = new HarnessReadinessManager({ autoUpgrade: false, runCommand: async spec => {
        const probe = spec.args.some(a => a.includes("ENNODIA_READY_"));
        if (phase === "auth" && !probe) return ok("Not logged in");
        if (phase === "probe" && probe) return ok("Add credits to continue");
        return reply(spec, 0);
      } });
      try {
        expect((await manager.check(harness, adapter, { verify: true })).state).toBe(phase === "auth" ? "login-required" : "quota-exhausted");
      } finally { await manager.shutdown(); }
    }
  });
  it("uses the caller's one-worker budget without adding a model probe", async () => {
    let probes = 0;
    const core = fixture(async spec => { if (spec.args.some(a => a.includes("ENNODIA_READY_"))) probes++; return reply(spec, 0); });
    try {
      const started = await core.startRun({ prompt: "review", harnessId: "codex", compare: false, budget: { maxChildTasks: 1 } });
      expect((await core.waitForRun(started.id, 5_000))?.status).toBe("succeeded");
      expect(probes).toBe(0);
      expect(core.listTasks()).toHaveLength(1);
    } finally { await core.shutdown(); }
  });
  it("refreshes readiness after the TTL or installed version changes", async () => {
    let time = 0;
    let calls = 0;
    const manager = new HarnessReadinessManager({ autoUpgrade: false, now: () => time, runCommand: async spec => { calls++; return reply(spec, 0); } });
    await manager.check(harness, adapter, { verify: true });
    await manager.check(harness, adapter, { verify: true });
    expect(calls).toBe(2);
    time = 300_001;
    await manager.check(harness, adapter, { verify: true });
    await manager.check({ ...harness, version: "2" }, adapter, { verify: true });
    expect(calls).toBe(6);
  });
  it("terminates a stalled check and its pipes at a bounded deadline", async () => {
    const result = await runMaintenanceCommand({ command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] }, 40);
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });
  it("runs native upgrades once a day across manager restarts and defers during active work", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ennodia-update-test-"));
    const path = join(dir, "agy");
    writeFileSync(path, "fixture");
    const h = { ...harness, id: "antigravity", commandPath: path };
    let upgrades = 0;
    const runner: MaintenanceCommandRunner = async () => { upgrades++; return ok(); };
    try {
      await new HarnessReadinessManager({ stateDir: dir, runCommand: runner }).upgrade(h);
      await new HarnessReadinessManager({ stateDir: dir, runCommand: runner }).upgrade(h);
      expect(upgrades).toBe(1);
      const busy = new HarnessReadinessManager({ stateDir: dir, runCommand: runner, isBusy: () => true });
      await busy.upgrade(h, true);
      expect(upgrades).toBe(1);
      const report = await busy.check(h, adapter);
      expect(report.upgrade?.status).toBe("deferred");
      await new HarnessReadinessManager({ stateDir: dir, runCommand: runner }).upgrade(h, true);
      expect(upgrades).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("preserves verified access when maintenance is deferred without changing the installation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ennodia-deferred-access-"));
    const path = join(dir, "agy"); writeFileSync(path, "fixture");
    const h = { ...harness, id: "antigravity", commandPath: path };
    let busy = false, probes = 0;
    const manager = new HarnessReadinessManager({ stateDir: dir, isBusy: () => busy, runCommand: async spec => { probes++; return reply(spec, 0); } });
    try {
      expect((await manager.check(h, adapter, { verify: true })).state).toBe("ready");
      busy = true;
      await manager.upgrade(h, true);
      expect((await manager.check(h, adapter, { verify: true })).state).toBe("ready");
      expect(probes).toBe(1);
    } finally { await manager.shutdown(); rmSync(dir, { recursive: true, force: true }); }
  });
  it("exposes failed upgrades without claiming that the harness is current", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ennodia-update-fail-"));
    const path = join(dir, "agy");
    writeFileSync(path, "fixture");
    const h = { ...harness, id: "antigravity", commandPath: path };
    const manager = new HarnessReadinessManager({ stateDir: dir, runCommand: async () => ({ ...ok(), exitCode: 1 }) });
    try {
      await manager.upgrade(h);
      expect((await manager.check(h, adapter)).upgrade).toMatchObject({ status: "failed", command: [path, "update"] });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("recognizes structured native failures while ignoring quoted JSON in answers", () => {
    expect(nativeReadinessFailure("401 responses are not retried\nUnauthorized requests fall through", "")).toBeUndefined();
    expect(nativeReadinessFailure('{"type":"turn.failed","error":{"message":"OAuth session expired"}}', "")).toBe("login-required");
    expect(nativeReadinessFailure('{"type":"item.completed","item":{"text":"Not logged in"}}', "")).toBeUndefined();
    expect(nativeReadinessFailure("", "No access token found for Nous Portal login. Run `hermes model` to re-authenticate.")).toBe("login-required");
    expect(nativeReadinessFailure('{"type":"error","message":"\\u001b[91mError: \\u001b[0mThis API key has expired."}', "")).toBe("credentials-expired");
    expect(nativeReadinessFailure('{"type":"turn.failed","error":{"message":"Add credits to continue, or switch to a free model"}}', "")).toBe("quota-exhausted");
    expect(nativeReadinessFailure('{"type":"item.completed","item":{"text":"This API key has expired."}}', "")).toBeUndefined();
    expect(nativeReadinessFailure("The example error is: Add credits to continue", "")).toBeUndefined();
  });
  it("keeps an authorized working route usable when unrelated credentials have expired", async () => {
    const broken = { ...adapter, id: "opencode", name: "Fixture OpenCode" };
    const core = new EnnodiaCore({
      discoverHarnesses: async () => [harness, { ...harness, ...broken, commandPath: "/fake/opencode" }],
      findHarnessAdapter: id => id === "opencode" ? broken : adapter,
      readinessOptions: { autoUpgrade: false, runCommand: async spec => spec.command === "/fake/opencode" ? { ...ok(), exitCode: 1, stderr: "\u001b[91mError: \u001b[0mThis API key has expired." } : reply(spec, 0) },
    });
    try {
      const run = await core.startRun({ prompt: "review", harnessId: "codex", compare: false });
      const terminal = await core.waitForRun(run.id, 5_000);
      expect(terminal?.status).toBe("succeeded");
      expect(core.listTasks().map(task => task.harnessId)).toEqual(["codex"]);
    } finally { await core.shutdown(); }
  });
  it("blocks raw and compositional batches with zero launched reviewers", async () => {
    const core = fixture(async () => ({ ...ok(), exitCode: 1, stderr: "Not logged in" }));
    try {
      await expect(core.startTasks({ prompt: "review", harnessId: "codex" })).rejects.toThrow("Review not started");
      await expect(core.startCompositional({ prompt: "review", slices: [{ harnessId: "codex", prompt: "review" }] })).rejects.toThrow("Review not started");
      expect(core.listTasks()).toHaveLength(0);
    } finally { await core.shutdown(); }
  });
  it("checks a requested Judge login before any worker probes or launches", async () => {
    let probes = 0;
    const judge = { ...adapter, id: "claude-code", name: "Fixture Judge" };
    const core = new EnnodiaCore({
      discoverHarnesses: async () => [harness, { ...harness, id: "opencode", commandPath: "/fake/opencode" }, { ...harness, ...judge, commandPath: "/fake/claude" }],
      findHarnessAdapter: id => id === "claude-code" ? judge : adapter,
      readinessOptions: { autoUpgrade: false, runCommand: async spec => {
        if (spec.command === "/fake/claude") return ok('{"loggedIn":false}');
        if (spec.args.some(a => a.includes("ENNODIA_READY_"))) probes++;
        return reply(spec, 0);
      } },
    });
    try {
      await expect(core.startRun({ prompt: "review", mode: "parallel", compare: true, judgeHarnessId: "claude-code" })).rejects.toThrow("Review not started");
      expect(probes).toBe(0);
      expect(core.listTasks()).toHaveLength(0);
    } finally { await core.shutdown(); }
  });
  it("keeps automatic routing exclusions visible in initial and terminal receipts", async () => {
    const broken = { ...adapter, id: "claude-code", name: "Fixture Claude" };
    const core = new EnnodiaCore({
      discoverHarnesses: async () => [harness, { ...harness, ...broken, commandPath: "/fake/claude" }],
      findHarnessAdapter: id => id === "claude-code" ? broken : adapter,
      readinessOptions: { autoUpgrade: false, runCommand: async spec => spec.command === "/fake/claude" ? ok('{"loggedIn":false}') : reply(spec, 0) },
    });
    try {
      const run = await core.startRun({ prompt: "review", category: "code", mode: "parallel", compare: false });
      expect(run.actionRequired?.[0]?.harnessId).toBe("claude-code");
      expect(run.coverage).toMatchObject({ requested: 2, skipped: 1 });
      const terminal = await core.waitForRun(run.id, 5_000);
      expect(terminal?.coverage).toEqual({ requested: 2, succeeded: 1, failed: 0, skipped: 1 });
      expect(terminal?.actionRequired).toEqual(run.actionRequired);
    } finally { await core.shutdown(); }
  });
  it("limits a fast recovery recheck to the requested native harness", async () => {
    const calls: string[] = [];
    const core = new EnnodiaCore({ discoverHarnesses: async () => [harness, { ...harness, id: "kilo", commandPath: "/fake/kilo" }], findHarnessAdapter: () => adapter,
      readinessOptions: { autoUpgrade: false, runCommand: async spec => { calls.push(spec.command); return reply(spec, 0); } } });
    try {
      await core.checkHarnesses({ harnessIds: ["codex"], refresh: true });
      expect(calls).toEqual(["/fake/codex"]);
    } finally { await core.shutdown(); }
  });
  it("cancels an in-flight native readiness check during shutdown", async () => {
    const manager = new HarnessReadinessManager({ autoUpgrade: false });
    const hanging = { ...adapter, id: "custom", buildCommand: () => ({ command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] }) };
    const pending = manager.check({ ...harness, id: "custom", commandPath: process.execPath }, hanging, { verify: true });
    await Bun.sleep(20);
    const started = Date.now();
    await manager.shutdown();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect((await pending).state).toBe("unverified");
  });
  it("blocks a cached ready route while another server owns its upgrade lease", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ennodia-update-lease-"));
    const path = join(dir, "agy");
    writeFileSync(path, "fixture");
    const h = { ...harness, id: "antigravity", commandPath: path };
    let release!: () => void;
    const updater = new HarnessReadinessManager({ stateDir: dir, runCommand: async () => { await new Promise<void>(resolve => { release = resolve; }); return ok(); } });
    const reader = new HarnessReadinessManager({ stateDir: dir, autoUpgrade: false, runCommand: reply });
    try {
      expect((await reader.check(h, adapter, { verify: true })).state).toBe("ready");
      const pending = updater.upgrade(h);
      expect((await reader.check(h, adapter)).state).toBe("updating");
      release();
      await pending;
      expect((await reader.check(h, adapter, { refresh: true, verify: true })).state).toBe("ready");
    } finally { release?.(); await updater.shutdown(); await reader.shutdown(); rmSync(dir, { recursive: true, force: true }); }
  });
  it("keeps a mid-review login failure actionable in compact run receipts", async () => {
    const failing = { ...adapter, buildCommand: (_path: string, input: { prompt: string; cwd?: string }) => ({ command: process.execPath, args: ["-e", "console.error('OAuth session expired'); process.exit(1)", input.prompt], cwd: input.cwd }) };
    const core = new EnnodiaCore({ discoverHarnesses: async () => [harness], findHarnessAdapter: () => failing, readinessOptions: { autoUpgrade: false, runCommand: reply } });
    try {
      const started = await core.startRun({ prompt: "review", harnessId: "codex", model: "exact-model", compare: false });
      const terminal = await core.waitForRun(started.id, 5_000, { includeEvents: false });
      expect(terminal?.coverage?.failed).toBe(1);
      expect(terminal?.actionRequired?.[0]?.readiness).toMatchObject({ state: "login-required", model: "exact-model", message: "Sign-in is required before review." });
      expect(terminal?.actionRequired?.[0]?.readiness.recovery?.recheck.model).toBe("exact-model");
    } finally { await core.shutdown(); }
  });
  it("automatically upgrades before execution, rediscovers the version, and reuses the verified route", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ennodia-core-update-"));
    const path = join(dir, "agy");
    writeFileSync(path, "fixture");
    let version = "1";
    let upgrades = 0;
    let probes = 0;
    const native = { ...adapter, id: "antigravity" };
    const core = new EnnodiaCore({ discoverHarnesses: async () => [{ ...harness, id: native.id, commandPath: path, version }], findHarnessAdapter: () => native,
      readinessOptions: { autoUpgrade: true, stateDir: dir, runCommand: async spec => {
        if (spec.args[0] === "update") { upgrades++; version = "2"; return ok(); }
        probes++;
        return reply(spec, 0);
      } } });
    try {
      const first = await core.startRun({ prompt: "review", harnessId: native.id, compare: false });
      expect(first.preflight?.checks[0]?.readiness.upgrade?.status).toBe("succeeded");
      await core.waitForRun(first.id, 5_000);
      const second = await core.startRun({ prompt: "review again", harnessId: native.id, compare: false });
      await core.waitForRun(second.id, 5_000);
      expect(version).toBe("2");
      expect(upgrades).toBe(1);
      expect(probes).toBe(0);
      expect(second.preflight?.modelProbes).toBe(0);
      expect(second.preflight?.checks[0]?.readiness.state).toBe("ready");
    } finally { await core.shutdown(); rmSync(dir, { recursive: true, force: true }); }
  });
});
