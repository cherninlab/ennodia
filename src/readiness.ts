import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { CommandSpec, HarnessAdapter, HarnessDiscovery, HarnessRunInput } from "./harnesses";
import { signalOwnedProcess } from "./process";

export type ReadinessState = "unverified" | "ready" | "login-required" | "credentials-expired" | "setup-required" | "model-unavailable" | "quota-exhausted" | "unreachable" | "updating";
export type HarnessReadiness = {
  state: ReadinessState;
  checkedAt: string;
  model?: string;
  message: string;
  recovery?: { command: string[]; instruction: string; recheck: { tool: "ennodia_check_harnesses"; harnessIds: string[]; model?: string; verify: boolean } };
  upgrade?: { status: "succeeded" | "failed" | "deferred" | "unsupported"; checkedAt: string; command?: string[]; message: string };
};
export type HarnessAttention = { harnessId: string; harnessName: string; readiness: HarnessReadiness };
export type HarnessCheckInput = { harnessIds?: string[]; model?: string; cwd?: string; refresh?: boolean; verify?: boolean; upgrade?: boolean };
export type PreflightReport = { checks: HarnessAttention[]; modelProbes: number; estimatedInputTokens: number; usage: "unknown" };
export type CommandResult = { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean };
export type MaintenanceCommandRunner = (spec: CommandSpec, timeoutMs: number) => Promise<CommandResult>;
export type HarnessReadinessOptions = {
  runCommand?: MaintenanceCommandRunner;
  now?: () => number;
  stateDir?: string;
  autoUpgrade?: boolean;
  isBusy?: () => boolean;
};

const BLOCKED = new Set<ReadinessState>(["login-required", "credentials-expired", "setup-required", "model-unavailable", "quota-exhausted", "unreachable", "updating"]);
export function readinessBlocked(readiness?: HarnessReadiness): boolean { return Boolean(readiness && BLOCKED.has(readiness.state)); }
export function harnessAttention(harnesses: HarnessDiscovery[]): HarnessAttention[] {
  return harnesses.filter(h => readinessBlocked(h.readiness)).map(h => ({ harnessId: h.id, harnessName: h.name, readiness: h.readiness! }));
}
export class HarnessReadinessError extends Error {
  constructor(readonly actionRequired: HarnessAttention[]) {
    super(`Review not started. ${actionRequired.map(a => `${a.harnessName}: ${a.readiness.message}`).join(" ")}`);
    this.name = "HarnessReadinessError";
  }
}

