---
title: Questions
description: Short answers about switching agents, setup, data, cost, time, and what Ennodia remembers.
---

## Do I need to switch agents?

No. You keep the agent you use, in the app you like.
Ennodia adds a few tools to it, and your agent calls another agent only when a task needs it.

## Where does Ennodia run?

On your computer. Your agent starts it as a local Model Context Protocol (MCP) server.
It needs Bun 1.3.14 or newer.
Your agent can [set it up for you](/docs/install/), or you can [add the server entry yourself](/docs/getting-started/#manual-setup).

## Which agents can I use?

Ennodia uses the agents on your computer, with the models and access you have set up.
It supports Codex CLI, Claude Code, OpenCode, Antigravity, Kilo Code, Kiro, Cline, and Hermes Agent.
[Check compatibility](/docs/reference/supported-harnesses/).

## What does it cost?

Ennodia is free and MIT licensed, with no account and no subscription of its own.
Each agent you call runs through its own command-line tool, with the plan or API key you set up for it.

## Will it use more tokens?

It can. Each agent you call reads its own prompt, and Compare reads every answer.
Ennodia's six core tools add about 2,600 tokens to each session.
You can cap agent runs and estimated input tokens for every run. [Set limits](/docs/guides/budgets-and-limits/).

## Is it slower?

A handoff takes as long as the other agent's session.
In the [audio pilot](https://github.com/cherninlab/ennodia/blob/main/bench/audio-routing/pilot-2026-09-26.md), Codex with Ennodia took a median of 57 seconds per clip, against 27 seconds alone.
Alone, Codex answered without listening.

## What data leaves my computer?

Ennodia has no hosted service and sends nothing to its authors.
The agents you call send prompts and files to their own model providers, as they do without Ennodia.
[How data is handled](/docs/concepts/data-governance/).

## Does my agent hand off work on its own?

Only when you let it. Say it in your own words, like "get Codex's opinion".
Or install the pragmatic skill, so your agent can hand off bounded work within the limits you set.
[The delegation skill](/docs/guides/agent-skills/#main-agent-delegation-skill).

## Does it remember what worked?

It keeps a local run history, including outputs and failures, so you can look back.
Learning which agent or skill to choose next is the [next step on the roadmap](/docs/roadmap/).
[What the history records](/docs/guides/understand-results/).
