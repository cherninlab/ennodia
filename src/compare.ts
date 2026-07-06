import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";
import { preview, tailItems, truncate } from "./internal";
import type { TaskView, TaskViewOptions } from "./tasks";
import { TaskManager } from "./tasks";

export type CompareCandidateInput = {
  id: string;
  label?: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export type CompareCandidate = {
  id: string;
  label?: string;
  content: string;
  taskId?: string;
  harnessId?: string;
  harnessName?: string;
  status?: string;
  elapsedMs?: number;
  metadata?: Record<string, unknown>;
};

export type CompareAnalysis = {
  consensus: string[];
  contradictions: {
    topic: string;
    stances: {
      source_id: string;
      stance: string;
    }[];
  }[];
  partial_coverage: {
    source_ids: string[];
    point: string;
  }[];
  unique_insights: {
    source_id: string;
    insight: string;
  }[];
  blind_spots: string[];
  risks: string[];
  confidence: "low" | "medium" | "high";
};

export type CompareEvent = {
  at: string;
  type:
    | "started"
    | "judge-started"
    | "judge-succeeded"
    | "judge-degraded"
    | "synthesizer-started"
    | "synthesizer-succeeded"
    | "failed"
    | "cancelled";
  message?: string;
};

export type CompareStatus =
  | "judging"
  | "synthesizing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type CompareSynthesis = {
  text: string;
  taskId: string;
};

export type CompareView = {
  id: string;
  status: CompareStatus;
  promptPreview: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  elapsedMs: number;
  candidateCount: number;
  candidates: CompareCandidate[];
  judgeTaskId?: string;
  synthesizerTaskId?: string;
  activeTaskId?: string;
  remainingMs: number | null;
  etaConfidence: "timeout-budget" | "unknown" | "complete";
  analysis?: CompareAnalysis;
  analysisAvailable: boolean;
  synthesis?: CompareSynthesis;
  events: CompareEvent[];
};

export type CompareViewOptions = {
  includeCandidates?: boolean;
  includeEvents?: boolean;
  maxCandidateChars?: number;
  maxEvents?: number;
};

export type CompareStartInput = {
  prompt: string;
  taskIds?: string[];
  responses?: CompareCandidateInput[];
  judgeHarnessId?: string;
  judgeModel?: string;
  synthesizerHarnessId?: string;
  synthesizerModel?: string;
  cwd?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
};

export type CompareManagerShutdownOptions = {
  deadlineMs?: number;
};

export type CompareManagerOptions = {
  maxCompares?: number;
};

export type ResolvedHarness = {
  adapter: HarnessAdapter;
  discovery: HarnessDiscovery;
};

export type ResolveHarness = (harnessId?: string) => Promise<ResolvedHarness>;

type InternalCompare = {
  id: string;
  status: CompareStatus;
  prompt: string;
  candidates: CompareCandidate[];
  createdAtMs: number;
  updatedAtMs: number;
  endedAtMs?: number;
  judgeTaskId?: string;
  synthesizerTaskId?: string;
  analysis?: CompareAnalysis;
  synthesis?: CompareSynthesis;
  events: CompareEvent[];
  settled?: Promise<void>;
};

export const CompareAnalysisSchema: z.ZodType<CompareAnalysis> = z.object({
  consensus: z.array(z.string()).default([]),
  contradictions: z
    .array(
      z.object({
        topic: z.string(),
        stances: z.array(
          z.object({
            source_id: z.string(),
            stance: z.string(),
          }),
        ),
      }),
    )
    .default([]),
  partial_coverage: z
    .array(
      z.object({
        source_ids: z.array(z.string()),
        point: z.string(),
      }),
    )
    .default([]),
  unique_insights: z
    .array(
      z.object({
        source_id: z.string(),
        insight: z.string(),
      }),
    )
    .default([]),
  blind_spots: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
});

export const MAX_PROMPT_CANDIDATE_CHARS = 24_000;
const DEFAULT_MAX_OUTPUT_CHARS = 80_000;
const DEFAULT_MAX_CANDIDATE_CHARS = 6_000;
const DEFAULT_MAX_EVENTS = 100;
const DEFAULT_SHUTDOWN_DEADLINE_MS = 5_000;
const DEFAULT_MAX_COMPARES = 100;

