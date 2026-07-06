---
title: Interfaces and Core
description: How Ennodia's MCP interface and shared core behavior relate to each other.
---

## Current Shape

| Name | Status | What it means |
| --- | --- | --- |
| <span class="agent-logo agent-logo--mcp" aria-hidden="true"></span>Ennodia MCP | Available | The shipped MCP tool interface for agents. Use this today. |
| Ennodia Core | Available | Shared orchestration behavior behind the MCP and IO surfaces. |

## Ennodia MCP

Ennodia MCP is the supported public surface in the current release. It exposes
tools such as `ennodia_list_harnesses`, `ennodia_estimate_budget`,
`ennodia_run`, `ennodia_get_run`, and `ennodia_start_compare`. Each tool is a
schema plus one Core call — nothing more.

Use MCP when a primary agent should ask installed local agent CLIs for help.

## Ennodia Core

Core is responsible for:

- discovering supported local harnesses
- planning routes with caller-provided categories or keyword fallback
- estimating preflight budgets and enforcing local caps on that estimate
- starting child tasks through thin adapters
- capturing status, output, failures, and timing
- resolving compositional slices and reporting Compare readiness
- comparing successful outputs when requested

## Ennodia IO

Ennodia IO is a local app interface. Start the HTTP server with:

```sh
npx -y @cherninlab/ennodia-io
```

See [Ennodia IO](/docs/reference/ennodia-io/) for supported fields, rejected
features, local binding defaults, and auth behavior.
