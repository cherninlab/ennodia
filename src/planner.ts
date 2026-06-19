import type { HarnessDiscovery } from "./harnesses";

export type RoutePlan = {
  category: "code" | "research" | "browser" | "image" | "general";
  reasons: string[];
  candidates: string[];
  selected?: string;
  parallelSuggested: boolean;
  compareSuggested: boolean;
  mermaid: string;
};

export function planRoute(
  prompt: string,
  harnesses: HarnessDiscovery[],
): RoutePlan {
  const lower = prompt.toLowerCase();
  const runnable = harnesses.filter((harness) => harness.runnable);
  const runnableIds = new Set(runnable.map((harness) => harness.id));
  const reasons: string[] = [];

  let category: RoutePlan["category"] = "general";

  if (/\b(code|bug|diff|repo|typescript|javascript|python|test|review)\b/.test(lower)) {
    category = "code";
    reasons.push("The prompt looks code-oriented.");
  } else if (/\b(browser|website|click|screenshot|ui|page|automation)\b/.test(lower)) {
    category = "browser";
    reasons.push("The prompt mentions browser or UI automation.");
  } else if (/\b(image|visual|design|screenshot|mockup)\b/.test(lower)) {
    category = "image";
    reasons.push("The prompt mentions visual or image work.");
  } else if (/\b(research|compare|latest|source|web|investigate)\b/.test(lower)) {
    category = "research";
    reasons.push("The prompt looks research-oriented.");
  } else {
    reasons.push("No specialist category was obvious, so Ennodia chose a general route.");
  }

  const preferredByCategory: Record<RoutePlan["category"], string[]> = {
    code: ["codex", "claude-code", "opencode", "antigravity"],
    research: ["claude-code", "codex", "opencode"],
    browser: ["antigravity", "opencode", "claude-code", "codex"],
    image: ["antigravity", "claude-code", "opencode", "codex"],
    general: ["claude-code", "codex", "opencode", "antigravity"],
  };

  const candidates = [
    ...preferredByCategory[category].filter((id) => runnableIds.has(id)),
    ...runnable.map((harness) => harness.id).filter(
      (id) => !preferredByCategory[category].includes(id),
    ),
  ];

  const complexSignals = /\b(compare|several|multiple|parallel|architecture|review|tradeoff|best|judge)\b/.test(
    lower,
  );
  const parallelSuggested = candidates.length > 1 && complexSignals;
  const compareSuggested = parallelSuggested;

  return {
    category,
    reasons,
    candidates,
    selected: candidates[0],
    parallelSuggested,
    compareSuggested,
    mermaid: renderPlanMermaid(candidates, parallelSuggested, compareSuggested),
  };
}

function renderPlanMermaid(
  candidates: string[],
  parallelSuggested: boolean,
  compareSuggested: boolean,
): string {
  const lines = [
    "flowchart TD",
    '    request["Request"]',
    '    classify["Classify"]',
    '    plan["Plan route"]',
    "    request --> classify",
    "    classify --> plan",
  ];

  const selected = parallelSuggested ? candidates : candidates.slice(0, 1);

  for (const id of selected) {
    const nodeId = id.replace(/[^a-zA-Z0-9]/g, "_");
    lines.push(`    ${nodeId}["${id}"]`);
    lines.push(`    plan --> ${nodeId}`);
  }

  if (compareSuggested && selected.length > 1) {
    lines.push('    compare["Compare outputs"]');
    for (const id of selected) {
      const nodeId = id.replace(/[^a-zA-Z0-9]/g, "_");
      lines.push(`    ${nodeId} --> compare`);
    }
    lines.push('    compare --> result["Final result"]');
  } else {
    lines.push('    plan --> result["Final result"]');
  }

  return lines.join("\n");
}
