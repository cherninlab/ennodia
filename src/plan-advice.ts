import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPlanAdvisorPrompt,
  compileAdvisorExecutionPlan,
  digestAdvisorExecutionPlan,
  parseAdvisorPlanProposal,
  type AdvisorExecutionPlan,
  type AdvisorInventorySnapshot,
  type AdvisorPlanIssue,
  type AdvisorPlanProposal,
} from "./advisor";
import {
  assertBudgetWithinLimits,
  checkBudgetLimits,
  estimateTaskBatchBudget,
  type BudgetCheck,
  type BudgetLimits,
} from "./budget";
import type { HarnessAdapter, HarnessDiscovery } from "./harnesses";
import { errorMessage, preview, tailItems } from "./internal";
import { TaskManager, type TaskView } from "./tasks";

export type PlanAdviceStatus =
  | "advising"
  | "ready"
  | "consumed"
  | "invalid"
  | "failed"
  | "cancelled";

export type PlanAdviceEvent = {
  at: string;
  type:
    | "started"
    | "advisor-succeeded"
    | "plan-ready"
    | "execution-authorized"
    | "plan-invalid"
    | "cleanup-warning"
    | "failed"
    | "cancelled";
  message?: string;
};

export type PlanAdviceIssue = {
  code: AdvisorPlanIssue["code"] | "execution-budget-exceeded" | "advisor-failed";
  path: Array<string | number>;
  message: string;
};

export type PlanAdviceView = {
  id: string;
  status: PlanAdviceStatus;
  promptPreview: string;
  advisorTaskId: string;
  advisorHarnessId: string;
  advisorModel?: string;
  inventorySnapshotId: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  elapsedMs: number;
  remainingMs: number | null;
  etaConfidence: "timeout-budget" | "unknown" | "complete";
  proposal?: AdvisorPlanProposal;
  plan?: AdvisorExecutionPlan;
  planDigest?: string;
  consumedAt?: string;
  issues: PlanAdviceIssue[];
  advisorBudget: BudgetCheck;
  executionBudget?: BudgetCheck;
  events: PlanAdviceEvent[];
};

export type PlanAdviceViewOptions = {
  includeProposal?: boolean;
  includePlan?: boolean;
  includeEvents?: boolean;
  maxEvents?: number;
};

export type PlanAdviceManagerOptions = {
  maxAdvice?: number;
};

export type PlanAdviceManagerStartInput = {
  prompt: string;
  inventory: AdvisorInventorySnapshot;
  inventoryCwd?: string;
  advisor: {
    adapter: HarnessAdapter;
    discovery: HarnessDiscovery;
  };
  advisorModel?: string;
  timeoutMs?: number;
  budget?: BudgetLimits;
};

export type PlanAdviceRevalidationContext = {
  prompt: string;
  inventoryCwd?: string;
  inventory: AdvisorInventorySnapshot;
};

type InternalPlanAdvice = {
  id: string;
  status: PlanAdviceStatus;
  prompt: string;
  inventoryCwd?: string;
  inventory: AdvisorInventorySnapshot;
  advisorTaskId: string;
  advisorScratchCwd: string;
  advisorHarnessId: string;
  advisorModel?: string;
  advisorTimeoutMs: number;
  budgetLimits?: BudgetLimits;
  advisorBudget: BudgetCheck;
  executionBudget?: BudgetCheck;
  proposal?: AdvisorPlanProposal;
  plan?: AdvisorExecutionPlan;
  planDigest?: string;
  consumedAtMs?: number;
  issues: PlanAdviceIssue[];
  createdAtMs: number;
  updatedAtMs: number;
  endedAtMs?: number;
  events: PlanAdviceEvent[];
  settled?: Promise<void>;
};

const DEFAULT_MAX_ADVICE = 100;
const DEFAULT_ADVISOR_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_EVENTS = 100;
const DEFAULT_SHUTDOWN_DEADLINE_MS = 5_000;

/**
 * Owns the one-task Plan Advisor lifecycle. It can compile and freeze a plan,
 * but it has no worker execution capability; execution remains a separate
 * EnnodiaCore operation guarded by the returned digest.
 */
export class PlanAdviceManager {
  private readonly advice = new Map<string, InternalPlanAdvice>();
  private readonly maxAdvice: number;
  private shuttingDown = false;
  private shutdownPromise?: Promise<void>;

