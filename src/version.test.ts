import { expect, test } from "bun:test";
import { ENNODIA_VERSION } from "./version";

type PackageJson = {
  version: string;
};

type JsrJson = {
  version: string;
};

const packageJson = (await Bun.file(
  new URL("../package.json", import.meta.url),
).json()) as PackageJson;

const jsrJson = (await Bun.file(
  new URL("../jsr.json", import.meta.url),
).json()) as JsrJson;

test("runtime version matches package and JSR versions", () => {
  expect(ENNODIA_VERSION).toBe(packageJson.version);
  expect(ENNODIA_VERSION).toBe(jsrJson.version);
});
