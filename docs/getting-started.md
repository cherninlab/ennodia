---
title: Quickstart
description: Set up Ennodia by hand, run the first checks, and know where to go next.
---

This page is for humans setting up Ennodia by hand. If you would rather have an
agent install and configure Ennodia for you, use
[Installation for Agents](/docs/install/) instead.

## Requirements

- Bun `1.3.14` or newer
- An MCP client that can launch a stdio server
- At least one supported AI command-line tool, if you want real agent
  execution; see [Supported Harnesses](/docs/reference/supported-harnesses/)

## Install from npm

Install the stable release from npm:

```sh
npx -y ennodia
```

Requires Bun `1.3.14` or newer. `npx` downloads Ennodia; Bun runs it. Prefer
Bun directly? Use `bunx ennodia`.

The JSR package `@cherninlab/ennodia` exposes TypeScript modules for import.
Use the npm package for the stdio MCP executable.

## Local Checkout

Use a checkout when you are changing Ennodia itself:

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

For a local checkout, point at the source file instead:

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

Replace `/absolute/path/to/ennodia` with your local repo path.

## First Checks

From the repo:

```bash
bun install
bun run mcp:smoke
bun run verify
```

From an MCP client, call these tools in order: `ennodia_list_harnesses`,
`ennodia_estimate_budget`, `ennodia_plan`, `ennodia_run`, then
`ennodia_get_run`. `ennodia_run` is the main end-to-end entrypoint — it plans
the route, starts the selected task or tasks, optionally compares successful
outputs, and returns a run ID. Poll `ennodia_get_run` with that ID until the
run reaches `succeeded`, `failed`, or `cancelled`.

Expect real runs to take minutes. Compare adds a judge pass and a synthesizer
pass after child agents finish.

## Next Pages

- [Budgets and Limits](/docs/guides/budgets-and-limits/) explains
  `ennodia_estimate_budget` and run limits.
- [Using Agent Skills](/docs/guides/agent-skills/) explains `skillIds` and
  native `SKILL.md` installation.
- [Supported Harnesses](/docs/reference/supported-harnesses/) lists adapter IDs
  and setup notes.
- [MCP Tools](/docs/reference/mcp-tools/) is the full parameter reference.

## Expected Behavior

An Ennodia run is meant to be visible. You should be able to inspect:

- selected harnesses
- child task IDs
- task status
- stdout and stderr previews
- elapsed time and per-task timeout
- Compare state, if Compare was used
- final answer or explicit failure reason

If a child tool times out or fails, Ennodia should report that state instead of
hiding it.
