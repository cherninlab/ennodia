type PackageJson = {
  description: string;
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, unknown>;
};

type JsrJson = {
  version: string;
};

type ServerJson = {
  description: string;
  version: string;
  packages: Array<{
    identifier: string;
    version: string;
  }>;
};

type ManifestJson = {
  description: string;
  version: string;
};

const root = new URL("../../", import.meta.url);
const packageJsonUrl = new URL("package.json", root);
const jsrJsonUrl = new URL("jsr.json", root);
const versionTsUrl = new URL("src/version.ts", root);
const ioPackageJsonUrl = new URL("packages/ennodia-io/package.json", root);
const serverJsonUrl = new URL("server.json", root);
const manifestJsonUrl = new URL("manifest.json", root);

const packageJson = await readJson<PackageJson>(packageJsonUrl);
const version = packageJson.version;

if (!version) {
  throw new Error("Root package.json is missing a version.");
}

const jsrJson = await readJson<JsrJson>(jsrJsonUrl);
jsrJson.version = version;

const ioPackageJson = await readJson<PackageJson>(ioPackageJsonUrl);
ioPackageJson.version = version;
ioPackageJson.dependencies = {
  ...ioPackageJson.dependencies,
  ennodia: version,
};
delete ioPackageJson.peerDependencies;
delete ioPackageJson.peerDependenciesMeta;

const serverJson = await readJson<ServerJson>(serverJsonUrl);
serverJson.description = packageJson.description;
serverJson.version = version;
const serverPackage = serverJson.packages.find(
  (candidate) => candidate.identifier === packageJson.name,
);
if (!serverPackage) {
  throw new Error(`server.json is missing package ${packageJson.name}.`);
}
serverPackage.version = version;

const manifestJson = await readJson<ManifestJson>(manifestJsonUrl);
manifestJson.description = packageJson.description;
manifestJson.version = version;

await writeTextIfChanged(jsrJsonUrl, `${JSON.stringify(jsrJson, null, 2)}\n`);
await writeTextIfChanged(
  versionTsUrl,
  `export const ENNODIA_VERSION = ${JSON.stringify(version)};\n`,
);
await writeTextIfChanged(
  ioPackageJsonUrl,
  `${JSON.stringify(ioPackageJson, null, 2)}\n`,
);
await writeTextIfChanged(
  serverJsonUrl,
  `${JSON.stringify(serverJson, null, 2)}\n`,
);
await writeTextIfChanged(
  manifestJsonUrl,
  `${JSON.stringify(manifestJson, null, 2)}\n`,
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
