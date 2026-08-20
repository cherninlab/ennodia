---
title: Ennodia vs Agent Frameworks
description: How Ennodia differs from general-purpose agent frameworks such as LangGraph, AutoGen, CrewAI, and similar systems.
---

General agent frameworks help developers build custom agent systems. They can
offer roles, graphs, memory, tool routing, state, persistence, deployment
patterns, and application-specific control.

Ennodia is less general on purpose. Its small Model Context Protocol (MCP)
interface lets a primary agent request help from installed agent command-line
interfaces (CLIs). The primary agent can then inspect the result.

## Choose an Agent Framework When

- You define the agent workflow.
- You need custom roles, memory, state, routing, or persistence.
- The agent system is part of your application or service.
- You want code-level control over every edge in the workflow.

## Choose Ennodia When

- You do not want to build an agent system.
- You want a local MCP tool that works with installed agent CLIs.
- You want asynchronous task state, run history, failures, budget
  estimates, and
  Judge + Result Advisor Compare.
- You want an optional Plan Advisor to suggest a bounded team while execution
  remains a separate, validated action.
- You want the primary agent to remain in charge.

## Key Difference

Agent frameworks provide components for custom agent systems. Ennodia is an
orchestration helper for an active agent. Its Plan Advisor produces inert plan
data. It does not create a persistent autonomous team or execute the proposal.

## Common Mistake

Do not claim that Ennodia is more powerful than a framework. It is deliberately
smaller. A user can add multi-agent review to a current local workflow. This
does not require a complete framework application.
