---
title: Install Ennodia
description: A copy-paste setup page for agents installing Ennodia into Codex, Claude Code, OpenCode, Antigravity, and other MCP clients.
---

This page is for the agent doing the setup. If the user gave you this link, the
goal is to install Ennodia as a local MCP server and turn it on in the MCP
client they use.

Copy-paste prompt for a user:

```text
Install and turn on Ennodia: https://ennodia.cherninlab.com/install
```

## What Ennodia is

Ennodia is a local MCP server. It lets the user's main agent ask other installed
agent CLIs for help during the same task.

The important part is not "many agents" by itself. Ennodia works with existing
local installs, subscriptions, and model choices. It discovers supported CLIs,
starts child tasks, tracks status and output, estimates the input-token budget,
and can ask a model to compare the answers before returning one result.

Ennodia is asynchronous by design. A primary agent can start a run, keep working,
and later poll `ennodia_get_run` for exact status, ETA, child task IDs, Compare
state, failures, and the final answer.

## Install command

Use the npm package for normal MCP client setup:

```sh
npx -y ennodia@next
```

Requires Bun `1.3.14` or newer. `npx` downloads Ennodia; Bun runs it. If the
client supports Bun directly, `bunx ennodia@next` is also fine.

## MCP config

Add this server to the user's MCP client config:

```json
{
  "mcpServers": {
    "ennodia": {
      "command": "npx",
      "args": ["-y", "ennodia@next"]
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

## First agent checks

After configuring MCP, call these tools:

1. `ennodia_list_harnesses`
2. `ennodia_estimate_budget`
3. `ennodia_plan`
4. `ennodia_run`
5. `ennodia_get_run`

`ennodia_list_harnesses` should show which local tools are available — see the
current adapter list and IDs in [MCP tools](/docs/reference/mcp-tools/).

## Example requests

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

## Budget and limits

Before starting a costly run, call `ennodia_estimate_budget`. It returns a
preflight input-token estimate, selected harness count, Compare assumptions, and
subscription-limit check status.

Ennodia can enforce local preflight limits on `ennodia_run`:

```json
{
  "tool": "ennodia_run",
  "arguments": {
    "prompt": "Review this release.",
    "mode": "parallel",
    "compare": true,
    "maxOutputChars": 20000,
    "budget": {
      "maxChildTasks": 4,
      "maxEstimatedInputTokens": 120000
    }
  }
}
```

Subscription quota checks are intentionally conservative. Ennodia only uses
supported local CLI/API surfaces. If a provider does not expose account quota
through a supported surface, Ennodia reports the limit as unknown instead of
scraping private account pages or inventing a number.

## Harness notes

### Codex

Codex runs through the supported Codex CLI. Ennodia-launched Codex tasks default
to read-only sandboxing.

### Claude Code

Claude Code runs through `claude -p`. Model aliases such as `sonnet` can be
passed through the `model` field. Do not add permission-bypass flags by default.

### OpenCode

OpenCode runs through `opencode run`. Model IDs use the provider/model format
reported by `opencode models`, such as `opencode-go/kimi-k2.7-code`.

### Antigravity

Antigravity can fail setup when the `agy` CLI is not on `PATH`. Ask the user or
the primary agent to verify:

```sh
command -v agy
agy --version
agy models
```

If the shell cannot find `agy` at all, open Antigravity and use its supported
CLI install or shell-integration flow first. Then restart the MCP client and
call `ennodia_list_harnesses` again.

## Skills

Ennodia uses native Agent Skills. First list available skills:

```json
{
  "tool": "ennodia_list_skills",
  "arguments": {}
}
```

Bundled skills must be installed into native harness locations before a run can
use them:

```json
{
  "tool": "ennodia_install_skills",
  "arguments": {
    "skillIds": ["source-grounded-audit"],
    "harnessIds": ["codex", "claude-code", "opencode", "antigravity"],
    "scope": "project",
    "cwd": "/absolute/path/to/your/project",
    "dryRun": true
  }
}
```

Replace `cwd` with the project that should receive the native skill folders.
Review the planned paths, then repeat with `dryRun: false` if they are correct.
