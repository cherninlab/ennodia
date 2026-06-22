import { describe, expect, it } from "bun:test";
import type { HarnessDiscovery } from "./harnesses";
import { planRoute } from "./planner";

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
    expect(plan.mermaid).toContain('compare["Compare outputs"]');
  });

  it("filters out unavailable harnesses", () => {
    const plan = planRoute("Review this code.", [
      harness("codex", { runnable: false }),
      harness("claude-code"),
    ]);

    expect(plan.candidates).toEqual(["claude-code"]);
    expect(plan.selected).toBe("claude-code");
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
    ...overrides,
  };
}
