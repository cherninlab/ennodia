---
title: Ennodia vs OpenRouter
description: How Ennodia differs from OpenRouter and other hosted multi-model application programming interface (API) routers.
---

[OpenRouter](https://openrouter.ai/docs/quickstart) provides one hosted
application programming interface (API). It gives access to many artificial
intelligence (AI) models through one endpoint.

Its routing documentation covers provider selection, model fallback, pricing,
and other hosted API concerns.

Ennodia is not a hosted multi-model API. Current Ennodia releases do not sell
hosted model access or abstract provider billing.

Ennodia IO exposes a small local Hypertext Transfer Protocol (HTTP) interface
for app calls. It is still different from OpenRouter. Ennodia delegates to
installed local agents.

Ennodia does not sell hosted model access or proxy provider billing.

## Choose OpenRouter When

- You want one hosted API for many models.
- You want provider routing, fallback, and pricing controls behind one endpoint.
- Your application code needs direct model responses, not local agent
  command-line interface (CLI) runs.
- You want centralized hosted model access outside a local desktop agent installation.

## Choose Ennodia When

- Your primary agent has a task in a Model Context Protocol (MCP) client.
- You want that agent to request help from installed local agent command-line
  interfaces (CLIs).
- You want child task identifiers (IDs), output previews, failures, estimated
  completion time, and run history.
- You want budget estimates and local limits before child tasks start.
- You want a Judge to map agent answers and a Result Advisor to recommend an
  answer. You do not want to read each response.
- You want an optional Plan Advisor to suggest a bounded local team without
  automatic execution. Plan Advisor cannot start the proposal.
- You want a local HTTP bridge over those same agent runs.

## Key Difference

OpenRouter routes hosted model API calls. Ennodia coordinates local agent
subprocesses and can expose that local orchestration through MCP or IO.

OpenRouter provides infrastructure for application developers. Ennodia is a
local collaboration tool for agents in a code or research workflow.

## Common Mistake

Do not describe Ennodia as a cheaper OpenRouter or an OpenRouter replacement.
It solves a different problem: visible delegation to installed local agents.
