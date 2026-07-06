---
title: Installation for Agents
description: A copy-paste setup page for agents installing Ennodia into Codex, Claude Code, OpenCode, Antigravity, and other MCP clients.
---

This page is for the agent doing the setup. If the user gave you this link, the
goal is to install Ennodia as a local MCP server and turn it on in the MCP
client they use.

## Copy-Paste Prompt

```text
Install and turn on Ennodia: https://ennodia.cherninlab.com/install
```

## Install Command

Use the npm package for normal MCP client setup:

```sh
npx -y ennodia
```

Requires Bun `1.3.14` or newer. `npx` downloads Ennodia; Bun runs it. If the
client supports Bun directly, `bunx ennodia` is also fine.

## MCP Config

Add this server to the user's MCP client config:

```json
{
  "mcpServers": {
    "ennodia": {
      "command": "npx",
      "args": ["-y", "ennodia"]
    }
  }
}
```

For a local Ennodia checkout, use:

```json
{
  "mcpServers": {
    "ennodia": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/ennodia/src/cli.ts"]
    }
  }
}
```

## First Agent Checks

After configuring MCP, call these tools:

1. `ennodia_list_harnesses`
2. `ennodia_estimate_budget`
3. `ennodia_plan`
4. `ennodia_run`
5. `ennodia_get_run`

`ennodia_list_harnesses` should show which local tools are available — see the
current adapter list and IDs in
[Supported Harnesses](/docs/reference/supported-harnesses/).

## What You Are Installing

Ennodia is a local MCP server. It lets the user's main agent ask other installed
agent CLIs for help during the same task.

The important part is not "many agents" by itself. Ennodia works with existing
local installs, subscriptions, and model choices. It discovers supported CLIs,
starts child tasks, tracks status and output, estimates the input-token budget,
and can ask a model to compare the answers before returning one result.

Ennodia is asynchronous by design. A primary agent can start a run, keep working,
and later poll `ennodia_get_run` for exact status, ETA, child task IDs, Compare
state, failures, and the final answer.

Tell the user a real run can take minutes. Compare adds two serial model passes
after the selected child agents finish.

## Example Requests

Use Ennodia when the user is intentionally spending more model work to get a
better answer than one agent usually gives.

```text
Use Ennodia to ask several available agents to review this bug fix. Compare the
answers, name disagreements, and return the highest-risk issue first.
```

```text
Use Ennodia to plan this migration with Claude Code, OpenCode, and Antigravity.
Compare the plans and tell me which assumptions each model made.
```

```text
Use Ennodia twice: once with source-grounded-audit and once without it. Compare
what the skill changed before recommending the final docs edit.
```

Compare is model-led. The user should not have to manually judge parallel
answers unless they want to inspect the trace.

## Optional Next Steps

- Use [Budgets and Limits](/docs/guides/budgets-and-limits/) before costly
  parallel runs.
- Use [Using Agent Skills](/docs/guides/agent-skills/) before passing
  `skillIds` such as `source-grounded-audit`.
- Use [Supported Harnesses](/docs/reference/supported-harnesses/) when a local
  CLI is missing, unrunnable, or using the wrong model ID.
- Use [MCP Tools](/docs/reference/mcp-tools/) for exact parameter shapes.
