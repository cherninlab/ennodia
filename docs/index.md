---
title: What is Ennodia?
description: Start here to understand Ennodia, select an installation path, and find the documentation page for your task.
---

Ennodia is a local Model Context Protocol (MCP) server for multi-agent review.
Your primary artificial intelligence (AI) agent can request help from installed
agent command-line interfaces (CLIs).

The primary agent can inspect the work. It can use a Judge and Result Advisor to
compare the answers.

An optional Plan Advisor can first propose a bounded team. It cannot execute the
proposal.

Use Ennodia when one agent has a task that needs additional review, a plan, a
diagnosis, or a comparison. A run usually takes minutes.

Compare adds a serial Judge pass and a serial Result Advisor pass after the
child agents finish.

## The Problem Ennodia Solves

Single-model judgment can be a single point of failure. One agent can miss a
risky bug, accept a weak plan, or report false confidence.

Important work can require independent second opinions and a record of each
reviewer's work.

Many developers have independent agent subscriptions. Examples include Codex,
Claude Code, Antigravity, and OpenCode. Ennodia makes their installed CLIs a
review panel for the primary agent.

This process does not require new accounts or a vendor migration. It does not
require new application programming interface (API) keys.

- Agents reach Ennodia through MCP, a protocol that the agents support.
- A Plan Advisor can propose inert harness, model, and skill assignments. A
  separate explicit call must launch the validated plan.
- Model-led Compare uses a Judge for the disagreement map and a Result Advisor
  for the recommended answer.
- One shared core discovers harnesses, plans routes, checks local preflight
  limits, tracks tasks, and keeps the trace visible.
- The separate Ennodia IO package is an experimental appendix for apps.

## Why People Use It

Ennodia:

- discovers supported local harnesses automatically
- uses your installed CLIs, subscriptions, and model choices
- estimates preflight input-token budgets and enforces local caps on that
  estimate
- keeps child task identifiers (IDs), status, estimated completion time,
  output, failures, Compare state, and run
  history visible
- can retain terminal receipts across server restarts
- lets a Judge inspect parallel answers and a Result Advisor combine the
  findings
- uses native Agent Skills through harness-visible `SKILL.md` folders

Durable model and skill preference memory is roadmap work. By default, Ennodia
stores terminal run history under `~/.ennodia/history/`. Live in-progress state
remains process-local.

## Choose Your Path

| Task | Page |
| --- | --- |
| Request Ennodia installation from an agent | [Installation for Agents](./install/) |
| Install it manually or work from a checkout | [Quickstart](./getting-started/) |
| Estimate or limit a costly run | [Budgets and Limits](./guides/budgets-and-limits/) |
| Install or use `source-grounded-audit` and other skills | [Agent Skills](./guides/agent-skills/) |
| Understand the run lifecycle | [How Ennodia Works](./concepts/how-ennodia-works/) |
| Request a bounded team proposal before work | [How Ennodia Works](./concepts/how-ennodia-works/#plan-advisor) |
| Use panels for second opinions | [Second Opinions as Infrastructure](./concepts/second-opinions/) |
| Understand local storage and data movement | [Data Governance](./concepts/data-governance/) |
| Understand Core, <span class="agent-logo agent-logo--mcp" aria-hidden="true"></span>MCP, and experimental IO | [Interfaces and Core](./concepts/interfaces-and-core/) |
| Split a large review into smaller shards | [Compositional Audits](./concepts/compositional-audits/) |
| Call the exact <span class="agent-logo agent-logo--mcp" aria-hidden="true"></span>MCP tools | [MCP Tools](./reference/mcp-tools/) |
| Call Ennodia from a local web app | [Ennodia IO](./reference/ennodia-io/) |
| Check harness identifiers and installation notes | [Supported Harnesses](./reference/supported-harnesses/) |
| Use the ASD-STE100 rules and approved Ennodia terms | [Controlled English](./reference/controlled-english/) |
| Inspect benchmark receipts | [Benchmarks](./reference/benchmarks/) |
| Decide if Ennodia fits your workflow | [Comparisons](./comparisons/) |
| Get better output from model-led Compare | [Better Audits](./guides/running-better-audits/) |

## First Useful Run

1. Install Ennodia in your MCP client.
2. Call `ennodia_list_harnesses`.
3. Call `ennodia_estimate_budget` for the task.
4. Start `ennodia_run`.
5. Poll `ennodia_get_run` until it reaches `succeeded`, `failed`, or
   `cancelled`.

The user does not normally need to grade each child answer. The trace remains
available for inspection.

For a team proposal, call `ennodia_start_plan_advice`. Then poll
`ennodia_get_plan_advice`. A ready result is only validated data.

Call `ennodia_start_advised_plan` with the returned plan digest once to start the
work.
