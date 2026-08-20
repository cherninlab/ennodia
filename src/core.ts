import { createHash } from "node:crypto";
import type {
  AdvisorExecutionPlan,
  AdvisorInventorySnapshot,
} from "./advisor";
import {
  assertBudgetWithinLimits,
  checkBudgetLimits,
  estimateCompareBudget,
  estimateRunBudget,
  estimateTaskBatchBudget,
  type BudgetCheck,
  type BudgetLimits,
} from "./budget";
import {
  CompareManager,
  type CompareManagerOptions,
  type CompareStartInput,
  type CompareView,
  type CompareViewOptions,
  type ResolvedHarness,
} from "./compare";
import {
  assertUniqueSliceIds,
  compositionalSliceSummaries,
  estimateCompositionalBudget,
  resolveCompositionalSlices,
  summarizeCompositionalTasks,
  uniqueTaskIds,
  type CompositionalCompareNext,
  type CompositionalSliceInput,
  type CompositionalSliceSummary,
  type CompositionalStatusView,
  type ResolvedCompositionalSlice,
} from "./compositional";
import {
  discoverHarnesses as defaultDiscoverHarnesses,
  findHarnessAdapter as defaultFindHarnessAdapter,
  type HarnessAdapter,
  type HarnessDiscovery,
} from "./harnesses";
import {
  createDefaultHistorySink,
  noopHistorySink,
  type HistorySink,
  type RunHistoryListOptions,
  type RunHistorySnapshot,
} from "./history";
import type { RoutePlan } from "./planner";
import { planRoute as defaultPlanRoute } from "./planner";
import {
  DEFAULT_COMPARE_HARNESS_PRIORITY,
  type RouteCategory,
} from "./priority";
import {
  RunManager,
  selectHarnessIds,
  shouldPlanCompare,
  type DiscoverHarnesses,
  type FindHarnessAdapter,
  type PlanRoute,
  type RunCompareMode,
  type RunManagerOptions,
  type RunMode,
  type RunStartInput,
  type RunView,
  type RunViewOptions,
} from "./runs";
import {
  assertSkillsSupportHarnesses,
  discoverSkills,
  discoverSkillsWithWarnings,
  installBundledSkills,
  loadRunnableSkillsByIds,
  type InstallBundledSkillsInput,
  type InstallBundledSkillsResult,
  type Skill,
  type SkillDiscovery,
} from "./skills";
import {
  TaskManager,
  type TaskManagerOptions,
  type TaskManagerShutdownOptions,
  type TaskView,
  type TaskViewOptions,
} from "./tasks";
import {
  PlanAdviceManager,
  type PlanAdviceManagerOptions,
  type PlanAdviceView,
  type PlanAdviceViewOptions,
} from "./plan-advice";

export type EnnodiaCoreOptions = {
  discoverHarnesses?: DiscoverHarnesses;
  findHarnessAdapter?: FindHarnessAdapter;
  planRoute?: PlanRoute;
  taskManager?: TaskManager;
  compareManager?: CompareManager;
  runManager?: RunManager;
  planAdviceManager?: PlanAdviceManager;
  taskManagerOptions?: TaskManagerOptions;
  compareManagerOptions?: CompareManagerOptions;
  runManagerOptions?: RunManagerOptions;
  planAdviceManagerOptions?: PlanAdviceManagerOptions;
  historySink?: HistorySink;
};

export type EnnodiaCoreShutdownOptions = TaskManagerShutdownOptions;

export type RunEstimateInput = {
  prompt: string;
  category?: RouteCategory;
  harnessId?: string;
  mode?: RunMode;
  compare?: RunCompareMode;
  refresh?: boolean;
  maxOutputChars?: number;
  budget?: BudgetLimits;
};

export type RunEstimate = {
  plan: RoutePlan;
  selectedHarnessIds: string[];
  budget: BudgetCheck;
};

export type TaskBatchStartInput = {
  prompt: string;
  category?: RouteCategory;
  harnessId?: string;
  mode?: "single" | "parallel";
  cwd?: string;
  isolateCwd?: boolean;
  model?: string;
  timeoutMs?: number;
  refresh?: boolean;
  skillIds?: string[];
  budget?: BudgetLimits;
};

export type TaskBatchStart = {
  plan: RoutePlan;
  tasks: TaskView[];
  budget: BudgetCheck;
  /** Skills discoverable in cwd's native skill directories but not part of
   * skillIds. A harness may self-select these on its own initiative even
   * though this run didn't request them - see skillIds isolation caveat. */
  unrequestedSkillsPresent: string[];
};

