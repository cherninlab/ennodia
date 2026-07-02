import { mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { ENNODIA_VERSION } from "../version";

const HANDSHAKE_TIMEOUT_MS = 10_000;

type PackResult = {
  filename: string;
  files: { path: string }[];
  name: string;
  version: string;
};

const tempDir = await mkdtemp(join(tmpdir(), "ennodia-package-smoke-"));

try {
  const pack = await runCapture([
    "npm",
    "pack",
    "--json",
    "--pack-destination",
    tempDir,
  ]);
  const [packResult] = JSON.parse(pack.stdout) as PackResult[];

  if (!packResult) {
    throw new Error("npm pack did not return package metadata.");
  }

  if (packResult.version !== ENNODIA_VERSION) {
    throw new Error(
      `Packed version ${packResult.version} did not match ${ENNODIA_VERSION}.`,
    );
  }

  assertPackedFiles(packResult.files.map((file) => file.path));

  const tarball = join(tempDir, basename(packResult.filename));
  await assertMcpHandshake("bunx", ["bunx", "--package", tarball, "ennodia"]);
  await assertMcpHandshake("npm exec", [
    "npm",
    "exec",
    "--yes",
    "--package",
    tarball,
    "--",
    "ennodia",
  ]);
  await assertMcpHandshake("npx", [
    "npx",
    "--yes",
    "--package",
    tarball,
    "ennodia",
  ]);

  console.log(
    JSON.stringify(
      {
        package: packResult.name,
        version: packResult.version,
        tarball: basename(tarball),
        smoke: ["bunx", "npm exec", "npx"],
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function assertPackedFiles(paths: string[]): void {
  const expected = [
    "package.json",
    "README.md",
    "LICENSE",
    "CONTRIBUTING.md",
    "bin/ennodia",
    "src/cli.ts",
    "src/index.ts",
    "src/server.ts",
    "src/skills.ts",
    "src/version.ts",
    "skills/benchmark-critic/SKILL.md",
    "skills/release-readiness/SKILL.md",
    "skills/rigorous-review/SKILL.md",
    "skills/source-grounded-audit/SKILL.md",
  ];

  for (const path of expected) {
    if (!paths.includes(path)) {
      throw new Error(`Packed tarball is missing ${path}.`);
    }
  }

  const forbiddenPatterns = [
    /^AGENTS\.md$/,
    /^CLAUDE\.md$/,
    /^src\/dev\//,
    /\.test\.ts$/,
    /^website\//,
    /^\.github\//,
    /^bun\.lock$/,
  ];

  const forbidden = paths.filter((path) =>
    forbiddenPatterns.some((pattern) => pattern.test(path)),
  );

  if (forbidden.length > 0) {
    throw new Error(`Packed tarball contains forbidden files: ${forbidden.join(", ")}`);
  }
}

async function assertMcpHandshake(label: string, command: string[]): Promise<void> {
  const input = `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "ennodia-package-smoke",
        version: "0",
      },
    },
  })}\n`;

  const result = await runCapture(command, { input, timeoutMs: HANDSHAKE_TIMEOUT_MS });
  const responseLine = result.stdout
    .split("\n")
    .find((line) => line.trim().startsWith("{"));

  if (!responseLine) {
    throw new Error(`${label} did not return a JSON-RPC response.`);
  }

  const response = JSON.parse(responseLine) as {
    result?: { serverInfo?: { version?: string } };
  };
  const version = response.result?.serverInfo?.version;

  if (version !== ENNODIA_VERSION) {
    throw new Error(
      `${label} reported version ${version ?? "<missing>"} instead of ${ENNODIA_VERSION}.`,
    );
  }
}

async function runCapture(
  command: string[],
  options: { input?: string; timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  const proc = Bun.spawn(command, {
    stdin: options.input ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeout = options.timeoutMs
    ? setTimeout(() => {
        proc.kill("SIGTERM");
      }, options.timeoutMs)
    : undefined;

  if (options.input && proc.stdin) {
    proc.stdin.write(options.input);
    proc.stdin.end();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (timeout) {
    clearTimeout(timeout);
  }

  if (exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} exited with ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }

  return { stdout, stderr };
}
