import type { HarnessDiscovery } from "./harnesses";
import { hasMultimodalInput, MULTIMODAL_INPUT_GUIDANCE } from "./harnesses";
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
  inputGuidance?: string[];
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
  const audioInspectionSignals = /\bnative audio\b|\baudio listening\b|\blistening comparison\b|\blisten to\b[^.!?\n]{0,80}\b(audio|recordings?|files?|samples?)\b|\b(compare|assess|judge)\b[^.!?\n]{0,60}\b(audio|recordings?|voice|sound)\b/.test(lower);
  const requestedAction = lower.replace(/^\s*(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+|i\s+(?:want|need)\s+you\s+to\s+)?(?:please\s+)?/, "");
  const softwareMaintenance = /^(fix|implement|refactor|debug)\b|^write\b[^.!?\n]{0,40}\b(script|function|tests?)\b|^review (?:the )?(code|implementation)\b/.test(requestedAction);
  const nativeAudioProbe = !options.category && audioInspectionSignals && !softwareMaintenance;

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
  } else if (nativeAudioProbe) {
    category = "general";
    reasons.push("The task needs native audio inspection. Start with one capability probe; compare after native access is confirmed.");
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
  if (nativeAudioProbe && runnableIds.has("antigravity")) {
    candidates.splice(candidates.indexOf("antigravity"), 1);
    candidates.unshift("antigravity");
    reasons.push("Antigravity has an observed native-audio probe path. This is a probe candidate, not verified model access.");
  }

  const complexSignals = /\b(audit|assess|compare|critique|evaluate|inspect|judge|multiple|parallel|review|several|tradeoff|best)\b/.test(
    lower,
  );
  const parallelSuggested = !nativeAudioProbe && candidates.length > 1 && complexSignals;
  const compareSuggested = parallelSuggested;

  return {
    category,
    reasons,
    candidates,
    selected: candidates[0],
    parallelSuggested,
    compareSuggested,
    ...(hasMultimodalInput(prompt) ? {
      inputGuidance: [
        ...MULTIMODAL_INPUT_GUIDANCE,
        "Keyword routing does not verify native media access. Inspect the chosen harness inputGuidance and select a harness/model explicitly for the initial probe.",
        ...runnable.flatMap((harness) => (harness.inputGuidance ?? [])
          .filter((note) => !MULTIMODAL_INPUT_GUIDANCE.includes(note))
          .map((note) => `${harness.id}: ${note}`)),
      ],
    } : {}),
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
