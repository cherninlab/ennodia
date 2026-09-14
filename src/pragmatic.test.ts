import { describe, expect, it } from "bun:test";
import { preparePragmaticRun } from "./pragmatic";

const input = {
  prompt: "Inspect /tmp/log",
  harnessId: "fixture",
  model: "fixture-model",
  pragmatic: { recipe: "investigate" as const, acceptanceCriteria: "Cite timestamps" },
};

describe("Pragmatic contract", () => {
  it("leaves ordinary orchestration untouched", () => {
    const normal = { prompt: "task", mode: "parallel" as const, compare: true };
    expect(preparePragmaticRun(normal)).toBe(normal);
  });

  it("rejects missing model, harness, criteria, and conflicting orchestration", () => {
    for (const fields of [{ model: " " }, { harnessId: "" }, { mode: "parallel" as const }, { compare: true }]) {
      expect(() => preparePragmaticRun({ ...input, ...fields })).toThrow();
    }
    expect(() => preparePragmaticRun({ ...input, pragmatic: { recipe: "patch", acceptanceCriteria: " " } })).toThrow();
  });

  it("adds a non-editing patch contract without mutating the caller input", () => {
    const result = preparePragmaticRun({ ...input, pragmatic: { ...input.pragmatic, recipe: "patch" } });
    expect(result.mode).toBe("single");
    expect(result.compare).toBe(false);
    expect(result.prompt).toContain("complete unified diff");
    expect(result.prompt).toContain("Do not create, edit, or delete files");
    expect(result.prompt).toContain(input.pragmatic.acceptanceCriteria);
    expect(input.prompt).toBe("Inspect /tmp/log");
  });
});
