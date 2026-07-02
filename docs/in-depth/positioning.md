---
title: Positioning and Related Work
description: How Ennodia fits among model routers, model councils, model merging, ensembles, voting, and local agent orchestration.
---

Ennodia is not the first multi-model or multi-agent idea, and it does not need
to be. Model councils, ensembles, evaluator loops, model merging, inference
proxies, and multi-agent frameworks all explore related territory.

Ennodia is narrower than most of them. It is a local MCP server that lets one
AI agent ask other installed local agent CLIs for help during a task. It keeps
the delegated runs visible: selected harnesses, task IDs, timing, failures,
raw outputs, Compare state, and the final synthesized answer.

That is the useful distinction. Ennodia is not trying to replace hosted model
routers, chat comparison tools, model merging, or general agent frameworks.

## The Landscape

| Category | Examples | What they are good at | How Ennodia differs |
| --- | --- | --- | --- |
| Hosted model routers | [OpenRouter](https://openrouter.ai/docs) | One API for many hosted models, routing, fallbacks, billing, provider choice, and model catalog access. | Ennodia does not provide hosted model access. It coordinates local agent CLIs through MCP. |
| Side-by-side chat tools | [ChatHub](https://chathub.gg/) | Human-facing comparison of responses from several chatbots, often with a polished UI and subscription model. | Ennodia is not a chat UI. It is meant to be called by an AI agent while that agent is already working. |
| Model councils | [karpathy/llm-council](https://github.com/karpathy/llm-council) | Several models answer a question, then a chair model synthesizes the result. | Ennodia adapts that shape to local agent CLIs, MCP tools, task state, failures, and inspectable run traces. |
| Model merging | [NVIDIA model merging overview](https://developer.nvidia.com/blog/an-introduction-to-model-merging-for-llms/), [mergekit](https://github.com/arcee-ai/mergekit), [arXiv:2502.09056](https://arxiv.org/abs/2502.09056) | Combining model weights or capabilities into one model artifact, often keeping single-model inference cost. | Ennodia does not touch weights. It coordinates separate agents at runtime. |
| Mixture-of-Agents and ensembles | [Mixture-of-Agents](https://arxiv.org/abs/2406.04692), [Majority Rules](https://arxiv.org/abs/2511.15714) | Aggregating multiple model outputs can improve response quality or categorical decisions in evaluated settings. | Ennodia is not primarily a benchmark ensemble. It manages local agent subprocesses, outputs, failures, and Compare. |
| Evaluator-optimizer loops | [Evaluator-Optimiser workflow](https://mlpills.substack.com/p/diy-19-evaluator-optimiser-llm-agent) | A generator drafts, an evaluator critiques, and the generator revises until the result passes or stops. | Ennodia can support review-like workflows, but its core unit is delegation to other agent CLIs, not one fixed generator/evaluator loop. |
| Consensus and voting | [Hermes Agent issue #412](https://github.com/NousResearch/hermes-agent/issues/412) | Majority, supermajority, quorum, weighted votes, and other structured decision rules. | Ennodia's current Compare is not formal voting. It judges and synthesizes outputs; it should not be described as consensus unless voting rules are implemented. |
| Inference optimization proxies | [optillm](https://github.com/algorithmicsuperintelligence/optillm) | Drop-in OpenAI-compatible proxy behavior, test-time compute, and inference strategies such as best-of-N or MoA-style calls. | Ennodia is not an OpenAI-compatible inference proxy. It is an MCP server for local agent delegation. |
| General agent frameworks | LangGraph, AutoGen, CrewAI, and similar frameworks | Custom programmable agent graphs, workflows, memory, roles, and tool use. | Ennodia is less general. It offers a small MCP surface for asking installed local agents for help and inspecting what happened. |

## What Ennodia Is

Ennodia is:

- a local MCP server
- a way for a primary agent to ask other local agents for help
- a runner for real local agent CLIs, not only raw model APIs
- a visible trace of child tasks, failures, partial output, and final status
- a Compare/Judge/Synthesizer workflow over successful outputs
- a practical local tool, not a claim that more agents are always better

## What Ennodia Is Not

Ennodia is not:

- a hosted model provider or all-in-one API router
- a side-by-side chatbot interface
- a model merging or fine-tuning tool
- a general OpenAI-compatible inference proxy
- a formal consensus engine
- a replacement for a primary coding agent
- proof that multi-agent review improves every task

## When Another Tool Is Better

Use OpenRouter or a similar router when you need hosted model access, provider
fallbacks, one billing path, or a large model catalog behind one API.

Use ChatHub or a similar chat comparison tool when a human wants to compare
model answers visually.

Use mergekit or model merging methods when you want one merged model artifact
and you control compatible open weights.

Use optillm when you want an OpenAI-compatible proxy that applies inference-time
optimization strategies to model calls.

Use a general agent framework when you need to design a full custom workflow
graph with persistent roles, memory, branching, and application-specific state.

Use Ennodia when a primary agent is already working and needs to ask other
installed local agents for help without hiding the subprocesses, failures, or
raw outputs.

## What Ennodia Does Not Claim

- Ennodia is not the first multi-agent or multi-model system, and does not
  claim to be. See the lineage in the table above.
- Adjacent tools are not "worse" — each is optimized for a different job.
- Compare is not consensus. It judges and synthesizes outputs; it does not
  implement voting, quorum, or weighting.
- Current benchmarks are narrow. They measure what they measure, not general
  production-code quality.

Ennodia came from a local workflow need, and it belongs to a broader lineage
of model councils, ensembles, evaluation loops, and agent orchestration. It
does not need to be the first idea in that lineage to be useful.