export class CompareManager {
  private readonly compares = new Map<string, InternalCompare>();
  private readonly maxCompares: number;
  private shuttingDown = false;
  private shutdownPromise?: Promise<void>;

  constructor(
    private readonly taskManager: TaskManager,
    private readonly resolveHarness: ResolveHarness,
    options: CompareManagerOptions = {},
  ) {
    this.maxCompares = Math.max(1, options.maxCompares ?? DEFAULT_MAX_COMPARES);
  }

  async start(input: CompareStartInput): Promise<CompareView> {
    if (this.shuttingDown) {
      throw new Error("CompareManager is shutting down.");
    }

    const candidates = this.collectCandidates(input);
    if (candidates.length === 0) {
      throw new Error("Compare needs at least one completed task or response.");
    }

    const now = Date.now();
    const compare: InternalCompare = {
      id: randomUUID(),
      status: "judging",
      prompt: input.prompt,
      candidates,
      createdAtMs: now,
      updatedAtMs: now,
      events: [],
    };

    this.compares.set(compare.id, compare);
    this.pruneCompares(compare.id);
    this.pushEvent(compare, {
      type: "started",
      message: `Compare started with ${candidates.length} candidate(s).`,
    });

    compare.settled = this.run(compare, input);
    void compare.settled;

    return this.toView(compare);
  }

  listViews(options: CompareViewOptions = {}): CompareView[] {
    return [...this.compares.values()]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .map((compare) => this.toView(compare, options));
  }

  get(id: string, options: CompareViewOptions = {}): CompareView | undefined {
    const compare = this.compares.get(id);
    return compare ? this.toView(compare, options) : undefined;
  }

  cancel(id: string): CompareView {
    const compare = this.requireCompare(id);

    if (isTerminalCompare(compare)) {
      return this.toView(compare);
    }

    this.cancelCompare(compare, "Compare cancelled.");

    for (const taskId of compareTaskIds(compare)) {
      this.taskManager.cancel(taskId);
    }

    return this.toView(compare);
  }

  async waitForTerminal(
    id: string,
    timeoutMs?: number,
    options: CompareViewOptions = {},
  ): Promise<CompareView | undefined> {
    const compare = this.compares.get(id);
    if (!compare) {
      return undefined;
    }

    if (!isTerminalCompare(compare) && compare.settled) {
      await settleWithDeadline(compare.settled, timeoutMs);
    }

    return this.toView(compare, options);
  }

  async shutdown(options: CompareManagerShutdownOptions = {}): Promise<void> {
    this.shuttingDown = true;
    this.shutdownPromise ??= this.performShutdown(
      options.deadlineMs ?? DEFAULT_SHUTDOWN_DEADLINE_MS,
    );
    await this.shutdownPromise;
  }

  private async performShutdown(deadlineMs: number): Promise<void> {
    const taskIds = new Set<string>();
    const comparesToWait: Promise<void>[] = [];

    for (const compare of this.compares.values()) {
      if (isTerminalCompare(compare)) {
        continue;
      }

      for (const taskId of compareTaskIds(compare)) {
        taskIds.add(taskId);
      }

      this.cancelCompare(compare, "Compare cancelled by shutdown.");
      if (compare.settled) {
        comparesToWait.push(settleWithDeadline(compare.settled, deadlineMs));
      }
    }

    for (const taskId of taskIds) {
      this.taskManager.cancel(taskId);
    }

    await Promise.allSettled(
      [
        ...[...taskIds].map((taskId) =>
          this.taskManager.waitForTerminal(taskId, deadlineMs)
        ),
        ...comparesToWait,
      ],
    );
  }

