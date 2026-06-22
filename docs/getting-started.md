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
- Antigravity

## Local checkout

Use the repository directly until the npm package is published:

```sh
git clone https://github.com/cherninlab/ennodia
cd ennodia
bun install
bun run verify
```

## Install from npm

After the first package publish, prerelease builds use the `next` dist-tag:

```sh
bunx ennodia@next
```

`npx ennodia@next` can also launch Ennodia when `bun` is already available on
`PATH`.

## MCP client config

Use this after the npm package is published:

```json
{
  "mcpServers": {
    "ennodia": {
      "command": "bunx",
      "args": ["ennodia@next"]
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
      "args": ["run", "/absolute/path/to/ennodia/src/index.ts"]
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

`ennodia_run` is the main end-to-end entrypoint. It plans the route, starts the
selected task or tasks, optionally compares successful outputs, and returns one
final answer.

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
