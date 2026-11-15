import { copyFile, mkdir, mkdtemp, readFile, rm, chmod } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildNative, root } from "./native";
import { ENNODIA_VERSION } from "../version";

const temp = await mkdtemp(join(tmpdir(), "ennodia-standalone-"));
const client = new Client({ name: "ennodia-standalone-smoke", version: "1" });
try {
  const built = process.argv[2] ? resolve(process.argv[2]) : (await buildNative()).binary;
  const binary = join(temp, process.platform === "win32" ? "ennodia.exe" : "ennodia");
  await copyFile(built, binary);
  await chmod(binary, 0o755);
  const emptyPath = join(temp, "empty-path");
  await mkdir(emptyPath);
  const transport = new StdioClientTransport({
    command: binary, args: ["--tools", "all"], cwd: temp, stderr: "pipe",
    env: { ...getDefaultEnvironment(), PATH: emptyPath, ENNODIA_HISTORY: "0", ENNODIA_AUTO_UPDATE: "false" },
  });
  await client.connect(transport, { timeout: 10_000 });
  if (client.getServerVersion()?.version !== ENNODIA_VERSION) throw new Error("Wrong standalone version.");
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(JSON.stringify(result));
    const block = (result.content as { type: string; text?: string }[]).find(c => c.type === "text");
    return JSON.parse(block?.text ?? "null");
  };
  // Cline has no automatic sign-in check; this makes no model requests.
  const { installation } = await call("ennodia_check_harnesses", { harnessIds: ["cline"], verify: false, upgrade: false });
  if (installation.distribution !== "compiled" || installation.packageVersion !== ENNODIA_VERSION || installation.status === "broken") throw new Error(JSON.stringify(installation));
  for (const id of ["runtime", "runtime-files", "package-version", "dependencies", "bundled-skills"]) {
    if (installation.checks.find((c: { id: string; status: string }) => c.id === id)?.status !== "pass") throw new Error(`Standalone check failed: ${id}`);
  }
  const listed = await call("ennodia_list_skills", { cwd: temp });
  const bundled = listed.skills.filter((s: { installations: { scope: string }[] }) => s.installations.some(i => i.scope === "builtin"));
  if (!bundled.length) throw new Error("Embedded skills are absent from discovery.");
  const installed = await call("ennodia_install_skills", { harnessIds: ["codex"], scope: "project", cwd: temp, dryRun: false });
  if (installed.actions.length !== 6) throw new Error("Expected all six embedded skills to install.");
  for (const action of installed.actions) {
    const actual = await readFile(join(action.targetPath, "SKILL.md"), "utf8");
    if (actual !== await readFile(join(root, "skills", action.skillId, "SKILL.md"), "utf8")) throw new Error(`Embedded skill content changed: ${action.skillId}`);
  }
  const repeated = await call("ennodia_install_skills", { harnessIds: ["codex"], scope: "project", cwd: temp, dryRun: false });
  if (!repeated.actions.every((a: { status: string }) => a.status === "skipped")) throw new Error("Repeated skill install did not preserve existing files.");
  console.log(JSON.stringify({ version: ENNODIA_VERSION, distribution: installation.distribution, bundledSkills: installed.actions.length, skillInstall: "verified", externalRuntimeOnPath: false, cwd: "outside checkout" }));
} finally {
  await client.close();
  await rm(temp, { recursive: true, force: true });
}
