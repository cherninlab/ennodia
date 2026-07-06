---
title: Ennodia vs AutoGen
description: How Ennodia differs from AutoGen and programmable multi-agent application frameworks.
---

[AutoGen](https://microsoft.github.io/autogen/stable/index.html) is a
programming framework for building conversational single-agent and multi-agent
applications, with an event-driven core for scalable multi-agent systems.

Ennodia is not a framework for authoring a new multi-agent application. It is a
local MCP server that an existing agent can call.

## Choose AutoGen When

- You want to build a multi-agent system in application code.
- You need programmable agent roles, event handling, message passing, and custom
  workflow control.
- Your product needs a framework-level architecture.

## Choose Ennodia When

- The primary workflow already happens in Codex, Claude Code, OpenCode,
  Antigravity, or another MCP-capable client.
- You want to reuse installed local CLIs and subscriptions.
- You want task traces, status, budget checks, and Compare without designing a
  full multi-agent runtime.

## Key Difference

AutoGen is for building multi-agent applications. Ennodia is for letting one
agent ask other already-installed agents for help.

## Common Mistake

Do not compare them only by "number of agents." The important question is where
the orchestration lives: inside a custom application framework, or inside a
local MCP tool called by the user's existing agent.