export type CompositionalEstimateInput = {
  prompt: string;
  slices: CompositionalSliceInput[];
  cwd?: string;
  isolateCwd?: boolean;
  refresh?: boolean;
  skillIds?: string[];
  includeCompareEstimate?: boolean;
  maxOutputChars?: number;
  budget?: BudgetLimits;
};

export type CompositionalEstimate = {
  slices: CompositionalSliceSummary[];
  selectedHarnessIds: string[];
  budget: BudgetCheck;
};

export type CompositionalStartInput = CompositionalEstimateInput & {
  timeoutMs?: number;
};

export type CompositionalTaskStart = {
  sliceId: string;
  sliceTitle?: string;
  harnessId: string;
  routeCategory: RoutePlan["category"];
  task: TaskView;
};

export type CompositionalStart = {
  tasks: CompositionalTaskStart[];
  budget: BudgetCheck;
  compareNext: CompositionalCompareNext;
  unrequestedSkillsPresent: string[];
};

export type CompositionalStatusInput = {
  taskIds: string[];
  prompt?: string;
  minSuccessfulTasksForCompare?: number;
  includeOutput?: boolean;
  maxOutputChars?: number;
};

export type CompareStartWithBudgetInput = CompareStartInput & {
  budget?: BudgetLimits;
};

export type CompareStart = CompareView & {
  budget: BudgetCheck;
};

export type RunStartWithSkillIdsInput = RunStartInput & {
  skillIds?: string[];
};

export type PlanAdviceStartInput = {
  prompt: string;
  cwd?: string;
  refresh?: boolean;
  advisorHarnessId?: string;
  advisorModel?: string;
  /** Worker harnesses the Advisor may select. Defaults to every runnable
   * harness with a public Ennodia adapter. */
  allowedHarnessIds?: string[];
  /** Exact caller-approved model IDs per worker harness. Omitted harnesses may
   * still be selected, but only with their configured harness default. */
  allowedModels?: Record<string, string[]>;
  maxSlices?: number;
  maxSkillsPerSlice?: number;
  maxTotalSkillAssignments?: number;
  timeoutMs?: number;
  budget?: BudgetLimits;
};

export type AdvisedPlanStartInput = {
  adviceId: string;
  expectedPlanDigest: string;
  cwd?: string;
  isolateCwd?: boolean;
  timeoutMs?: number;
  budget?: BudgetLimits;
};

export type AdvisedPlanTaskStart = {
  sliceId: string;
  sliceTitle?: string;
  harnessId: string;
  model?: string;
  skillIds: string[];
  task: TaskView;
};

export type AdvisedPlanStart = {
  adviceId: string;
  planDigest: string;
  inventorySnapshotId: string;
  plan: AdvisorExecutionPlan;
  tasks: AdvisedPlanTaskStart[];
  budget: BudgetCheck;
  execution: {
    cwd?: string;
    isolateCwd: boolean;
    timeoutMs?: number;
  };
  unrequestedSkillsPresent: string[];
};

type AdvisorInventoryRuntime = {
  inventory: AdvisorInventorySnapshot;
  harnesses: ResolvedHarness[];
  skills: Skill[];
  projectNativeSkillIds: string[];
};

export class EnnodiaCore {
  readonly taskManager: TaskManager;
  readonly compareManager: CompareManager;
  readonly runManager: RunManager;
  readonly planAdviceManager: PlanAdviceManager;
  readonly discoverHarnesses: DiscoverHarnesses;
  readonly findHarnessAdapter: FindHarnessAdapter;
  readonly planRoute: PlanRoute;
  readonly historySink: HistorySink;

  constructor(options: EnnodiaCoreOptions = {}) {
    this.discoverHarnesses = options.discoverHarnesses ??
      defaultDiscoverHarnesses;
    this.findHarnessAdapter = options.findHarnessAdapter ??
      defaultFindHarnessAdapter;
    this.planRoute = options.planRoute ?? defaultPlanRoute;
    this.historySink = options.historySink ??
      options.runManagerOptions?.historySink ??
      noopHistorySink;
    this.taskManager = options.taskManager ??
      new TaskManager(options.taskManagerOptions);
    this.planAdviceManager = options.planAdviceManager ??
      new PlanAdviceManager(
        this.taskManager,
        options.planAdviceManagerOptions,
      );
    this.compareManager = options.compareManager ??
      new CompareManager(
        this.taskManager,
        (harnessId) => this.resolveRunnableHarness(harnessId),
        options.compareManagerOptions,
      );
    this.runManager = options.runManager ??
      new RunManager({
        taskManager: this.taskManager,
        compareManager: this.compareManager,
        discoverHarnesses: this.discoverHarnesses,
        findHarnessAdapter: this.findHarnessAdapter,
        planRoute: this.planRoute,
      }, { ...options.runManagerOptions, historySink: this.historySink });
  }

