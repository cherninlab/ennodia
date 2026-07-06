---
title: How Ennodia Works
description: A visible orchestration pipeline for routing, budget checks, task watching, recovery, Compare, and final synthesis.
---

When an MCP client starts a high-level run, Ennodia turns one request into a
visible orchestration. The normal entrypoint is `ennodia_run`; lower-level task
and Compare tools stay available for debugging and manual control.

## Pipeline at a Glance

| Stage | What happens | Main tools |
| --- | --- | --- |
| Discover | Ennodia finds installed agent CLIs and reports whether each harness is runnable. | `ennodia_list_harnesses` |
| Plan | The router uses a caller-provided category when supplied, otherwise a keyword fallback, then chooses candidate harnesses. | `ennodia_plan`, `ennodia_run` |
| Budget | Ennodia estimates preflight input tokens and checks optional local limits on that estimate. | `ennodia_estimate_budget`, `ennodia_run` |
| Execute | Thin adapters start the selected local agent CLI commands. Each child has a default 5-minute timeout and a 1-hour maximum accepted by the public tools. | `ennodia_start`, `ennodia_run` |
| Watch | Child task status, stdout, stderr, timing, and failures stay inspectable. | `ennodia_get_task`, `ennodia_get_run` |
| Recover | Timeouts, cancellations, and failed children are reported instead of hidden. | `ennodia_cancel_task`, `ennodia_cancel_run` |
| Compare | A model judges and synthesizes successful outputs when comparison is requested. Compare adds two serial model passes after child agents finish. | `ennodia_start_compare`, `ennodia_get_compare` |
| Return | The MCP client receives one final answer plus an inspectable run record and durable terminal receipt. | `ennodia_get_run`, `ennodia_history` |

## Discover

Ennodia maintains a registry of execution backends. Each adapter is intentionally
thin: it reports whether the tool is available, identifies the installed
version, and starts the tool through its supported command-line surface.

See [Supported Harnesses](/docs/reference/supported-harnesses/) for current
adapter IDs and setup notes.

## Plan

The router combines the currently available harnesses with either a
caller-provided category (`code`, `research`, `browser`, `image`, or `general`)
or a small keyword fallback. Agent callers should pass `category` when they
already know what kind of work they are asking for; the fallback is a convenience
path, not a claim of deep intent understanding.

![A request is classified, routed to available harnesses, watched, recovered when needed, compared, and returned with a trace.](../assets/orchestration-pipeline.svg)

## Budget

Before a high-level run starts child tasks, Ennodia can estimate the input-token
budget. The estimate includes selected child task count, prompt input, planned
Compare input, and the effective candidate bound used in the judge prompt.

Budget checks are intentionally honest. Ennodia can enforce local preflight
limits such as `maxChildTasks` and `maxEstimatedInputTokens` on that estimate.
Child-task estimates exclude harness system prompts, file reads, tool loops, and
provider-side context, so real usage can be higher. Ennodia only reports
subscription quota as known when a supported local CLI/API surface exposes it.

See [Budgets and Limits](/docs/guides/budgets-and-limits/) for request shapes.

## Execute

Each node in the graph is dispatched through a thin adapter. Ennodia keeps the
shared task lifecycle outside the adapter: process start, output capture,
timeout handling, cancellation, and terminal status all live in core modules.

Expect this stage to take minutes, not seconds. Every child task launches a real
agent CLI. The default per-task timeout is 5 minutes, and public tool schemas
cap requested timeouts at 1 hour.

## Watch

Every external command becomes a tracked child task. A task is not terminal until
the child process exits and captured output has drained.

## Recover

Failure handling is part of the execution plan. Nodes can time out, fail, be
cancelled, or return partial output without hiding what happened.

## Compare

When several agents produce answers, Ennodia does not concatenate them. A judge
can produce a structured comparison: agreements, contradictions, unique
insights, blind spots, and risks. A synthesizer then uses that comparison and
the original outputs to create the final result.

Compare is model-led synthesis, not formal voting or consensus.

Compare is also serial: a judge task runs first, then a synthesizer task runs
after the judge completes. For a parallel run with N child agents, budget and
latency should be understood as N child runs plus those two Compare passes.

## Return

The MCP client receives the final output and can inspect live in-memory state
while the MCP server process remains alive. Terminal run snapshots are also
written under `~/.ennodia/history/` by default, capped to the most recent 500
runs. Set `ENNODIA_HISTORY=0` to opt out or `ENNODIA_HISTORY_DIR` to choose a
different local directory.
