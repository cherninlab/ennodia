import { randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CompareView } from "./compare";
import type { RunView } from "./runs";
import type { TaskView } from "./tasks";

export type RunHistorySnapshot = {
  version: 1;
  kind: "run";
  recordedAt: string;
  run: RunView;
  tasks: TaskView[];
  compare?: CompareView;
};

export type RunHistoryListOptions = {
  limit?: number;
};

export type HistorySink = {
  recordRun(snapshot: RunHistorySnapshot): Promise<void> | void;
  listRuns(
    options?: RunHistoryListOptions,
  ): Promise<RunHistorySnapshot[]> | RunHistorySnapshot[];
};

export type FileHistorySinkOptions = {
  dir?: string;
  maxRuns?: number;
};

export const HISTORY_ENV_VAR = "ENNODIA_HISTORY";
export const HISTORY_DIR_ENV_VAR = "ENNODIA_HISTORY_DIR";
export const DEFAULT_HISTORY_MAX_RUNS = 500;

const HISTORY_FILE = "runs.jsonl";
const COMPACTION_FACTOR = 2;

export const noopHistorySink: HistorySink = {
  recordRun: () => undefined,
  listRuns: () => [],
};

export class FileHistorySink implements HistorySink {
  private readonly dir: string;
  private readonly maxRuns: number;

  constructor(options: FileHistorySinkOptions = {}) {
    this.dir = options.dir ?? defaultHistoryDir();
    this.maxRuns = Math.max(1, options.maxRuns ?? DEFAULT_HISTORY_MAX_RUNS);
  }

  async recordRun(snapshot: RunHistorySnapshot): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    // Append-only hot path: an interrupted write can lose at most this
    // snapshot, and concurrent writers (MCP and IO processes share the
    // default directory) cannot clobber each other's lines.
    await appendFile(this.path, `${serialize(snapshot)}\n`, { mode: 0o600 });
    await this.compactIfNeeded();
  }

  async listRuns(
    options: RunHistoryListOptions = {},
  ): Promise<RunHistorySnapshot[]> {
    const limit = Math.max(1, options.limit ?? 50);
    return dedupeByRunId(await this.readChronological())
      .sort((a, b) =>
        new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
      )
      .slice(0, limit);
  }

  private get path(): string {
    return join(this.dir, HISTORY_FILE);
  }

  private async compactIfNeeded(): Promise<void> {
    const snapshots = await this.readChronological();
    if (snapshots.length <= this.maxRuns * COMPACTION_FACTOR) {
      return;
    }

    const retained = dedupeByRunId(snapshots)
      .sort((a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
      )
      .slice(-this.maxRuns);

    // Atomic replace: rename cannot leave a partially written file behind.
    // A snapshot appended by another process between the read above and the
    // rename below can be dropped; compaction is rare and the append path
    // stays lock-free, so that narrow window is accepted by design.
    const tempPath = join(this.dir, `${HISTORY_FILE}.${randomUUID()}.tmp`);
    await writeFile(tempPath, `${retained.map(serialize).join("\n")}\n`, {
      mode: 0o600,
    });
    await rename(tempPath, this.path);
  }

  private async readChronological(): Promise<RunHistorySnapshot[]> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }
      throw error;
    }

    return text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map(parseSnapshot)
      .filter((snapshot): snapshot is RunHistorySnapshot =>
        snapshot !== undefined
      );
  }
}

export function createDefaultHistorySink(
  env: Record<string, string | undefined> = process.env,
): HistorySink {
  if (env[HISTORY_ENV_VAR] === "0") {
    return noopHistorySink;
  }

  return new FileHistorySink({ dir: env[HISTORY_DIR_ENV_VAR] });
}

export function defaultHistoryDir(): string {
  return join(homedir(), ".ennodia", "history");
}

function dedupeByRunId(
  snapshots: RunHistorySnapshot[],
): RunHistorySnapshot[] {
  const byRunId = new Map<string, RunHistorySnapshot>();

  for (const snapshot of snapshots) {
    byRunId.set(snapshot.run.id, snapshot);
  }

  return [...byRunId.values()];
}

function serialize(snapshot: RunHistorySnapshot): string {
  return JSON.stringify(snapshot);
}

function parseSnapshot(line: string): RunHistorySnapshot | undefined {
  try {
    const parsed = JSON.parse(line) as RunHistorySnapshot;
    return parsed?.kind === "run" && parsed.version === 1 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(
    typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "ENOENT",
  );
}
