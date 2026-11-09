---
title: Understand results
description: Distinguish useful findings, disagreement, missing evidence, and failed execution.
---

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

## Keep in mind

One agent can notice a constraint or gap that another agent misses.
Put relevant known constraints and prior decisions in the normal task prompt under **Keep in mind**.
For a task where the same function serves a web route and a command-line tool, a prompt could include:

```text
Review the proposed retry change.

Keep in mind:
- This function also serves the command-line tool. Preserve that behavior and check both callers.
```

Ennodia asks workers to return up to three concise, task-specific notes when useful and compatible with the requested answer format.
Each note states what matters, why it matters, and what evidence supports it.
This is prompt guidance. A worker can miss a useful note.

Compare returns structured notes in `advisor.keepInMind`, for example:

```json
{
  "keepInMind": [
    {
      "note": "Reviewer B reports running only the web-route test.",
      "whyItMatters": "A passing web-route test does not cover that caller.",
      "evidence": "Reviewer B reports running only the web-route test.",
      "sourceIds": ["review-b"],
      "status": "reported"
    }
  ]
}
```

`reported` attributes a point to a candidate. It does not prove the point.
`inferred` marks a conclusion drawn from the available answers.
`unverified` marks a point that still needs evidence.
Source IDs identify the candidates behind a note.
An empty list can identify coverage that no candidate supplied.

The list is empty when Compare has no useful notes.
Run results also expose nonempty notes as `keepInMind`, including in compact output.
This field stays separate from `finalAnswer` so a chosen file or patch stays unchanged.
The primary agent checks each note and carries only relevant ones into the next assignment.
Notes do not grant permissions, trigger another run, or create memory across runs.

## Read the attempt record

Task records include the selected agent, requested skills, status, elapsed time, and bounded output.
Run history preserves terminal run snapshots locally.
It does not yet learn which model or skill to choose next.

`remainingMs` with `etaConfidence: "timeout-budget"` reports time left before the deadline.
It is not a prediction of model completion time.
Input-token estimates also exclude work inside the agent.
Unknown provider usage must remain unknown.