  async listHarnesses(options?: Parameters<DiscoverHarnesses>[0]): Promise<
    HarnessDiscovery[]
  > {
    return this.discoverHarnesses(options);
  }

  findAdapter(id: string): HarnessAdapter | undefined {
    return this.findHarnessAdapter(id);
  }

  listSkills(cwd?: string): Promise<SkillDiscovery> {
    return discoverSkillsWithWarnings(cwd);
  }

  installSkills(
    input: InstallBundledSkillsInput = {},
  ): Promise<InstallBundledSkillsResult> {
    return installBundledSkills(input);
  }

  async plan(
    prompt: string,
    options: Parameters<DiscoverHarnesses>[0] & { category?: RouteCategory } = {},
  ): Promise<RoutePlan> {
    const harnesses = await this.discoverHarnesses(options);
    return this.planRoute(prompt, harnesses, { category: options.category });
  }

  async startPlanAdvice(
    input: PlanAdviceStartInput,
  ): Promise<PlanAdviceView> {
    const { inventory } = await this.buildAdvisorInventory({
      cwd: input.cwd,
      refresh: input.refresh,
      allowedHarnessIds: input.allowedHarnessIds,
      allowedModels: input.allowedModels,
      maxSlices: Math.min(
        input.maxSlices ?? 8,
        input.budget?.maxChildTasks ?? Number.POSITIVE_INFINITY,
      ),
      maxSkillsPerSlice: input.maxSkillsPerSlice ?? 8,
      maxTotalSkillAssignments: input.maxTotalSkillAssignments ?? 32,
    });
    const advisor = await this.resolveRunnableHarness(input.advisorHarnessId);

    return this.planAdviceManager.start({
      prompt: input.prompt,
      inventory,
      inventoryCwd: input.cwd,
      advisor,
      advisorModel: input.advisorModel,
      timeoutMs: input.timeoutMs,
      budget: input.budget,
    });
  }

  listPlanAdvice(
    options: PlanAdviceViewOptions = {},
  ): PlanAdviceView[] {
    return this.planAdviceManager.listViews(options);
  }

  getPlanAdvice(
    id: string,
    options: PlanAdviceViewOptions = {},
  ): PlanAdviceView | undefined {
    return this.planAdviceManager.get(id, options);
  }

  waitForPlanAdvice(
    id: string,
    timeoutMs?: number,
    options: PlanAdviceViewOptions = {},
  ): Promise<PlanAdviceView | undefined> {
    return this.planAdviceManager.waitForTerminal(id, timeoutMs, options);
  }

  cancelPlanAdvice(id: string): PlanAdviceView {
    return this.planAdviceManager.cancel(id);
  }

