---
title: Second Opinions as Infrastructure
description: How to use Ennodia for independent artificial intelligence (AI) panels, decomposed reviews, and red-team prompts.
---

Ennodia convenes independent artificial intelligence (AI) panels for judgments
that are too important for one model. It shows you exactly where they disagree.

Code review is the first strong use case, not the category. The core pattern is
delegation to installed local agents with a visible trace. Compare turns
multiple answers into a disagreement map and one usable result. The Judge maps
the evidence, and the Result Advisor recommends the answer.

## Three Patterns

### Replicate

Send the same question to multiple agents, then compare the answers.

```json
{
  "tool": "ennodia_run",
  "arguments": {
    "prompt": "Review this release plan. Name the highest-risk assumption first.",
    "mode": "parallel",
    "compare": true,
    "category": "general",
    "budget": {
      "maxChildTasks": 3
    }
  }
}
```

Use this when the question is coherent as one prompt but the cost of a missed
issue is high.

### Decompose

Split a broad review into focused slices, then combine the useful completed
outputs.

```json
{
  "tool": "ennodia_start_compositional",
  "arguments": {
    "prompt": "Decide whether this release is ready.",
    "slices": [
      { "id": "install", "prompt": "Audit install and first-run instructions." },
      { "id": "budget", "prompt": "Audit budget and latency expectations." },
      { "id": "security", "prompt": "Audit data governance and local execution claims." }
    ],
    "budget": {
      "maxChildTasks": 3
    }
  }
}
```

Poll the returned task IDs with `ennodia_get_compositional_status`, then pass
the ready task IDs to `ennodia_start_compare`.

### Red-Team

Fan out prompts that argue against a proposal from different angles.

```json
{
  "tool": "ennodia_run",
  "arguments": {
    "prompt": "Argue against this migration plan. Focus on hidden coupling, rollout risk, and unverifiable assumptions.",
    "mode": "parallel",
    "compare": true,
    "category": "code"
  }
}
```

Use this when the primary agent has a plausible plan and you want
independent pressure before committing.

## Staging Pattern

For larger reviews, have the primary agent stage a folder containing the case
file: relevant paths, screenshots, dataset summaries, contracts, or decision
criteria. Then pass `cwd` to Ennodia so child agents can inspect the same local
context independently. Keep staged material deliberate. Do not give every agent
an unbounded workspace when a smaller evidence bundle will do.

## Skills Carry Expertise

Use Agent Skills as reusable rubrics. A skill can define the review standard,
expected evidence, output shape, and escalation rules. Ennodia installs bundled
skills as harness-visible `SKILL.md` folders, then passes skill IDs through a
run without inlining the full instructions into every prompt.

## Examples

- Security threat models: replicate a threat review, then compare blind spots
  and contradictions.
- Contract comparison: decompose obligations, termination, liability, and data
  handling into focused slices.
- Pre-mortems: red-team a roadmap, launch, or migration plan before work starts.
- Exam or rubric QA: send the same staged rubric to multiple agents. Compare
  where their grading differs.

## Honest Constraints

Ennodia supports careful review. A run usually takes minutes, not seconds.
Compare adds two serial model passes after the child agents finish.
Parallel review with Compare costs roughly N child runs, a Judge, and a Result
Advisor.

Ennodia uses installed agent CLIs and local tools. It does not use specialist
models for one domain. Ennodia supports decisions by showing evidence,
disagreements, and uncertainty. It does not make regulated, legal, financial,
medical, or operational decisions for the user.

For storage and data movement boundaries, read
[Data Governance](/docs/concepts/data-governance/).
