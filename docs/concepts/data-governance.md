---
title: Data Governance
description: What Ennodia stores, what it does not store, and where data can leave the machine.
---

Ennodia is local orchestration software. It does not send prompts, source code,
task output, or telemetry to an Ennodia-hosted service. The selected child agent
CLIs can still contact their own model providers according to their own
configuration, subscriptions, and policies.

## What Ennodia Stores

Live process state is held in memory while the server runs. It includes run
status, task IDs, command summaries, stdout/stderr captures, failures, timing,
and budget estimates. It also includes Plan Advisor proposals and validation
state, Compare analysis, and final answers.

When `isolateCwd` is enabled, Ennodia copies the requested working directory
to an ephemeral operating-system temporary directory so concurrent workers do
not overwrite one another. The copy excludes `.git` and `node_modules`, but it
can include other ignored files and local secrets present in the working
directory. Ennodia deletes this scratch copy after the task becomes terminal
and retries cleanup during task pruning and graceful shutdown. The task's
reported `cwd` remains an execution trace, not a persistent artifact path.

After excluding `.git` and `node_modules` by name, isolation rejects any
symbolic link in the remaining tree before spawning the task. This fail-closed
rule prevents an isolated worker from following an absolute or parent-relative
link back outside its scratch directory.
An abrupt process or machine termination can still leave operating-system
temporary files behind.

Terminal run history is stored under `~/.ennodia/history/runs.jsonl` by default.
Each snapshot contains the terminal run view and bounded task views. The final
answer is capped at 80,000 characters. Each task stream is capped at 20,000
characters. Each snapshot keeps the 50 most recent events and Judge/Result
Advisor output when Compare ran. It does not persist Plan Advisor requests,
environment variables, provider credentials, or raw process environments.

History writes use an append-only hot path. Periodic compaction keeps the most
recent 500 runs. An interrupted append can lose its current snapshot.
A concurrent append in the short compaction window can also be lost.

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

Use Ennodia for work that you are willing to send to the selected local agent
CLIs. Use `cwd` deliberately. Prefer short staged case files over broad prompts.
Inspect `ennodia_list_harnesses` before sensitive work so the active local tools
are clear.
