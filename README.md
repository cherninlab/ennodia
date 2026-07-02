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

Ennodia is a local MCP server that lets one AI agent ask the agent CLIs you
already have installed for help while a task is still in progress. It routes
the request, runs the selected command-line tools, estimates the preflight
input-token budget, tracks status and output, and can ask a model to compare
several answers before returning one result — built for workflows where no
single model or agent should be trusted as the only reviewer.

## Install

Send this to your primary agent and let it handle setup:

```text
Install and turn on Ennodia: https://ennodia.cherninlab.com/install
```

Or run it directly as a stdio MCP server from the npm prerelease channel:

```sh
npx -y ennodia@next
```

Requires Bun `1.3.14` or newer — `npx` downloads Ennodia, Bun runs it. Prefer
Bun directly? Use `bunx ennodia@next`. For manual setup, local development,
or a full walkthrough, see
[Getting started](https://ennodia.cherninlab.com/docs/getting-started/).

## What Ennodia does

- Discovers available local AI tools
- Plans which tool should handle a request
- Estimates and enforces preflight input-token budget limits
- Starts and monitors child tasks
- Shows status, timing, logs, and failures
- Cancels tasks and runs explicitly
- Compares multiple completed outputs
- Synthesizes one answer from the comparison

The main entrypoint is `ennodia_run`: it plans, executes, optionally
compares, and returns a run ID to poll with `ennodia_get_run`. See
[MCP tools](https://ennodia.cherninlab.com/docs/reference/mcp-tools/) for the
full tool and parameter reference.

## Supported harnesses

- Codex CLI
- Claude Code
- OpenCode
- Kilo Code
- Kiro CLI
- Cline CLI
- Hermes Agent
- Antigravity

Adapters stay thin — shared routing, tracing, task state, recovery, and
Compare logic live in core modules.

## Documentation

- [Install Ennodia](https://ennodia.cherninlab.com/docs/install/) — the agent-driven setup path
- [Getting started](https://ennodia.cherninlab.com/docs/getting-started/) — manual setup and local development
- [MCP tools](https://ennodia.cherninlab.com/docs/reference/mcp-tools/) — full tool parameter reference
- [How Ennodia works](https://ennodia.cherninlab.com/docs/in-depth/architecture/) — the orchestration pipeline
- [Positioning and related work](https://ennodia.cherninlab.com/docs/in-depth/positioning/) — how Ennodia compares to adjacent tools
- [Running better audits](https://ennodia.cherninlab.com/docs/in-depth/auditing/) — prompt rubrics for Compare

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
