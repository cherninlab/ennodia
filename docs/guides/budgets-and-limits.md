---
title: Budgets and Limits
description: How Ennodia estimates preflight input-token budgets and enforces local run limits before starting child agents.
---

Ennodia can estimate the input-token budget before a costly run starts. The
estimate is a planning guardrail, not a provider invoice, and child-task
estimates are lower bounds because harness system prompts, file reads, tool
calls, and provider-side context are not visible before the run.

Use it before parallel work, long reviews, or any run where the user cares about
cost, subscription pressure, or the number of child agents started.

## What the Estimate Includes

`ennodia_estimate_budget` reports:

- selected harness count
- selected harness IDs
- whether Compare is planned
- prompt input estimate
- potential Compare input from bounded candidate outputs, capped by the same
  24,000-character per-candidate truncation used in the judge prompt
- subscription-limit check status when a supported local surface exposes it
- any exceeded local limits

The estimate does not claim to know provider billing, output tokens, tool-call
cost, cache behavior, harness-internal context, or private subscription quota.

## Estimate Before Running

```json
{
  "tool": "ennodia_estimate_budget",
  "arguments": {
    "prompt": "Review this release.",
    "mode": "parallel",
    "compare": true,
    "maxOutputChars": 20000,
    "budget": {
      "maxChildTasks": 4,
      "maxEstimatedInputTokens": 120000
    }
  }
}
```

If the estimate is too high, reduce the selected harnesses, shorten the prompt,
lower `maxOutputChars`, or run a narrower first pass.

## Enforce Limits on a Run

The same budget object can be passed to `ennodia_run`:

```json
{
  "tool": "ennodia_run",
  "arguments": {
    "prompt": "Review this release.",
    "mode": "parallel",
    "compare": true,
    "maxOutputChars": 20000,
    "budget": {
      "maxChildTasks": 4,
      "maxEstimatedInputTokens": 120000
    }
  }
}
```

Ennodia checks these local limits before starting child tasks. If the estimated
input tokens or selected child-task count exceeds the cap, the run fails early
instead of silently launching more model work.

## Subscription Limits

Subscription quota checks are intentionally conservative. Ennodia only uses
supported local CLI/API surfaces. If a provider does not expose account quota
through a supported surface, Ennodia reports the limit as unknown instead of
scraping private account pages or inventing a number.

Today every built-in harness reports subscription quota as unknown because no
supported local surface exposes a reliable account limit. An older fail-closed
quota gate has been retired until at least one current harness exposes a real
supported quota surface.

## Practical Defaults

- For a first docs or code audit, start with two or three harnesses.
- Use `maxOutputChars` to keep Compare input bounded.
- Keep `maxChildTasks` set when the prompt may route to many adapters.
- Treat unknown subscription-limit status as a transparency signal, not proof
  that a run is cheap or expensive.

See the exact tool schema in [MCP Tools](/docs/reference/mcp-tools/).