  async startAdvisedPlan(
    input: AdvisedPlanStartInput,
  ): Promise<AdvisedPlanStart> {
    const context = this.planAdviceManager.getRevalidationContext(
      input.adviceId,
    );
    const executionCwd = input.cwd ?? context.inventoryCwd;
    const currentRuntime = await this.buildAdvisorInventory({
      cwd: executionCwd,
      refresh: true,
      allowedHarnessIds: context.inventory.harnesses.map((harness) =>
        harness.id
      ),
      allowedModels: Object.fromEntries(
        context.inventory.harnesses.map((harness) => [
          harness.id,
          harness.allowedModelIds,
        ]),
      ),
      ...context.inventory.limits,
    });
    let budget!: BudgetCheck;
    let resolved!: Array<{
      slice: AdvisorExecutionPlan["slices"][number];
      harness: ResolvedHarness;
      skills: Skill[];
    }>;
    let requestedSkillIds: string[] = [];
    const plan = this.planAdviceManager.authorizeExecution(
      input.adviceId,
      input.expectedPlanDigest,
      currentRuntime.inventory,
      (authorizedPlan) => {
        budget = checkBudgetLimits(
          estimateTaskBatchBudget({
            tasks: authorizedPlan.slices.map((slice) => ({
              prompt: slice.prompt,
              harnessId: slice.harnessId,
            })),
            comparePlanned: false,
          }),
          input.budget,
        );
        assertBudgetWithinLimits(budget);

        // Resolve and validate every harness/skill before launching the first
        // task. This preserves the zero-launch guarantee for deterministic
        // validation, inventory drift, digest, and budget failures.
        requestedSkillIds = [
          ...new Set(authorizedPlan.slices.flatMap((slice) => slice.skillIds)),
        ];
        const runtimeSkillsById = new Map(
          currentRuntime.skills.map((skill) => [skill.id, skill]),
        );
        const requestedSkills = requestedSkillIds.map((skillId) => {
          const skill = runtimeSkillsById.get(skillId);
          if (!skill) {
            throw new Error(
              `Skill not found in authorized inventory: ${skillId}`,
            );
          }
          return skill;
        });
        const skillsById = new Map(
          requestedSkills.map((skill) => [skill.id, skill]),
        );
        const harnessesById = new Map(
          currentRuntime.harnesses.map((harness) => [
            harness.discovery.id,
            harness,
          ]),
        );
        resolved = authorizedPlan.slices.map((slice) => {
          const harness = harnessesById.get(slice.harnessId);
          if (!harness) {
            throw new Error(
              `Harness not found in authorized inventory: ${slice.harnessId}`,
            );
          }
          const skills = slice.skillIds.map((skillId) => {
            const skill = skillsById.get(skillId);
            if (!skill) {
              throw new Error(`Skill not found after loading: ${skillId}`);
            }
            return skill;
          });
          if (skills.length > 0) {
            assertSkillsSupportHarnesses(skills, [slice.harnessId]);
          }
          return { slice, harness, skills };
        });
      },
    );

    const requestedIds = new Set(requestedSkillIds);
    const unrequestedSkillsPresent = currentRuntime.projectNativeSkillIds
      .filter((skillId) => !requestedIds.has(skillId));

    const tasks: AdvisedPlanTaskStart[] = [];
    try {
      for (const { slice, harness, skills } of resolved) {
        tasks.push({
          sliceId: slice.id,
          sliceTitle: slice.title,
          harnessId: slice.harnessId,
          model: slice.model,
          skillIds: [...slice.skillIds],
          task: this.taskManager.start(harness.adapter, harness.discovery, {
            prompt: slice.prompt,
            cwd: executionCwd,
            isolateCwd: input.isolateCwd,
            model: slice.model,
            timeoutMs: input.timeoutMs,
            skills,
          }).task,
        });
      }
    } catch (error) {
      for (const started of tasks) {
        this.taskManager.cancel(started.task.id);
      }
      throw error;
    }
    return {
      adviceId: input.adviceId,
      planDigest: input.expectedPlanDigest,
      inventorySnapshotId: currentRuntime.inventory.snapshotId,
      plan,
      tasks,
      budget,
      execution: {
        cwd: executionCwd,
        isolateCwd: input.isolateCwd ?? false,
        timeoutMs: input.timeoutMs,
      },
      unrequestedSkillsPresent,
    };
  }

  async resolveRunnableHarness(harnessId?: string): Promise<ResolvedHarness> {
    const harnesses = await this.discoverHarnesses();
    const preferredIds = harnessId
      ? [harnessId]
      : DEFAULT_COMPARE_HARNESS_PRIORITY;

    for (const id of preferredIds) {
      const adapter = this.findHarnessAdapter(id);
      const discovery = harnesses.find((harness) => harness.id === id);

      if (adapter?.buildCommand && discovery?.runnable) {
        return { adapter, discovery };
      }
    }

    throw new Error(
      harnessId
        ? `Harness is not runnable: ${harnessId}`
        : "No runnable harness was found for Compare.",
    );
  }

  async estimateRun(input: RunEstimateInput): Promise<RunEstimate> {
    const harnesses = await this.discoverHarnesses({ refresh: input.refresh });
    const plan = this.planRoute(input.prompt, harnesses, {
      category: input.category,
    });
    const selectedHarnessIds = selectHarnessIds(
      input.harnessId,
      input.mode ?? "auto",
      plan,
    );
    this.assertHarnessesRunnable(selectedHarnessIds, harnesses);
    const compareMode = input.compare ?? "auto";

    return {
      plan,
      selectedHarnessIds,
      budget: checkBudgetLimits(
        estimateRunBudget({
          prompt: input.prompt,
          selectedHarnessIds,
          comparePlanned: shouldPlanCompare(
            compareMode,
            plan.compareSuggested,
            selectedHarnessIds.length,
          ),
          maxOutputChars: input.maxOutputChars,
        }),
        input.budget,
      ),
    };
  }

