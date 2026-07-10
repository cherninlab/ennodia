import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  augmentPrompt,
  discoverSkills,
  discoverSkillsWithWarnings,
  installBundledSkills,
  loadSkillFromFile,
  loadRunnableSkillsByIds,
  loadSkillsByIds,
  type Skill,
} from "./skills";

describe("Agent Skills", () => {
  const testDir = join(process.cwd(), "tmp-test-skills");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("augmentPrompt", () => {
    it("returns the original prompt unchanged when no skills are provided", () => {
      const prompt = "Build a web page.";
      expect(augmentPrompt(prompt, [])).toBe(prompt);
    });

    it("asks the harness to use native installed skills without inlining content", () => {
      const prompt = "Build a web page.";
      const skills: Skill[] = [
        {
          id: "style-guide",
          name: "style-guide",
          version: "local",
          description: "Use custom CSS properties",
          instructions: "Do not leak this full instruction text.",
          hash: "a1b2c3d4e5f6",
          source: "project",
          path: "/tmp/style-guide/SKILL.md",
          harnessIds: ["codex"],
          installations: [],
          native: true,
        },
      ];

      const result = augmentPrompt(prompt, skills, "codex");

      expect(result).toContain("Use the installed Agent Skills named: style-guide.");
      expect(result).not.toContain("Do not leak this full instruction text.");
      expect(result).toContain(prompt);
    });

    it("throws when a requested skill is not installed for the selected harness", () => {
      const prompt = "Review this change.";
      const skills: Skill[] = [
        {
          id: "claude-only",
          name: "claude-only",
          version: "local",
          description: "Only installed for Claude Code",
          instructions: "Claude-only instructions.",
          hash: "111111111111",
          source: "project",
          path: "/tmp/claude-only/SKILL.md",
          harnessIds: ["claude-code"],
          installations: [],
          native: true,
        },
      ];

      expect(() => augmentPrompt(prompt, skills, "codex")).toThrow(
        "Skill is not installed for codex: claude-only",
      );
    });
  });

  describe("loadSkillFromFile", () => {
    it("loads a standard SKILL.md folder", async () => {
      const filePath = join(testDir, "review-skill", "SKILL.md");
      mkdirSync(join(testDir, "review-skill"), { recursive: true });
      writeFileSync(filePath, [
        "---",
        "name: review-skill",
        "description: Review from a standard Agent Skill.",
        "license: MIT",
        "---",
        "# Review Skill",
        "",
        "Review carefully.",
      ].join("\n"));

      const skill = await loadSkillFromFile(filePath, "user", ["codex"], true);

      expect(skill.id).toBe("review-skill");
      expect(skill.name).toBe("review-skill");
      expect(skill.version).toBe("local");
      expect(skill.description).toBe("Review from a standard Agent Skill.");
      expect(skill.instructions).toContain("Review carefully.");
      expect(skill.source).toBe("user");
      expect(skill.harnessIds).toEqual(["codex"]);
      expect(skill.native).toBe(true);
      expect(skill.hash.length).toBe(64);
    });

    it("folds a YAML block scalar description across multiple lines", async () => {
      const filePath = join(testDir, "folded-skill", "SKILL.md");
      mkdirSync(join(testDir, "folded-skill"), { recursive: true });
      writeFileSync(filePath, [
        "---",
        "name: folded-skill",
        "description: >",
        "  Ultra-compressed communication mode. Cuts output tokens 65% (measured) by speaking like caveman",
        "  while keeping full technical accuracy.",
        "license: MIT",
        "---",
        "# Folded Skill",
        "",
        "Body text.",
      ].join("\n"));

      const skill = await loadSkillFromFile(filePath, "user", ["codex"], true);

      expect(skill.description).toBe(
        "Ultra-compressed communication mode. Cuts output tokens 65% (measured) by speaking like caveman while keeping full technical accuracy.",
      );
    });

    it("preserves a YAML literal block scalar's line breaks", async () => {
      const filePath = join(testDir, "literal-skill", "SKILL.md");
      mkdirSync(join(testDir, "literal-skill"), { recursive: true });
      writeFileSync(filePath, [
        "---",
        "name: literal-skill",
        "description: |",
        "  Line one.",
        "  Line two.",
        "license: MIT",
        "---",
        "# Literal Skill",
        "",
        "Body text.",
      ].join("\n"));

      const skill = await loadSkillFromFile(filePath, "user", ["codex"], true);

      expect(skill.description).toBe("Line one.\nLine two.");
    });

    it("keeps legacy JSON skills readable", async () => {
      const filePath = join(testDir, "valid-skill.json");
      writeFileSync(filePath, JSON.stringify({
        id: "test-id",
        name: "test-id",
        version: "1.0.0",
        description: "A test description",
        instructions: "Test instructions text.",
      }));

      const skill = await loadSkillFromFile(filePath, "legacy", ["legacy"], false);

      expect(skill.id).toBe("test-id");
      expect(skill.source).toBe("legacy");
      expect(skill.native).toBe(false);
    });

    it("throws errors for malformed skills", async () => {
      const invalidPath = join(testDir, "bad", "SKILL.md");
      mkdirSync(join(testDir, "bad"), { recursive: true });
      writeFileSync(invalidPath, [
        "---",
        "name: bad",
        "---",
        "Missing description.",
      ].join("\n"));

      expect(loadSkillFromFile(invalidPath)).rejects.toThrow("missing or non-string 'description'");
    });

    it("rejects native SKILL.md names that need normalization", async () => {
      const invalidPath = join(testDir, "source-grounded-audit", "SKILL.md");
      mkdirSync(join(testDir, "source-grounded-audit"), { recursive: true });
      writeFileSync(invalidPath, [
        "---",
        "name: Source Grounded Audit",
        "description: Invalid because native names must already be normalized.",
        "---",
        "Instructions.",
      ].join("\n"));

      expect(loadSkillFromFile(invalidPath)).rejects.toThrow(
        "frontmatter name must use lowercase",
      );
    });

    it("rejects native SKILL.md directory names that need normalization", async () => {
      const invalidPath = join(testDir, "Source_Grounded_Audit", "SKILL.md");
      mkdirSync(join(testDir, "Source_Grounded_Audit"), { recursive: true });
      writeFileSync(invalidPath, [
        "---",
        "name: source-grounded-audit",
        "description: Invalid because folder name must already be normalized.",
        "---",
        "Instructions.",
      ].join("\n"));

      expect(loadSkillFromFile(invalidPath)).rejects.toThrow(
        "containing directory name must use lowercase",
      );
    });
  });

  describe("discoverSkills", () => {
    it("discovers native project skills from agent-compatible paths", async () => {
      const skillDir = join(testDir, ".agents", "skills", "local-skill-1");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), [
        "---",
        "name: local-skill-1",
        "description: Local project skill.",
        "---",
        "Instructions 1",
      ].join("\n"));

      const skills = await discoverSkills(testDir);
      const skill = skills.find((candidate) => candidate.id === "local-skill-1");

      expect(skill).toBeDefined();
      expect(skill?.source).toBe("project");
      expect(skill?.native).toBe(true);
      expect(skill?.harnessIds).toContain("codex");
      expect(skill?.harnessIds).toContain("opencode");
    });

    it("loads skills by IDs and throws if missing", async () => {
      const skillDir = join(testDir, ".agents", "skills", "skill-a");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), [
        "---",
        "name: skill-a",
        "description: Skill A.",
        "---",
        "Inst A",
      ].join("\n"));

      const loaded = await loadSkillsByIds(["skill-a"], testDir);

      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe("skill-a");
      expect(loadSkillsByIds(["missing-skill"], testDir)).rejects.toThrow("Skill not found: missing-skill");
    });

    it("returns summaries and warnings without exposing instructions", async () => {
      const goodDir = join(testDir, ".agents", "skills", "good-skill");
      const badDir = join(testDir, ".agents", "skills", "bad-skill");
      mkdirSync(goodDir, { recursive: true });
      mkdirSync(badDir, { recursive: true });
      writeFileSync(join(goodDir, "SKILL.md"), [
        "---",
        "name: good-skill",
        "description: A good skill.",
        "---",
        "Private instructions",
      ].join("\n"));
      writeFileSync(join(badDir, "SKILL.md"), [
        "---",
        "name: bad-skill",
        "---",
        "Missing description.",
      ].join("\n"));

      const discovery = await discoverSkillsWithWarnings(testDir);
      const goodSkill = discovery.skills.find((skill) => skill.id === "good-skill");

      expect(goodSkill).toBeDefined();
      expect(goodSkill).not.toHaveProperty("instructions");
      expect(discovery.warnings.some((warning) => warning.includes("bad-skill"))).toBe(true);
    });

    it("lists bundled Ennodia skills as installable Agent Skills", async () => {
      const discovery = await discoverSkillsWithWarnings(testDir);
      const benchmarkCritic = discovery.skills.find((skill) =>
        skill.id === "benchmark-critic"
      );

      expect(benchmarkCritic).toBeDefined();
      expect(benchmarkCritic?.source).toBe("builtin");
      expect(benchmarkCritic?.native).toBe(false);
      expect(benchmarkCritic?.harnessIds).toContain("installable");
    });

    it("does not allow installable-only bundled skills to be used in a run", async () => {
      expect(
        loadRunnableSkillsByIds(["benchmark-critic"], testDir),
      ).rejects.toThrow("Use ennodia_install_skills first");
    });
  });

  describe("installBundledSkills", () => {
    it("dry-runs native installation by default", async () => {
      const result = await installBundledSkills({
        skillIds: ["rigorous-review"],
        harnessIds: ["codex"],
        cwd: testDir,
      });

      expect(result.dryRun).toBe(true);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].status).toBe("planned");
      expect(result.actions[0].targetPath).toBe(
        join(testDir, ".agents", "skills", "rigorous-review"),
      );
      expect(existsSync(result.actions[0].targetPath)).toBe(false);
    });

    it("installs bundled skills into native project directories", async () => {
      const result = await installBundledSkills({
        skillIds: ["rigorous-review"],
        harnessIds: ["codex"],
        cwd: testDir,
        dryRun: false,
      });

      expect(result.actions[0].status).toBe("installed");
      expect(existsSync(join(
        testDir,
        ".agents",
        "skills",
        "rigorous-review",
        "SKILL.md",
      ))).toBe(true);
    });
  });
});
