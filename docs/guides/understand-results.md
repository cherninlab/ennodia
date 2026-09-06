---
title: Understand results
description: Distinguish useful findings, disagreement, missing evidence, and failed execution.
---

# Understand the result

Process completion is one signal. A useful answer also needs evidence that fits your task.

| Result | Meaning | Next step |
| --- | --- | --- |
| Useful finding | A concrete claim, correction, or test you can examine. | Verify it and integrate the useful part. |
| Disagreement | Different assumptions or conclusions remain. | Check the evidence that can distinguish them. |
| Unhelpful answer | The attempt ran but did not move the task forward. | Record the conditions and change the approach. |
| Failed login or unavailable model | The requested model could not be evaluated. | Repair access or select another available configuration. |
| Timeout | The attempt did not finish within its limit. | Inspect progress before narrowing or repeating it. |
| Missing tool permission | The worker could not perform a required operation. | Review normal tool permissions or provide accessible material. |

An unsuccessful attempt does not prove that every model would fail.
It can remove the need to repeat that same attempt under the same conditions.

## Compare is advice

Compare uses a Judge to examine answers and a Result Advisor to recommend a next answer.
Agreement is not proof of correctness.
The primary agent still checks code, sources, tests, and important assumptions.

When Judge output is unusable, the result exposes `analysisAvailable: false`.
The Result Advisor can continue with `basis: "candidates-only"`.
That result has less analysis behind it and needs corresponding scrutiny.

## Read the attempt record

Task records include the selected agent, requested skills, status, elapsed time, and bounded output.
Run history preserves terminal run snapshots locally.
It does not yet learn which model or skill to choose next.

`remainingMs` with `etaConfidence: "timeout-budget"` reports time left before the deadline.
It is not a prediction of model completion time.
Input-token estimates also exclude work inside the agent.
Unknown provider usage must remain unknown.