  private async run(
    compare: InternalCompare,
    input: CompareStartInput,
  ): Promise<void> {
    try {
      const judgeHarness = await this.resolveHarness(input.judgeHarnessId);
      if (isCompareStatus(compare, "cancelled")) {
        return;
      }

      const judgePrompt = buildJudgePrompt(input.prompt, compare.candidates);
      const judgeTask = this.taskManager.start(
        judgeHarness.adapter,
        judgeHarness.discovery,
        {
          prompt: judgePrompt,
          cwd: input.cwd,
          model: input.judgeModel,
          timeoutMs: input.timeoutMs,
        },
      ).task;

      compare.judgeTaskId = judgeTask.id;
      this.pushEvent(compare, {
        type: "judge-started",
        message: `Judge task started through ${judgeTask.harnessName}.`,
      });

      const settledJudge = await this.waitForTask(judgeTask.id, compare);
      if (isCompareStatus(compare, "cancelled")) {
        return;
      }

      if (settledJudge.status === "succeeded") {
        const parsed = parseJudgeAnalysis(settledJudge.stdout);
        if (parsed.ok) {
          compare.analysis = parsed.analysis;
          this.pushEvent(compare, {
            type: "judge-succeeded",
            message: "Judge returned valid structured analysis.",
          });
        } else {
          this.pushEvent(compare, {
            type: "judge-degraded",
            message: parsed.error,
          });
        }
      } else {
        this.pushEvent(compare, {
          type: "judge-degraded",
          message: `Judge task ended with status ${settledJudge.status}.`,
        });
      }

      compare.status = "synthesizing";
      this.touch(compare);

      const synthesizerHarness = await this.resolveHarness(
        input.synthesizerHarnessId ?? input.judgeHarnessId,
      );
      if (isCompareStatus(compare, "cancelled")) {
        return;
      }

      const synthesizerPrompt = buildSynthesizerPrompt(
        input.prompt,
        compare.candidates,
        compare.analysis,
      );
      const synthesizerTask = this.taskManager.start(
        synthesizerHarness.adapter,
        synthesizerHarness.discovery,
        {
          prompt: synthesizerPrompt,
          cwd: input.cwd,
          model: input.synthesizerModel ?? input.judgeModel,
          timeoutMs: input.timeoutMs,
        },
      ).task;

      compare.synthesizerTaskId = synthesizerTask.id;
      this.pushEvent(compare, {
        type: "synthesizer-started",
        message: `Synthesizer task started through ${synthesizerTask.harnessName}.`,
      });

      const settledSynthesizer = await this.waitForTask(
        synthesizerTask.id,
        compare,
      );
      if (isCompareStatus(compare, "cancelled")) {
        return;
      }

      if (settledSynthesizer.status !== "succeeded") {
        throw new Error(
          `Synthesizer task ended with status ${settledSynthesizer.status}.`,
        );
      }

      compare.synthesis = {
        text: settledSynthesizer.stdout.trim(),
        taskId: settledSynthesizer.id,
      };
      compare.status = "succeeded";
      compare.endedAtMs = Date.now();
      this.pushEvent(compare, {
        type: "synthesizer-succeeded",
        message: "Synthesizer returned the final answer.",
      });
    } catch (error) {
      if (compare.status !== "cancelled") {
        compare.status = "failed";
        compare.endedAtMs = Date.now();
        this.pushEvent(compare, {
          type: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      this.touch(compare);
      this.pruneCompares(compare.id);
    }
  }

  private pruneCompares(protectedCompareId?: string): void {
    const overflow = this.compares.size - this.maxCompares;
    if (overflow <= 0) {
      return;
    }

    const removable = [...this.compares.values()]
      .filter((compare) =>
        compare.id !== protectedCompareId && isTerminalCompare(compare)
      )
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    for (const compare of removable.slice(0, overflow)) {
      this.compares.delete(compare.id);
    }
  }

  private collectCandidates(input: CompareStartInput): CompareCandidate[] {
    const candidates: CompareCandidate[] = [];
    const seen = new Set<string>();
    const taskOptions: TaskViewOptions = {
      includeOutput: true,
      includeEvents: false,
      maxOutputChars: input.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
    };

    for (const taskId of input.taskIds ?? []) {
      const task = this.taskManager.get(taskId, taskOptions);
      if (!task) {
        throw new Error(`Unknown task: ${taskId}`);
      }

      if (task.status === "running") {
        throw new Error(`Task is still running: ${taskId}`);
      }

      const id = `task:${task.id}`;
      if (seen.has(id)) {
        continue;
      }

      seen.add(id);
      candidates.push(candidateFromTask(task));
    }

    for (const response of input.responses ?? []) {
      const id = response.id.trim();
      if (!id) {
        throw new Error("Compare response IDs cannot be empty.");
      }

      if (seen.has(id)) {
        throw new Error(`Duplicate compare candidate ID: ${id}`);
      }

      seen.add(id);
      candidates.push({
        id,
        label: response.label,
        content: response.text.trim(),
        metadata: response.metadata,
      });
    }

    return candidates.filter((candidate) => candidate.content.length > 0);
  }

  private async waitForTask(
    taskId: string,
    compare: InternalCompare,
  ): Promise<TaskView> {
    const task = await this.taskManager.waitForTerminal(taskId);
    if (!task) {
      throw new Error(`Compare child task disappeared: ${taskId}`);
    }

    if (compare.status === "cancelled") {
      return task;
    }

    // TaskManager guarantees terminal status only after output drains or times out visibly.
    return this.taskManager.get(taskId, {
      includeOutput: true,
      includeEvents: false,
    }) ?? task;
  }

  private toView(
    compare: InternalCompare,
    options: CompareViewOptions = {},
  ): CompareView {
    const now = Date.now();
    const end = compare.endedAtMs ?? now;
    const activeTask = this.activeTask(compare);
    const includeCandidates = options.includeCandidates ?? true;
    const includeEvents = options.includeEvents ?? true;
    const maxCandidateChars =
      options.maxCandidateChars ?? DEFAULT_MAX_CANDIDATE_CHARS;
    const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;

    return {
      id: compare.id,
      status: compare.status,
      promptPreview: preview(compare.prompt),
      createdAt: new Date(compare.createdAtMs).toISOString(),
      updatedAt: new Date(compare.updatedAtMs).toISOString(),
      endedAt: compare.endedAtMs
        ? new Date(compare.endedAtMs).toISOString()
        : undefined,
      elapsedMs: Math.max(0, end - compare.createdAtMs),
      candidateCount: compare.candidates.length,
      candidates: includeCandidates
        ? compare.candidates.map((candidate) =>
            truncateCandidate(candidate, maxCandidateChars),
          )
        : [],
      judgeTaskId: compare.judgeTaskId,
      synthesizerTaskId: compare.synthesizerTaskId,
      activeTaskId: activeTask?.id,
      remainingMs: activeTask?.remainingMs ?? (compare.endedAtMs ? 0 : null),
      etaConfidence: activeTask?.etaConfidence ?? (
        compare.endedAtMs ? "complete" : "unknown"
      ),
      analysis: compare.analysis,
      analysisAvailable: Boolean(compare.analysis),
      synthesis: compare.synthesis,
      events: includeEvents ? tailItems(compare.events, maxEvents) : [],
    };
  }

  private activeTask(compare: InternalCompare): TaskView | undefined {
    const activeTaskId =
      compare.status === "synthesizing"
        ? compare.synthesizerTaskId
        : compare.status === "judging"
          ? compare.judgeTaskId
          : undefined;

    return activeTaskId
      ? this.taskManager.get(activeTaskId, {
          includeOutput: false,
          includeEvents: false,
        })
      : undefined;
  }

  private requireCompare(id: string): InternalCompare {
    const compare = this.compares.get(id);
    if (!compare) {
      throw new Error(`Unknown compare: ${id}`);
    }

    return compare;
  }

  private cancelCompare(compare: InternalCompare, message: string): void {
    compare.status = "cancelled";
    compare.endedAtMs = Date.now();
    this.pushEvent(compare, { type: "cancelled", message });
  }

  private pushEvent(
    compare: InternalCompare,
    event: Omit<CompareEvent, "at">,
  ): void {
    compare.events.push({
      at: new Date().toISOString(),
      ...event,
    });
    this.touch(compare);
  }

  private touch(compare: InternalCompare): void {
    compare.updatedAtMs = Date.now();
  }
}

export function buildJudgePrompt(
  originalPrompt: string,
  candidates: CompareCandidate[],
): string {
  return [
    "ENNODIA_COMPARE_JUDGE",
    "",
    "You are the judge in an AI orchestration pipeline.",
    "Compare the candidate responses. Do not write the final answer.",
    "Return only valid JSON matching this schema:",
    JSON.stringify(schemaExample(), null, 2),
    "",
    "Rules:",
    "- Judge the candidate set against the original prompt, not only against each other.",
    "- Treat agreement across independent candidates as stronger signal, but not as proof.",
    "- Surface contradictions and partial coverage clearly.",
    "- Preserve unique insights with source IDs.",
    "- Flag blind spots none of the candidates covered, including missing files, screenshots, rendered views, commands, or external sources needed to answer well.",
    "- If the original prompt asks for audit, review, critique, or assessment, identify what evidence the candidates used and what they did not verify.",
    "- Do not invent sources or claims.",
    "",
    "Original prompt:",
    originalPrompt,
    "",
    "Candidate responses:",
    renderCandidates(candidates),
  ].join("\n");
}

export function buildSynthesizerPrompt(
  originalPrompt: string,
  candidates: CompareCandidate[],
  analysis?: CompareAnalysis,
): string {
  return [
    "ENNODIA_COMPARE_SYNTHESIZER",
    "",
    "You are the synthesizer in an AI orchestration pipeline.",
    "Write the final answer for the user using the judge analysis and the candidate responses.",
    "If judge analysis is missing, degrade gracefully and use the raw candidate responses.",
    "Be explicit about uncertainty, contradictions, and missing coverage.",
    "When a non-obvious claim depends on one candidate, mention its source ID inline.",
    "",
    "Original prompt:",
    originalPrompt,
    "",
    "Judge analysis JSON:",
    analysis ? JSON.stringify(analysis, null, 2) : "null",
    "",
    "Candidate responses:",
    renderCandidates(candidates),
  ].join("\n");
}

export function parseJudgeAnalysis(
  text: string,
): { ok: true; analysis: CompareAnalysis } | { ok: false; error: string } {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    return { ok: false, error: "Judge output did not contain a JSON object." };
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return { ok: true, analysis: CompareAnalysisSchema.parse(parsed) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function candidateFromTask(task: TaskView): CompareCandidate {
  const content = `${task.stdout.trim()}\n${task.stderr.trim()}`.trim();

  return {
    id: `task:${task.id}`,
    label: task.harnessName,
    content,
    taskId: task.id,
    harnessId: task.harnessId,
    harnessName: task.harnessName,
    status: task.status,
    elapsedMs: task.elapsedMs,
    metadata: {
      exitCode: task.exitCode,
      timedOut: task.timedOut,
      drainTimedOut: task.drainTimedOut,
    },
  };
}

function renderCandidates(candidates: CompareCandidate[]): string {
  return candidates
    .map((candidate) =>
      [
        `<candidate id="${escapeAttribute(candidate.id)}" label="${escapeAttribute(
          candidate.label ?? candidate.id,
        )}">`,
        truncate(candidate.content, MAX_PROMPT_CANDIDATE_CHARS),
        "</candidate>",
      ].join("\n"),
    )
    .join("\n\n");
}

function schemaExample() {
  return {
    consensus: ["Points all or most candidates agree on."],
    contradictions: [
      {
        topic: "What the disagreement is about.",
        stances: [
          {
            source_id: "candidate-id",
            stance: "The candidate's position.",
          },
        ],
      },
    ],
    partial_coverage: [
      {
        source_ids: ["candidate-id"],
        point: "Important point only some candidates covered.",
      },
    ],
    unique_insights: [
      {
        source_id: "candidate-id",
        insight: "Useful insight only this candidate raised.",
      },
    ],
    blind_spots: ["Important topics no candidate addressed."],
    risks: ["Risks, caveats, or weak evidence in the candidate set."],
    confidence: "low | medium | high",
  };
}

function extractJsonObject(text: string): string | undefined {
  const withoutFence = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }

  return withoutFence.slice(start, end + 1);
}

function truncateCandidate(
  candidate: CompareCandidate,
  maxChars: number,
): CompareCandidate {
  return {
    ...candidate,
    content: truncate(candidate.content, maxChars),
  };
}

function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function isCompareStatus(
  compare: InternalCompare,
  status: CompareStatus,
): boolean {
  return compare.status === status;
}

async function settleWithDeadline(
  settled: Promise<void>,
  timeoutMs?: number,
): Promise<void> {
  if (timeoutMs === undefined) {
    await settled;
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void settled.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function isTerminalCompare(compare: InternalCompare): boolean {
  return (
    compare.status === "succeeded" ||
    compare.status === "failed" ||
    compare.status === "cancelled"
  );
}

function compareTaskIds(compare: InternalCompare): string[] {
  return [compare.judgeTaskId, compare.synthesizerTaskId].filter(
    (taskId): taskId is string => typeof taskId === "string",
  );
}