  async startTasks(input: TaskBatchStartInput): Promise<TaskBatchStart> {
    const harnesses = await this.discoverHarnesses({ refresh: input.refresh });
    const plan = this.planRoute(input.prompt, harnesses, {
      category: input.category,
    });
    const selectedHarnessIds = selectHarnessIds(
      input.harnessId,
      input.mode ?? "single",
      plan,
    );

    if (selectedHarnessIds.length === 0) {
      throw new Error("No runnable harnesses were found.");
    }

    this.assertHarnessesRunnable(selectedHarnessIds, harnesses);
    const budget = checkBudgetLimits(
      estimateRunBudget({
        prompt: input.prompt,
        selectedHarnessIds,
        comparePlanned: false,
      }),
      input.budget,
    );
    assertBudgetWithinLimits(budget);

    const skills = await this.loadSkillsFor(
      selectedHarnessIds,
      input.skillIds,
      input.cwd,
    );
    const tasks = selectedHarnessIds.map((harnessId) => {
      const { adapter, discovery } = this.requireRunnableHarness(
        harnessId,
        harnesses,
      );

      return this.taskManager.start(adapter, discovery, {
        prompt: input.prompt,
        cwd: input.cwd,
        isolateCwd: input.isolateCwd,
        model: input.model,
        timeoutMs: input.timeoutMs,
        skills,
      }).task;
    });
    const unrequestedSkillsPresent = await this.findUnrequestedSkills(
      input.cwd,
      skills,
    );

    return { plan, tasks, budget, unrequestedSkillsPresent };
  }

  async estimateCompositional(
    input: CompositionalEstimateInput,
  ): Promise<CompositionalEstimate> {
    const { resolvedSlices, selectedHarnessIds } = await this
      .resolveCompositional(input);

    return {
      slices: compositionalSliceSummaries(resolvedSlices),
      selectedHarnessIds,
      budget: estimateCompositionalBudget(
        resolvedSlices,
        input.includeCompareEstimate ?? true,
        input.maxOutputChars,
        input.budget,
      ),
    };
  }

  async startCompositional(
    input: CompositionalStartInput,
  ): Promise<CompositionalStart> {
    const { harnesses, resolvedSlices, sliceSkills, requestedSkills } = await this
      .resolveCompositional(input);
    const budget = estimateCompositionalBudget(
      resolvedSlices,
      input.includeCompareEstimate ?? true,
      input.maxOutputChars,
      input.budget,
    );
    assertBudgetWithinLimits(budget);

    const tasks = resolvedSlices.map((slice, index) => {
      const { adapter, discovery } = this.requireRunnableHarness(
        slice.harnessId,
        harnesses,
      );

      return {
        sliceId: slice.id,
        sliceTitle: slice.title,
        harnessId: slice.harnessId,
        routeCategory: slice.plan.category,
        task: this.taskManager.start(adapter, discovery, {
          prompt: slice.prompt,
          cwd: input.cwd,
          isolateCwd: input.isolateCwd,
          model: slice.model,
          timeoutMs: input.timeoutMs,
          skills: sliceSkills[index] ?? [],
        }).task,
      };
    });
    const unrequestedSkillsPresent = await this.findUnrequestedSkills(
      input.cwd,
      requestedSkills,
    );

    return {
      tasks,
      budget,
      compareNext: {
        prompt: input.prompt,
        taskIds: tasks.map((item) => item.task.id),
        maxOutputChars: input.maxOutputChars,
      },
      unrequestedSkillsPresent,
    };
  }

  getCompositionalStatus(
    input: CompositionalStatusInput,
  ): CompositionalStatusView {
    const requestedTaskIds = uniqueTaskIds(input.taskIds);
    const tasks = requestedTaskIds
      .map((taskId) =>
        this.taskManager.get(taskId, {
          includeOutput: input.includeOutput,
          includeEvents: false,
          maxOutputChars: input.maxOutputChars,
        })
      )
      .filter((task): task is TaskView => task !== undefined);

    return summarizeCompositionalTasks({
      requestedTaskIds,
      tasks,
      prompt: input.prompt,
      minSuccessfulTasksForCompare: input.minSuccessfulTasksForCompare,
      includeOutput: input.includeOutput,
      maxOutputChars: input.maxOutputChars,
    });
  }

