import { expect, test } from "bun:test";
import { ENNODIA_VERSION } from "./version";

type PackageJson = {
  version: string;
};

type JsrJson = {
  version: string;
};

type IoPackageJson = {
  version: string;
  peerDependencies?: Record<string, string>;
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

test("runtime version matches package and JSR versions", () => {
  expect(ENNODIA_VERSION).toBe(packageJson.version);
  expect(ENNODIA_VERSION).toBe(jsrJson.version);
  expect(ioPackageJson.version).toBe(packageJson.version);
  expect(ioPackageJson.peerDependencies?.ennodia).toBe(packageJson.version);
});
