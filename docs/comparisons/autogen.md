---
title: Ennodia vs AutoGen
description: How Ennodia differs from AutoGen and programmable multi-agent application frameworks.
---

[AutoGen](https://microsoft.github.io/autogen/stable/index.html) is a programming
framework. Developers use it to create conversational single-agent and
multi-agent applications. It has an event-driven core for scalable multi-agent
systems.

Ennodia is not a framework for a new multi-agent application. It is a local
Model Context Protocol (MCP) server that an active agent can call.

## Choose AutoGen When

- You want to create a multi-agent system in application code.
- You need programmable agent roles, event handling, message passing, and custom
  workflow control.
- Your product needs a framework-level architecture.

## Choose Ennodia When

- The primary workflow uses Codex, Claude Code, OpenCode,
  Antigravity, or another MCP-capable client.
- You want to reuse installed local command-line interfaces (CLIs) and
  subscriptions.
- You want task traces, status, budget checks, and Compare without a full
  multi-agent runtime.
- You want a Plan Advisor to suggest explicit harness, model, and skill
  assignments. Plan Advisor has no execution control.

## Key Difference

AutoGen helps developers create multi-agent applications. Ennodia lets one agent
request help from other installed agents. A Plan Advisor can propose a bounded
team. The proposal stays inert until the caller explicitly starts it.

## Common Mistake

Do not compare them only by "number of agents." The important question is the
location of the orchestration. It can be in a custom application framework or a
local MCP tool.
