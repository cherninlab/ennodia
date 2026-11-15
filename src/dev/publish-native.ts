import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NATIVE_TARGETS, nativeOutput, nativePackageName, root } from "./native";

const { values } = parseArgs({ args: process.argv.slice(2), options: { "dry-run": { type: "boolean", default: false }, tag: { type: "string", default: "next" } }, strict: true });
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

async function run(args: string[]): Promise<void> {
  const child = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  if (await child.exited !== 0) throw new Error(`Native publication command failed: ${args[0]} ${args[1]}`);
}

for (const { id } of NATIVE_TARGETS) {
  const name = nativePackageName(id);
  const archive = join(nativeOutput, `cherninlab-ennodia-${id}-${version}.tgz`);
  if (values["dry-run"]) {
    await run(["npm", "publish", archive, "--dry-run", "--tag", values.tag!]);
    continue;
  }
  const exists = Bun.spawn(["npm", "view", `${name}@${version}`, "version", "--prefer-online"], { stdout: "ignore", stderr: "ignore" });
  if (await exists.exited === 0) await run(["npm", "dist-tag", "add", `${name}@${version}`, values.tag!]);
  else await run(["npm", "publish", archive, "--provenance", "--tag", values.tag!]);
}

// Core's optional dependencies must be downloadable before its latest tag moves.
if (!values["dry-run"]) {
  for (let attempt = 1; attempt <= 36; attempt++) {
    const available = await Promise.all(NATIVE_TARGETS.map(async ({ id }) => {
      const name = nativePackageName(id);
      const base = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
      try {
        const response = await fetch(`${base}/${version}`, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) return false;
        const metadata = await response.json() as { version: string; dist: { tarball: string } };
        return metadata.version === version && (await fetch(metadata.dist.tarball, { method: "HEAD", signal: AbortSignal.timeout(10_000) })).ok;
      } catch { return false; }
    }));
    if (available.every(Boolean)) {
      console.log(`All ${available.length} native packages are publicly downloadable.`);
      break;
    }
    if (attempt === 36) throw new Error("Native packages are not all public. Retry publication before publishing core.");
    console.log(`Waiting for native packages: ${available.filter(Boolean).length}/${available.length} available (${attempt}/36).`);
    await Bun.sleep(10_000);
  }
}
