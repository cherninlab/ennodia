import { MAX_PROMPT_CANDIDATE_CHARS } from "./compare";

export type BudgetLimits = {
  maxEstimatedInputTokens?: number;
  maxChildTasks?: number;
};

export type BudgetSubscriptionLimitCheck = {
  harnessId: string;
  status: "known" | "unknown";
  message: string;
};

export type BudgetEstimate = {
  selectedHarnessCount: number;
  selectedHarnessIds: string[];
  comparePlanned: boolean;
  maxOutputCharsPerCandidate: number;
  estimatedPromptTokensPerTask: number;
  estimatedChildTaskInputTokens: number;
  estimatedCompareInputTokens: number;
  estimatedTotalInputTokens: number;
  tokenEstimateRatio: string;
  assumptions: string[];
  subscriptionLimitChecks: BudgetSubscriptionLimitCheck[];
};

export type BudgetCheck = {
  estimate: BudgetEstimate;
  limits?: BudgetLimits;
  exceeded: boolean;
  issues: string[];
};

export type EstimateRunBudgetInput = {
  prompt: string;
  selectedHarnessIds: string[];
  comparePlanned: boolean;
  maxOutputChars?: number;
};

export type EstimateTaskBatchBudgetInput = {
  tasks: {
    prompt: string;
    harnessId: string;
  }[];
  comparePlanned: boolean;
  maxOutputChars?: number;
};

export type EstimateCompareBudgetInput = {
  prompt: string;
  taskCandidateCount: number;
  responseCandidateChars: number;
  judgeHarnessId?: string;
  synthesizerHarnessId?: string;
  maxOutputChars?: number;
};

const CHARS_PER_TOKEN = 4;
export const DEFAULT_COMPARE_MAX_OUTPUT_CHARS = 80_000;
const COMPARE_JUDGE_OVERHEAD_CHARS = 2_400;
const COMPARE_SYNTHESIZER_OVERHEAD_CHARS = 1_600;
const NATIVE_SKILL_PROMPT_OVERHEAD_CHARS = 220;

export function estimateRunBudget(
  input: EstimateRunBudgetInput,
): BudgetEstimate {
  const selectedHarnessIds = [...new Set(input.selectedHarnessIds)];
  const selectedHarnessCount = selectedHarnessIds.length;
  const maxOutputCharsPerCandidate = compareCandidateChars(input.maxOutputChars);
  const estimatedPromptTokensPerTask = estimateTokensFromChars(
    input.prompt.length + NATIVE_SKILL_PROMPT_OVERHEAD_CHARS,
  );
  const estimatedChildTaskInputTokens =
    estimatedPromptTokensPerTask * selectedHarnessCount;
  const estimatedCompareInputTokens = input.comparePlanned
    ? estimateCompareInputTokens({
      promptChars: input.prompt.length,
      candidateChars: selectedHarnessCount * maxOutputCharsPerCandidate,
    })
    : 0;

  return {
    selectedHarnessCount,
    selectedHarnessIds,
    comparePlanned: input.comparePlanned,
    maxOutputCharsPerCandidate,
    estimatedPromptTokensPerTask,
    estimatedChildTaskInputTokens,
    estimatedCompareInputTokens,
    estimatedTotalInputTokens:
      estimatedChildTaskInputTokens + estimatedCompareInputTokens,
    tokenEstimateRatio: `1 token ~= ${CHARS_PER_TOKEN} characters`,
    assumptions: [
      "Budgeting is a preflight input-token estimate, not a provider bill.",
      "Child-task estimates include the user prompt and Ennodia skill pointer only; harness system prompts, file reads, tool calls, and provider-side context are excluded and can make real usage higher.",
      "Output tokens, tool calls, cache behavior, and provider pricing are not known before a run starts.",
      `Compare estimates cap each task candidate at ${MAX_PROMPT_CANDIDATE_CHARS} characters because that is the judge prompt truncation bound.`,
      "Subscription quota checks use supported CLI/API surfaces only; Ennodia does not inspect private account pages or provider-private APIs.",
    ],
    subscriptionLimitChecks: selectedHarnessIds.map(subscriptionLimitCheck),
  };
}

export function estimateTaskBatchBudget(
  input: EstimateTaskBatchBudgetInput,
): BudgetEstimate {
  const tasks = input.tasks;
  const selectedHarnessIds = tasks.map((task) => task.harnessId);
  const selectedHarnessCount = selectedHarnessIds.length;
  const uniqueHarnessIds = [...new Set(selectedHarnessIds)];
  const maxOutputCharsPerCandidate = compareCandidateChars(input.maxOutputChars);
  const perTaskTokenEstimates = tasks.map((task) =>
    estimateTokensFromChars(task.prompt.length + NATIVE_SKILL_PROMPT_OVERHEAD_CHARS)
  );
  const estimatedChildTaskInputTokens = perTaskTokenEstimates.reduce(
    (total, tokens) => total + tokens,
    0,
  );
  const estimatedPromptTokensPerTask = selectedHarnessCount === 0
    ? 0
    : Math.ceil(estimatedChildTaskInputTokens / selectedHarnessCount);
  const estimatedCompareInputTokens = input.comparePlanned
    ? estimateCompareInputTokens({
      promptChars: tasks.reduce((total, task) => total + task.prompt.length, 0),
      candidateChars: selectedHarnessCount * maxOutputCharsPerCandidate,
    })
    : 0;

  return {
    selectedHarnessCount,
    selectedHarnessIds,
    comparePlanned: input.comparePlanned,
    maxOutputCharsPerCandidate,
    estimatedPromptTokensPerTask,
    estimatedChildTaskInputTokens,
    estimatedCompareInputTokens,
    estimatedTotalInputTokens:
      estimatedChildTaskInputTokens + estimatedCompareInputTokens,
    tokenEstimateRatio: `1 token ~= ${CHARS_PER_TOKEN} characters`,
    assumptions: [
      "Budgeting is a preflight input-token estimate, not a provider bill.",
      "Task-batch estimates count one child task per resolved slice and harness.",
      "estimatedPromptTokensPerTask is the average across slices because slice prompts can differ.",
      "Child-task estimates include slice prompts and Ennodia skill pointers only; harness system prompts, file reads, tool calls, and provider-side context are excluded and can make real usage higher.",
      "Output tokens, tool calls, cache behavior, and provider pricing are not known before a run starts.",
      `Compare estimates cap each task candidate at ${MAX_PROMPT_CANDIDATE_CHARS} characters because that is the judge prompt truncation bound.`,
      "Subscription quota checks use supported CLI/API surfaces only; Ennodia does not inspect private account pages or provider-private APIs.",
    ],
    subscriptionLimitChecks: uniqueHarnessIds.map(subscriptionLimitCheck),
  };
}

