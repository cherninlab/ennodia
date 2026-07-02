---
title: Getting started
description: Set up Ennodia by hand -- local checkout, npm install, MCP client config, and first checks.
---

This page is for developers setting up Ennodia by hand, either from npm or a
local checkout, without asking an agent to do it. If you would rather have an
agent install and configure Ennodia for you, use
[Install Ennodia](/docs/install/) instead — it is written for that agent, and
covers harness-specific setup notes and Agent Skills this page does not
repeat.

## Requirements

- Bun `1.3.14` or newer
- An MCP client that can launch a stdio server
- At least one supported AI command-line tool, if you want real agent
  execution — see the current adapter list in
  [MCP tools](/docs/reference/mcp-tools/)

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

## First checks

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

## Budget preflight

Before expensive parallel work, call `ennodia_estimate_budget`. It is a
preflight input-token estimate, not a provider invoice: output tokens, tool
calls, cache behavior, and provider pricing are only known to the child
harnesses and providers. See the Budget and limits section of
[Install Ennodia](/docs/install/) for the request shape and what Ennodia can
enforce before a run starts.

## Agent Skills

Ennodia uses native Agent Skills: folders with `SKILL.md` files installed
where each harness expects them. List available skills with
`ennodia_list_skills`, install the bundled ones you need with
`ennodia_install_skills`, then pass their IDs into a run's `skillIds`. See the
Skills section of [Install Ennodia](/docs/install/) for the install walkthrough.

## Expected behavior

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
