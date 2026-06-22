<div align="center">

<a href="https://ennodia.cherninlab.com">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo.svg">
  <img alt="Ennodia" src="docs/assets/logo.svg" width="235" height="50">
</picture>
</a>

<p><strong>MCP server that lets one AI agent ask other agents for help</strong></p>

<p>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-informational"></a>
  <img alt="CI" src="https://github.com/cherninlab/ennodia/actions/workflows/ci.yml/badge.svg" />
</p>

</div>

Ennodia is a local MCP server that lets one AI agent ask other agents for help while a task is still in progress. It routes the request, runs selected command line tools, tracks status and output, and can compare several answers before returning one result.

It is built for workflows where no single model or agent should be trusted as the only reviewer.

## Install

Run Ennodia as a stdio MCP server from the npm prerelease channel:

```sh
npx -y ennodia@next
```

Requires Bun `1.3.14` or newer. `npx` downloads Ennodia; Bun runs it. Prefer
Bun directly? Use `bunx ennodia@next`.

For local development from a checkout:

```sh
git clone https://github.com/cherninlab/ennodia
cd ennodia
bun install
bun run verify
```

## What Ennodia Does

- Discovers available local AI tools
- Plans which tool should handle a request
- Starts and monitors child tasks
- Shows status, timing, logs, and failures
- Cancels tasks and runs explicitly
- Compares multiple completed outputs
- Synthesizes one answer from the comparison

## Supported Harnesses

Current adapters:

- Codex CLI
- Claude Code
- OpenCode
- Kilo Code
- Kiro CLI
- Cline CLI
- Hermes Agent
- Antigravity

Adapters stay thin. Shared routing, tracing, task state, recovery, and Compare
logic live in the core modules.

## MCP Tools

Common entrypoints:

- `ennodia_list_harnesses` - show detected tools
- `ennodia_plan` - preview routing for a prompt
- `ennodia_start` - start direct child tasks without run-level synthesis
- `ennodia_run` - plan, execute, optionally Compare, and return a run ID
- `ennodia_get_run` - inspect run state, events, ETA, and final answer
- `ennodia_cancel_run` - cancel a running orchestration
- `ennodia_start_compare` - compare completed task outputs or supplied responses

Lower-level task tools are available for polling and cancellation.

## Documentation

- [Getting started](docs/getting-started.md)
- [How Ennodia works](docs/in-depth/architecture.md)
- [MCP tools](docs/reference/mcp-tools.md)
- [Running better audits](docs/in-depth/auditing.md)
- [Releasing Ennodia](docs/in-depth/releasing.md)

## Benchmarks

The current benchmark is `multi-model-bug-recall`: small TypeScript review
fixtures scored against committed bug oracles. Run the deterministic suite with:

```sh
bun run bench:bug-recall
```

Live harness runs are available through `bun run bench:bug-recall:live` and are
kept out of `bun run verify`.

## Contributing

Ennodia is under active development. Bug reports and small, focused pull requests
are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the local verification
workflow.
