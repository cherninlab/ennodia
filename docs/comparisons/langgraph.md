---
title: Ennodia vs LangGraph
description: How Ennodia differs from LangGraph's programmable graph runtime for long-running, stateful agents.
---

[LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) is a
low-level orchestration framework and runtime. Developers use it to build,
manage, and deploy long-running, stateful agents.

Ennodia is intentionally narrower. It does not require a custom graph,
state machine, durable agent state, or application runtime.

## Choose LangGraph When

- You create an agentic application.
- You need custom graph nodes, edges, state, persistence, or deployment control.
- You want to model a workflow as programmable application infrastructure.
- You own the application code and want a framework embedded in that code.

## Choose Ennodia When

- You have a primary agent in a Model Context Protocol (MCP) client.
- You want that agent to request help from other installed local agent
  command-line interfaces (CLIs).
- You want visible child runs, failures, estimated completion time, Judge
  findings, and a Result Advisor answer.
- You want optional team advice. The advice remains inert until an explicit,
  validated start request.
- You want a small MCP surface without a full application framework.

## Key Difference

LangGraph helps developers create agent systems. Ennodia lets one agent delegate
work to other local agents during a task.

Plan Advisor does not change this boundary: it can propose explicit worker
assignments, but it cannot define arbitrary graph behavior or execute the plan.

## Common Mistake

Do not treat Ennodia as a lighter LangGraph runtime. Ennodia does not replace a
programmable graph framework. It gives an active agent a simple way to request
an independent review or other assistance.
