---
title: Try a skill separately
description: Compare two reviews of one function while keeping the main conversation focused.
---

# Try a skill separately

A skill can improve a review, add irrelevant work, or make no difference.
A small separate task gives you evidence before you use its recommendations.

The fixture lives in `examples/skill-trial` in the Ennodia checkout.
It contains a short function and a local contract with deliberate mismatches.

## Prepare two comparable attempts

1. Select one available agent and model.
2. Check that the requested skill is installed for that agent.
3. Give both attempts the same `retry.ts` and `contract.md` files.
4. Keep the evaluator `check.ts` out of the review materials.
5. Run the plain review and skill review as separate read-only tasks.

```text
Use Ennodia MCP for two separate read-only reviews of examples/skill-trial/retry.ts.
Provide contract.md as the source of truth. Use the same agent and model.
First run: request no additional skill.
Second run: request the installed source-grounded-audit skill.
Do not open check.ts until both reviews finish.
Return each contract mismatch with a concrete failing input.
Compare useful findings, unsupported claims, and time spent.
```

Your agent can use `ennodia_start_compositional` with one slice per attempt.
Set `skillIds: []` on the plain slice and `skillIds: ["source-grounded-audit"]` on the skill slice.
The [skill guide](/docs/guides/agent-skills/) describes installation and explicit selection.

A native agent can self-select other available skills.
An empty requested skill list does not guarantee a skill-free control.
For strict measurement, use separate controlled skill inventories and record the skills actually loaded.

## Validate the findings

Run the evaluator after saving both reviews:

```sh
bun examples/skill-trial/check.ts
```

The supplied implementation deliberately fails some cases.
Use each reported input to check a proposed fix in a disposable copy.
A useful finding needs to explain a contract mismatch, not just suggest a stylistic change.
Keep useful partial findings even if the skill adds other irrelevant advice.

This fixture supports a repeatable workflow demonstration.
No quality improvement is claimed for it.

## Recorded development trial

On September 6, 2026, two Antigravity tasks ran through Ennodia in separate temporary copies.
The plain review found the six failing evaluator cases and an additional alternative-number-notation case.
The requested-skill attempt produced no answer because native tool permissions blocked a required read.

The agent command exited with code zero despite the permission denial.
Ennodia initially labeled that task successful. This trial exposed a classification defect that the next release candidate fixes.
The denied attempt cannot establish the quality of the skill.
No permission bypass was used to force a successful result.

The fixture includes `recorded-trial.json` with both observed outcomes and the diagnostic excerpt.
Local paths were normalized, and CLI remediation instructions were omitted from the excerpt.