  constructor(
    private readonly taskManager: TaskManager,
    options: PlanAdviceManagerOptions = {},
  ) {
    this.maxAdvice = Math.max(1, options.maxAdvice ?? DEFAULT_MAX_ADVICE);
  }

  start(input: PlanAdviceManagerStartInput): PlanAdviceView {
    if (this.shuttingDown) {
      throw new Error("PlanAdviceManager is shutting down.");
    }

    const advisorPrompt = buildPlanAdvisorPrompt(input.prompt, input.inventory);
    const advisorBudget = checkBudgetLimits(
      estimateTaskBatchBudget({
        tasks: [{
          prompt: advisorPrompt,
          harnessId: input.advisor.adapter.id,
        }],
        comparePlanned: false,
      }),
      input.budget,
    );
    assertBudgetWithinLimits(advisorBudget);

    // The Advisor receives the closed inventory snapshot, not the target
    // workspace. A fresh empty cwd also avoids accidentally inheriting the
    // MCP server process's project directory.
    const advisorScratchCwd = mkdtempSync(
      join(tmpdir(), "ennodia-plan-advisor-"),
    );
    let advisorTask: TaskView;
    try {
      advisorTask = this.taskManager.start(
        forceAdapterCwd(input.advisor.adapter, advisorScratchCwd),
        input.advisor.discovery,
        {
          prompt: advisorPrompt,
          cwd: advisorScratchCwd,
          model: input.advisorModel,
          timeoutMs: input.timeoutMs,
        },
      ).task;
    } catch (error) {
      rmSync(advisorScratchCwd, { recursive: true, force: true });
      throw error;
    }
    const now = Date.now();
    const record: InternalPlanAdvice = {
      id: randomUUID(),
      status: "advising",
      prompt: input.prompt,
      inventoryCwd: input.inventoryCwd,
      inventory: structuredClone(input.inventory),
      advisorTaskId: advisorTask.id,
      advisorScratchCwd,
      advisorHarnessId: input.advisor.adapter.id,
      advisorModel: input.advisorModel,
      advisorTimeoutMs: advisorTask.timeoutMs ??
        input.timeoutMs ?? DEFAULT_ADVISOR_TIMEOUT_MS,
      budgetLimits: input.budget ? { ...input.budget } : undefined,
      advisorBudget,
      issues: [],
      createdAtMs: now,
      updatedAtMs: now,
      events: [],
    };

    this.advice.set(record.id, record);
    this.prune(record.id);
    this.pushEvent(record, {
      type: "started",
      message: `Plan Advisor task started through ${advisorTask.harnessName}.`,
    });
    record.settled = this.run(record);
    void record.settled;

    return this.toView(record);
  }

  listViews(options: PlanAdviceViewOptions = {}): PlanAdviceView[] {
    return [...this.advice.values()]
      .sort((left, right) => right.createdAtMs - left.createdAtMs)
      .map((record) => this.toView(record, options));
  }

  get(
    id: string,
    options: PlanAdviceViewOptions = {},
  ): PlanAdviceView | undefined {
    const record = this.advice.get(id);
    return record ? this.toView(record, options) : undefined;
  }

  async waitForTerminal(
    id: string,
    timeoutMs?: number,
    options: PlanAdviceViewOptions = {},
  ): Promise<PlanAdviceView | undefined> {
    const record = this.advice.get(id);
    if (!record) {
      return undefined;
    }

    if (!isTerminal(record.status) && record.settled) {
      await settleWithDeadline(record.settled, timeoutMs);
    }

    return this.toView(record, options);
  }

  cancel(id: string): PlanAdviceView {
    const record = this.require(id);
    if (isTerminal(record.status)) {
      return this.toView(record);
    }

    record.status = "cancelled";
    record.endedAtMs = Date.now();
    this.taskManager.cancel(record.advisorTaskId);
    this.pushEvent(record, {
      type: "cancelled",
      message: "Plan advice cancelled.",
    });
    return this.toView(record);
  }

  getRevalidationContext(id: string): PlanAdviceRevalidationContext {
    const record = this.require(id);
    return {
      prompt: record.prompt,
      inventoryCwd: record.inventoryCwd,
      inventory: structuredClone(record.inventory),
    };
  }

