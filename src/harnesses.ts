import { existsSync } from "node:fs";
import { signalOwnedProcess } from "./process";
import { type Skill } from "./skills";

export type HarnessKind = "cli" | "app";

export type HarnessRunInput = {
  prompt: string;
  cwd?: string;
  model?: string;
  timeoutMs?: number;
  skills?: Skill[];
  /** Run the task against an ephemeral isolated copy of cwd instead of cwd
   * itself, so concurrent tasks sharing a cwd cannot clobber each other's
   * file writes. TaskManager refuses symbolic links in the copied tree and
   * deletes the copy when the task becomes terminal. */
  isolateCwd?: boolean;
  /** Scratch file path an adapter can write its clean final message to,
   * separate from the harness's raw stdout (which may include a full
   * transcript). Populated by TaskManager; adapters opt in by referencing it. */
  finalMessagePath?: string;
};

export type HarnessUsage = {
  /** Best-effort, adapter-reported token count. Not guaranteed available or
   * billing-accurate; parsed from each CLI's own text output where possible. */
  tokensUsed?: number;
};

export type CommandSpec = {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
};

export type HarnessAdapter = {
  id: string;
  name: string;
  kind: HarnessKind;
  commandCandidates: string[];
  appPaths?: string[];
  versionArgs?: string[];
  capabilities: string[];
  notes?: string[];
  /** Input preparation guidance, not a guarantee of model or tool access. */
  inputGuidance?: string[];
  buildCommand?: (commandPath: string, input: HarnessRunInput) => CommandSpec;
  /** Best-effort usage extraction from a finished task's captured output. */
  extractUsage?: (stdout: string, stderr: string) => HarnessUsage | undefined;
  /** Some public CLIs report a semantic failure with exit code zero. */
  failureReason?: (stdout: string, stderr: string) => string | undefined;
};

export type HarnessDiscovery = {
  id: string;
  name: string;
  kind: HarnessKind;
  available: boolean;
  runnable: boolean;
  commandPath?: string;
  appPath?: string;
  version?: string;
  capabilities: string[];
  notes: string[];
  inputGuidance?: string[];
};

export type DiscoverHarnessesOptions = {
  refresh?: boolean;
  maxAgeMs?: number;
};

type CaptureResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

const DEFAULT_VERSION_TIMEOUT_MS = 2_500;
const DEFAULT_DISCOVERY_CACHE_MS = 30_000;

let cachedDiscovery:
  | { createdAtMs: number; harnesses: HarnessDiscovery[] }
  | undefined;
let inFlightDiscovery: Promise<HarnessDiscovery[]> | undefined;

export const MULTIMODAL_INPUT_GUIDANCE = [
  "Ennodia passes text prompts and local file paths, not media attachments. Native input depends on the selected harness, model, file tools, permissions, and format. Missing guidance means unverified access.",
  "When native listening or viewing is required, first load one small sample with native file tools. Report the file, inspected range, tool, and content-specific evidence, or the exact blocking error. A transcript, DSP score, or extracted frame is not equivalent evidence.",
  "For media comparisons, use matching excerpts and an original reference. Separate cleanup quality from voice or image fidelity. Report conversions and limitations; a successful process exit does not establish successful media inspection.",
];

export function hasMultimodalInput(prompt: string): boolean {
  return /\b(audio|video|image|multimodal|listen|listening|sound|speech|voice|recordings?|footage)\b|\.(mp3|wav|flac|m4a|aac|opus|ogg|ogv|mp4|mov|webm|png|jpe?g|webp)\b/i.test(prompt);
}

/** Keep preparation instructions out of unrelated work and internal text judges. */
export function withInputGuidance(
  prompt: string,
  adapter?: Pick<HarnessAdapter, "inputGuidance">,
): string {
  if (!hasMultimodalInput(prompt) || /^ENNODIA_(?:COMPARE|PLAN_ADVISOR)/.test(prompt)) {
    return prompt;
  }
  return `${prompt}\n\nEnnodia media input guidance (applies when native media inspection is required):\n${
    (adapter?.inputGuidance ?? MULTIMODAL_INPUT_GUIDANCE).map((note) => `- ${note}`).join("\n")
  }`;
}

