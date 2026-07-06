---
title: Ennodia vs Agent Frameworks
description: How Ennodia differs from general-purpose agent frameworks such as LangGraph, AutoGen, CrewAI, and similar systems.
---

General agent frameworks help developers build custom agent systems. They can
offer roles, graphs, memory, tool routing, state, persistence, deployment
patterns, and application-specific control.

Ennodia is less general on purpose. It gives a primary agent a small MCP surface
for asking other installed local agents for help and inspecting the result.

## Choose an Agent Framework When

- You are designing the agent workflow yourself.
- You need custom roles, memory, state, routing, or persistence.
- The agent system is part of your application or service.
- You want code-level control over every edge in the workflow.

## Choose Ennodia When

- You do not want to build an agent system.
- You want a local MCP tool that works with installed agent CLIs.
- You want async task state, run history, failures, budget estimates, and
  model-led Compare.
- You want the primary agent to remain in charge.

## Key Difference

Agent frameworks are construction kits. Ennodia is an orchestration helper for
an already-running agent.

## Common Mistake

Do not claim Ennodia is more powerful than a framework. It is deliberately
smaller. The benefit is that the user can add multi-agent review to an existing
local workflow without designing an entire framework application.
