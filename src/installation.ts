import { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ENNODIA_VERSION } from "./version";

export const MIN_BUN_VERSION = "1.3.14";
export type InstallationScope = "source-checkout" | "project-local" | "global" | "cache" | "unknown";
export type InstallationCheck = { id: string; status: "pass" | "warning" | "fail"; message: string };
export type InstallationReport = {
  checkedAt: string;
  status: "healthy" | "limited" | "broken";
  version: string;
  packageVersion?: string;
  distribution: "source" | "compiled";
  scope: InstallationScope;
  evidence: string;
  codeRoot: string;
  serverCwd: string;
  launcher?: string;
  runtime: { name: "bun" | "unsupported"; version?: string; executable: string; minimumVersion: string; platform: string; arch: string };
  checks: InstallationCheck[];
  storage: { temporaryDirectory: string; history: { enabled: boolean; directory?: string }; harnessUpdates: { enabled: boolean; directory: string } };
  limitations: string[];
};

export type InstallationOptions = {
  /** Defaults to the loaded module's location, never the caller's workspace. */
  codeRoot?: string;
  cwd?: string;
  home?: string;
  temporaryDirectory?: string;
  env?: Record<string, string | undefined>;
  bunVersion?: string | null;
  history?: { enabled: boolean; directory?: string };
  autoUpgrade?: boolean;
  upgradeStateDirectory?: string;
};

/** Local, read-only evidence. Does not inspect credentials, contact registries,
 * create directories, or call providers. Access checks do not prove disk capacity. */
