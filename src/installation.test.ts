import { afterEach, describe, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inspectInstallation, MIN_BUN_VERSION } from "./installation";
import { ENNODIA_VERSION } from "./version";
import { createDefaultEnnodiaCore } from "./core";
import { createEnnodiaServer } from "./server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ennodia-install-test-")));
  temporary.push(dir);
  const home = join(dir, "home"); mkdirSync(home);
  return { dir, home };
}
function put(path: string, value = "") { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); }
function distribution(root: string) {
  put(join(root, "package.json"), JSON.stringify({ name: "ennodia", version: ENNODIA_VERSION }));
  for (const path of ["src/index.ts", "src/core.ts", "src/cli.ts", "src/readiness.ts", "src/installation.ts", "bin/ennodia", "skills/pragmatic/SKILL.md", "skills/compositional-audit/SKILL.md"]) put(join(root, path));
}

describe("Ennodia installation evidence", () => {
  it("uses the code location rather than the caller's workspace; resolves symlinks", () => {
    const { dir, home } = fixture(); const root = join(dir, "checkout"); distribution(root); put(join(root, ".git"), "gitdir: elsewhere");
    const alias = join(dir, "linked"); symlinkSync(root, alias);
    const report = inspectInstallation({ codeRoot: alias, cwd: home, home, env: {}, bunVersion: MIN_BUN_VERSION });
    expect(report).toMatchObject({ scope: "source-checkout", codeRoot: root, serverCwd: home, version: ENNODIA_VERSION });
    expect(report.checks.find(c => c.id === "runtime")?.status).toBe("pass");
    expect(report.checks.find(c => c.id === "runtime-files")?.status).toBe("pass");
  });

  it("identifies a project-local dependency", () => {
    const { dir, home } = fixture(); put(join(dir, "project/package.json"), "{}");
    const root = join(dir, "project/node_modules/ennodia"); distribution(root);
    expect(inspectInstallation({ codeRoot: root, home, env: {} }).scope).toBe("project-local");
  });

  it("requires a matching global launcher before inferring an npm global install", () => {
    const { dir, home } = fixture(); const root = join(dir, "prefix/lib/node_modules/ennodia"); distribution(root);
    expect(inspectInstallation({ codeRoot: root, home, env: {} }).scope).toBe("unknown");
    mkdirSync(join(dir, "prefix/bin")); symlinkSync(join(root, "bin/ennodia"), join(dir, "prefix/bin/ennodia"));
    expect(inspectInstallation({ codeRoot: root, home, env: {} }).scope).toBe("global");
  });

  it("identifies Bun global scope and both package caches", () => {
    const { dir, home } = fixture();
    for (const [root, scope] of [[join(home, ".bun/install/global/node_modules/ennodia"), "global"], [join(dir, "npm-cache/_npx/123/node_modules/ennodia"), "cache"], [join(home, ".bun/install/cache/ennodia@0.4.1"), "cache"], [join(dir, "bunx-501-ennodia@latest/node_modules/ennodia"), "cache"]] as const) {
      distribution(root!);
      const report = inspectInstallation({ codeRoot: root, home, env: { npm_config_cache: join(dir, "npm-cache") } });
      expect(report.scope).toBe(scope!);
      if (scope === "cache") expect(report.limitations.join(" ")).toContain("package cache");
    }
  });

  it("does not infer scope just because a node_modules directory exists", () => {
    const { dir, home } = fixture(); const root = join(dir, "node_modules/ennodia"); distribution(root);
    const report = inspectInstallation({ codeRoot: root, home, env: {} });
    expect(report.scope).toBe("unknown");
    expect(report.limitations.join(" ")).toContain("could not be established");
  });

  it("reports a broken or mismatched package and missing skills", () => {
    const { dir, home } = fixture(); const root = join(dir, "install"); distribution(root);
    put(join(root, "package.json"), JSON.stringify({ name: "ennodia", version: "0.0.0" }));
    rmSync(join(root, "src/readiness.ts")); rmSync(join(root, "skills/pragmatic/SKILL.md"));
    const report = inspectInstallation({ codeRoot: root, home, env: {} });
    expect(report.status).toBe("broken");
    expect(report.checks.find(c => c.id === "package-version")?.status).toBe("fail");
    expect(report.limitations.join(" ")).toContain("src/readiness.ts");
    expect(report.limitations.join(" ")).toContain("skills are incomplete");
  });

  it("does not require the npm launcher or development files from a JSR distribution", () => {
    const { dir, home } = fixture(); const root = join(dir, "jsr"); distribution(root);
    rmSync(join(root, "package.json")); rmSync(join(root, "bin"), { recursive: true });
    put(join(root, "jsr.json"), JSON.stringify({ name: "@cherninlab/ennodia", version: ENNODIA_VERSION }));
    const report = inspectInstallation({ codeRoot: root, home, env: {} });
    expect(report.checks.find(c => c.id === "runtime-files")?.status).toBe("pass");
    expect(report.checks.find(c => c.id === "package-version")?.status).toBe("pass");
  });

  it("reports unsupported Bun versions, including a prerelease of the minimum", () => {
    for (const bunVersion of [null, "1.3.13", "1.3.14-canary", "invalid"]) expect(inspectInstallation({ bunVersion }).checks.find(c => c.id === "runtime")?.status).toBe("fail");
    for (const bunVersion of ["1.3.14", "1.4.0-canary", "2.0.0"]) expect(inspectInstallation({ bunVersion }).checks.find(c => c.id === "runtime")?.status).toBe("pass");
    expect(JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8")).engines.bun).toBe(`>=${MIN_BUN_VERSION}`);
  });

  it("recognizes embedded code and reports missing compiled resources without requiring separate source files", () => {
    const report = inspectInstallation({ codeRoot: "/$bunfs", env: {}, bunVersion: MIN_BUN_VERSION });
    expect(report.distribution).toBe("compiled");
    expect(report.checks.find(c => c.id === "runtime-files")?.status).toBe("pass");
    expect(report.checks.find(c => c.id === "bundled-skills")?.status).toBe("warning");
    expect(report.status).toBe("limited");
  });

  it("checks storage without creating directories and excludes secret environment values", () => {
    const { dir, home } = fixture(); const obstacle = join(dir, "file"); put(obstacle);
    const report = inspectInstallation({ home, env: { ENNODIA_HISTORY: "0", ENNODIA_AUTO_UPDATE: "false", API_KEY: "SECRET_VALUE" }, temporaryDirectory: obstacle });
    expect(report.checks.find(c => c.id === "temporary-storage")?.status).toBe("fail");
    expect(report.storage.history.enabled).toBe(false);
    expect(report.storage.harnessUpdates.enabled).toBe(false);
    expect(JSON.stringify(report)).not.toContain("SECRET_VALUE");
    expect(() => readFileSync(join(home, ".ennodia/history/runs.jsonl"))).toThrow();
    const blocked = inspectInstallation({ home, history: { enabled: true, directory: join(obstacle, "history") }, upgradeStateDirectory: join(obstacle, "state") });
    expect(blocked.checks.find(c => c.id === "history-storage")?.status).toBe("warning");
    expect(blocked.checks.find(c => c.id === "maintenance-storage")?.status).toBe("warning");
    expect(inspectInstallation({ temporaryDirectory: join(dir, "missing-temp") }).checks.find(c => c.id === "temporary-storage")?.status).toBe("fail");
  });

  it("sends only installation problems at MCP initialization and the full report on recheck, without provider calls", async () => {
    const core = createDefaultEnnodiaCore({ discoverHarnesses: async () => [] });
    const server = createEnnodiaServer(core); const client = new Client({ name: "installation-test", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(st); await client.connect(ct);
      // This core runs without harness maintenance, which is a limitation.
      expect(client.getInstructions()).toContain("Installation notes, to mention only when they affect the request: Automatic harness upgrades are disabled.");
      expect(client.getInstructions()).not.toContain('"scope"');
      const reply = await client.callTool({ name: "ennodia_check_harnesses", arguments: {} });
      const text = reply.content as { type: "text"; text: string }[];
      expect(JSON.parse(text[0]!.text)).toMatchObject({ harnesses: [], actionRequired: [], installation: { scope: "source-checkout", version: ENNODIA_VERSION } });
      const before = core.getInstallation();
      expect(core.getInstallation()).toBe(before);
      expect(core.getInstallation(true)).not.toBe(before);
    } finally { await client.close(); await server.close(); await core.shutdown(); }
  });
});

describe("npm launcher runtime check", () => {
  it("rejects an old runtime before launch and passes installation provenance on a supported runtime", () => {
    const { dir } = fixture(); const bun = join(dir, "bun");
    put(bun, '#!/usr/bin/env node\nif (process.argv[2] === "--version") console.log(process.env.FIXTURE_BUN_VERSION); else console.log(JSON.stringify({ launcher: process.env.ENNODIA_LAUNCHER_PATH, args: process.argv.slice(2) }));\n');
    chmodSync(bun, 0o755);
    const wrapper = join(import.meta.dir, "../bin/ennodia");
    for (const version of ["1.3.13", "1.3.14-canary", "invalid"]) {
      const result = Bun.spawnSync(["node", wrapper], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FIXTURE_BUN_VERSION: version }, stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(1); expect(result.stderr.toString()).toContain("requires Bun >=1.3.14"); expect(result.stdout.toString()).toBe("");
    }
    const result = Bun.spawnSync(["node", wrapper, "--tools", "all"], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FIXTURE_BUN_VERSION: MIN_BUN_VERSION }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toMatchObject({ launcher: wrapper, args: ["run", join(import.meta.dir, "cli.ts"), "--tools", "all"] });
  });
});
