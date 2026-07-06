---
title: What is Ennodia?
description: Start here to understand Ennodia, choose the right setup path, and find the docs page for your task.
---

Ennodia is a local MCP server for multi-agent review. Your primary AI agent can
ask other installed agent CLIs for help, inspect what happened, and let a model
compare the answers before you get one result.

It is useful when one agent is already working and the task is important enough
to spend extra model work on review, planning, diagnosis, or comparison.
Ennodia is deliberation-class tooling: a run usually takes minutes, and Compare
adds a serial judge pass plus a serial synthesizer pass after child agents
finish.

## The Problem Ennodia Solves

The primary problem is single-model judgment as a single point of failure. One
agent can miss the risky bug, accept a weak plan, or hallucinate confidence.
For important work, you often want independent second opinions and a record of
what each reviewer actually did.

The enabling asset is that many developers already pay for several independent
agent subscriptions — Codex, Claude Code, Antigravity, OpenCode, and others.
Ennodia turns the installed CLIs on one machine into a review panel your
primary agent can use, without new accounts, API keys, or vendor migration:

- Agents reach Ennodia through MCP, the protocol agents already speak.
- Model-led Compare produces a structured disagreement map and final synthesis.
- One shared core discovers harnesses, plans routes, checks local preflight
  limits, tracks tasks, and keeps the trace visible.
- The separate Ennodia IO package is an experimental app-facing appendix.

## Why People Use It

Ennodia:

- discovers supported local harnesses automatically
- uses the CLIs, installs, subscriptions, and model choices you already have
- estimates preflight input-token budgets and enforces local caps on that
  estimate
- keeps child task IDs, status, ETA, output, failures, Compare state, and run
  history visible, including terminal receipts across server restarts
- lets a model judge and synthesize parallel answers
- uses native Agent Skills through harness-visible `SKILL.md` folders

Durable model and skill preference memory is roadmap work. Terminal run history
is persisted locally under `~/.ennodia/history/` by default; live in-progress
state remains process-local.

## Choose Your Path

| If you want to... | Start here |
| --- | --- |
| Ask an agent to install Ennodia for you | [Installation for Agents](./install/) |
| Set it up manually or work from a checkout | [Quickstart](./getting-started/) |
| Estimate or limit a costly run | [Budgets and Limits](./guides/budgets-and-limits/) |
| Install or use `source-grounded-audit` and other skills | [Using Agent Skills](./guides/agent-skills/) |
| Understand the run lifecycle | [How Ennodia Works](./concepts/how-ennodia-works/) |
| Use panels for second opinions | [Second Opinions as Infrastructure](./concepts/second-opinions/) |
| Understand local storage and data movement | [Data Governance](./concepts/data-governance/) |
| Understand Core, <span class="agent-logo agent-logo--mcp" aria-hidden="true"></span>MCP, and experimental IO | [Interfaces and Core](./concepts/interfaces-and-core/) |
| Split a large review into smaller shards | [Compositional Audits](./concepts/compositional-audits/) |
| Call the exact <span class="agent-logo agent-logo--mcp" aria-hidden="true"></span>MCP tools | [MCP Tools](./reference/mcp-tools/) |
| Call Ennodia from a local HTTP app | [Ennodia IO](./reference/ennodia-io/) |
| Check harness IDs and setup notes | [Supported Harnesses](./reference/supported-harnesses/) |
| Inspect benchmark receipts | [Benchmarks](./reference/benchmarks/) |
| Decide whether Ennodia fits your workflow | [Comparisons](./comparisons/) |
| Get better output from model-led Compare | [Running Better Audits](./guides/running-better-audits/) |

## First Useful Run

1. Install Ennodia in your MCP client.
2. Call `ennodia_list_harnesses`.
3. Call `ennodia_estimate_budget` for the task.
4. Start `ennodia_run`.
5. Poll `ennodia_get_run` until it reaches `succeeded`, `failed`, or
   `cancelled`.

The user should not need to manually grade every child answer unless they want
to inspect the trace.
