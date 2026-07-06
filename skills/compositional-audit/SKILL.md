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
- Keep the output short enough for a later Compare pass.

If you are synthesizing shard answers:

- Preserve disagreements instead of flattening them.
- Treat failed, empty, or access-limited shards as non-signal.
- Prefer recommendations that are supported by more than one shard or by the
  strongest source evidence.
- Name the smallest next action that would reduce the most risk.
