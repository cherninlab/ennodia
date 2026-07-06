---
title: Ennodia vs LangGraph
description: How Ennodia differs from LangGraph's programmable graph runtime for long-running, stateful agents.
---

[LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) is a
low-level orchestration framework and runtime for building, managing, and
deploying long-running, stateful agents.

Ennodia is intentionally narrower. It does not ask you to define a custom graph,
state machine, durable agent state, or application runtime.

## Choose LangGraph When

- You are building an agentic application.
- You need custom graph nodes, edges, state, persistence, or deployment control.
- You want to model a workflow as programmable application infrastructure.
- You own the application code and want a framework embedded in that code.

## Choose Ennodia When

- You already have a primary agent working in an MCP client.
- You want that agent to ask other installed local agent CLIs for help.
- You want visible child runs, failures, ETA, and final synthesis.
- You want a small MCP surface instead of a full application framework.

## Key Difference

LangGraph is for building agent systems. Ennodia is for delegating work from one
agent to other local agents during a task.

## Common Mistake

Do not treat Ennodia as a lighter LangGraph runtime. Ennodia does not replace a
programmable graph framework; it gives an existing agent a simple way to request
outside review or assistance.
