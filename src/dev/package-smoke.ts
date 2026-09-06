import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { ENNODIA_VERSION } from "../version";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
  const packResult = parsePackResult(pack.stdout, "ennodia");

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

  const ioPack = await runCapture(
    ["npm", "pack", "--json", "--pack-destination", tempDir],
    { cwd: join(import.meta.dir, "../../packages/ennodia-io") },
  );
  const ioPackResult = parsePackResult(
    ioPack.stdout,
    "@cherninlab/ennodia-io",
  );
  if (ioPackResult.version !== ENNODIA_VERSION) {
    throw new Error(
      `Packed IO version ${ioPackResult.version} did not match ${ENNODIA_VERSION}.`,
    );
  }
  assertIoPackedFiles(ioPackResult.files.map((file) => file.path));

  const ioTarball = join(tempDir, basename(ioPackResult.filename));
  const consumerDir = join(tempDir, "consumer");
  await mkdir(consumerDir);
  await runCapture(["npm", "init", "--yes"], { cwd: consumerDir });
  const installArgs = ["--ignore-scripts", "--no-audit", "--no-fund"];
  await runCapture(["npm", "install", ...installArgs, tarball], {
    cwd: consumerDir,
  });
  await runCapture(["npm", "install", ...installArgs, ioTarball], {
    cwd: consumerDir,
  });
  await runCapture([
    "bun",
    "--eval",
    'const io = await import("@cherninlab/ennodia-io"); if (typeof io.startEnnodiaIoServer !== "function") process.exit(1);',
  ], { cwd: consumerDir });

  console.log(
    JSON.stringify(
      {
        package: packResult.name,
        version: packResult.version,
        tarball: basename(tarball),
        smoke: ["bunx", "npm exec", "npx"],
        ioPackage: ioPackResult.name,
        ioTarball: basename(ioTarball),
        ioSmoke: "fresh tarball install and import",
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function assertIoPackedFiles(paths: string[]): void {
  const expected = [
    "package.json",
    "README.md",
    "bin/ennodia-io",
    "src/cli.ts",
    "src/index.ts",
    "src/internal.ts",
    "src/io.ts",
  ];

  for (const path of expected) {
    if (!paths.includes(path)) {
      throw new Error(`Packed Ennodia IO tarball is missing ${path}.`);
    }
  }

  const forbidden = paths.filter((path) =>
    path.includes("/dev/") || path.endsWith(".test.ts")
  );
  if (forbidden.length > 0) {
    throw new Error(
      `Packed Ennodia IO tarball contains forbidden files: ${forbidden.join(", ")}`,
    );
  }
}

function parsePackResult(stdout: string, expectedName: string): PackResult {
  const parsed: unknown = JSON.parse(stdout);
  const candidate = Array.isArray(parsed)
    ? parsed[0]
    : isRecord(parsed)
      ? parsed[expectedName]
      : undefined;

  if (
    !isRecord(candidate) ||
    candidate.name !== expectedName ||
    typeof candidate.version !== "string" ||
    typeof candidate.filename !== "string" ||
    !Array.isArray(candidate.files) ||
    !candidate.files.every(
      (file) => isRecord(file) && typeof file.path === "string",
    )
  ) {
    throw new Error(
      `npm pack did not return valid package metadata for ${expectedName}.`,
    );
  }

  return candidate as PackResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertPackedFiles(paths: string[]): void {
  const expected = [
    "package.json",
    "README.md",
    "LICENSE",
    "CONTRIBUTING.md",
    "bin/ennodia",
    "src/advisor.ts",
    "src/budget.ts",
    "src/cli.ts",
    "src/compare.ts",
    "src/compositional.ts",
    "src/core.ts",
    "src/diagnosis.ts",
    "src/harnesses.ts",
    "src/history.ts",
    "src/index.ts",
    "src/internal.ts",
    "src/planner.ts",
    "src/process.ts",
    "src/plan-advice.ts",
    "src/priority.ts",
    "src/runs.ts",
    "src/server.ts",
    "src/skills.ts",
    "src/tasks.ts",
    "src/version.ts",
    "skills/benchmark-critic/SKILL.md",
    "skills/compositional-audit/SKILL.md",
    "skills/release-readiness/SKILL.md",
    "skills/rigorous-review/SKILL.md",
    "skills/source-grounded-audit/SKILL.md",
    "examples/docs-drift/check.ts",
    "examples/skill-trial/check.ts",
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
    /^src\/io\.ts$/,
    /\.test\.ts$/,
    /^packages\//,
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
  const client = new Client({ name: "ennodia-package-smoke", version: "0" });
  const transport = new StdioClientTransport({
    command: command[0], args: command.slice(1), stderr: "pipe",
  });
  try {
    // Keep the connection open until initialization completes. EOF now means
    // the client disconnected and correctly shuts down the server's work.
    await client.connect(transport, { timeout: HANDSHAKE_TIMEOUT_MS });
    const version = client.getServerVersion()?.version;
    if (version !== ENNODIA_VERSION) {
      throw new Error(
        `${label} reported version ${version ?? "<missing>"} instead of ${ENNODIA_VERSION}.`,
      );
    }
  } finally {
    await client.close();
  }
}

async function runCapture(
  command: string[],
  options: { cwd?: string; input?: string; timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd: command,
    ...(options.cwd ? { cwd: options.cwd } : {}),
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
