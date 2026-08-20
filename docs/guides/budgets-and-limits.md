---
title: Budgets and Limits
description: How Ennodia estimates preflight input-token budgets and enforces local run limits before child agents start.
---

Ennodia can estimate the input-token budget before a costly run starts. The
estimate is a budget limit check, not a provider invoice. Child-task estimates
are lower bounds.

Harness system prompts, file reads, tool calls, and provider-side context are
not visible before the run.

Use it before parallel work or long reviews. Also use it when the user limits
cost, subscription use, or child-task count.

## What the Estimate Includes

`ennodia_estimate_budget` reports:

- selected harness count
- selected harness identifiers (IDs)
- if Compare is planned
- prompt input estimate
- potential Compare input from bounded candidate outputs, capped by the same
  24,000-character per-candidate truncation used in the judge prompt
- subscription-limit check status when a supported local surface exposes it
- any exceeded local limits

The estimate does not claim to know provider billing, output tokens, tool-call
cost, cache behavior, harness-internal context, or private subscription quota.

## Estimate Before a Run

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

If the estimate is too high, use one or more of these changes:

- Select fewer harnesses.
- Make the prompt shorter.
- Decrease `maxOutputChars`.
- Use a narrower first pass.

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

Ennodia checks these local limits before child tasks start. The run fails early
if estimated input tokens or the child-task count exceed a cap. Ennodia does
not start the excess model work.

## Subscription Limits

Subscription quota checks are conservative by design. Ennodia uses only
supported local command-line interface (CLI) and application programming
interface (API) surfaces.

If a provider does not expose account quota through a supported surface,
Ennodia reports the limit as unknown. It does not inspect private account pages
or create an unsupported value.

Today every built-in harness reports subscription quota as unknown because no
supported local surface exposes a reliable account limit. An older fail-closed
quota gate has been retired until at least one current harness exposes a real
supported quota surface.

## Practical Defaults

- For a first documentation or code audit, start with two or three harnesses.
- Use `maxOutputChars` to keep Compare input bounded.
- Keep `maxChildTasks` set when the prompt may route to many adapters.
- Treat unknown subscription-limit status as a transparency signal, not proof
  that a run is cheap or expensive.

See the exact tool schema in
[Model Context Protocol (MCP) Tools](/docs/reference/mcp-tools/).
