---
title: MCP tools
description: The public MCP tool surface exposed by Ennodia.
---

This page describes the MCP tools exposed by the Ennodia server.

## Shared behavior

`ennodia_plan`, `ennodia_start`, and `ennodia_run` use a lightweight keyword
classifier to choose a route. Call `ennodia_plan` first when you want to inspect
that decision without starting a child process. Pass `harnessId` to
`ennodia_start` or `ennodia_run` when you want to override routing.

Harness discovery is cached briefly. Tools that accept `refresh` can set it to
`true` to re-scan local command paths and versions before planning or starting
work.

Fields named `maxOutputChars`, `maxAnswerChars`, or `maxCandidateChars` bound
returned text. A value of `0` omits that text while still returning status,
IDs, timing, and counts.

## Discovery and planning

### `ennodia_list_harnesses`

Detects supported local AI tools and reports whether each one is runnable.

Use this first when debugging a client setup.

### `ennodia_plan`

Classifies a prompt and previews the route Ennodia would take with the currently
available harnesses.

This does not start a child process.

## End-to-end runs

### `ennodia_run`

Plans a request, starts selected child tasks, optionally compares successful
outputs, and returns a monitorable run ID.

This is the main high-level tool.

### `ennodia_get_run`

Returns run status, selected harnesses, child task IDs, Compare ID, events,
timing, ETA, and the final answer when available.

### `ennodia_cancel_run`

Cancels a high-level run and any active child task or Compare.

Cancellation is explicit: a cancelled run should not be reported as a normal
model failure.

### `ennodia_list_runs`

Lists runs started by the current Ennodia MCP server process.

## Direct tasks

### `ennodia_start`

Starts one or more local AI tool tasks and returns task IDs for monitoring.

Use this when you want direct task control instead of the full run orchestration.
Use `ennodia_run` for the normal end-to-end path.

### `ennodia_get_task`

Returns task status, captured output, events, timing, and ETA.

### `ennodia_cancel_task`

Cancels a running task by task ID.

### `ennodia_list_tasks`

Lists tasks started by the current Ennodia MCP server process.

## Compare

### `ennodia_start_compare`

Runs a judge and synthesizer over completed task outputs or supplied responses.

Compare is useful when you already have several answers and want a structured
review of agreement, disagreement, unique insights, blind spots, and risks.

### `ennodia_get_compare`

Returns Compare status, candidate inputs, judge analysis, synthesis, child task
IDs, timing, and ETA.

### `ennodia_cancel_compare`

Cancels a running Compare and its active child task.

### `ennodia_list_compares`

Lists Compare runs started by the current Ennodia MCP server process.
