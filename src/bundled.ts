import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

// Only standalone builds define this constant. Source and JSR keep using files.
declare const ENNODIA_BUNDLED_FILES: Record<string, string> | undefined;
const files = typeof ENNODIA_BUNDLED_FILES === "undefined" ? undefined : ENNODIA_BUNDLED_FILES;
// Virtual resource identities do not require filesystem extraction at startup.
export const BUNDLED_ROOT = files ? "/$bunfs/ennodia" : fileURLToPath(new URL("..", import.meta.url));

export function bundledText(path: string): string | undefined {
  return files?.[relative(BUNDLED_ROOT, path).replaceAll("\\", "/")];
}

export function bundledFilesUnder(directory: string): { path: string; content: string }[] | undefined {
  if (!files) return undefined;
  const prefix = relative(BUNDLED_ROOT, directory).replaceAll("\\", "/") + "/";
  return Object.entries(files).filter(([path]) => path.startsWith(prefix))
    .map(([path, content]) => ({ path: join(BUNDLED_ROOT, path), content }));
}
