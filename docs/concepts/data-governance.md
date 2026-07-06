---
title: Data Governance
description: What Ennodia stores, what it does not store, and where data can leave the machine.
---

Ennodia is local orchestration software. It does not send prompts, source code,
task output, or telemetry to an Ennodia-hosted service. The selected child agent
CLIs can still contact their own model providers according to their own
configuration, subscriptions, and policies.

## What Ennodia Stores

Live process state is held in memory while the server runs: run status, task
IDs, command summaries, stdout/stderr captures, failures, timing, budget
estimates, Compare analysis, and final answers.

Terminal run history is stored under `~/.ennodia/history/runs.jsonl` by default.
Each snapshot contains the terminal run view (final answer capped at 80,000
characters), task views with output capped at 20,000 characters per stream and
the 50 most recent events, and Compare analysis/synthesis when Compare ran. It
does not persist environment variables, provider credentials, or raw process
environments.

History writes are append-only with periodic compaction to the most recent 500
runs. An interrupted write can lose at most the snapshot being written, never
previously recorded history.

Set `ENNODIA_HISTORY=0` to disable durable history. Set
`ENNODIA_HISTORY_DIR=/path/to/dir` to move the history file.

## What Ennodia Does Not Know

Budget estimates are preflight input-token estimates, not provider bills. They
exclude provider-side system prompts, file reads performed inside a child
agent, tool loops, output tokens, cache behavior, and private subscription
state. Subscription quota is reported as unknown unless a supported local
surface exposes a reliable value.

## Explicit Writes

`ennodia_install_skills` can write bundled `SKILL.md` folders into project or
user skill locations. It defaults to `dryRun: true`, and project-scope installs
require an explicit `cwd`.

Benchmark runs write under `bench/results/bug-recall/` unless `--out` is
provided. Those results are ignored by default because live outputs can include
model text and environment metadata.

## Practical Guidance

Use Ennodia for work you are already willing to send to the selected local agent
CLIs. Use `cwd` deliberately, prefer short staged case files over broad prompts,
and inspect `ennodia_list_harnesses` before sensitive work so the active local
tools are clear.
