import { existsSync } from "node:fs";

export type HarnessKind = "cli" | "app";

export type HarnessRunInput = {
  prompt: string;
  cwd?: string;
  model?: string;
  timeoutMs?: number;
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
  buildCommand?: (commandPath: string, input: HarnessRunInput) => CommandSpec;
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

      args.push(input.prompt);
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

      args.push(input.prompt);
      return { command: commandPath, args, cwd: input.cwd };
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

      args.push(input.prompt);
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
    notes: [
      "Runs through the supported `agy` CLI surface.",
      "Defaults to Antigravity sandbox mode for Ennodia-launched tasks.",
      "Sends prompts through stdin because `agy --print` does not consume positional prompts.",
    ],
    buildCommand: (commandPath, input) => {
      const args = [
        "--sandbox",
        "--print",
        "--print-timeout",
        toGoDuration(input.timeoutMs),
      ];

      if (input.cwd) {
        args.push("--add-dir", input.cwd);
      }

      if (input.model) {
        args.push("--model", input.model);
      }

      return { command: commandPath, args, cwd: input.cwd, stdin: input.prompt };
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
  const version = commandPath ? await readVersion(commandPath, adapter) : undefined;
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
    notes: adapter.notes ?? [],
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

  const text = `${result.stdout}\n${result.stderr}`.trim();
  return text || undefined;
}

async function capture(
  command: string,
  args: string[],
  options: { timeoutMs: number },
): Promise<CaptureResult> {
  const process = Bun.spawn({
    cmd: [command, ...args],
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    process.kill();
  }, options.timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      streamToText(process.stdout),
      streamToText(process.stderr),
      process.exited,
    ]);

    return { stdout, stderr, exitCode, timedOut };
  } finally {
    clearTimeout(timeout);
  }
}

async function streamToText(
  stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
  if (!stream) {
    return "";
  }

  return await new Response(stream).text();
}

function toGoDuration(timeoutMs = 5 * 60 * 1000): string {
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return `${seconds}s`;
}
