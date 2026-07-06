---
title: Ennodia vs ChatHub
description: How Ennodia differs from ChatHub and other side-by-side chatbot comparison tools.
---

[ChatHub](https://doc.chathub.gg/introduction) is a human-facing app for using
multiple AI chatbots side by side. Its core experience is chatbot comparison
through a web app or browser extension.

Ennodia is not a chat UI. It is meant to be called by an AI agent while that
agent is already working.

## Choose ChatHub When

- A human wants to compare chatbot answers visually.
- The main workflow is interactive chat, not local MCP tool orchestration.
- You want a polished multi-chat interface across hosted chatbots.

## Choose Ennodia When

- A primary agent needs help during a task and can call MCP tools.
- You want local agent CLIs to run as child tasks.
- You want task state, stdout, stderr, failures, and Compare state captured.
- You want the final answer synthesized for the user instead of asking the user
  to manually grade a side-by-side wall of responses.

## Key Difference

ChatHub helps a person compare chatbot outputs. Ennodia helps an agent delegate
work to other local agents and inspect what happened.

## Common Mistake

Do not pitch Ennodia as "ChatHub for agents" unless you immediately explain the
missing piece: Ennodia has task orchestration and traces, not a human chat
comparison interface.
