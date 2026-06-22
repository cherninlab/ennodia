# Contributing to Ennodia

Thanks for helping make Ennodia better. Keep changes small, tested, and easy to
review.

## Prerequisites

- Bun `1.3.14` or newer
- Local AI tools only when you are changing or testing their adapters

## Local workflow

```sh
bun install
bun run verify
```

`bun run verify` runs:

- TypeScript typechecking
- Oxlint
- Bun tests
- website build
- task smoke test
- MCP smoke test

Before changing release metadata, package contents, or registry config, also run:

```sh
bun run release:check
```

## Project rules

- Keep adapters thin. Put shared routing, tracing, task lifecycle, recovery, and
  Compare behavior in core modules.
- Do not add permission-bypass flags to harness commands by default.
- Do not call provider-private APIs. Use supported CLI or API surfaces.
- Keep progress and status output compact and factual.
- Keep docs, website copy, package metadata, and MCP behavior aligned in the
  same change when public behavior changes.
- Keep `package.json`, `jsr.json`, and `src/version.ts` in sync.

## Package surfaces

`bin/ennodia` is the executable used by npm, `bunx`, and `npx`.
`src/cli.ts` starts the stdio MCP server.
`src/index.ts` is the side-effect-free TypeScript export surface for JSR and
imports.

## Benchmarks

The deterministic benchmark suite is:

```sh
bun run bench:bug-recall
```

Live harness benchmarks use:

```sh
bun run bench:bug-recall:live
```

Live runs are intentionally not part of `bun run verify`.

## Security

Do not commit credentials, provider tokens, `.env` files, or private tool
configuration. If you suspect a secret was committed, stop and rotate the secret
before continuing.