export function inspectInstallation(options: InstallationOptions = {}): InstallationReport {
  const env = options.env ?? process.env;
  const home = canonical(options.home ?? homedir());
  const codeRoot = canonical(options.codeRoot ?? fileURLToPath(new URL("..", import.meta.url)));
  const compiled = /(?:^|\/)\$bunfs(?:\/|$)/.test(codeRoot.replaceAll("\\", "/"));
  const serverCwd = canonical(options.cwd ?? process.cwd());
  const bunVersion = options.bunVersion === undefined ? process.versions.bun : options.bunVersion ?? undefined;
  const temporaryDirectory = canonical(options.temporaryDirectory ?? tmpdir());
  const historySetting = options.history ?? { enabled: env.ENNODIA_HISTORY !== "0", directory: env.ENNODIA_HISTORY_DIR ?? join(home, ".ennodia", "history") };
  const history = { ...historySetting, directory: historySetting.directory ? resolve(historySetting.directory) : undefined };
  const updates = { enabled: options.autoUpgrade ?? env.ENNODIA_AUTO_UPDATE !== "false", directory: resolve(options.upgradeStateDirectory ?? join(env.XDG_STATE_HOME ?? join(home, ".local", "state"), "ennodia", "harnesses")) };
  const checks: InstallationCheck[] = [];
  const add = (id: string, status: InstallationCheck["status"], message: string) => checks.push({ id, status, message });
  add("runtime", bunVersion && atLeast(bunVersion, MIN_BUN_VERSION) ? "pass" : "fail", bunVersion ? `Bun ${bunVersion}; requires >=${MIN_BUN_VERSION}.` : `Bun >=${MIN_BUN_VERSION} is required.`);

  const npm = readMetadata(join(codeRoot, "package.json"));
  const jsr = readMetadata(join(codeRoot, "jsr.json"));
  const metadata = npm?.name === "ennodia" ? npm : jsr?.name === "@cherninlab/ennodia" ? jsr : undefined;
  const packageVersion = typeof metadata?.version === "string" ? metadata.version : undefined;
  add("package-version", packageVersion === ENNODIA_VERSION ? "pass" : packageVersion ? "fail" : "warning", packageVersion ? `Metadata ${packageVersion}; loaded code ${ENNODIA_VERSION}.` : "Package metadata is unavailable; only the loaded code version is known.");

  // JSR does not ship the npm launcher. Development tooling is not required.
  const declaredModules = Array.isArray(npm?.files) ? npm.files.filter((p): p is string => typeof p === "string" && /^src\/[^/*]+\.ts$/.test(p)) : [];
  const required = [...new Set(["src/index.ts", "src/core.ts", "src/cli.ts", "src/readiness.ts", "src/installation.ts", ...declaredModules, ...(npm?.name === "ennodia" ? ["bin/ennodia"] : [])])];
  const missing = required.filter(p => !readableFile(join(codeRoot, p)));
  add("runtime-files", compiled || !missing.length ? "pass" : "fail", compiled ? "Loaded core code is embedded in the executable; separate source entrypoints are not required." : missing.length ? `Missing or unreadable runtime files: ${missing.join(", ")}. Reinstall this distribution.` : "Core entrypoints and declared runtime modules are readable.");
  const skillFiles = ["pragmatic", "compositional-audit"].map(id => join(codeRoot, "skills", id, "SKILL.md"));
  add("bundled-skills", skillFiles.every(readableFile) ? "pass" : "warning", skillFiles.every(readableFile) ? "Bundled skills are readable." : "Bundled skills are incomplete; skill discovery or installation may be limited.");
  const dependencies = ["@modelcontextprotocol/sdk/server/mcp.js", "zod"];
  if (compiled) add("dependencies", "warning", "Executable uses bundled dependencies; separate dependency-file integrity cannot be checked.");
  else {
    const require = createRequire(join(codeRoot, "src/index.ts"));
    const unresolved = dependencies.filter(id => { try { return !readableFile(require.resolve(id)); } catch { return true; } });
    add("dependencies", unresolved.length ? "warning" : "pass", unresolved.length ? `Dependencies cannot be resolved from the code location: ${unresolved.join(", ")}. Install dependencies for this source distribution.` : "MCP dependencies resolve from the code location.");
  }

  const { scope, evidence } = installationScope(codeRoot, home, env);
  if (scope === "unknown") add("installation-scope", "warning", "Global versus local scope could not be established from filesystem evidence.");
  else add("installation-scope", "pass", evidence);
  const temporaryAccessible = writableDirectory(temporaryDirectory, false);
  add("temporary-storage", temporaryAccessible ? "pass" : "fail", `Temporary workspace directory ${temporaryDirectory}: ${temporaryAccessible ? "filesystem access available" : "directory missing or filesystem access unavailable"}.`);
  if (history.enabled) {
    const accessible = history.directory && writableDirectory(history.directory) && writableExistingFile(join(history.directory, "runs.jsonl"));
    add("history-storage", accessible ? "pass" : "warning", history.directory ? `History storage ${history.directory}: filesystem access ${accessible ? "available" : "unavailable; receipts may not persist"}.` : "Custom history sink; filesystem access cannot be checked.");
  }
  if (updates.enabled) {
    const accessible = writableDirectory(updates.directory);
    add("maintenance-storage", accessible ? "pass" : "warning", `Harness update receipts and locks ${updates.directory}: filesystem access ${accessible ? "available" : "unavailable; upgrades may fail"}.`);
  }

  const limitations = checks.filter(c => c.status !== "pass").map(c => c.message);
  if (scope === "cache") limitations.push("This code runs from a package cache. Cache cleanup or a future unpinned launch can change the loaded version; restart after changing the install.");
  if (!updates.enabled) limitations.push("Automatic harness upgrades are disabled.");
  if (!history.enabled) limitations.push("Run history is disabled; receipts will not persist through restart.");
  const launcherPath = env.ENNODIA_LAUNCHER_PATH;
  // Ignore stale inherited launcher metadata (e.g. when a worker starts another installation).
  const launcher = launcherPath && isAbsolute(launcherPath) && canonical(launcherPath) === canonical(join(codeRoot, "bin/ennodia")) ? launcherPath : undefined;
  return {
    checkedAt: new Date().toISOString(), status: checks.some(c => c.status === "fail") ? "broken" : limitations.length ? "limited" : "healthy",
    version: ENNODIA_VERSION, packageVersion, distribution: compiled ? "compiled" : "source", scope, evidence, codeRoot, serverCwd, launcher,
    runtime: { name: bunVersion ? "bun" : "unsupported", version: bunVersion, executable: process.execPath, minimumVersion: MIN_BUN_VERSION, platform: process.platform, arch: process.arch },
    checks, storage: { temporaryDirectory, history, harnessUpdates: updates }, limitations,
  };
}

function installationScope(root: string, home: string, env: Record<string, string | undefined>): { scope: InstallationScope; evidence: string } {
  if (existsSync(join(root, ".git"))) return { scope: "source-checkout", evidence: "Loaded code root contains Git checkout metadata." };
  const npmCache = canonical(env.npm_config_cache ?? join(home, ".npm"));
  const bunInstall = canonical(env.BUN_INSTALL ?? join(home, ".bun"));
  const bunxCache = [canonical(tmpdir()), canonical("/tmp")].some(temp => within(root, temp)) && /(?:^|\/)bunx-\d+-[^/]+\/(?:.*\/)?node_modules\/ennodia$/.test(root);
  if (within(root, join(npmCache, "_npx")) || within(root, join(bunInstall, "install/cache")) || bunxCache) return { scope: "cache", evidence: "Loaded code is inside an npm exec/npx or Bun package cache." };
  if (root === join(bunInstall, "install/global/node_modules/ennodia")) return { scope: "global", evidence: "Loaded code is inside Bun's global installation directory." };
  const globalSuffix = `${sep}lib${sep}node_modules${sep}ennodia`;
  if (root.endsWith(globalSuffix)) {
    const launcher = join(root.slice(0, -globalSuffix.length), "bin", "ennodia");
    if (existsSync(launcher) && canonical(launcher) === canonical(join(root, "bin/ennodia"))) return { scope: "global", evidence: "Global prefix bin/ennodia resolves to this lib/node_modules/ennodia installation." };
  }
  const dependencyParent = dirname(dirname(root));
  if (dirname(root).endsWith(`${sep}node_modules`) && readMetadata(join(dependencyParent, "package.json"))) return { scope: "project-local", evidence: "Loaded code is a node_modules dependency beneath a project package.json." };
  return { scope: "unknown", evidence: "Code location does not establish an installation scope." };
}

function readMetadata(path: string): Record<string, unknown> | undefined {
  try { const value: unknown = JSON.parse(readFileSync(path, "utf8")); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; } catch { return undefined; }
}
function canonical(path: string): string { try { return realpathSync(path); } catch { return resolve(path); } }
function readableFile(path: string): boolean { try { accessSync(path, constants.R_OK); return statSync(path).isFile(); } catch { return false; } }
function writableExistingFile(path: string): boolean { try { accessSync(path, constants.R_OK | constants.W_OK); return statSync(path).isFile(); } catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; } }
function writableDirectory(path: string, allowMissing = true): boolean {
  let ancestor = resolve(path);
  if (!allowMissing && !existsSync(ancestor)) return false;
  while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
  try { accessSync(ancestor, constants.R_OK | constants.W_OK | constants.X_OK); return statSync(ancestor).isDirectory(); } catch { return false; }
}
function within(path: string, directory: string): boolean { const suffix = relative(directory, path); return suffix !== "" && suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix); }
function atLeast(version: string, minimum: string): boolean {
  if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(version)) return false;
  const parts = version.split(/[.+-]/).slice(0, 3).map(Number), required = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if (parts[i]! !== required[i]!) return parts[i]! > required[i]!; }
  return !version.split("+")[0]!.includes("-");
}