  async startRun(input: RunStartWithSkillIdsInput): Promise<RunView> {
    const { skillIds, ...runInput } = input;
    const skills = runInput.skills ??
      (skillIds?.length
        ? await loadRunnableSkillsByIds(skillIds, runInput.cwd)
        : undefined);

    const view = await this.runManager.start({ ...runInput, skills });
    const unrequestedSkillsPresent = await this.findUnrequestedSkills(
      runInput.cwd,
      skills ?? [],
    );

    return { ...view, unrequestedSkillsPresent };
  }

  listRuns(options: RunViewOptions = {}): RunView[] {
    return this.runManager.listViews(options);
  }

  listRunHistory(
    options: RunHistoryListOptions = {},
  ): Promise<RunHistorySnapshot[]> | RunHistorySnapshot[] {
    return this.runManager.listHistory(options);
  }

  getRun(id: string, options: RunViewOptions = {}): RunView | undefined {
    return this.runManager.get(id, options);
  }

  waitForRun(
    id: string,
    timeoutMs?: number,
    options: RunViewOptions = {},
  ): Promise<RunView | undefined> {
    return this.runManager.waitForTerminal(id, timeoutMs, options);
  }

  cancelRun(id: string): RunView {
    return this.runManager.cancel(id);
  }

  async startCompare(input: CompareStartWithBudgetInput): Promise<CompareStart> {
    const {
      budget: budgetLimits,
      advisorHarnessId: preferredAdvisorHarnessId,
      advisorModel: preferredAdvisorModel,
      synthesizerHarnessId,
      synthesizerModel,
      ...compareInput
    } = input;
    const advisorHarnessId = resolvePreferredAlias(
      "advisorHarnessId",
      preferredAdvisorHarnessId,
      "synthesizerHarnessId",
      synthesizerHarnessId,
    );
    const advisorModel = resolvePreferredAlias(
      "advisorModel",
      preferredAdvisorModel,
      "synthesizerModel",
      synthesizerModel,
    );
    const judgeHarness = await this.resolveRunnableHarness(
      compareInput.judgeHarnessId,
    );
    const advisorHarness = advisorHarnessId
      ? await this.resolveRunnableHarness(advisorHarnessId)
      : judgeHarness;
    const budget = checkBudgetLimits(
      estimateCompareBudget({
        prompt: compareInput.prompt,
        taskCandidateCount: compareInput.taskIds?.length ?? 0,
        responseCandidateChars: (compareInput.responses ?? []).reduce(
          (total, response) => total + response.text.length,
          0,
        ),
        judgeHarnessId: judgeHarness.adapter.id,
        advisorHarnessId: advisorHarness.adapter.id,
        maxOutputChars: compareInput.maxOutputChars,
      }),
      budgetLimits,
    );
    assertBudgetWithinLimits(budget);

    const compare = await this.compareManager.start({
      ...compareInput,
      judgeHarnessId: judgeHarness.adapter.id,
      advisorHarnessId: advisorHarness.adapter.id,
      advisorModel,
    });

    return { ...compare, budget };
  }

  listCompares(options: CompareViewOptions = {}): CompareView[] {
    return this.compareManager.listViews(options);
  }

  getCompare(id: string, options: CompareViewOptions = {}): CompareView | undefined {
    return this.compareManager.get(id, options);
  }

  cancelCompare(id: string): CompareView {
    return this.compareManager.cancel(id);
  }

  listTasks(options: TaskViewOptions = {}): TaskView[] {
    return this.taskManager.listViews(options);
  }

  getTask(id: string, options: TaskViewOptions = {}): TaskView | undefined {
    return this.taskManager.get(id, options);
  }

  cancelTask(id: string): TaskView {
    return this.taskManager.cancel(id);
  }

  async shutdown(options: EnnodiaCoreShutdownOptions = {}): Promise<void> {
    await this.runManager.shutdown(options);
    await this.compareManager.shutdown(options);
    await this.planAdviceManager.shutdown(options);
    await this.taskManager.shutdown(options);
  }

