---
title: Ennodia vs OpenRouter
description: How Ennodia differs from OpenRouter and other hosted multi-model API routers.
---

[OpenRouter](https://openrouter.ai/docs/quickstart) provides a unified hosted
API for accessing many AI models through one endpoint. Its routing docs cover
provider selection, model fallback, pricing, and other hosted API concerns.

Ennodia is not that. Current Ennodia releases do not sell hosted model access or
abstract provider billing.

Ennodia IO exposes a small local HTTP interface for app-facing calls. It is
still different from OpenRouter: Ennodia delegates to installed local agents
rather than sell hosted model access or proxy provider billing.

## Choose OpenRouter When

- You want one hosted API for many models.
- You want provider routing, fallback, and pricing controls behind one endpoint.
- Your application code needs direct model responses, not local agent CLI runs.
- You want to centralize hosted model access outside a local desktop agent setup.

## Choose Ennodia When

- Your primary agent is already working in an MCP client.
- You want that agent to ask installed local agent CLIs for help.
- You want child task IDs, output previews, failures, ETA, and run history.
- You want budget estimates and local limits before launching child tasks.
- You want a model to compare agent answers instead of manually reading every
  response yourself.
- You want a local HTTP bridge over those same agent runs.

## Key Difference

OpenRouter routes hosted model API calls. Ennodia coordinates local agent
subprocesses and can expose that local orchestration through MCP or IO.

That means OpenRouter is closer to infrastructure for application developers,
while Ennodia is closer to a local collaboration tool for agents already inside
your coding or research workflow.

## Common Mistake

Do not describe Ennodia as a cheaper OpenRouter or an OpenRouter replacement.
It solves a different problem: visible delegation to local agents you already
have installed.
