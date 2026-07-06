import type { HarnessDiscovery } from "./harnesses";
import {
  CATEGORY_HARNESS_PRIORITIES,
  type RouteCategory,
} from "./priority";

export type RoutePlan = {
  category: RouteCategory;
  reasons: string[];
  candidates: string[];
  selected?: string;
  parallelSuggested: boolean;
  compareSuggested: boolean;
};

export type PlanRouteOptions = {
  category?: RouteCategory;
};

export function planRoute(
  prompt: string,
  harnesses: HarnessDiscovery[],
  options: PlanRouteOptions = {},
): RoutePlan {
  const lower = prompt.toLowerCase();
  const runnable = harnesses.filter((harness) => harness.runnable);
  const runnableIds = new Set(runnable.map((harness) => harness.id));
  const reasons: string[] = [];

  let category: RouteCategory = "general";
  const strongBrowserSignals =
    /\b(browser|click|screenshot|viewport|rendered|mobile|desktop)\b/.test(
      lower,
    );
  const uiSurfaceSignals =
    /\b(website|site|landing page|frontend|ui|page)\b/.test(lower);
  const uiReviewSignals = /\b(audit|inspect|review|test|open)\b/.test(lower);
  const copywritingSignals =
    /\b(copy|headline|tagline|rewrite|write|draft|body text)\b/.test(lower);
  const browserSignals = strongBrowserSignals ||
    (uiSurfaceSignals && uiReviewSignals && !copywritingSignals);
  const imageSignals = /\b(image|visual|design|mockup)\b/.test(lower);
  const explicitCodeSignals = /\b(code|bug|diff|repo|typescript|javascript|python|test)\b/.test(
    lower,
  );
  const codeSignals = explicitCodeSignals;

  if (options.category) {
    category = options.category;
    reasons.push("Caller-provided category.");
  } else if (browserSignals) {
    category = "browser";
    reasons.push("The prompt mentions a website, UI, or rendered page.");
  } else if (imageSignals) {
    category = "image";
    reasons.push("The prompt mentions visual or image work.");
  } else if (codeSignals) {
    category = "code";
    reasons.push("The prompt looks code-oriented.");
  } else if (/\b(research|compare|latest|source|web|investigate)\b/.test(lower)) {
    category = "research";
    reasons.push("The prompt looks research-oriented.");
  } else {
    reasons.push("No specialist category was obvious, so Ennodia chose a general route.");
  }

  const candidates = [
    ...CATEGORY_HARNESS_PRIORITIES[category].filter((id) => runnableIds.has(id)),
    ...runnable.map((harness) => harness.id).filter(
      (id) => !CATEGORY_HARNESS_PRIORITIES[category].includes(id),
    ),
  ];

  const complexSignals = /\b(audit|assess|compare|critique|evaluate|inspect|judge|multiple|parallel|review|several|tradeoff|best)\b/.test(
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
  };
}

export function renderPlanMermaid(plan: RoutePlan): string {
  const lines = [
    "flowchart TD",
    '    request["Request"]',
    '    classify["Classify"]',
    '    plan["Plan route"]',
    "    request --> classify",
    "    classify --> plan",
  ];

  const selected = plan.parallelSuggested
    ? plan.candidates
    : plan.candidates.slice(0, 1);

  for (const id of selected) {
    const nodeId = id.replace(/[^a-zA-Z0-9]/g, "_");
    lines.push(`    ${nodeId}["${id}"]`);
    lines.push(`    plan --> ${nodeId}`);
  }

  if (plan.compareSuggested && selected.length > 1) {
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
