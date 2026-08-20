# Contributing to Ennodia

Thanks for helping make Ennodia better. Keep changes small, tested, and easy to
review.

## Prerequisites

- Bun `1.3.14` or newer
- Local artificial intelligence (AI) tools only when you change or test their adapters

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
- controlled-English deterministic checks
- task smoke test
- Model Context Protocol (MCP) smoke test

Before changing release metadata, package contents, or registry config, also run:

```sh
bun run release:check
```

## Project rules

- Keep adapters thin. Put shared routing, tracing, task lifecycle, recovery, and
  Compare behavior in core modules.
- Do not add permission-bypass flags to harness commands by default.
- Do not call provider-private application programming interfaces (APIs).
  Use supported command-line interface (CLI) or API surfaces.
- Keep progress and status output compact and factual.
- Keep docs, website copy, package metadata, and MCP behavior aligned in the
  same change when public behavior changes.
- Edit the version in root `package.json`, then run `bun run version:sync` to
  refresh generated version fields.

## Package surfaces

`bin/ennodia` is the executable used by npm, `bunx`, and `npx`.
`src/cli.ts` starts the stdio MCP server only.
`src/index.ts` is the side-effect-free TypeScript export surface for the
JavaScript Registry (JSR) and imports.
`packages/ennodia-io` is the experimental local Hypertext Transfer Protocol
(HTTP) package. It owns the
`ennodia-io` binary and imports Core from the `ennodia` package surface. The
root package must not ship the HTTP server.

## Releasing

Releases are cut by a maintainer, not part of a normal contribution. This
section exists so the process is written down.

**Versioning.** Prerelease versions use SemVer suffixes such as `0.1.0-rc.1`.
stable versions omit the suffix, such as `0.1.0`. The source of truth is the
root `package.json` version.

`bun run version:sync` derives `jsr.json`,
`src/version.ts`, `server.json`, `manifest.json`, and the IO package version.
It also derives the IO dependency on the core version. `bun test` verifies
that the versions match.

**Dist-tags.** Tags containing a hyphen publish to npm's `next` dist-tag.
tags without a hyphen publish to `latest`:

```bash
git tag v0.1.0-rc.1 && git push origin v0.1.0-rc.1   # publishes to next
git tag v0.1.0 && git push origin v0.1.0             # publishes to latest
```

Since `v0.1.0`, docs recommend the unqualified `ennodia` install, which npm
resolves to the `latest` dist-tag. Prerelease work between stable releases
still publishes to `next`. Recommend `ennodia@next` in docs only while a fix
exists solely on that channel.

**Release checklist.**

1. Update the root `package.json` version, then run `bun run version:sync`.
2. Run `bun run release:check`. It chains `bun run version:sync`,
   `bun run verify`,
   `npm pack --dry-run`, `npm publish --dry-run --tag next`,
   `npx jsr publish --dry-run --allow-dirty`, and a package smoke test that
   packs a real tarball and MCP-handshakes it through `bunx`, `npm exec`,
   and `npx`. It also runs the `@cherninlab/ennodia-io` typecheck, tests,
   pack dry-run, and npm publish dry-run.
3. Commit the version change.
4. Push a matching tag, for example `v0.1.0-rc.1`.
5. The `Release` GitHub Actions workflow publishes the core `ennodia` package
   to npm and JSR, then `@cherninlab/ennodia-io` to npm, the MCP Registry
   listing, and the GitHub release asset. Re-running a release is safe when a
   prior attempt published one of these immutable versions.

**Package contents.** The core npm package must include these items:

- `bin/ennodia`
- source files that the Bun runtime needs
- README, LICENSE, CONTRIBUTING, and documentation files
- benchmark fixtures

The core npm package must not include these items:

- `.github/`, `AGENTS.md`, or `CLAUDE.md`
- `bun.lock`, `src/dev/`, or `src/io.ts`
- `*.test.ts`, `packages/`, or `website/`

JSR publishes the TypeScript source and docs, but not benchmark fixtures.
The IO npm package must include `bin/ennodia-io`, its `src/` files, and its
README. It has an exact runtime dependency on the matching `ennodia` version.
The release workflow publishes the core package first. The IO package stays
outside the root Bun workspace so an unpublished next version does not block
the root install. `bun run release:check` enforces these rules.

**Registry publishing.** npm publishes use the repository `NPM_TOKEN` secret.
The workflow passes it to npm as `NODE_AUTH_TOKEN`. JSR uses GitHub Actions
OpenID Connect (OIDC) without a JSR token.

Link scope `@cherninlab`, package `ennodia`, to
`cherninlab/ennodia` in JSR package settings. The workflow's `id-token: write`
permission enables that authentication. To reconfigure npm, ensure the token
can publish both `ennodia` and `@cherninlab/ennodia-io` with public access.

**MCP registry listing.** The official MCP Registry
(`registry.modelcontextprotocol.io`) hosts metadata only. npm remains the
artifact source. The listing is defined by `server.json` at the repo root,
and npm-side ownership is verified through the `mcpName` field in
`package.json`. Its value must match `io.github.cherninlab/ennodia` in
`server.json`.
To publish or update the listing after the npm package is live:

```sh
brew install mcp-publisher        # or download from the registry's releases
mcp-publisher login github        # interactive local login; grants io.github.cherninlab/*
mcp-publisher publish             # validates and submits server.json
```

The release workflow uses the non-interactive GitHub Actions OIDC equivalent:
`mcp-publisher login github-oidc --registry=https://registry.modelcontextprotocol.io`.
This also requires the workflow's `id-token: write` permission.

Keep the `version` fields in `server.json` in step with releases. The
listing is per-version, so re-run `mcp-publisher publish` after each release.
Community aggregators (Glama, PulseMCP, mcp.so, Smithery) index
GitHub and the official registry automatically or accept one-time
submissions. They do not need per-release updates.

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