export const harnessAdapters: HarnessAdapter[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    kind: "cli",
    commandCandidates: ["claude"],
    versionArgs: ["--version"],
    capabilities: ["reasoning", "code", "agents", "mcp", "non-interactive-cli"],
    notes: ["Runs through the supported Claude Code CLI surface."],
    buildCommand: (commandPath, input) => {
      const args = [
        "-p",
        "--output-format",
        "text",
        "--no-session-persistence",
      ];

      if (input.model) {
        args.push("--model", input.model);
      }

      args.push("--", input.prompt);
      return { command: commandPath, args, cwd: input.cwd };
    },
  },
  {
    id: "codex",
    name: "Codex CLI",
    kind: "cli",
    commandCandidates: ["codex"],
    versionArgs: ["--version"],
    capabilities: ["reasoning", "code", "agents", "mcp", "non-interactive-cli"],
    notes: ["Defaults to read-only sandboxing for Ennodia-launched tasks."],
    buildCommand: (commandPath, input) => {
      const args = [
        "exec",
        "--color",
        "never",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "--ephemeral",
      ];

      if (input.cwd) {
        args.push("-C", input.cwd);
      }

      if (input.model) {
        args.push("--model", input.model);
      }

      if (input.finalMessagePath) {
        args.push("-o", input.finalMessagePath);
      }

      args.push("--", input.prompt);
      return { command: commandPath, args, cwd: input.cwd };
    },
    extractUsage: (stdout) => {
      const match = /tokens used\s*\n\s*([\d,]+)/i.exec(stdout);
      if (!match) {
        return undefined;
      }

      const tokensUsed = Number(match[1].replace(/,/g, ""));
      return Number.isFinite(tokensUsed) ? { tokensUsed } : undefined;
    },
  },
  {
    id: "opencode",
    name: "OpenCode",
    kind: "cli",
    commandCandidates: ["opencode"],
    versionArgs: ["--version"],
    capabilities: ["reasoning", "code", "agents", "non-interactive-cli"],
    notes: ["Runs through `opencode run` without permission-bypass flags."],
    buildCommand: (commandPath, input) => {
      const args = ["run"];

      if (input.cwd) {
        args.push("--dir", input.cwd);
      }

      if (input.model) {
        args.push("--model", input.model);
      }

      args.push("--", input.prompt);
      return { command: commandPath, args, cwd: input.cwd };
    },
  },
  {
    id: "kilo",
    name: "Kilo Code",
    kind: "cli",
    commandCandidates: [
      "kilo",
      "kilocode",
      "kilocode-cli",
      "kilo-code",
      "kilo-code-cli",
    ],
    versionArgs: ["--version"],
    capabilities: ["reasoning", "code", "agents", "non-interactive-cli"],
    notes: [
      "Runs through `kilo run` without auto-approval or permission-bypass flags.",
      "Detects Kilo Code command-name variants when they are available on PATH.",
    ],
    buildCommand: (commandPath, input) => {
      const args = ["run"];

      if (input.cwd) {
        args.push("--dir", input.cwd);
      }

      if (input.model) {
        args.push("--model", input.model);
      }

      args.push("--", input.prompt);
      return { command: commandPath, args, cwd: input.cwd };
    },
  },
  {
    id: "hermes-agent",
    name: "Hermes Agent",
    kind: "cli",
    commandCandidates: ["hermes-agent", "hermes"],
    versionArgs: ["--version"],
    capabilities: ["reasoning", "code", "agents", "non-interactive-cli"],
    notes: [
      "Runs through `hermes chat --query --quiet` without `--yolo`.",
    ],
    buildCommand: (commandPath, input) => {
      const args = [
        "chat",
        "--query",
        input.prompt,
        "--quiet",
        "--source",
        "ennodia",
      ];

      if (input.model) {
        args.push("--model", input.model);
      }

      return { command: commandPath, args, cwd: input.cwd };
    },
  },
  {
    id: "kiro",
    name: "Kiro CLI",
    kind: "cli",
    commandCandidates: ["kiro-cli", "kiro"],
    versionArgs: ["--version"],
    appPaths: ["/Applications/Kiro CLI.app"],
    capabilities: ["reasoning", "code", "agents", "non-interactive-cli"],
    notes: [
      "Runs through `kiro-cli chat --no-interactive` without trusting tools by default.",
    ],
    buildCommand: (commandPath, input) => {
      const args = [
        "chat",
        "--no-interactive",
        "--trust-tools=",
        "--wrap",
        "never",
      ];

      if (input.model) {
        args.push("--model", input.model);
      }

      args.push("--", input.prompt);
      return { command: commandPath, args, cwd: input.cwd };
    },
  },
  {
    id: "cline",
    name: "Cline CLI",
    kind: "cli",
    commandCandidates: ["cline", "cline-cli"],
    versionArgs: ["--version"],
    capabilities: ["reasoning", "code", "agents", "non-interactive-cli"],
    notes: [
      "Runs through `cline` with auto-approval explicitly disabled.",
    ],
    buildCommand: (commandPath, input) => {
      const args = ["--auto-approve", "false", "--json"];

      if (input.cwd) {
        args.push("--cwd", input.cwd);
      }

      if (input.model) {
        args.push("--model", input.model);
      }

      args.push("--", input.prompt);
      return { command: commandPath, args, cwd: input.cwd };
    },
  },
  {
    id: "antigravity",
    name: "Antigravity",
    kind: "cli",
    commandCandidates: ["agy"],
    versionArgs: ["--version"],
    appPaths: [
      "/Applications/Antigravity.app",
      "/Applications/Antigravity IDE.app",
    ],
    capabilities: ["ide", "browser-automation", "agents", "non-interactive-cli"],
    inputGuidance: [
      ...MULTIMODAL_INPUT_GUIDANCE,
      "Antigravity headless input is text-only, including stream-json content blocks. Put local paths in the prompt and use the worker's native view_file tool when available; do not send Gemini API attachment blocks to agy. https://antigravity.google/docs/cli/headless/",
      "Observed 2026-09-10 with agy 1.2.0 and gemini-3.8-flash-medium: an eight-second MP3 loaded through view_file and returned spoken words absent from the prompt. Start with a short MP3 probe for this route, then compare matched samples after confirming native access.",
      "In that same case, FLAC was rejected as unsupported MIME audio/x-flac; four WAV samples timed out without output. These are scoped observations, not a universal FLAC/WAV support rule. CLI release notes list broader audio support: https://antigravity.google/changelog",
      "Use native file tools first. Headless command permission denials cannot be approved interactively; report the blocked operation and keep normal permission settings. Do not keep guessing formats or repeat an unchanged failed request.",
    ],
    notes: [
      "Runs through the supported `agy` CLI surface.",
      "Defaults to Antigravity sandbox mode for Ennodia-launched tasks.",
      "Passes the prompt as the value of Antigravity's non-interactive `--print` option.",
    ],
    failureReason: (stdout, stderr) => !stdout.trim() &&
      /^jetski: no output produced\b/m.test(stderr)
      ? "Antigravity returned no answer. Check the required tool access in its normal permission settings."
      : undefined,
    buildCommand: (commandPath, input) => {
      const args = [
        "--sandbox",
        "--print",
        input.prompt,
        "--print-timeout",
        toGoDuration(input.timeoutMs),
      ];

      if (input.cwd) {
        args.push("--add-dir", input.cwd);
      }

      if (input.model) {
        args.push("--model", input.model);
      }

      return { command: commandPath, args, cwd: input.cwd };
    },
  },
];