export function estimateCompareBudget(
  input: EstimateCompareBudgetInput,
): BudgetEstimate {
  const maxOutputCharsPerCandidate = compareCandidateChars(input.maxOutputChars);
  const selectedHarnessIds = [
    ...new Set(
      [input.judgeHarnessId, input.synthesizerHarnessId ?? input.judgeHarnessId]
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const compareTaskCount = 2;
  const taskCandidateChars = input.taskCandidateCount *
    maxOutputCharsPerCandidate;
  const responseCandidateChars = Math.max(0, input.responseCandidateChars);
  const candidateChars = taskCandidateChars + responseCandidateChars;
  const estimatedCompareInputTokens = estimateCompareInputTokens({
    promptChars: input.prompt.length,
    candidateChars,
  });

  return {
    selectedHarnessCount: compareTaskCount,
    selectedHarnessIds,
    comparePlanned: true,
    maxOutputCharsPerCandidate,
    estimatedPromptTokensPerTask: 0,
    estimatedChildTaskInputTokens: 0,
    estimatedCompareInputTokens,
    estimatedTotalInputTokens: estimatedCompareInputTokens,
    tokenEstimateRatio: `1 token ~= ${CHARS_PER_TOKEN} characters`,
    assumptions: [
      "Budgeting is a preflight input-token estimate, not a provider bill.",
      "Direct Compare starts a judge task and a synthesizer task.",
      `Task candidates are estimated at the lower of maxOutputChars and ${MAX_PROMPT_CANDIDATE_CHARS} characters; direct response candidates use their provided text length.`,
      "Output tokens, tool calls, cache behavior, and provider pricing are not known before a run starts.",
      "Subscription quota checks use supported CLI/API surfaces only; Ennodia does not inspect private account pages or provider-private APIs.",
    ],
    subscriptionLimitChecks: selectedHarnessIds.map(subscriptionLimitCheck),
  };
}

export function assertBudgetWithinLimits(budget: BudgetCheck): void {
  if (budget.exceeded) {
    throw new Error(`Budget limit exceeded: ${budget.issues.join(" ")}`);
  }
}

export function checkBudgetLimits(
  estimate: BudgetEstimate,
  limits?: BudgetLimits,
): BudgetCheck {
  const issues: string[] = [];

  if (
    limits?.maxChildTasks !== undefined &&
    estimate.selectedHarnessCount > limits.maxChildTasks
  ) {
    issues.push(
      `Selected ${estimate.selectedHarnessCount} child task(s), above maxChildTasks ${limits.maxChildTasks}.`,
    );
  }

  if (
    limits?.maxEstimatedInputTokens !== undefined &&
    estimate.estimatedTotalInputTokens > limits.maxEstimatedInputTokens
  ) {
    issues.push(
      `Estimated ${estimate.estimatedTotalInputTokens} input token(s), above maxEstimatedInputTokens ${limits.maxEstimatedInputTokens}.`,
    );
  }

  return {
    estimate,
    limits,
    exceeded: issues.length > 0,
    issues,
  };
}

function estimateCompareInputTokens(input: {
  promptChars: number;
  candidateChars: number;
}): number {
  const judgeChars =
    input.promptChars + input.candidateChars + COMPARE_JUDGE_OVERHEAD_CHARS;
  const synthesizerChars =
    input.promptChars + input.candidateChars + COMPARE_SYNTHESIZER_OVERHEAD_CHARS;

  return estimateTokensFromChars(judgeChars) +
    estimateTokensFromChars(synthesizerChars);
}

function estimateTokensFromChars(chars: number): number {
  if (chars <= 0) {
    return 0;
  }

  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function compareCandidateChars(maxOutputChars: number | undefined): number {
  return Math.min(
    maxOutputChars ?? DEFAULT_COMPARE_MAX_OUTPUT_CHARS,
    MAX_PROMPT_CANDIDATE_CHARS,
  );
}

function subscriptionLimitCheck(harnessId: string): BudgetSubscriptionLimitCheck {
  switch (harnessId) {
    case "claude-code":
      return {
        harnessId,
        status: "unknown",
        message:
          "Claude Code exposes per-run budget controls, but Ennodia does not read account subscription quota through a supported local surface yet.",
      };
    case "opencode":
      return {
        harnessId,
        status: "unknown",
        message:
          "OpenCode can report usage statistics, but Ennodia does not infer subscription quota from provider-private account state.",
      };
    case "antigravity":
      return {
        harnessId,
        status: "unknown",
        message:
          "Antigravity exposes installed model choices, but no supported local quota surface is implemented in Ennodia yet.",
      };
    default:
      return {
        harnessId,
        status: "unknown",
        message:
          "No supported local subscription-limit check is implemented for this harness yet.",
      };
  }
}
