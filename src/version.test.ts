import { expect, test } from "bun:test";
import { ENNODIA_VERSION } from "./version";

type PackageJson = {
  description: string;
  version: string;
};

type JsrJson = {
  version: string;
};

type IoPackageJson = {
  version: string;
  dependencies?: Record<string, string>;
};

type ServerJson = {
  description: string;
  version: string;
  packages: Array<{ identifier: string; version: string }>;
};

type ManifestJson = {
  description: string;
  version: string;
};

const packageJson = (await Bun.file(
  new URL("../package.json", import.meta.url),
).json()) as PackageJson;

const jsrJson = (await Bun.file(
  new URL("../jsr.json", import.meta.url),
).json()) as JsrJson;

const ioPackageJson = (await Bun.file(
  new URL("../packages/ennodia-io/package.json", import.meta.url),
).json()) as IoPackageJson;

const serverJson = (await Bun.file(
  new URL("../server.json", import.meta.url),
).json()) as ServerJson;

const manifestJson = (await Bun.file(
  new URL("../manifest.json", import.meta.url),
).json()) as ManifestJson;

test("runtime version matches package and JSR versions", () => {
  expect(ENNODIA_VERSION).toBe(packageJson.version);
  expect(ENNODIA_VERSION).toBe(jsrJson.version);
  expect(ioPackageJson.version).toBe(packageJson.version);
  expect(ioPackageJson.dependencies?.ennodia).toBe(packageJson.version);
  expect(serverJson.version).toBe(packageJson.version);
  expect(serverJson.description).toBe(packageJson.description);
  expect(
    serverJson.packages.find((entry) => entry.identifier === "ennodia")?.version,
  ).toBe(packageJson.version);
  expect(manifestJson.version).toBe(packageJson.version);
  expect(manifestJson.description).toBe(packageJson.description);
});
