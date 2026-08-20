---
title: Interfaces and Core
description: How Ennodia's Model Context Protocol (MCP) interface and shared core behavior relate to each other.
---

## Current Shape

Ennodia has a Model Context Protocol (MCP) interface and a shared Core.

| Name | Status | What it means |
| --- | --- | --- |
| <span class="agent-logo agent-logo--mcp" aria-hidden="true"></span>Ennodia MCP | Available | The shipped MCP tool interface for agents. Use this today. |
| Ennodia Core | Available | Shared orchestration behavior behind the MCP and IO surfaces. |

## Ennodia MCP

Ennodia MCP is the supported public surface in the current release. It exposes
tools such as `ennodia_list_harnesses`, `ennodia_estimate_budget`,
`ennodia_run`, `ennodia_start_plan_advice`, `ennodia_get_run`, and
`ennodia_start_compare`. Each tool is a schema plus one Core call — nothing
more.

Use MCP when a primary agent needs help from installed local agent
command-line interface (CLI) programs.

## Ennodia Core

Core is responsible for:

- discovering supported local harnesses
- planning routes with caller-provided categories or keyword fallback
- estimating preflight budgets and enforcing local caps on that estimate
- running the optional Plan Advisor against a bounded inventory, validating its
  inert proposal, and requiring a separate digest-bound call before execution
- starting child tasks through thin adapters
- capturing status, output, failures, and timing
- resolving compositional slices and reporting Compare readiness
- running the Judge and Result Advisor over successful outputs when Compare is
  requested

The roles do not own runtime policy. Plan Advisor proposes harness, model, and
skill assignments but never executes them. Result Advisor combines Judge
findings after Compare. If Judge analysis is unavailable, its candidates-only
basis is exposed rather than hidden.

## Ennodia IO

Ennodia IO is a local app interface. Start the Hypertext Transfer Protocol
(HTTP) server with:

```sh
npx -y @cherninlab/ennodia-io
```

See [Ennodia IO](/docs/reference/ennodia-io/) for supported fields, rejected
features, local binding defaults, and auth behavior.
