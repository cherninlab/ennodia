import { describe, expect, it } from "bun:test";
import { harnessAdapters, type HarnessDiscovery } from "./harnesses";
import { planRoute, renderPlanMermaid } from "./planner";

const harnesses: HarnessDiscovery[] = [
  harness("claude-code"),
  harness("codex"),
  harness("opencode"),
  harness("antigravity"),
];

describe("planRoute", () => {
  it("prefers Codex for code tasks", () => {
    const plan = planRoute("Review this TypeScript repo for bugs.", harnesses);

    expect(plan.category).toBe("code");
    expect(plan.selected).toBe("codex");
    expect(plan.candidates).toEqual([
      "codex",
      "claude-code",
      "opencode",
      "antigravity",
    ]);
  });

  it("prefers Antigravity for browser automation tasks", () => {
    const plan = planRoute("Open the website, click the button, and screenshot it.", harnesses);

    expect(plan.category).toBe("browser");
    expect(plan.selected).toBe("antigravity");
  });

  it("treats website review prompts as rendered UI work", () => {
    const plan = planRoute("Audit and review the landing page website for first-time users.", harnesses);

    expect(plan.category).toBe("browser");
    expect(plan.selected).toBe("antigravity");
    expect(plan.parallelSuggested).toBe(true);
    expect(plan.compareSuggested).toBe(true);
  });

  it("suggests parallel Compare for complex comparison prompts", () => {
    const plan = planRoute("Compare several models and judge the tradeoffs.", harnesses);

    expect(plan.parallelSuggested).toBe(true);
    expect(plan.compareSuggested).toBe(true);
    expect(renderPlanMermaid(plan)).toContain('compare["Compare outputs"]');
  });

  it("filters out unavailable harnesses", () => {
    const plan = planRoute("Review this code.", [
      harness("codex", { runnable: false }),
      harness("claude-code"),
    ]);

    expect(plan.candidates).toEqual(["claude-code"]);
    expect(plan.selected).toBe("claude-code");
  });

  it("uses caller-provided category before keyword classification", () => {
    const plan = planRoute("Help me write landing page copy.", harnesses, {
      category: "general",
    });

    expect(plan.category).toBe("general");
    expect(plan.reasons).toContain("Caller-provided category.");
    expect(plan.selected).toBe("claude-code");
  });

  it("does not route copywriting or generic review prompts as browser/code", () => {
    expect(planRoute("Help me write landing page copy.", harnesses).category)
      .toBe("general");
    expect(planRoute("Review this poem.", harnesses).category).toBe("general");
  });

  it("starts native audio comparisons with one Antigravity probe despite negative code instructions", () => {
    const prompt = "Compare these recordings by native audio listening: /tmp/original.mp3 and /tmp/cleaned.mp3. Do not use Python, code, DSP metrics, or transcripts as substitutes.";
    const plan = planRoute(prompt, harnesses);

    expect(plan.category).toBe("general");
    expect(plan.selected).toBe("antigravity");
    expect(plan.candidates[0]).toBe("antigravity");
    expect(plan.parallelSuggested).toBe(false);
    expect(plan.compareSuggested).toBe(false);
    expect(plan.reasons.join(" ")).toContain("not verified model access");
    expect(plan.inputGuidance?.join(" ")).toContain("first load one small sample");
    expect(plan.inputGuidance?.join(" ")).toContain("antigravity: Observed");
    expect(renderPlanMermaid(plan)).toContain('antigravity["antigravity"]');
    expect(renderPlanMermaid(plan)).not.toContain('compare["Compare outputs"]');
    expect(renderPlanMermaid(plan)).not.toContain('codex["codex"]');
  });

  it("keeps code maintenance and explicit categories ahead of native-audio probing", () => {
    for (const prompt of [
      "Fix the Python code used to compare native audio recordings.",
      "Review the code used to compare audio recordings.",
      "Write a Python script to compare audio recordings.",
      "Please fix the Python code used to compare audio recordings.",
      "Can you review the code used to compare audio recordings?",
      "I need you to fix the code used to compare native audio recordings.",
    ]) {
      const plan = planRoute(prompt, harnesses);
      expect(plan.category).toBe("code");
      expect(plan.selected).toBe("codex");
      expect(plan.parallelSuggested).toBe(true);
      expect(plan.inputGuidance).toBeDefined();
    }

    const explicit = planRoute("Compare these native audio recordings.", harnesses, { category: "code" });
    expect(explicit.category).toBe("code");
    expect(explicit.selected).toBe("codex");
    expect(explicit.compareSuggested).toBe(true);
    expect(explicit.reasons).toContain("Caller-provided category.");
  });

  it("does not recommend an unavailable Antigravity probe or its guidance", () => {
    const plan = planRoute("Compare native audio recordings.", [
      harness("codex"),
      harness("antigravity", { runnable: false }),
    ]);

    expect(plan.selected).toBe("codex");
    expect(plan.candidates).toEqual(["codex"]);
    expect(plan.parallelSuggested).toBe(false);
    expect(plan.inputGuidance?.join(" ")).not.toContain("antigravity:");
  });

  it("provides probe guidance when only recordings and Ogg paths identify the media", () => {
    const plan = planRoute("Compare these recordings: /tmp/reference.ogg and /tmp/candidate.ogg.", harnesses);
    expect(plan.selected).toBe("antigravity");
    expect(plan.parallelSuggested).toBe(false);
    expect(plan.inputGuidance?.join(" ")).toContain("first load one small sample");
  });
});

function harness(
  id: string,
  overrides: Partial<HarnessDiscovery> = {},
): HarnessDiscovery {
  return {
    id,
    name: id,
    kind: "cli",
    available: true,
    runnable: true,
    commandPath: `/bin/${id}`,
    capabilities: [],
    notes: [],
    inputGuidance: harnessAdapters.find((adapter) => adapter.id === id)?.inputGuidance,
    ...overrides,
  };
}