  authorizeExecution(
    id: string,
    expectedPlanDigest: string,
    currentInventory: AdvisorInventorySnapshot,
    validate?: (plan: AdvisorExecutionPlan) => void,
  ): AdvisorExecutionPlan {
    const record = this.require(id);
    if (record.status === "consumed") {
      throw new Error(`Plan advice has already been executed: ${id}.`);
    }
    if (record.status !== "ready" || !record.proposal || !record.planDigest) {
      throw new Error(`Plan advice is not ready for execution: ${id}.`);
    }
    if (expectedPlanDigest !== record.planDigest) {
      throw new Error("Advised plan digest mismatch; no tasks were started.");
    }
    if (currentInventory.snapshotId !== record.inventory.snapshotId) {
      throw new Error(
        "Advisor inventory changed after the plan was proposed; request new advice before executing.",
      );
    }

    const compiled = compileAdvisorExecutionPlan(
      record.proposal,
      currentInventory,
    );
    if (!compiled.compiled) {
      throw new Error(
        `Advised plan no longer validates: ${
          compiled.issues.map((issue) => issue.message).join(" ")
        }`,
      );
    }
    const currentDigest = digestAdvisorExecutionPlan(compiled.plan);
    if (currentDigest !== record.planDigest) {
      throw new Error("Advised plan changed after approval; no tasks were started.");
    }

    // Keep this final state change after every caller-supplied validation. The
    // callback is synchronous, so no second authorization can interleave.
    validate?.(structuredClone(compiled.plan));
    record.status = "consumed";
    record.consumedAtMs = Date.now();
    record.endedAtMs = record.consumedAtMs;
    this.pushEvent(record, {
      type: "execution-authorized",
      message: "Validated plan authorized for one execution.",
    });

    return structuredClone(compiled.plan);
  }

  async shutdown(options: { deadlineMs?: number } = {}): Promise<void> {
    this.shuttingDown = true;
    this.shutdownPromise ??= this.performShutdown(
      options.deadlineMs ?? DEFAULT_SHUTDOWN_DEADLINE_MS,
    );
    await this.shutdownPromise;
  }

  private async run(record: InternalPlanAdvice): Promise<void> {
    try {
      const task = await this.taskManager.waitForTerminal(record.advisorTaskId);
      if (record.status === "cancelled") {
        return;
      }
      if (!task || task.status !== "succeeded") {
        this.fail(
          record,
          "advisor-failed",
          taskFailureMessage(task),
        );
        return;
      }
      this.pushEvent(record, {
        type: "advisor-succeeded",
        message: "Plan Advisor task succeeded; validating its response.",
      });

      const raw = (task.finalMessage ?? task.stdout).trim();
      const parsed = parseAdvisorPlanProposal(raw);
      if (!parsed.success) {
        this.invalidate(record, parsed.issues);
        return;
      }
      record.proposal = parsed.proposal;

      const compiled = compileAdvisorExecutionPlan(
        parsed.proposal,
        record.inventory,
      );
      if (!compiled.compiled) {
        this.invalidate(record, compiled.issues);
        return;
      }

      const executionBudget = checkBudgetLimits(
        estimateTaskBatchBudget({
          tasks: compiled.plan.slices.map((slice) => ({
            prompt: slice.prompt,
            harnessId: slice.harnessId,
          })),
          comparePlanned: false,
        }),
        record.budgetLimits,
      );
      record.executionBudget = executionBudget;
      if (executionBudget.exceeded) {
        this.invalidate(
          record,
          executionBudget.issues.map((message) => ({
            code: "execution-budget-exceeded" as const,
            path: ["plan", "budget"],
            message,
          })),
        );
        return;
      }

      record.plan = compiled.plan;
      record.planDigest = digestAdvisorExecutionPlan(compiled.plan);
      record.status = "ready";
      record.endedAtMs = Date.now();
      this.pushEvent(record, {
        type: "plan-ready",
        message: `Validated and froze ${compiled.plan.counts.sliceCount} plan slice(s).`,
      });
    } catch (error) {
      if (record.status !== "cancelled") {
        this.fail(record, "advisor-failed", errorMessage(error));
      }
    } finally {
      try {
        rmSync(record.advisorScratchCwd, { recursive: true, force: true });
      } catch (error) {
        this.pushEvent(record, {
          type: "cleanup-warning",
          message: `Could not remove Plan Advisor scratch directory: ${
            errorMessage(error)
          }`,
        });
      }
      record.updatedAtMs = Date.now();
      this.prune(record.id);
    }
  }

