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

## Releasing

Releases are cut by a maintainer, not part of a normal contribution. This
section exists so the process is written down.

**Versioning.** Prerelease versions use SemVer suffixes such as `0.1.0-rc.1`;
stable versions omit the suffix, such as `0.1.0`. The version is tracked in
`package.json`, `jsr.json`, and `src/version.ts` — `bun test` verifies they
match.

**Dist-tags.** Tags containing a hyphen publish to npm's `next` dist-tag;
tags without a hyphen publish to `latest`:

```bash
git tag v0.1.0-rc.1 && git push origin v0.1.0-rc.1   # publishes to next
git tag v0.1.0 && git push origin v0.1.0             # publishes to latest
```

Until the first stable release, docs should recommend `ennodia@next` instead
of an unqualified `ennodia` install. npm points `latest` at the first
published version even when that publish used `--tag next` — that is
expected registry behavior, not a bug, and resolves itself once the first
stable tag publishes with `--tag latest`.

**Release checklist.**

1. Update `package.json`, `jsr.json`, and `src/version.ts`.
2. Run `bun run release:check`. It chains `bun run verify`,
   `npm pack --dry-run`, `npm publish --dry-run --tag next`,
   `npx jsr publish --dry-run --allow-dirty`, and a package smoke test that
   packs a real tarball and MCP-handshakes it through `bunx`, `npm exec`,
   and `npx`.
3. Commit the version change.
4. Push a matching tag, for example `v0.1.0-rc.1`.
5. The `Release` GitHub Actions workflow publishes npm, JSR, and the GitHub
   release asset. `workflow_dispatch` is available for dry runs; tag pushes
   are the canonical publish path.

**Package contents.** The npm package must include `bin/ennodia`, the source
files the Bun runtime needs, README/LICENSE/CONTRIBUTING/docs, and benchmark
fixtures — and must not include `.github/`, `AGENTS.md`, `CLAUDE.md`,
`bun.lock`, `src/dev/`, `*.test.ts`, or `website/`. JSR publishes the
TypeScript source and docs, but not benchmark fixtures.
`bun run release:check` enforces both lists.

**Registry publishing.** Both npm and JSR publish from GitHub Actions using
OIDC — there is no long-lived `NPM_TOKEN`. To reconfigure a trusted
publisher: npm needs provider "GitHub Actions", org/user `cherninlab`,
repository `ennodia`, workflow filename `release.yml`, allowed action
`npm publish`; JSR needs scope `@cherninlab`, package `ennodia`, linked
repository `cherninlab/ennodia`.

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
