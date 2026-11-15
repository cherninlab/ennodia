import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { MIN_BUN_VERSION } from "../installation";
import { parsePackResult } from "./npm-pack";

export const NATIVE_TARGETS = [
  { id: "darwin-arm64", os: "darwin", cpu: "arm64", target: "bun-darwin-arm64" },
  { id: "darwin-x64", os: "darwin", cpu: "x64", target: "bun-darwin-x64" },
  { id: "linux-arm64", os: "linux", cpu: "arm64", libc: "glibc", target: "bun-linux-arm64" },
  { id: "linux-x64", os: "linux", cpu: "x64", libc: "glibc", target: "bun-linux-x64-baseline" },
  { id: "linux-arm64-musl", os: "linux", cpu: "arm64", libc: "musl", target: "bun-linux-arm64-musl" },
  { id: "linux-x64-musl", os: "linux", cpu: "x64", libc: "musl", target: "bun-linux-x64-baseline-musl" },
  { id: "win32-x64", os: "win32", cpu: "x64", target: "bun-windows-x64-baseline" },
] as const;
export const nativePackageName = (id: string) => `@cherninlab/ennodia-${id}`;
export const root = resolve(import.meta.dir, "../..");
export const nativeOutput = join(root, "dist/native");

export function hostTargetId(): string {
  const musl = process.platform === "linux" && !(process.report.getReport() as { header: { glibcVersionRuntime?: string } }).header.glibcVersionRuntime;
  return `${process.platform}-${process.arch}${musl ? "-musl" : ""}`;
}

export async function buildNative(id = hostTargetId()): Promise<{ binary: string; directory: string; name: string }> {
  const spec = NATIVE_TARGETS.find(t => t.id === id);
  if (!spec) throw new Error(`Unsupported standalone target: ${id}. Supported: ${NATIVE_TARGETS.map(t => t.id).join(", ")}`);
  if (Bun.semver.order(Bun.version, MIN_BUN_VERSION) < 0) throw new Error(`Build requires Bun >=${MIN_BUN_VERSION}.`);
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const embedded: Record<string, string> = { "package.json": JSON.stringify(pkg) };
  for (const path of [...new Bun.Glob("skills/**/*").scanSync({ cwd: root, onlyFiles: true, followSymlinks: false })].sort()) {
    if (!(await lstat(join(root, path))).isFile()) throw new Error(`Cannot embed a non-regular skill resource: ${path}`);
    embedded[path.replaceAll("\\", "/")] = await readFile(join(root, path), "utf8");
  }
  await mkdir(nativeOutput, { recursive: true });
  const executable = spec.os === "win32" ? "ennodia.exe" : "ennodia";
  const binary = join(nativeOutput, `ennodia-${id}${spec.os === "win32" ? ".exe" : ""}`);
  const result = await Bun.build({
    entrypoints: [join(root, "src/cli.ts")],
    compile: { target: spec.target, outfile: binary, autoloadDotenv: false, autoloadBunfig: false },
    minify: true,
    sourcemap: "linked",
    define: { ENNODIA_BUNDLED_FILES: JSON.stringify(embedded) },
  });
  if (!result.success) throw new AggregateError(result.logs, `Standalone build failed: ${id}`);
  const directory = join(nativeOutput, "packages", id);
  await mkdir(join(directory, "bin"), { recursive: true });
  await copyFile(binary, join(directory, "bin", executable));
  await copyFile(join(root, "LICENSE"), join(directory, "LICENSE"));
  const name = nativePackageName(id);
  await writeFile(join(directory, "package.json"), JSON.stringify({
    name, version: pkg.version, description: `Ennodia standalone executable for ${id}`,
    license: pkg.license, repository: pkg.repository, os: [spec.os], cpu: [spec.cpu],
    ...("libc" in spec ? { libc: [spec.libc] } : {}),
    files: ["bin/", "LICENSE"], publishConfig: { access: "public" },
  }, null, 2) + "\n");
  return { binary, directory, name };
}

export async function packNative(id = hostTargetId()): Promise<string> {
  const { directory, name } = await buildNative(id);
  const proc = Bun.spawn(["npm", "pack", "--json", "--pack-destination", nativeOutput], { cwd: directory, stdout: "pipe", stderr: "inherit" });
  const output = await new Response(proc.stdout).text();
  if (await proc.exited !== 0) throw new Error(`Native pack failed: ${id}`);
  return join(nativeOutput, parsePackResult(output, name).filename);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && args[0] !== "--all" && !NATIVE_TARGETS.some(t => t.id === args[0]))) throw new Error("Use native:build [--all|target].");
  const ids = args[0] === "--all" ? NATIVE_TARGETS.map(t => t.id) : [args[0] ?? hostTargetId()];
  const checksums: string[] = [];
  for (const id of ids) {
    const tarball = await packNative(id);
    const spec = NATIVE_TARGETS.find(t => t.id === id)!;
    for (const path of [tarball, join(nativeOutput, `ennodia-${id}${spec.os === "win32" ? ".exe" : ""}`)]) {
      checksums.push(`${createHash("sha256").update(await readFile(path)).digest("hex")}  ${path.slice(nativeOutput.length + 1)}`);
    }
    console.log(`Built and packed ${id}: ${tarball}`);
  }
  await writeFile(join(nativeOutput, "SHA256SUMS"), checksums.join("\n") + "\n");
}
