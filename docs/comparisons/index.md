---
title: Comparisons
description: How Ennodia compares to model routers, chat comparison tools, agent frameworks, ensembles, model merging, and adjacent multi-agent ideas.
---

Ennodia is a local capability layer for installed agent command-line interfaces
(CLIs). Through Model Context Protocol (MCP), a primary agent can request help
from those local agents.

The primary agent can inspect child task status, raw outputs, failures, budget
assumptions, and model-led Compare results.

Through experimental Ennodia IO, apps can discover local provider options. Apps
can send a small OpenAI-compatible chat-completions application programming
interface (API) subset to the same agents.

Some adjacent tools have similar descriptions. They usually have different
purposes.

## Choose the Right Page

| Question | Page |
| --- | --- |
| Is Ennodia a hosted multi-model API? | <span class="agent-logo agent-logo--openrouter" aria-hidden="true"></span>[Ennodia vs OpenRouter](./openrouter/) |
| Is Ennodia a side-by-side chatbot user interface (UI)? | [Ennodia vs ChatHub](./chathub/) |
| Is Ennodia a graph runtime for agents? | <span class="agent-logo agent-logo--langgraph" aria-hidden="true"></span>[Ennodia vs LangGraph](./langgraph/) |
| Is Ennodia like AutoGen? | [Ennodia vs AutoGen](./autogen/) |
| Is Ennodia a general-purpose agent framework? | [Ennodia vs Agent Frameworks](./agent-frameworks/) |
| Is Ennodia an ensemble or Mixture-of-Agents system? | [Ennodia vs Mixture-of-Agents and Ensembles](./mixture-of-agents/) |
| Is Ennodia model merging? | [Ennodia vs Model Merging](./model-merging/) |
| What is the broader pattern? | [Second Opinions as Infrastructure](/docs/concepts/second-opinions/) |

## What Ennodia Is

Ennodia is:

- a local MCP server
- an experimental local IO surface for provider options in apps
- a way for a primary agent to request help from other installed local agents
- a runner for real local agent CLIs, not only raw model APIs
- a visible trace of child task identifiers (IDs), status, standard output,
  standard error, failures, final answers, and terminal run history
- a preflight budget estimate and local limit check before expensive runs
- an optional Plan Advisor that proposes a validated, inert work plan and never
  executes it
- a model-led Compare workflow where the Judge maps successful outputs and the
  Result Advisor recommends an answer
- a native Agent Skills bridge for harnesses that support `SKILL.md` folders

## What Ennodia Is Not

Ennodia is not:

- a hosted model provider
- an all-in-one API router
- a side-by-side chatbot interface
- a model merging or fine-tuning tool
- a general hosted OpenAI-compatible inference proxy
- a formal consensus engine
- a replacement for a primary agent
- proof that multi-agent review improves every task

Durable model and skill preference memory is roadmap work. By default, Ennodia
stores terminal run history locally. In-progress run and task state remains
process-local.

## Other Related Work

Some related ideas do not need a full page yet:

| Category | Examples | How Ennodia differs |
| --- | --- | --- |
| Model councils | [karpathy/llm-council](https://github.com/karpathy/llm-council) | Ennodia adapts council-like review to local agent CLIs, MCP task state, failures, and traces. |
| Evaluator-optimizer loops | Generator/evaluator workflows | Ennodia can support review loops, but its principal operation delegates work to installed local agents. |
| Consensus and voting | Majority, quorum, or weighted-vote schemes | Ennodia Compare uses a Judge and Result Advisor. It does not implement formal voting rules. |
| Inference optimization proxies | [optillm](https://github.com/algorithmicsuperintelligence/optillm) | Ennodia runs installed local agents and exposes a small local IO subset. It is not a hosted inference optimization proxy. |

Use another tool if its purpose matches your task. Use Ennodia when a primary
agent needs visible help from other local agents.
