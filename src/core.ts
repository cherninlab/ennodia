import {
  assertBudgetWithinLimits,
  checkBudgetLimits,
  estimateCompareBudget,
  estimateRunBudget,
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

export type EnnodiaCoreOptions = {
  discoverHarnesses?: DiscoverHarnesses;
  findHarnessAdapter?: FindHarnessAdapter;
  planRoute?: PlanRoute;
  taskManager?: TaskManager;
  compareManager?: CompareManager;
  runManager?: RunManager;
  taskManagerOptions?: TaskManagerOptions;
  compareManagerOptions?: CompareManagerOptions;
  runManagerOptions?: RunManagerOptions;
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

export class EnnodiaCore {
  readonly taskManager: TaskManager;
  readonly compareManager: CompareManager;
  readonly runManager: RunManager;
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
    const { harnesses, resolvedSlices, skills } = await this
      .resolveCompositional(input);
    const budget = estimateCompositionalBudget(
      resolvedSlices,
      input.includeCompareEstimate ?? true,
      input.maxOutputChars,
      input.budget,
    );
    assertBudgetWithinLimits(budget);

    const tasks = resolvedSlices.map((slice) => {
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
          skills,
        }).task,
      };
    });
    const unrequestedSkillsPresent = await this.findUnrequestedSkills(
      input.cwd,
      skills,
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
    const { budget: budgetLimits, ...compareInput } = input;
    const judgeHarness = await this.resolveRunnableHarness(
      compareInput.judgeHarnessId,
    );
    const synthesizerHarness = compareInput.synthesizerHarnessId
      ? await this.resolveRunnableHarness(compareInput.synthesizerHarnessId)
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
        synthesizerHarnessId: synthesizerHarness.adapter.id,
        maxOutputChars: compareInput.maxOutputChars,
      }),
      budgetLimits,
    );
    assertBudgetWithinLimits(budget);

    const compare = await this.compareManager.start({
      ...compareInput,
      judgeHarnessId: judgeHarness.adapter.id,
      synthesizerHarnessId: synthesizerHarness.adapter.id,
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
    await this.taskManager.shutdown(options);
  }

  private async resolveCompositional(input: CompositionalEstimateInput): Promise<{
    harnesses: HarnessDiscovery[];
    resolvedSlices: ResolvedCompositionalSlice[];
    selectedHarnessIds: string[];
    skills: Skill[];
  }> {
    assertUniqueSliceIds(input.slices);
    const harnesses = await this.discoverHarnesses({ refresh: input.refresh });
    const resolvedSlices = resolveCompositionalSlices(
      input.prompt,
      input.slices,
      harnesses,
      this.planRoute,
    );
    const selectedHarnessIds = resolvedSlices.map((slice) => slice.harnessId);
    this.assertHarnessesRunnable(selectedHarnessIds, harnesses);
    const skills = await this.loadSkillsFor(
      selectedHarnessIds,
      input.skillIds,
      input.cwd,
    );

    return { harnesses, resolvedSlices, selectedHarnessIds, skills };
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
