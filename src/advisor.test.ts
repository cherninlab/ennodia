import { describe, expect, it } from "bun:test";
import {
  AdvisorPlanProposalSchema,
  buildPlanAdvisorPrompt,
  compileAdvisorExecutionPlan,
  parseAdvisorPlanProposal,
  validateAdvisorPlanProposal,
  type AdvisorInventorySnapshot,
  type AdvisorPlanProposal,
} from "./advisor";

describe("Plan Advisor", () => {
  it("compiles an inert plan with explicit model provenance and per-slice skills", () => {
    const result = compileAdvisorExecutionPlan(validProposal(), inventory());

    expect(result.compiled).toBe(true);
    if (!result.compiled) {
      throw new Error("Expected compilation to succeed.");
    }

    expect(result.plan).toEqual({
      schemaVersion: 1,
      inventorySnapshotId: "snapshot-1",
      title: "Independent implementation review",
      rationale: "Use distinct perspectives, then let the caller review them.",
      slices: [
        {
          id: "implementation-review",
          title: "Implementation review",
          prompt: "Review the implementation for correctness.",
          harnessId: "codex",
          model: "gpt-5.6-sol",
          modelSelection: {
            kind: "caller-allowlist",
            model: "gpt-5.6-sol",
          },
          skillIds: ["source-audit"],
        },
        {
          id: "product-review",
          title: "Product review",
          prompt: "Review the product boundary.",
          harnessId: "claude-code",
          model: undefined,
          modelSelection: { kind: "harness-default" },
          skillIds: [],
        },
      ],
      counts: {
        sliceCount: 2,
        harnessLaunchCount: 2,
        skillAssignmentCount: 1,
      },
    });
  });

  it("allows only harness defaults or caller-allowlisted model IDs", () => {
    const proposal = validProposal();
    proposal.slices[0]!.model = "invented-provider-private-model";

    const validation = validateAdvisorPlanProposal(proposal, inventory());

    expect(validation.valid).toBe(false);
    if (validation.valid) {
      throw new Error("Expected validation to fail.");
    }
    expect(validation.issues.map((issue) => issue.code)).toContain(
      "model-not-allowlisted",
    );
    expect(compileAdvisorExecutionPlan(proposal, inventory())).toEqual({
      compiled: false,
      issues: validation.issues,
    });
  });

  it("rejects unknown, unrunnable, and skill-incompatible inventory choices", () => {
    const proposal = validProposal();
    proposal.slices.push(
      {
        id: "missing-harness",
        prompt: "Use a missing harness.",
        harnessId: "unknown-cli",
        skillIds: ["missing-skill"],
      },
      {
        id: "unrunnable-harness",
        prompt: "Use an unrunnable harness.",
        harnessId: "antigravity",
        skillIds: ["source-audit"],
      },
    );

    const validation = validateAdvisorPlanProposal(proposal, inventory());
    expect(validation.valid).toBe(false);
    if (validation.valid) {
      throw new Error("Expected validation to fail.");
    }

    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "harness-not-found",
        "slice-skill-not-found",
        "harness-not-runnable",
        "slice-skill-not-supported",
      ]),
    );
  });

  it("enforces caller slice, per-slice skill, and total skill limits", () => {
    const snapshot = inventory();
    snapshot.limits = {
      maxSlices: 1,
      maxSkillsPerSlice: 0,
      maxTotalSkillAssignments: 0,
    };

    const validation = validateAdvisorPlanProposal(
      validProposal(),
      snapshot,
    );
    expect(validation.valid).toBe(false);
    if (validation.valid) {
      throw new Error("Expected validation to fail.");
    }

    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "slice-limit-exceeded",
        "skill-limit-exceeded",
        "total-skill-limit-exceeded",
      ]),
    );
  });

  it("requires stable unique slice IDs and unique skill assignments", () => {
    const proposal = validProposal();
    proposal.slices[1]!.id = proposal.slices[0]!.id;
    proposal.slices[0]!.skillIds.push("source-audit");

    const validation = validateAdvisorPlanProposal(proposal, inventory());
    expect(validation.valid).toBe(false);
    if (validation.valid) {
      throw new Error("Expected validation to fail.");
    }

    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "duplicate-slice-id",
        "duplicate-slice-skill-id",
      ]),
    );

    expect(AdvisorPlanProposalSchema.safeParse({
      ...validProposal(),
      slices: [{
        ...validProposal().slices[0],
        id: "Slice 1",
      }],
    }).success).toBe(false);
  });

  it("rejects unsupported execution controls instead of dropping them", () => {
    const withForbiddenControls = JSON.stringify({
      ...validProposal(),
      budget: { maxTokens: 1_000 },
      slices: [{
        ...validProposal().slices[0],
        cwd: "/tmp/project",
        timeoutMs: 10_000,
        count: 3,
      }],
    });

    const parsed = parseAdvisorPlanProposal(withForbiddenControls);
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("Expected parsing to fail.");
    }

    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported-field",
          path: ["proposal", "budget"],
        }),
        expect.objectContaining({
          code: "unsupported-field",
          path: ["proposal", "slices", 0, "cwd"],
        }),
        expect.objectContaining({
          code: "unsupported-field",
          path: ["proposal", "slices", 0, "timeoutMs"],
        }),
        expect.objectContaining({
          code: "unsupported-field",
          path: ["proposal", "slices", 0, "count"],
        }),
      ]),
    );
  });

  it("parses exactly one JSON object and rejects prose, fences, and multiple values", () => {
    const json = JSON.stringify(validProposal());
    const parsed = parseAdvisorPlanProposal(`  \n${json}\n  `);
    expect(parsed.success).toBe(true);

    for (const raw of [
      `Here is the plan: ${json}`,
      `\`\`\`json\n${json}\n\`\`\``,
      `${json}\n${json}`,
      `${json}\nDone.`,
    ]) {
      const invalid = parseAdvisorPlanProposal(raw);
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.issues[0]?.code).toBe("invalid-json");
      }
    }
  });

  it("rejects slice prompts that can be parsed as CLI flags", () => {
    const proposal = {
      ...validProposal(),
      slices: [{
        ...validProposal().slices[0],
        prompt: "  --dangerous-option",
      }],
    };

    const parsed = parseAdvisorPlanProposal(JSON.stringify(proposal));

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("Expected a flag-like slice prompt to be rejected.");
    }
    expect(parsed.issues).toEqual([
      expect.objectContaining({
        code: "invalid-proposal",
        path: ["proposal", "slices", 0, "prompt"],
        message: "Slice prompts must not begin with '-' after whitespace.",
      }),
    ]);
  });

  it("fails closed when the caller inventory is inconsistent", () => {
    const snapshot = inventory();
    snapshot.harnesses.push({ ...snapshot.harnesses[0]! });
    snapshot.skills[0]!.harnessIds.push("missing-harness");

    const validation = validateAdvisorPlanProposal(
      validProposal(),
      snapshot,
    );
    expect(validation.valid).toBe(false);
    if (validation.valid) {
      throw new Error("Expected validation to fail.");
    }
    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "duplicate-harness-id",
        "skill-inventory-harness-not-found",
      ]),
    );
  });

  it("builds a constrained model prompt from a validated snapshot", () => {
    const prompt = buildPlanAdvisorPrompt(
      "Review this repository.",
      inventory(),
    );

    expect(prompt).toContain("ENNODIA_PLAN_ADVISOR");
    expect(prompt).toContain("Return exactly one JSON object");
    expect(prompt).toContain("Every slice is one harness launch");
    expect(prompt).toContain('"allowedModelIds"');
    expect(prompt).toContain("Review this repository.");
    expect(prompt).toContain("Do not include cwd, env, argv");
    expect(prompt).toContain('"task": "Review this repository."');
  });
});

