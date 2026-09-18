---
title: Quickstart
description: Give your agent the Ennodia setup link, get your first useful result, or follow the manual installation instructions.
---

Paste this address into a new or existing conversation with your agent:

```text
try-ennodia.cherninlab.com
```

Your agent can follow the setup instructions, check the requirements, and connect Ennodia to your client.
Continue in your preferred compatible chat app, command-line interface (CLI), or editor.
Ennodia connects through Model Context Protocol (MCP).

The [installation instructions for agents](/docs/install/) explain the setup steps.
Your agent will identify any client restart or reload needed to make the new tools available.

After setup, [try your first useful result](#your-first-useful-result).
For manual setup, follow the instructions below.

## Your first useful result

After installation, give your primary agent a small request:

```text
Use Ennodia MCP to get one additional opinion on this function.
Choose an available agent. Keep the review read-only.
Return one concrete issue or explain that no issue was established.
Bring the findings back to this conversation.
```

Start with one worker and a small set of files.
Discovery checks installed commands, not authentication, model access, or provider quota.
A live task establishes which configuration works in your environment.

Your agent can call `ennodia_list_harnesses`, then `ennodia_run` with a selected `harnessId`, `mode: "single"`, and `compare: false`.
Poll `ennodia_get_run` with the returned run identifier (ID).
Stop when the status is `succeeded`, `failed`, or `cancelled`.

Inspect the result before starting more work.
Use the [recipes](/docs/guides/recipes/) for a stuck task, a skill trial, or conflicting answers.
See [Understand Results](/docs/guides/understand-results/) when the attempt is incomplete or unhelpful.

Expect live runs to take time. A timeout budget is not a completion prediction.
Compare adds a Judge pass and a Result Advisor pass after child agents finish.

For a local development checkout, run `bun run verify` before relying on changes.

## Manual Setup

### Requirements

- Bun `1.3.14` or newer
- An MCP client that can launch a standard input/output (stdio) server
- At least one supported artificial intelligence (AI) command-line tool with
  working provider access

See [Supported Harnesses](/docs/reference/supported-harnesses/).

### Install from npm

Install the stable release from npm:

```sh
npx -y ennodia
```

Ennodia requires Bun `1.3.14` or newer. `npx` downloads Ennodia. Bun runs it.
To use Bun directly, run `bunx ennodia`.

The JSR package `@cherninlab/ennodia` exposes TypeScript modules for import.
Use the npm package for the stdio MCP executable.

### Local Checkout

Use a checkout to modify Ennodia:

```sh
git clone https://github.com/cherninlab/ennodia
cd ennodia
bun install
bun run verify
```

### MCP Client Config

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

For a local checkout, use the source file:

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

Replace `/absolute/path/to/ennodia` with your local repository path.

Use your client's supported configuration method.
Preserve existing server entries.
Reload the tools or restart the client if its setup instructions require this step.

## Optional Team Advice

For a proposed work split, call `ennodia_start_plan_advice`. The Plan Advisor
proposes explicit harness, model, and skill assignments. It cannot execute them.

Poll `ennodia_get_plan_advice`. Stop when the status is `ready`, `consumed`,
`invalid`, `failed`, or `cancelled`.

Ennodia parses the response as strict plan data. It validates the data against
the frozen harness, model, and skill inventory.

To start a ready plan once, call `ennodia_start_advised_plan`. Pass the returned
`planDigest` as `expectedPlanDigest`. Ennodia validates the current inventory
and budget again before authorizing the plan. A mismatch stops the operation
before any worker task starts. Authorization consumes the advice, so a second
launch with the same advice fails before any worker task starts.

Compare is a separate operation after worker completion. The Judge maps the
completed answers. Then the Result Advisor recommends one answer.

If Judge analysis is not available, the Result Advisor can use only the
candidate outputs. The Compare result shows this condition.

## Next Pages

- [Budgets and Limits](/docs/guides/budgets-and-limits/) explains
  `ennodia_estimate_budget` and run limits.
- [Agent Skills](/docs/guides/agent-skills/) explains `skillIds` and
  native `SKILL.md` installation.
- [Supported Harnesses](/docs/reference/supported-harnesses/) lists adapter IDs
  and installation notes.
- [MCP Tools](/docs/reference/mcp-tools/) is the full parameter reference.

## Expected Behavior

An Ennodia run is visible. You can inspect:

- selected harnesses
- child task IDs
- task status
- standard output (stdout) and standard error (stderr) previews
- elapsed time and per-task timeout
- Compare state, if Compare was used
- final answer or explicit failure reason

If a child tool times out or fails, Ennodia must report that state. It must not
conceal the failure.
