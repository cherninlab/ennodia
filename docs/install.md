---
title: Installation for Agents
description: A copy-paste installation page for agents that install Ennodia in Codex, Claude Code, OpenCode, Antigravity, and other Model Context Protocol (MCP) clients.
---

This page is for the agent that does the installation. Install Ennodia as a local Model
Context Protocol (MCP) server. Then enable it in the user's MCP client.

## Copy-Paste Prompt

```text
try-ennodia.cherninlab.com
```

## Install Command

Use the npm package for normal MCP client installation:

```sh
npx -y ennodia
```

Ennodia requires Bun `1.3.14` or newer. `npx` downloads Ennodia. Bun runs it.
If the client supports Bun directly, use `bunx ennodia`.

## MCP Configuration

Add this server to the user's MCP client configuration:

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

After MCP configuration, call these tools:

1. `ennodia_list_harnesses`
2. `ennodia_estimate_budget`
3. `ennodia_plan`
4. `ennodia_run`
5. `ennodia_get_run`

`ennodia_list_harnesses` shows the available local tools. See the current
adapter list and identifiers (IDs) in
[Supported Harnesses](/docs/reference/supported-harnesses/).

## Installed Components

Ennodia is a local MCP server. It lets the user's main agent request help from
other installed agent command-line interface (CLI) programs during the same task.

The number of agents is not the primary benefit. Ennodia uses current local
installs, subscriptions, and model choices. It discovers supported CLI programs and
starts child tasks. It also tracks status and output.

Ennodia estimates the input-token budget. A Judge can compare the answers. A
Result Advisor can then recommend one result.

An optional Plan Advisor can propose harness, model, and skill assignments. It
cannot start them. A separate explicit call must start the validated plan.

Ennodia is asynchronous by design. A primary agent can start a run and continue
its main task. It can later poll `ennodia_get_run` for status and estimated
completion time.

The result also contains child task IDs, Compare state, failures, and the final
answer.

Tell the user a real run can take minutes. Compare adds two serial model passes
after the selected child agents finish.

## Example Requests

Use Ennodia when the user permits more model work to get a better answer than
one agent usually gives.

```text
Use Ennodia to request a review from multiple available agents.
Compare the answers for this bug fix.
Name the disagreements and return the highest-risk issue first.
```

```text
Use Ennodia to plan this migration with Claude Code, OpenCode, and Antigravity.
Compare the plans and tell me which assumptions each model made.
```

```text
Use Ennodia twice.
Use source-grounded-audit for the first run, but not for the second run.
Compare the results before you recommend the final documentation edit.
```

Compare is model-led. The user does not normally need to judge the parallel
answers. The trace remains available for inspection.

## Optional Next Steps

- Use [Budgets and Limits](/docs/guides/budgets-and-limits/) before costly
  parallel runs.
- Use [Agent Skills](/docs/guides/agent-skills/) before you pass
  `skillIds` such as `source-grounded-audit`.
- Use [Supported Harnesses](/docs/reference/supported-harnesses/) when a local
  CLI is missing, not runnable, or has the wrong model ID.
- Use [MCP Tools](/docs/reference/mcp-tools/) for exact parameter shapes.
