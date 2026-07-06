export type RouteCategory = "code" | "research" | "browser" | "image" | "general";

export const CATEGORY_HARNESS_PRIORITIES: Record<RouteCategory, readonly string[]> = {
  code: [
    "codex",
    "claude-code",
    "opencode",
    "kilo",
    "kiro",
    "cline",
    "hermes-agent",
    "antigravity",
  ],
  research: [
    "claude-code",
    "codex",
    "opencode",
    "kilo",
    "kiro",
    "cline",
    "hermes-agent",
  ],
  browser: [
    "antigravity",
    "opencode",
    "kilo",
    "kiro",
    "cline",
    "hermes-agent",
    "claude-code",
    "codex",
  ],
  image: [
    "antigravity",
    "claude-code",
    "opencode",
    "kilo",
    "kiro",
    "cline",
    "hermes-agent",
    "codex",
  ],
  general: [
    "claude-code",
    "codex",
    "opencode",
    "kilo",
    "kiro",
    "cline",
    "hermes-agent",
    "antigravity",
  ],
};

export const DEFAULT_COMPARE_HARNESS_PRIORITY = [
  "claude-code",
  "codex",
  "antigravity",
  "opencode",
  "kilo",
  "kiro",
  "cline",
  "hermes-agent",
] as const;

export function formatHarnessPriorityList(
  ids: readonly string[] = DEFAULT_COMPARE_HARNESS_PRIORITY,
): string {
  if (ids.length <= 1) {
    return ids.join("");
  }

  return `${ids.slice(0, -1).join(", ")}, then ${ids.at(-1)}`;
}

export function allPriorityHarnessIds(): string[] {
  return [
    ...new Set([
      ...DEFAULT_COMPARE_HARNESS_PRIORITY,
      ...Object.values(CATEGORY_HARNESS_PRIORITIES).flat(),
    ]),
  ];
}
