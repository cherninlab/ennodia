---
title: Second Opinions as Infrastructure
description: How to use Ennodia for independent AI panels, decomposed reviews, and red-team prompts.
---

Ennodia convenes independent AI panels for judgments too important for one model
and shows you exactly where they disagree.

Code review is the first strong use case, not the category. The core pattern is
delegating a question to installed local agents, keeping the trace visible, and
using Compare to turn multiple answers into a disagreement map and one usable
result.

## Three Patterns

### Replicate

Ask the same question of several agents, then compare the answers.

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

Split a broad review into focused slices, then synthesize the useful completed
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

Use this when the primary agent already has a plausible plan and you want
independent pressure before committing.

## Staging Pattern

For larger reviews, have the primary agent stage a folder containing the case
file: relevant paths, screenshots, dataset summaries, contracts, or decision
criteria. Then pass `cwd` to Ennodia so child agents can inspect the same local
context independently. Keep staged material deliberate; do not hand every agent
an unbounded workspace when a smaller evidence bundle will do.

## Skills Carry Expertise

Use Agent Skills as reusable rubrics. A skill can define the review standard,
expected evidence, output shape, and escalation rules. Ennodia installs bundled
skills as harness-visible `SKILL.md` folders, then passes skill IDs through a
run instead of inlining the full instructions into every prompt.

## Examples

- Security threat models: replicate a threat review, then compare blind spots
  and contradictions.
- Contract comparison: decompose obligations, termination, liability, and data
  handling into focused slices.
- Pre-mortems: red-team a roadmap, launch, or migration plan before work starts.
- Exam or rubric QA: ask several agents to grade an answer against the same
  staged rubric, then compare where their grading differs.

## Honest Constraints

Ennodia is deliberation-class infrastructure. A run usually takes minutes, not
seconds. Compare adds two serial model passes after the child agents finish, so
parallel review with Compare costs roughly N child runs plus a judge and a
synthesizer.

The substrate is installed coding agents and local CLI tools, not domain-tuned
specialist models. Ennodia supports decision-making by surfacing evidence,
disagreements, and uncertainty; it does not make regulated, legal, financial,
medical, or operational decisions for the user.

For storage and data movement boundaries, read
[Data Governance](/docs/concepts/data-governance/).
