export type PackResult = {
  filename: string;
  files: { path: string }[];
  name: string;
  version: string;
};

/** npm 11 returns an array; npm 12 keys results by package name. */
export function parsePackResult(stdout: string, expectedName: string): PackResult {
  const parsed: unknown = JSON.parse(stdout);
  const candidate = Array.isArray(parsed) ? parsed[0] : isRecord(parsed) ? parsed[expectedName] : undefined;
  if (!isRecord(candidate) || candidate.name !== expectedName ||
      typeof candidate.version !== "string" || typeof candidate.filename !== "string" ||
      !Array.isArray(candidate.files) || !candidate.files.every(file => isRecord(file) && typeof file.path === "string")) {
    throw new Error(`npm pack did not return valid package metadata for ${expectedName}.`);
  }
  return candidate as PackResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
