---
title: Installation for Agents
description: A copy-paste installation page for agents that install Ennodia in Codex, Claude Code, OpenCode, Antigravity, and other Model Context Protocol (MCP) clients.
---

This page gives setup instructions to the user's agent.
Install Ennodia as a local Model Context Protocol (MCP) server.
Then connect it to the user's preferred compatible client.

## Copy-Paste Prompt

```text
try-ennodia.cherninlab.com
```

The user can send this address in a new or existing agent conversation.
The agent handles the setup steps below.

## Check the Environment

1. Identify the user's client and the machine where Ennodia will run.
2. Check that the client can launch a local standard input/output (stdio) MCP server.
3. Check for Bun `1.3.14` or newer in that environment.
4. Check for a supported agent command-line interface (CLI) with working provider access.

Use the client's supported configuration method and the tools' official installation instructions.
Preserve existing server entries and unrelated settings.
Use the client's normal permissions.

If the current client cannot launch a local MCP server, explain the missing capability.
Use a compatible local client for Ennodia.
See [Supported Harnesses](/docs/reference/supported-harnesses/) for the worker agents Ennodia can call.

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

The configuration above shows the server command and arguments.
Adapt its format to the client's documented configuration method.
Reload the tools or restart the client only when its setup instructions require this step.
Tell the user which step is needed before trying to call Ennodia.

## Get One Useful Result

After the client exposes Ennodia's tools, start with one small task:

1. Call `ennodia_list_harnesses` with `refresh: true`.
2. Choose one available worker for a focused, read-only check from the user's current task.
3. Call `ennodia_run` with `prompt`, `harnessId`, `mode: "single"`, `compare: false`, and the relevant `cwd`.
4. Poll `ennodia_get_run` with the returned `id` as `runId`.
5. Stop when the status is `succeeded`, `failed`, or `cancelled`.
6. Report the useful finding or the specific failure in the user's conversation.

For example, request a read-only check of one function or one documentation claim against its source.
Include the relevant files or task details in the worker prompt.
Request evidence the main agent can inspect.

Discovery checks installed commands, not active authentication, model access, or provider quota.
A successful small run verifies the selected worker's configuration.
If provider access is missing, identify the affected worker and its normal login or configuration step.

The first run does not require separate planning, budget estimation, or Compare calls.
These tools remain available for larger tasks.
See [MCP Tools](/docs/reference/mcp-tools/) for exact parameters and identifiers (IDs).

## Installed Components

Ennodia is a local MCP server. It lets the user's main agent request help from
other installed agent CLI programs during the same task.

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
