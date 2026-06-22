# Contributing to Ennodia

## Prerequisites

- **Bun** 1.3.14+
- Local AI tools are optional unless you are changing their adapters

## Quickstart

```sh
bun install
bun run verify
```

`verify` runs typechecking, Oxlint, unit tests, and local MCP smoke checks.

Before changing release metadata or package contents, also run:

```sh
bun run release:check
```
