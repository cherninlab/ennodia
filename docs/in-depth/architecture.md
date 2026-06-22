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
Claude Code, Codex CLI, OpenCode, Kilo Code, Kiro CLI, Cline CLI, Hermes Agent,
and Antigravity. Each adapter is intentionally thin: it reports whether the tool
is available, identifies the installed version, and starts the tool through its
supported command-line surface.

### 2. Plan

The router combines prompt classification and the currently available harnesses
to decide where work should go.

For example:

![A request is classified, routed to available harnesses, watched, recovered when needed, compared, and returned with a trace.](../assets/orchestration-pipeline.svg)

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

The MCP client receives the final output and can inspect the in-memory run
record while the MCP server process remains alive.
