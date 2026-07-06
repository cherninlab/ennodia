---
title: Compositional Audits
description: Split large reviews into focused slices, route them to local agents, and synthesize the results without losing traceability.
---

Large reviews work better when each agent gets a small, explicit slice. Ennodia
supports this pattern with `ennodia_start_compositional`, existing task polling,
and `ennodia_start_compare`. The `compositional-audit` skill gives reviewers a
consistent rubric.

## When To Use It

Use a compositional audit when the request mixes several risk types, such as:

- product positioning and implementation architecture
- website copy and protocol compatibility
- security boundaries and developer experience
- release readiness and future roadmap

One broad prompt can make every reviewer repeat the same surface-level answer.
Slices make each response easier to verify and easier to synthesize.

## Good Slice Shape

A useful slice includes:

- one narrow question
- the files or sources the reviewer should inspect
- the harness or model to use, when that matters
- the maximum answer length
- the output shape expected by the synthesis pass

Example slice prompt:

```text
Use the compositional-audit skill.

Slice: Audit whether the IO docs overpromise current behavior.
Read:
- docs/comparisons/openrouter.md
- docs/concepts/interfaces-and-core.md
- CONTRIBUTING.md

Return under 450 words:
1. verdict
2. source-backed facts
3. top risks
4. concrete recommendation
```

## Current Workflow

Install the skill into the harnesses you want to use:

```json
{
  "tool": "ennodia_install_skills",
  "arguments": {
    "skillIds": ["compositional-audit"],
    "harnessIds": ["codex", "claude-code", "opencode", "antigravity"],
    "scope": "project",
    "cwd": "/absolute/path/to/project",
    "dryRun": true
  }
}
```

Estimate the slice fan-out before starting child agents:

```json
{
  "tool": "ennodia_estimate_compositional_budget",
  "arguments": {
    "prompt": "Synthesize these audit shards into the smallest safe next action.",
    "slices": [
      {
        "id": "docs-truth",
        "title": "Docs and positioning",
        "harnessId": "opencode",
        "prompt": "Audit whether the current docs overpromise IO behavior."
      },
      {
        "id": "website-clarity",
        "title": "Homepage clarity",
        "harnessId": "antigravity",
        "prompt": "Audit whether the homepage explains MCP today and experimental IO without sounding speculative."
      }
    ],
    "skillIds": ["compositional-audit"],
    "budget": {
      "maxChildTasks": 6
    }
  }
}
```

Then start the focused tasks:

```json
{
  "tool": "ennodia_start_compositional",
  "arguments": {
    "prompt": "Synthesize these audit shards into the smallest safe next action.",
    "slices": [
      {
        "id": "docs-truth",
        "title": "Docs and positioning",
        "harnessId": "opencode",
        "prompt": "Audit whether the current docs overpromise IO behavior."
      },
      {
        "id": "website-clarity",
        "title": "Homepage clarity",
        "harnessId": "antigravity",
        "prompt": "Audit whether the homepage explains MCP today and experimental IO without sounding speculative."
      }
    ],
    "skillIds": ["compositional-audit"],
    "budget": {
      "maxChildTasks": 6
    }
  }
}
```

Each slice starts one task. Poll the returned task IDs with
`ennodia_get_compositional_status`:

```json
{
  "tool": "ennodia_get_compositional_status",
  "arguments": {
    "prompt": "Synthesize these compositional audit shards into the smallest safe next action. Preserve disagreements and ignore non-signal shards.",
    "taskIds": ["task-id-1", "task-id-2", "task-id-3"]
  }
}
```

When `compareReady` is true, pass the returned `readyTaskIds` to
`ennodia_start_compare`.

```json
{
  "tool": "ennodia_start_compare",
  "arguments": {
    "prompt": "Synthesize these compositional audit shards into the smallest safe next action. Preserve disagreements and ignore non-signal shards.",
    "taskIds": ["task-id-1", "task-id-2", "task-id-3"],
    "maxOutputChars": 12000
  }
}
```

## What To Avoid

- Do not send the entire plan to every shard if the goal is faster, deeper review.
- Do not mix unrelated evidence in one slice.
- Do not treat failed, empty, or access-limited shard output as a normal review.
- Do not claim that a synthesis is consensus when the shards disagree.

## Current Boundary

`ennodia_estimate_compositional_budget` resolves and budgets slices without
starting child agents. `ennodia_start_compositional` starts and budgets the shard
tasks. `ennodia_get_compositional_status` groups shard task states and identifies
Compare-ready outputs. Synthesis stays explicit through `ennodia_start_compare`
so long-running shard status, failed shards, and the final Compare step remain
visible to the primary agent.
