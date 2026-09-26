import type { AgentId } from "./agents";

// Public leaderboards and model docs, read at the source on the date below.
// Only values read there are listed. `through` names the agent the leader
// is reachable through, which is what makes the row matter to Ennodia.

export const leadersReadOn = "September 26, 2026";

export type Source = { label: string; href: string };

export type Leader = {
  capability: string;
  leader: string;
  through: AgentId;
  throughLabel: string;
  value: string;
  unit?: string;
  detail: string;
  sources: Source[];
};

export const leaders: Leader[] = [
  {
    capability: "Coding agents",
    leader: "Opus 5.5",
    through: "claude",
    throughLabel: "Claude Code",
    value: "66",
    unit: "index",
    detail: "Codex with GPT-6 Astra scores 62. Antigravity with Gemini 3.8 Flash scores 42, at under a fifth of the cost per task.",
    sources: [{ label: "Artificial Analysis Coding Agent Index v1.5", href: "https://artificialanalysis.ai/agents/coding-agents" }],
  },
  {
    capability: "Long documents",
    leader: "Kimi K3",
    through: "opencode",
    throughLabel: "OpenCode",
    value: "88.7%",
    detail: "Step 5 Preview scores 88.3%, and MiMo-V2.6-Pro 86.3%.",
    sources: [{ label: "Artificial Analysis AA-LCR v1.1", href: "https://artificialanalysis.ai/evaluations/artificial-analysis-long-context-reasoning" }],
  },
  {
    capability: "Image generation",
    leader: "GPT Image 2.5",
    through: "codex",
    throughLabel: "Codex",
    value: "1,196",
    unit: "Elo",
    detail: "OpenAI holds the top three places. The best Google model, Nano Banana 2, scores 1,123.",
    sources: [{ label: "Artificial Analysis text-to-image arena", href: "https://artificialanalysis.ai/image/leaderboard/text-to-image" }],
  },
  {
    capability: "Audio input",
    leader: "Gemini",
    through: "antigravity",
    throughLabel: "Antigravity",
    value: "Native",
    detail: "Current Claude models take text and images only.",
    sources: [
      { label: "Gemini audio docs", href: "https://ai.google.dev/gemini-api/docs/audio" },
      { label: "Claude models overview", href: "https://platform.claude.com/docs/en/models/overview" },
    ],
  },
];

// Research on mixing models points both ways. Both results come from the
// papers' abstracts.
export const mixing: { stance: string; finding: string; source: Source }[] = [
  {
    stance: "In favor",
    finding: "Picking among edits from top coding systems scored 66.2% on SWE-bench Verified, above the best single system.",
    source: { label: "CodeMonkeys, 2025", href: "https://arxiv.org/abs/2501.14723" },
  },
  {
    stance: "Against",
    finding: "Running the best model many times and combining its answers did 6.6% better on AlpacaEval 2.0 than mixing different models.",
    source: { label: "Self-MoA, 2025", href: "https://arxiv.org/abs/2502.00674" },
  },
];
