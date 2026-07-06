---
title: Comparisons
description: How Ennodia compares to model routers, chat comparison tools, agent frameworks, ensembles, model merging, and adjacent multi-agent ideas.
---

Ennodia is a local capability layer for installed agent CLIs. Through MCP, it
lets a primary agent ask those local agents for help, then inspect child task
status, raw outputs, failures, budget assumptions, and model-led Compare
results. Through experimental IO, apps can discover local provider options and
send a small OpenAI-compatible chat-completions subset to those same agents.

This section exists because several adjacent tools sound similar from far away.
They are usually optimized for different jobs.

## Choose the Right Page

| If you are asking... | Read |
| --- | --- |
| Is Ennodia a hosted multi-model API? | <span class="agent-logo agent-logo--openrouter" aria-hidden="true"></span>[Ennodia vs OpenRouter](./openrouter/) |
| Is Ennodia a side-by-side chatbot UI? | [Ennodia vs ChatHub](./chathub/) |
| Is Ennodia a graph runtime for agents? | <span class="agent-logo agent-logo--langgraph" aria-hidden="true"></span>[Ennodia vs LangGraph](./langgraph/) |
| Is Ennodia like AutoGen? | [Ennodia vs AutoGen](./autogen/) |
| Is Ennodia a general-purpose agent framework? | [Ennodia vs Agent Frameworks](./agent-frameworks/) |
| Is Ennodia an ensemble or Mixture-of-Agents system? | [Ennodia vs MoA and Ensembles](./mixture-of-agents/) |
| Is Ennodia model merging? | [Ennodia vs Model Merging](./model-merging/) |
| What is the broader pattern? | [Second Opinions as Infrastructure](/docs/concepts/second-opinions/) |

## What Ennodia Is

Ennodia is:

- a local MCP server
- an experimental local IO surface for app-facing provider options
- a way for a primary agent to ask other installed local agents for help
- a runner for real local agent CLIs, not only raw model APIs
- a visible trace of child task IDs, status, stdout, stderr, failures, final
  answers, and terminal run history
- a preflight budget estimate and local limit check before expensive runs
- a model-led Compare workflow over successful outputs
- a native Agent Skills bridge for harnesses that support `SKILL.md` folders

## What Ennodia Is Not

Ennodia is not:

- a hosted model provider
- an all-in-one API router
- a side-by-side chatbot interface
- a model merging or fine-tuning tool
- a general hosted OpenAI-compatible inference proxy
- a formal consensus engine
- a replacement for a primary coding agent
- proof that multi-agent review improves every task

Durable model and skill preference memory is roadmap work. Terminal run history
is persisted locally by default; in-progress run and task state remains
process-local.

## Other Related Work

Some related ideas do not need a full page yet:

| Category | Examples | How Ennodia differs |
| --- | --- | --- |
| Model councils | [karpathy/llm-council](https://github.com/karpathy/llm-council) | Ennodia adapts council-like review to local agent CLIs, MCP task state, failures, and traces. |
| Evaluator-optimizer loops | Generator/evaluator workflows | Ennodia can support review loops, but its core unit is delegation to installed local agents. |
| Consensus and voting | Majority, quorum, or weighted-vote schemes | Ennodia Compare judges and synthesizes; it does not implement formal voting rules. |
| Inference optimization proxies | [optillm](https://github.com/algorithmicsuperintelligence/optillm) | Ennodia runs installed local agents and exposes a small local IO subset; it is not a hosted inference optimization proxy. |

Use another tool when that tool's job is the job you need. Use Ennodia when the
primary agent is already working and needs visible help from other local agents.