function inventory(): AdvisorInventorySnapshot {
  return {
    schemaVersion: 1,
    snapshotId: "snapshot-1",
    harnesses: [
      {
        id: "codex",
        name: "Codex CLI",
        runnable: true,
        capabilities: ["code", "reasoning"],
        allowedModelIds: ["gpt-5.6-sol"],
      },
      {
        id: "claude-code",
        name: "Claude Code",
        runnable: true,
        capabilities: ["code", "reasoning"],
        allowedModelIds: ["claude-opus-5"],
      },
      {
        id: "antigravity",
        name: "Antigravity",
        runnable: false,
        capabilities: ["browser"],
        allowedModelIds: ["gemini-3.7-flash-high"],
      },
    ],
    skills: [{
      id: "source-audit",
      name: "Source audit",
      description: "Check claims against primary sources.",
      harnessIds: ["codex", "claude-code"],
    }],
    limits: {
      maxSlices: 4,
      maxSkillsPerSlice: 2,
      maxTotalSkillAssignments: 4,
    },
  };
}

function validProposal(): AdvisorPlanProposal {
  return {
    schemaVersion: 1,
    title: "Independent implementation review",
    rationale: "Use distinct perspectives, then let the caller review them.",
    slices: [
      {
        id: "implementation-review",
        title: "Implementation review",
        prompt: "Review the implementation for correctness.",
        harnessId: "codex",
        model: "gpt-5.6-sol",
        skillIds: ["source-audit"],
      },
      {
        id: "product-review",
        title: "Product review",
        prompt: "Review the product boundary.",
        harnessId: "claude-code",
        skillIds: [],
      },
    ],
  };
}
