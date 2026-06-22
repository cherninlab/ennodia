---
title: Getting started
description: Install Ennodia, connect it to an MCP client, and run the first checks.
---

Ennodia runs locally as a stdio MCP server. The MCP client starts Ennodia, then
calls tools such as `ennodia_list_harnesses`, `ennodia_plan`, and `ennodia_run`.

## Requirements

- Bun `1.3.14` or newer
- At least one supported AI command line tool if you want real agent execution
- An MCP client that can launch a stdio server

The current adapters detect:

- Codex CLI
- Claude Code
- OpenCode
- Kilo Code
- Kiro CLI
- Cline CLI
- Hermes Agent
- Antigravity

## Local checkout

Use a checkout when you are changing Ennodia itself:

```sh
git clone https://github.com/cherninlab/ennodia
cd ennodia
bun install
bun run verify
```

## Install from npm

The public prerelease channel uses npm's `next` dist-tag:

```sh
npx -y ennodia@next
```

Requires Bun `1.3.14` or newer. `npx` downloads Ennodia; Bun runs it. Prefer
Bun directly? Use `bunx ennodia@next`.

The JSR package `@cherninlab/ennodia` exposes TypeScript modules for import.
Use the npm package for the stdio MCP executable.

## MCP client config

Use the npm package for normal MCP client setup:

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

For local development from a checkout:

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

## First checks

From the repo:

```bash
bun install
bun run mcp:smoke
bun run verify
```

From an MCP client, start with:

1. `ennodia_list_harnesses`
2. `ennodia_plan`
3. `ennodia_run`
4. `ennodia_get_run`

`ennodia_run` is the main end-to-end entrypoint. It plans the route, starts the
selected task or tasks, optionally compares successful outputs, and returns a
run ID. Poll `ennodia_get_run` with that ID until the run reaches `succeeded`,
`failed`, or `cancelled`.

## Expected behavior

An Ennodia run is meant to be visible. You should be able to inspect:

- selected harnesses
- child task IDs
- task status
- stdout and stderr previews
- elapsed time and timeout budget
- Compare state, if Compare was used
- final answer or explicit failure reason

If a child tool times out or fails, Ennodia should report that state instead of
hiding it.