  private invalidate(
    record: InternalPlanAdvice,
    issues: PlanAdviceIssue[] | AdvisorPlanIssue[],
  ): void {
    record.status = "invalid";
    record.issues = issues.map((issue) => ({ ...issue }));
    record.endedAtMs = Date.now();
    this.pushEvent(record, {
      type: "plan-invalid",
      message: `Plan Advisor response was rejected with ${issues.length} issue(s).`,
    });
  }

  private fail(
    record: InternalPlanAdvice,
    code: "advisor-failed",
    message: string,
  ): void {
    record.status = "failed";
    record.issues = [{ code, path: ["advisorTask"], message }];
    record.endedAtMs = Date.now();
    this.pushEvent(record, { type: "failed", message });
  }

  private require(id: string): InternalPlanAdvice {
    const record = this.advice.get(id);
    if (!record) {
      throw new Error(`Unknown plan advice: ${id}`);
    }
    return record;
  }

  private toView(
    record: InternalPlanAdvice,
    options: PlanAdviceViewOptions = {},
  ): PlanAdviceView {
    const now = Date.now();
    const end = record.endedAtMs ?? now;
    const elapsedMs = Math.max(0, end - record.createdAtMs);
    const running = record.status === "advising";
    const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;

    return {
      id: record.id,
      status: record.status,
      promptPreview: preview(record.prompt),
      advisorTaskId: record.advisorTaskId,
      advisorHarnessId: record.advisorHarnessId,
      advisorModel: record.advisorModel,
      inventorySnapshotId: record.inventory.snapshotId,
      createdAt: new Date(record.createdAtMs).toISOString(),
      updatedAt: new Date(record.updatedAtMs).toISOString(),
      endedAt: record.endedAtMs
        ? new Date(record.endedAtMs).toISOString()
        : undefined,
      elapsedMs,
      remainingMs: running
        ? Math.max(0, record.advisorTimeoutMs - elapsedMs)
        : 0,
      etaConfidence: running ? "timeout-budget" : "complete",
      proposal: (options.includeProposal ?? true) && record.proposal
        ? structuredClone(record.proposal)
        : undefined,
      plan: (options.includePlan ?? true) && record.plan
        ? structuredClone(record.plan)
        : undefined,
      planDigest: record.planDigest,
      consumedAt: record.consumedAtMs
        ? new Date(record.consumedAtMs).toISOString()
        : undefined,
      issues: record.issues.map((issue) => ({ ...issue, path: [...issue.path] })),
      advisorBudget: structuredClone(record.advisorBudget),
      executionBudget: record.executionBudget
        ? structuredClone(record.executionBudget)
        : undefined,
      events: options.includeEvents ?? true
        ? tailItems(record.events, maxEvents).map((event) => ({ ...event }))
        : [],
    };
  }

  private pushEvent(
    record: InternalPlanAdvice,
    event: Omit<PlanAdviceEvent, "at">,
  ): void {
    record.events.push({ at: new Date().toISOString(), ...event });
    record.updatedAtMs = Date.now();
  }

  private prune(protectedId?: string): void {
    const overflow = this.advice.size - this.maxAdvice;
    if (overflow <= 0) {
      return;
    }

    const removable = [...this.advice.values()]
      .filter((record) =>
        record.id !== protectedId && isTerminal(record.status)
      )
      .sort((left, right) => left.createdAtMs - right.createdAtMs);
    for (const record of removable.slice(0, overflow)) {
      this.advice.delete(record.id);
    }
  }

  private async performShutdown(deadlineMs: number): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const record of this.advice.values()) {
      if (isTerminal(record.status)) {
        continue;
      }
      this.cancel(record.id);
      if (record.settled) {
        pending.push(settleWithDeadline(record.settled, deadlineMs));
      }
    }
    await Promise.allSettled(pending);
  }
}

function isTerminal(status: PlanAdviceStatus): boolean {
  return status !== "advising";
}

function taskFailureMessage(task: TaskView | undefined): string {
  if (!task) {
    return "Plan Advisor task disappeared before its result was collected.";
  }
  const detail = task.stderr.trim();
  return detail
    ? `Plan Advisor task ${task.status}: ${detail}`
    : `Plan Advisor task ${task.status}.`;
}

function forceAdapterCwd(
  adapter: HarnessAdapter,
  cwd: string,
): HarnessAdapter {
  const buildCommand = adapter.buildCommand;
  if (!buildCommand) {
    return adapter;
  }

  return {
    ...adapter,
    buildCommand: (commandPath, input) => ({
      ...buildCommand.call(adapter, commandPath, input),
      cwd,
    }),
  };
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
