import { expect, test } from "bun:test";
import { parsePackResult } from "./dev/npm-pack";

const name = "@cherninlab/ennodia-linux-x64";
const metadata = { name, version: "1.0.0", filename: "cherninlab-ennodia-linux-x64-1.0.0.tgz", files: [{ path: "bin/ennodia" }] };

test.each([
  ["npm 11 array", [metadata]],
  ["npm 12 name map", { [name]: metadata }],
])("reads a native archive filename from %s", (_label, output) => {
  expect(parsePackResult(JSON.stringify(output), name).filename).toBe(metadata.filename);
});

test("rejects missing or mismatched npm pack results", () => {
  for (const output of [[], {}, { other: metadata }, [{ ...metadata, name: "other" }], [{ ...metadata, filename: undefined }]]) {
    expect(() => parsePackResult(JSON.stringify(output), name)).toThrow("valid package metadata");
  }
});