export async function discoverHarnesses(
  options: DiscoverHarnessesOptions = {},
): Promise<HarnessDiscovery[]> {
  const now = Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_DISCOVERY_CACHE_MS;

  if (
    !options.refresh &&
    cachedDiscovery &&
    now - cachedDiscovery.createdAtMs <= maxAgeMs
  ) {
    return cachedDiscovery.harnesses;
  }

  if (!options.refresh && inFlightDiscovery) {
    return inFlightDiscovery;
  }

  inFlightDiscovery = Promise.all(harnessAdapters.map(discoverHarness)).then(
    (harnesses) => {
      cachedDiscovery = { createdAtMs: Date.now(), harnesses };
      return harnesses;
    },
  );

  try {
    return await inFlightDiscovery;
  } finally {
    inFlightDiscovery = undefined;
  }
}

export function findHarnessAdapter(id: string): HarnessAdapter | undefined {
  return harnessAdapters.find((adapter) => adapter.id === id);
}

async function discoverHarness(
  adapter: HarnessAdapter,
): Promise<HarnessDiscovery> {
  const commandPath = adapter.commandCandidates
    .map((candidate) => Bun.which(candidate))
    .find((match): match is string => Boolean(match));

  const appPath = adapter.appPaths?.find((path) => existsSync(path));
  let version: string | undefined;
  const notes = [...(adapter.notes ?? [])];
  if (commandPath) {
    try {
      version = await readVersion(commandPath, adapter);
    } catch (error) {
      notes.push(`Version check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const available = Boolean(commandPath || appPath);
  const runnable = Boolean(commandPath && adapter.buildCommand);

  return {
    id: adapter.id,
    name: adapter.name,
    kind: adapter.kind,
    available,
    runnable,
    commandPath,
    appPath,
    version,
    capabilities: adapter.capabilities,
    notes,
    ...(adapter.inputGuidance ? { inputGuidance: [...adapter.inputGuidance] } : {}),
  };
}

async function readVersion(
  commandPath: string,
  adapter: HarnessAdapter,
): Promise<string | undefined> {
  if (!adapter.versionArgs) {
    return undefined;
  }

  const result = await capture(commandPath, adapter.versionArgs, {
    timeoutMs: DEFAULT_VERSION_TIMEOUT_MS,
  });
  if (result.timedOut) throw new Error("Version probe timed out.");
  if (result.exitCode !== 0) throw new Error(`Version probe exited with code ${result.exitCode}.`);

  const text = `${result.stdout}\n${result.stderr}`.trim();
  return text.split(/\r?\n/).find((line) => line.trim())?.trim();
}

async function capture(
  command: string,
  args: string[],
  options: { timeoutMs: number },
): Promise<CaptureResult> {
  const child = Bun.spawn({
    cmd: [command, ...args],
    stdout: "pipe",
    stderr: "pipe",
    detached: process.platform !== "win32",
  });

  let timedOut = false;
  let timeout: Timer | undefined;
  const readers = [child.stdout.getReader(), child.stderr.getReader()];
  const output = ["", ""];
  const drained = Promise.all(readers.map(async (reader, index) => {
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        output[index] = (output[index] + decoder.decode(value, { stream: true })).slice(0, 8_000);
      }
      output[index] += decoder.decode();
    } catch { /* cancellation closes a stalled pipe */ }
    finally { reader.releaseLock(); }
  }));

  try {
    const exitCode = await Promise.race([
      Promise.all([drained, child.exited]).then(([, code]) => code),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          timedOut = true;
          signalOwnedProcess(child, "SIGKILL");
          for (const reader of readers) void reader.cancel().catch(() => undefined);
          resolve(null);
        }, options.timeoutMs);
      }),
    ]);
    return { stdout: output[0], stderr: output[1], exitCode, timedOut };
  } finally {
    clearTimeout(timeout);
    if (!timedOut) signalOwnedProcess(child, "SIGKILL");
  }
}

function toGoDuration(timeoutMs = 5 * 60 * 1000): string {
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return `${seconds}s`;
}
