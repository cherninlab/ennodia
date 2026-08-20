<div align="center">

<a href="https://ennodia.cherninlab.com">
<picture> 
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/cherninlab/ennodia/raw/main/docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/cherninlab/ennodia/raw/main/docs/assets/logo.svg">
  <img alt="Ennodia" src="https://github.com/cherninlab/ennodia/raw/main/docs/assets/logo.svg" width="235" height="50">
</picture>
</a>

<p><strong>Model Context Protocol (MCP) server for multi-agent review with Compare and traceable receipts</strong></p>

<p>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-informational"></a>
  <img alt="Continuous integration" src="https://github.com/cherninlab/ennodia/actions/workflows/ci.yml/badge.svg" />
  <a href="https://smithery.ai/servers/cherninlab/ennodia"><img alt="Smithery: Ennodia" src="https://img.shields.io/badge/Smithery-Ennodia-FF5601"></a>
</p>

<p align="center">
  <img alt="Ennodia terminal with three completed artificial intelligence reviews" src="https://github.com/cherninlab/ennodia/raw/main/docs/assets/terminal.png" width="600">
</p>

</div>

Ennodia gives your primary agent access to installed agent command-line
interfaces (CLIs). It tracks each child task and uses model-led Compare to show
agreements, disagreements, omissions, and one recommended answer with receipts.

Before work, an optional Plan Advisor can propose a bounded set of harnesses,
models, and skills. It does not start the proposed work.

## Install

Send this address to your primary agent. The agent can then complete the
installation:

```text
try-ennodia.cherninlab.com
```
To run Ennodia directly as a standard input/output (stdio) MCP server, use:

```sh
npx -y ennodia
```
To use Bun directly, run `bunx ennodia`.

For a registry or client installer, use the
[Ennodia Smithery page](https://smithery.ai/servers/cherninlab/ennodia).

For manual installation or local development, see
[Quickstart](https://ennodia.cherninlab.com/docs/getting-started/).

## What Ennodia does

- Discovers available local artificial intelligence (AI) tools
- Plans a route with a caller-provided category or keyword fallback
- Estimates preflight input tokens and enforces local caps on that estimate
- Starts and monitors child tasks
- Shows status, elapsed time, logs, and failures
- Cancels tasks and runs explicitly
- Lets a Plan Advisor propose an inert, validated work plan
- Compares multiple completed outputs with a Judge
- Lets a Result Advisor combine the Judge findings into one answer

`ennodia_run` is the main entrypoint. It plans and starts tasks. It can also use
Compare. It returns a run identifier (ID) for use with `ennodia_get_run`.

See [MCP tools](https://ennodia.cherninlab.com/docs/reference/mcp-tools/) for
the full tool and parameter reference.

Use Ennodia for work that needs additional model analysis. A run usually takes
minutes. Compare adds two serial model passes after the child agents finish.

## Judge, Plan Advisor, and Result Advisor

Each role has limited responsibilities:

- **Plan Advisor** runs before work when requested. It proposes explicit
  harness, model, and skill assignments as inert data. Ennodia validates the
  proposal against a frozen inventory. Plan Advisor cannot execute it. The
  caller must use a separate call to start the validated plan once.
- **Judge** runs during Compare and maps agreements, contradictions, unique
  evidence, omissions, and risks across completed outputs.
- **Result Advisor** follows the Judge. It uses the Judge findings and original
  outputs to recommend an answer. If Judge analysis is not usable, it uses
  `basis: "candidates-only"`. This status makes the degradation visible.

## Ennodia IO

The separate `@cherninlab/ennodia-io` package provides a local Hypertext
Transfer Protocol (HTTP) and TypeScript interface. Apps can use it with
user-supplied keys and installed local agents:

```sh
npx -y @cherninlab/ennodia-io
```

See [Ennodia IO](https://ennodia.cherninlab.com/docs/reference/ennodia-io/) for
supported fields, authentication behavior, cross-origin resource sharing
rules, and current limits.

## Supported harnesses

- Codex CLI
- Claude Code
- OpenCode
- Kilo Code
- Kiro CLI
- Cline CLI
- Hermes Agent
- Antigravity

Adapters stay thin. Core modules contain shared routing, trace data, task state,
recovery, and Compare logic.

Evaluated candidates include Gemini CLI, GitHub Copilot CLI, Amp, Aider, Goose,
Qwen Code, and Cursor CLI. Ennodia does not include these candidates.

Ennodia can add a candidate after verification of a supported prompt-in and
text-out interface. Verification must not use permission-bypass flags or
provider-private APIs.

## Documentation

- [Installation for Agents](https://ennodia.cherninlab.com/docs/install/): agent-controlled installation
- [Quickstart](https://ennodia.cherninlab.com/docs/getting-started/): manual installation and local development
- [MCP Tools](https://ennodia.cherninlab.com/docs/reference/mcp-tools/): full tool parameter reference
- [How Ennodia Works](https://ennodia.cherninlab.com/docs/concepts/how-ennodia-works/): orchestration pipeline
- [Second Opinions](https://ennodia.cherninlab.com/docs/concepts/second-opinions/): replicate, decompose, and red-team patterns
- [Data Governance](https://ennodia.cherninlab.com/docs/concepts/data-governance/): local storage and data movement boundaries
- [Controlled English](https://ennodia.cherninlab.com/docs/reference/controlled-english/): ASD-STE100 rules and Ennodia technical terms
- [Comparisons](https://ennodia.cherninlab.com/docs/comparisons/): comparisons with adjacent tools
- [Benchmarks](https://ennodia.cherninlab.com/docs/reference/benchmarks/): deterministic bug-recall results
- [Better Audits](https://ennodia.cherninlab.com/docs/guides/running-better-audits/): prompt rubrics for Compare

## Benchmarks

The current benchmark is `multi-model-bug-recall`. It uses small TypeScript
review fixtures and committed bug oracles. Run the deterministic suite with:

```sh
bun run bench:bug-recall
```

Live harness runs are available through `bun run bench:bug-recall:live` and are
kept out of `bun run verify`.

The current dated fixture snapshot is published in
[Benchmarks](https://ennodia.cherninlab.com/docs/reference/benchmarks/): 4
cases, with `ennodia-parallel-compare` at 100% recall and 100% precision.

## Contribute

Ennodia is under active development. You can submit bug reports and small,
focused pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for the local
verification workflow.