  private async buildAdvisorInventory(input: {
    cwd?: string;
    refresh?: boolean;
    allowedHarnessIds?: string[];
    allowedModels?: Record<string, string[]>;
    maxSlices: number;
    maxSkillsPerSlice: number;
    maxTotalSkillAssignments: number;
  }): Promise<AdvisorInventoryRuntime> {
    const discoveredHarnesses = await this.discoverHarnesses({
      refresh: input.refresh,
    });
    const requestedHarnessIds = input.allowedHarnessIds
      ? [...new Set(input.allowedHarnessIds)]
      : discoveredHarnesses
        .filter((harness) =>
          harness.runnable && Boolean(this.findHarnessAdapter(harness.id)?.buildCommand)
        )
        .map((harness) => harness.id);

    if (requestedHarnessIds.length === 0) {
      throw new Error("Plan Advisor needs at least one runnable worker harness.");
    }
    this.assertHarnessesRunnable(requestedHarnessIds, discoveredHarnesses);

    const outsideInventory = Object.keys(input.allowedModels ?? {}).filter(
      (harnessId) => !requestedHarnessIds.includes(harnessId),
    );
    if (outsideInventory.length > 0) {
      throw new Error(
        `Model allowlist references a harness outside allowedHarnessIds: ${
          outsideInventory.join(", ")
        }`,
      );
    }

    const selectedHarnesses = requestedHarnessIds
      .map((harnessId) =>
        this.requireRunnableHarness(harnessId, discoveredHarnesses)
      )
      .sort((left, right) =>
        left.discovery.id.localeCompare(right.discovery.id)
      );
    const inventoryHarnesses = selectedHarnesses.map(({ discovery }) => ({
      id: discovery.id,
      name: discovery.name,
      runnable: true,
      capabilities: [...new Set(discovery.capabilities)].sort(),
      allowedModelIds: [
        ...new Set(input.allowedModels?.[discovery.id] ?? []),
      ].sort(),
    }));
    const harnessIds = new Set(inventoryHarnesses.map((harness) => harness.id));
    const discoveredSkills = await discoverSkills(input.cwd);
    const inventorySkills = discoveredSkills
      .filter((skill) => skill.native)
      .map((skill) => {
        // A same-content legacy installation can merge into a native skill.
        // It must not turn that skill into a wildcard: only native
        // installations can make a skill available to a harness here.
        const supportedHarnessIds = skill.installations
          .filter((installation) => installation.native)
          .flatMap((installation) => installation.harnessIds)
          .filter((harnessId) =>
            harnessIds.has(harnessId) && skill.harnessIds.includes(harnessId)
          );
        return {
          skill,
          supportedHarnessIds: [...new Set(supportedHarnessIds)].sort(),
        };
      })
      .filter((entry) => entry.supportedHarnessIds.length > 0)
      .sort((left, right) => left.skill.id.localeCompare(right.skill.id));
    const limits = {
      maxSlices: input.maxSlices,
      maxSkillsPerSlice: input.maxSkillsPerSlice,
      maxTotalSkillAssignments: input.maxTotalSkillAssignments,
    };
    const snapshotBody = {
      schemaVersion: 1 as const,
      harnesses: inventoryHarnesses,
      skills: inventorySkills.map(({ skill, supportedHarnessIds }) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        harnessIds: supportedHarnessIds,
      })),
      limits,
    };
    const fingerprintMaterial = {
      ...snapshotBody,
      harnessRuntime: selectedHarnesses.map(({ discovery }) => ({
        id: discovery.id,
        commandPath: discovery.commandPath,
        version: discovery.version,
      })),
      skillRuntime: inventorySkills.map(({ skill, supportedHarnessIds }) => ({
        id: skill.id,
        version: skill.version,
        hash: skill.hash,
        native: skill.native,
        harnessIds: supportedHarnessIds,
      })),
    };

    return {
      inventory: {
        ...snapshotBody,
        snapshotId: `sha256:${
          createHash("sha256").update(stableJson(fingerprintMaterial)).digest("hex")
        }`,
      },
      harnesses: selectedHarnesses,
      skills: inventorySkills.map(({ skill }) => skill),
      projectNativeSkillIds: discoveredSkills
        .filter((skill) =>
          skill.native && skill.installations.some((installation) =>
            installation.scope === "project" && installation.native
          )
        )
        .map((skill) => skill.id),
    };
  }

  private async resolveCompositional(input: CompositionalEstimateInput): Promise<{
    harnesses: HarnessDiscovery[];
    resolvedSlices: ResolvedCompositionalSlice[];
    selectedHarnessIds: string[];
    sliceSkills: Skill[][];
    requestedSkills: Skill[];
  }> {
    assertUniqueSliceIds(input.slices);
    const harnesses = await this.discoverHarnesses({ refresh: input.refresh });
    const resolvedSlices = resolveCompositionalSlices(
      input.prompt,
      input.slices,
      harnesses,
      this.planRoute,
      input.skillIds,
    );
    const selectedHarnessIds = resolvedSlices.map((slice) => slice.harnessId);
    this.assertHarnessesRunnable(selectedHarnessIds, harnesses);
    const requestedSkillIds = [
      ...new Set(resolvedSlices.flatMap((slice) => slice.skillIds)),
    ];
    const requestedSkills = requestedSkillIds.length
      ? await loadRunnableSkillsByIds(requestedSkillIds, input.cwd)
      : [];
    const skillsById = new Map(
      requestedSkills.map((skill) => [skill.id, skill]),
    );
    const sliceSkills = resolvedSlices.map((slice) => {
      const skills = slice.skillIds.map((skillId) => {
        const skill = skillsById.get(skillId);
        if (!skill) {
          throw new Error(`Skill not found after loading: ${skillId}`);
        }
        return skill;
      });

      if (skills.length > 0) {
        assertSkillsSupportHarnesses(skills, [slice.harnessId]);
      }

      return skills;
    });

    return {
      harnesses,
      resolvedSlices,
      selectedHarnessIds,
      sliceSkills,
      requestedSkills,
    };
  }

  private async loadSkillsFor(
    harnessIds: string[],
    skillIds?: string[],
    cwd?: string,
  ): Promise<Skill[]> {
    const skills = skillIds?.length
      ? await loadRunnableSkillsByIds(skillIds, cwd)
      : [];

    if (skills.length > 0) {
      assertSkillsSupportHarnesses(skills, harnessIds);
    }

    return skills;
  }

  /**
   * Skills discoverable in cwd's native skill directories that were not part
   * of this run's requested skills. A harness's own skill mechanism can pick
   * these up on its own initiative (observed: Codex reading and applying an
   * unrequested skill file purely because it existed on disk), independent
   * of what Ennodia told it to use via skillIds. This does not prevent that;
   * it only makes the exposure visible to the caller.
   */
  private async findUnrequestedSkills(
    cwd: string | undefined,
    requestedSkills: Skill[],
  ): Promise<string[]> {
    if (!cwd) {
      return [];
    }

    const requestedIds = new Set(requestedSkills.map((skill) => skill.id));
    const discovery = await discoverSkillsWithWarnings(cwd);

    return discovery.skills
      .filter((skill) =>
        skill.installations.some((installation) =>
          installation.scope === "project" && installation.native
        )
      )
      .map((skill) => skill.id)
      .filter((id) => !requestedIds.has(id));
  }

  private requireRunnableHarness(
    harnessId: string,
    harnesses: HarnessDiscovery[],
  ): ResolvedHarness {
    const adapter = this.findHarnessAdapter(harnessId);
    const discovery = harnesses.find((harness) => harness.id === harnessId);

    if (!adapter || !discovery) {
      throw new Error(`Unknown harness: ${harnessId}`);
    }

    if (!discovery.runnable) {
      throw new Error(`Harness is not runnable: ${harnessId}`);
    }

    return { adapter, discovery };
  }

  private assertHarnessesRunnable(
    harnessIds: string[],
    harnesses: HarnessDiscovery[],
  ): void {
    for (const harnessId of harnessIds) {
      this.requireRunnableHarness(harnessId, harnesses);
    }
  }
}

export function createDefaultEnnodiaCore(
  options: EnnodiaCoreOptions = {},
): EnnodiaCore {
  return new EnnodiaCore({
    ...options,
    historySink: options.historySink ??
      options.runManagerOptions?.historySink ??
      createDefaultHistorySink(),
  });
}

function resolvePreferredAlias(
  preferredName: string,
  preferredValue: string | undefined,
  legacyName: string,
  legacyValue: string | undefined,
): string | undefined {
  if (
    preferredValue !== undefined &&
    legacyValue !== undefined &&
    preferredValue !== legacyValue
  ) {
    throw new Error(
      `Conflicting Compare fields: ${preferredName} and deprecated ${legacyName}.`,
    );
  }
  return preferredValue ?? legacyValue;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
        .join(",")
    }}`;
  }
  return JSON.stringify(value);
}
