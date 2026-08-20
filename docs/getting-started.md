---
title: Quickstart
description: Install Ennodia manually, perform the first checks, and find the next documentation page.
---

This page gives manual installation instructions for a Model Context Protocol
(MCP) client. To use an agent for installation and configuration, see
[Installation for Agents](/docs/install/).

## Requirements

- Bun `1.3.14` or newer
- An MCP client that can launch a standard input/output (stdio) server
- At least one supported artificial intelligence (AI) command-line tool for
  real agent execution

See [Supported Harnesses](/docs/reference/supported-harnesses/).

## Install from npm

Install the stable release from npm:

```sh
npx -y ennodia
```

Ennodia requires Bun `1.3.14` or newer. `npx` downloads Ennodia. Bun runs it.
To use Bun directly, run `bunx ennodia`.

The JSR package `@cherninlab/ennodia` exposes TypeScript modules for import.
Use the npm package for the stdio MCP executable.

## Local Checkout

Use a checkout to modify Ennodia:

```sh
git clone https://github.com/cherninlab/ennodia
cd ennodia
bun install
bun run verify
```

## MCP Client Config

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

## First Checks

From the repository:

```bash
bun install
bun run mcp:smoke
bun run verify
```

From an MCP client, call `ennodia_list_harnesses`. Then call
`ennodia_estimate_budget`. To inspect the route, call `ennodia_plan`.

Start the work with `ennodia_run`. This tool plans the route and starts the
selected tasks. It can also compare successful outputs. It returns a run
identifier (ID).

Poll `ennodia_get_run` with that ID. Stop when the status is `succeeded`,
`failed`, or `cancelled`.

Expect real runs to take minutes. Compare adds a Judge pass and a Result
Advisor pass after child agents finish.

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
