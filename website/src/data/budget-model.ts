// Browser copy of the preflight estimate in src/budget.ts, for prompts without
// media. budget-model.test.ts keeps both in agreement.

const CHARS_PER_TOKEN = 4;
const CANDIDATE_CAP_CHARS = 24_000;
const JUDGE_OVERHEAD_CHARS = 2_400;
const ADVISOR_OVERHEAD_CHARS = 1_600;
const SKILL_POINTER_CHARS = 220;
const EXECUTION_NOTICE_CHARS = 1_600;

export type BudgetInput = {
  promptChars: number;
  workers: number;
  compare: boolean;
};

export type BudgetStages = {
  workers: number;
  judge: number;
  advisor: number;
  total: number;
  candidateCapChars: number;
};

const tokens = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

export function estimateStages({ promptChars, workers, compare }: BudgetInput): BudgetStages {
  const workerTokens = workers * tokens(promptChars + SKILL_POINTER_CHARS + EXECUTION_NOTICE_CHARS);
  const candidateChars = workers * CANDIDATE_CAP_CHARS;
  const judge = compare ? tokens(promptChars + candidateChars + JUDGE_OVERHEAD_CHARS + EXECUTION_NOTICE_CHARS) : 0;
  const advisor = compare ? tokens(promptChars + candidateChars + ADVISOR_OVERHEAD_CHARS + EXECUTION_NOTICE_CHARS) : 0;
  return {
    workers: workerTokens,
    judge,
    advisor,
    total: workerTokens + judge + advisor,
    candidateCapChars: CANDIDATE_CAP_CHARS,
  };
}