/** Recognize native failure envelopes, never quoted prose inside an answer. */
export function nativeReadinessFailure(stdout: string, stderr: string, allowPlainStdout = false): ReadinessState | undefined {
  const stderrLines = stripVTControlCharacters(stderr).split(/\r?\n/);
  const lines = [...stderrLines, ...stripVTControlCharacters(stdout).split(/\r?\n/)];
  for (const [index, line] of lines.entries()) {
    let message = line.trim();
    try {
      const event = JSON.parse(line);
      if (event.type === "error") message = typeof event.message === "string" ? event.message : event.error?.message ?? "";
      else if (event.type === "turn.failed") message = event.error?.message ?? "";
      else continue;
    } catch {
      // Only status/nonce checks can distinguish plain stdout from worker prose.
      if (index >= stderrLines.length && !allowPlainStdout) continue;
    }
    message = stripVTControlCharacters(message).trim();
    if (/^(?:Error:\s*)?(?:This |The |Your )?API key (?:has expired|is expired)\b/i.test(message)) return "credentials-expired";
    if (/^(?:(?:API )?Error:\s*)?(?:Failed to authenticate\b|OAuth session expired\b|Authentication failed\b|Not logged in\b|Unauthorized\b|401\b|Re-authentication required\b|No access token found\b|Token refresh failed\b|Failed to refresh (?:OAuth|token)\b|Your authentication token .*expired\b)/i.test(message)) return "login-required";
    if (/^(?:Error:\s*)?(?:You've hit your usage limit\b|quota (?:exceeded|exhausted)\b|insufficient (?:credits|balance)\b|rate limit exceeded\b|Add credits to continue\b)/i.test(message)) return "quota-exhausted";
    if (/^(?:Error:\s*)?(?:model .* (?:not found|not available|not supported)|unknown model\b|ModelNotFoundError\b)/i.test(message)) return "model-unavailable";
    if (/^(?:Error:\s*)?(?:No (?:API key|provider|credentials)\b|Missing .*API.?KEY\b|unrecognized arguments\b|unknown (?:option|command)\b)/i.test(message)) return "setup-required";
  }
  return undefined;
}

function recipe(id: string): { auth?: string[]; login: string[]; update?: string[] } {
  switch (id) {
    case "codex": return { auth: ["login", "status"], login: ["login"] };
    case "claude-code": return { auth: ["auth", "status", "--json"], login: ["auth", "login"], update: ["update"] };
    case "opencode": return { auth: ["auth", "list"], login: ["auth", "login"], update: ["upgrade"] };
    case "kilo": return { auth: ["auth", "list"], login: ["auth", "login"], update: ["upgrade"] };
    case "hermes-agent": return { auth: ["auth", "list"], login: ["model"], update: ["update", "--yes"] };
    case "kiro": return { auth: ["whoami", "--format", "json"], login: ["login"], update: ["update", "--non-interactive"] };
    case "antigravity": return { login: [], update: ["update"] };
    default: return { login: [] };
  }
}

/** Preserve the installed distribution and channel. Never force an upgrade. */
export function harnessUpgradeCommand(h: HarnessDiscovery): string[] | undefined {
  if (!h.commandPath) return undefined;
  let actual: string;
  try { actual = realpathSync(h.commandPath); } catch { return undefined; }
  const brew = Bun.which("brew");
  const cask = /\/Caskroom\/([^/]+)\//.exec(actual)?.[1];
  const formula = /\/Cellar\/([^/]+)\//.exec(actual)?.[1];
  const distribution = cask ?? formula;
  const distributions: Record<string, string[]> = { codex: ["codex"], "claude-code": ["claude-code", "claude-code@latest"], opencode: ["opencode"], kilo: ["kilo"], kiro: ["kiro-cli"], "hermes-agent": ["hermes", "hermes-agent"], antigravity: ["antigravity", "antigravity-cli"], cline: ["cline"] };
  if (distribution) return brew && distributions[h.id]?.includes(distribution) ? [brew, "upgrade", ...(cask ? ["--cask", "--greedy", "--no-quit"] : []), distribution] : undefined;
  if (h.id === "codex") {
    const npm = Bun.which("npm");
    return npm && /\/node_modules\/@openai\/codex\//.test(actual) ? [npm, "install", "-g", "@openai/codex@latest"] : undefined;
  }
  const args = recipe(h.id).update;
  return args ? [h.commandPath, ...args] : undefined;
}

const messages: Record<ReadinessState, string> = {
  unverified: "Model access is unverified; a small request is required before review.",
  ready: "The selected route returned a verified response.",
  "login-required": "Sign-in is required before review.",
  "credentials-expired": "The configured provider API key has expired. Replace the key in the native CLI/provider settings; signing in again will not renew it.",
  "setup-required": "Install or repair the native CLI/provider configuration before review.",
  "model-unavailable": "The selected model is unavailable on this route.",
  "quota-exhausted": "Provider quota or credits are exhausted; sign-in will not resolve it.",
  unreachable: "The readiness check did not complete; inspect connectivity or native setup before retrying.",
  updating: "An upgrade is in progress. Recheck after it completes.",
};

/** Core owns readiness, failure memory and maintenance; native CLIs own credentials. */
export class HarnessReadinessManager {
  private readonly cache = new Map<string, { at: number; value: HarnessReadiness }>();
  private readonly flights = new Map<string, Promise<HarnessReadiness>>();
  private readonly updates = new Map<string, NonNullable<HarnessReadiness["upgrade"]>>();
  private readonly busyHarnesses = new Set<string>();
  private readonly upgradeFlights = new Map<string, Promise<void>>();
  private readonly abort = new AbortController();
  private closing = false;
  private readonly runner: MaintenanceCommandRunner;
  private readonly now: () => number;
  private readonly stateDir: string;
  readonly autoUpgrade: boolean;
  get stateDirectory(): string { return this.stateDir; }
  constructor(private readonly options: HarnessReadinessOptions = {}) {
    this.runner = options.runCommand ?? ((spec, timeout) => runMaintenanceCommand(spec, timeout, this.abort.signal));
    this.now = options.now ?? Date.now;
    this.stateDir = options.stateDir ?? join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "ennodia", "harnesses");
    this.autoUpgrade = options.autoUpgrade ?? process.env.ENNODIA_AUTO_UPDATE !== "false";
  }
  private key(h: HarnessDiscovery, model?: string, cwd?: string): string {
    // Environment values may be secret: hash them, never expose or persist them.
    const environment = createHash("sha256").update(JSON.stringify(process.env)).digest("hex");
    return JSON.stringify([h.id, h.commandPath, h.version, model, resolve(cwd ?? process.cwd()), environment]);
  }
  private value(h: HarnessDiscovery, state: ReadinessState, model?: string): HarnessReadiness {
    const r = recipe(h.id);
    const result: HarnessReadiness = { state, checkedAt: new Date(this.now()).toISOString(), model, message: messages[state], upgrade: this.updates.get(h.id) };
    if (state !== "ready") result.recovery = {
      command: h.commandPath ? [h.commandPath, ...(state === "login-required" || state === "credentials-expired" || state === "unverified" ? r.login : ["--help"])] : [],
      instruction: !h.commandPath ? "Install the supported native CLI, then recheck."
        : state === "unverified" ? "Run the targeted recheck to verify model access. Sign in only when a login blocker is reported."
        : state === "login-required" ? "Run the native command in an interactive terminal using the intended account/provider, then recheck."
        : state === "credentials-expired" ? "Replace the expired API key through the native credential flow for the intended provider, then recheck the same route. Signing in again will not renew the key."
        : state === "quota-exhausted" ? "Restore credits or quota through the intended provider, then recheck the same route. Do not repeat sign-in or switch to a different model silently."
        : "Inspect the reported blocker through the native CLI; then recheck the same route. Do not change account, provider or model silently.",
      recheck: { tool: "ennodia_check_harnesses", harnessIds: [h.id], ...(model ? { model } : {}), verify: true },
    };
    return result;
  }
  describe(h: HarnessDiscovery, state: ReadinessState, model?: string): HarnessReadiness { return this.value(h, state, model); }
  invalidate(id: string): void {
    for (const [key] of this.cache) if (JSON.parse(key)[0] === id) this.cache.delete(key);
  }
  private installationState(h: HarnessDiscovery): { stamp: string; lock: string } {
    const identity = createHash("sha256").update(h.commandPath ?? h.id).digest("hex").slice(0, 20);
    return { stamp: join(this.stateDir, `${identity}.json`), lock: join(this.stateDir, `${identity}.lock`) };
  }
  private clearDeadLease(lock: string): void {
    if (!existsSync(lock)) return;
    let owner: number;
    try { owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")).pid; }
    catch {
      // A process can die between mkdir and recording its ownership.
      try { if (this.now() - lstatSync(lock).mtimeMs > 120_000) rmSync(lock, { recursive: true, force: true }); } catch { /* raced with release */ }
      return;
    }
    if (!Number.isInteger(owner) || owner < 1) return;
    try { process.kill(owner, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") rmSync(lock, { recursive: true, force: true }); }
  }
  async check(h: HarnessDiscovery, adapter?: HarnessAdapter, input: HarnessCheckInput = {}): Promise<HarnessReadiness> {
    if (this.closing) throw new Error("Harness maintenance is shutting down.");
    const { lock } = this.installationState(h);
    this.clearDeadLease(lock);
    if (this.busyHarnesses.has(h.id) || existsSync(lock)) return this.value(h, "updating", input.model);
    const key = this.key(h, input.model, input.cwd);
    const existing = this.cache.get(key);
    if (!input.refresh && existing && (!input.verify || existing.value.state !== "unverified") && this.now() - existing.at < (existing.value.state === "ready" ? 300_000 : 30_000)) return existing.value;
    const flightKey = `${key}:${Boolean(input.verify)}`;
    const flight = this.flights.get(flightKey);
    if (flight) return flight;
    const pending = this.performCheck(h, adapter, input).catch(() => this.value(h, "unreachable", input.model)).then(value => {
      this.cache.set(key, { at: this.now(), value });
      return value;
    }).finally(() => this.flights.delete(flightKey));
    this.flights.set(flightKey, pending);
    return pending;
  }
  private async performCheck(h: HarnessDiscovery, adapter: HarnessAdapter | undefined, input: HarnessCheckInput): Promise<HarnessReadiness> {
    if (!h.runnable || !h.commandPath || !adapter?.buildCommand) return this.value(h, "setup-required", input.model);
    const { lock } = this.installationState(h);
    this.clearDeadLease(lock);
    if (this.busyHarnesses.has(h.id) || existsSync(lock)) return this.value(h, "updating", input.model);
    const auth = recipe(h.id).auth;
    if (auth) {
      const result = await this.runner({ command: h.commandPath, args: auth }, 5_000);
      const state = nativeReadinessFailure(result.stdout, result.stderr, true);
      if (state) return this.value(h, state, input.model);
      if (h.id === "claude-code") {
        try { if (JSON.parse(result.stdout).loggedIn === false) return this.value(h, "login-required", input.model); } catch { /* verification below */ }
      }
      if (result.timedOut) return this.value(h, "unreachable", input.model);
      if (result.exitCode !== 0) return this.value(h, ["codex", "claude-code", "kiro"].includes(h.id) ? "login-required" : "setup-required", input.model);
    }
    if (!input.verify) return this.value(h, "unverified", input.model);
    const dir = mkdtempSync(join(tmpdir(), "ennodia-readiness-"));
    const nonce = `ENNODIA_READY_${randomUUID().replaceAll("-", "")}`;
    try {
      const spec = adapter.buildCommand(h.commandPath, { prompt: `Reply with exactly ${nonce}. Do not use tools, read files, or perform any other work.`, cwd: dir, model: input.model, timeoutMs: 20_000, finalMessagePath: join(dir, "answer.txt"), nativeSandbox: adapter.supportsNativeSandbox ? "read-only" : undefined });
      const result = await this.runner(spec, 25_000);
      const failure = nativeReadinessFailure(result.stdout, result.stderr, true);
      if (failure) return this.value(h, failure, input.model);
      if (result.timedOut || result.exitCode !== 0 || adapter.failureReason?.(result.stdout, result.stderr)) return this.value(h, "unreachable", input.model);
      let answer = adapter.readinessAnswer ? adapter.readinessAnswer(result.stdout) ?? "" : result.stdout;
      try { answer = readFileSync(join(dir, "answer.txt"), "utf8"); } catch { /* native text output */ }
      // An echoed prompt is not success. Require a standalone returned nonce.
      if (!stripVTControlCharacters(answer).split(/\r?\n/).some(line => line.trim() === nonce)) return this.value(h, "setup-required", input.model);
      return this.value(h, "ready", input.model);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  observe(h: HarnessDiscovery, input: Pick<HarnessRunInput, "model" | "cwd">, result: { status: string; stdout: string; stderr: string; timedOut: boolean; hasOutput?: boolean }): void {
    if (this.closing) return;
    if (result.status === "cancelled" || result.timedOut) return;
    const failure = result.status === "failed" ? nativeReadinessFailure(result.stdout, result.stderr) : undefined;
    if (failure) this.invalidate(h.id);
    if (failure || (result.status === "succeeded" && result.hasOutput)) {
      this.cache.set(this.key(h, input.model, input.cwd), { at: this.now(), value: this.value(h, failure ?? "ready", input.model) });
    }
  }
  /** Upgrade at most daily across server restarts; use an exclusive per-install lease. */
  async upgrade(h: HarnessDiscovery, force = false): Promise<void> {
    if (this.closing) throw new Error("Harness maintenance is shutting down.");
    const existing = this.upgradeFlights.get(h.id);
    if (existing) return existing;
    const pending = this.performUpgrade(h, force).finally(() => this.upgradeFlights.delete(h.id));
    this.upgradeFlights.set(h.id, pending);
    return pending;
  }
  private async performUpgrade(h: HarnessDiscovery, force: boolean): Promise<void> {
    const command = harnessUpgradeCommand(h);
    const checkedAt = new Date(this.now()).toISOString();
    const save = (status: NonNullable<HarnessReadiness["upgrade"]>["status"], message: string) => {
      this.updates.set(h.id, { status, checkedAt, command, message }); this.invalidate(h.id);
    };
    if (!command) { save("unsupported", "No supported updater was found for this installation. Use its original installer."); return; }
    if (this.options.isBusy?.() || this.flights.size > 0) { save("deferred", "Upgrade deferred while Ennodia work is active."); return; }
    const { stamp, lock } = this.installationState(h);
    try {
      mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
      if (!force) {
        try {
          const previous = JSON.parse(readFileSync(stamp, "utf8"));
          if (this.now() - previous.at < 86_400_000) {
            if (previous.result) this.updates.set(h.id, previous.result);
            return;
          }
        } catch { /* first check */ }
      }
      this.clearDeadLease(lock);
      try { mkdirSync(lock); writeFileSync(join(lock, "owner.json"), JSON.stringify({ pid: process.pid }), { mode: 0o600 }); } catch {
        save("deferred", "Another maintenance process holds the installation lock. Recheck later."); return;
      }
    } catch { save("failed", "Maintenance state could not be written; no upgrade was attempted."); return; }
    this.busyHarnesses.add(h.id);
    try {
      writeFileSync(stamp, JSON.stringify({ at: this.now() }), { mode: 0o600 });
      const result = await this.runner({ command: command[0]!, args: command.slice(1) }, 120_000);
      save(result.exitCode === 0 && !result.timedOut ? "succeeded" : "failed", result.exitCode === 0 && !result.timedOut ? "Native updater completed; version and readiness must be rechecked." : "Native updater did not complete successfully. Run the displayed update command interactively; no force flags were used.");
      writeFileSync(stamp, JSON.stringify({ at: this.now(), result: this.updates.get(h.id) }), { mode: 0o600 });
    } catch { save("failed", "Native updater failed to start. Run the displayed command interactively."); }
    finally { this.busyHarnesses.delete(h.id); rmSync(lock, { recursive: true, force: true }); }
  }
  async shutdown(): Promise<void> {
    this.closing = true;
    this.abort.abort();
    await Promise.allSettled([...this.flights.values(), ...this.upgradeFlights.values()]);
  }
}

export async function runMaintenanceCommand(spec: CommandSpec, timeoutMs: number, signal?: AbortSignal): Promise<CommandResult> {
  if (signal?.aborted) throw new Error("Harness maintenance was cancelled.");
  const child = Bun.spawn([spec.command, ...spec.args], { cwd: spec.cwd, env: { ...process.env, ...spec.env }, stdin: spec.stdin ? "pipe" : "ignore", stdout: "pipe", stderr: "pipe", detached: process.platform !== "win32" });
  if (spec.stdin && child.stdin) { child.stdin.write(spec.stdin); child.stdin.end(); }
  let timedOut = false;
  const readers = [child.stdout.getReader(), child.stderr.getReader()];
  const chunks = ["", ""];
  const kill = () => {
    signalOwnedProcess(child, "SIGKILL", process.platform !== "win32");
    for (const reader of readers) void reader.cancel().catch(() => {});
  };
  const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
  signal?.addEventListener("abort", kill, { once: true });
  try {
    await Promise.all(readers.map(async (reader, index) => {
      const decoder = new TextDecoder();
      try { for (;;) { const { done, value } = await reader.read(); if (done) break; chunks[index] = (chunks[index] + decoder.decode(value, { stream: true })).slice(-32_000); } } finally { reader.releaseLock(); }
    }));
    return { exitCode: await child.exited, stdout: chunks[0]!, stderr: chunks[1]!, timedOut };
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", kill); signalOwnedProcess(child, "SIGKILL", process.platform !== "win32"); }
}
