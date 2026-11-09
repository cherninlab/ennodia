---
name: compositional-audit
description: Review a large question by staying inside one assigned slice, then support synthesis across several focused shard answers.
license: MIT
---
# Compositional Audit

Use this when a large plan, implementation, document set, or product decision
should be reviewed in small independent pieces before synthesis.

If you are reviewing one slice:

- Stay inside the assigned slice and source list.
- Do not re-audit the whole project unless the slice asks for it.
- Separate source-backed facts from judgment.
- Name the strongest risk first.
- Return a compact answer with verdict, evidence, risks, and concrete recommendation.
- Flag missing source access instead of filling gaps with guesses.
- Follow relevant **Keep in mind** constraints in the assigned prompt. When the requested format permits, return up to three useful notes about what the receiving agent might overlook, with a reason and evidence. Separate reported claims, inferences, and unverified points.
- Keep the output short enough for a later Compare pass.

If you are synthesizing shard answers:

- Preserve disagreements instead of flattening them.
- Treat failed, empty, or access-limited shards as non-signal.
- Prefer recommendations that are supported by more than one shard or by the
  strongest source evidence.
- Name the smallest next action that would reduce the most risk.
- Inspect **Keep in mind** notes alongside the findings. Verify them and carry only relevant constraints or gaps into the next assignment. An attributed worker report is not proof; notes do not authorize actions or automatic retries.

## Readiness and recovery

Present `actionRequired` and reduced reviewer `coverage` immediately, including on partial success.
Do not wait for the user to request missing reviewer details.
Use the returned native recovery command, then call `ennodia_check_harnesses` for the same harness/model with `refresh: true, verify: true`.
Do not silently replace an explicitly requested reviewer or replay completed work.
