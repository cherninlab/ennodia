---
title: How Ennodia works
description: A visible orchestration pipeline for routing, task watching, recovery, Compare, and final synthesis.
---

When an MCP client submits a high-level run, Ennodia processes it through a
visible orchestration pipeline. The `ennodia_run` tool is the current end-to-end
entrypoint. Lower-level task and Compare tools stay available for debugging and
manual control.

### 1. Discover

Ennodia maintains a registry of execution backends. The current adapters cover
Claude Code, Codex CLI, OpenCode, and Antigravity. Each adapter is intentionally
thin: it reports whether the tool is available, identifies the installed
version, and starts the tool through its supported command-line surface.

### 2. Plan

The router combines task classification, available harnesses, and simple project
rules to decide where work should go.

For example:

![A code-review request is classified, routed through project rules to Claude Code and Codex CLI, compared, resolved, and returned as a final review.](../assets/orchestration-pipeline.svg)

### 3. Execute

Each node in the graph is dispatched through a thin adapter. Ennodia keeps the
shared task lifecycle outside the adapter: process start, output capture,
timeout handling, cancellation, and terminal status all live in core modules.

### 4. Watch

Every external command becomes a tracked child task. A task is not terminal until
the child process exits and captured output has drained.

### 5. Recover

Failure handling is part of the execution plan. Nodes can time out, fail, be
cancelled, or return partial output without hiding what happened.


### 6. Compare

When several agents produce answers, Ennodia does not concatenate them. A judge
can produce a structured comparison: consensus, contradictions, unique insights,
blind spots, and risks. A synthesizer then uses that comparison and the original
outputs to create the final result.

### 7. Return

The MCP client receives the final output, while Ennodia retains the complete execution record.
