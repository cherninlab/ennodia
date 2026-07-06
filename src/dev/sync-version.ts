type PackageJson = {
  version: string;
  peerDependencies?: Record<string, string>;
};

type JsrJson = {
  version: string;
};

const root = new URL("../../", import.meta.url);
const packageJsonUrl = new URL("package.json", root);
const jsrJsonUrl = new URL("jsr.json", root);
const versionTsUrl = new URL("src/version.ts", root);
const ioPackageJsonUrl = new URL("packages/ennodia-io/package.json", root);

const packageJson = await readJson<PackageJson>(packageJsonUrl);
const version = packageJson.version;

if (!version) {
  throw new Error("Root package.json is missing a version.");
}

const jsrJson = await readJson<JsrJson>(jsrJsonUrl);
jsrJson.version = version;

const ioPackageJson = await readJson<PackageJson>(ioPackageJsonUrl);
ioPackageJson.version = version;
ioPackageJson.peerDependencies = {
  ...ioPackageJson.peerDependencies,
  ennodia: version,
};

await writeTextIfChanged(jsrJsonUrl, `${JSON.stringify(jsrJson, null, 2)}\n`);
await writeTextIfChanged(
  versionTsUrl,
  `export const ENNODIA_VERSION = ${JSON.stringify(version)};\n`,
);
await writeTextIfChanged(
  ioPackageJsonUrl,
  `${JSON.stringify(ioPackageJson, null, 2)}\n`,
);

async function readJson<T>(url: URL): Promise<T> {
  return await Bun.file(url).json() as T;
}

async function writeTextIfChanged(url: URL, text: string): Promise<void> {
  const current = await Bun.file(url).text();
  if (current !== text) {
    await Bun.write(url, text);
  }
}
