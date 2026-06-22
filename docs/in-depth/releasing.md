---
title: Releasing Ennodia
description: Release gates, package contents, and registry publishing for Ennodia.
---

Ennodia releases are conservative. A release should prove that the packaged MCP
server starts through `bunx`, `npm exec`, and `npx`; that the package reports the
same version as the source; and that the tarball does not include private repo
scaffolding.

## Versioning

Prerelease versions use SemVer prerelease suffixes such as `0.1.0-rc.1`.
Stable versions omit the suffix, such as `0.1.0`.

The version is tracked in three files:

- `package.json`
- `jsr.json`
- `src/version.ts`

`bun test` verifies that those values match.

## Dist-tags

Tags containing a hyphen publish to npm's `next` dist-tag. Tags without a hyphen
publish to `latest`.

Examples:

```bash
git tag v0.1.0-rc.1
git push origin v0.1.0-rc.1
```

publishes `0.1.0-rc.1` to `next`.

```bash
git tag v0.1.0
git push origin v0.1.0
```

publishes `0.1.0` to `latest`.

Until the first stable release, docs should recommend `ennodia@next` instead of
an unqualified `ennodia` install.

## Local gates

Run the full release gate before tagging or publishing:

```bash
bun run release:check
```

That runs:

- `bun run verify`
- `npm pack --dry-run`
- `npm publish --dry-run --tag next`
- `npx jsr publish --dry-run --allow-dirty`
- `bun run src/dev/package-smoke.ts`

The package smoke creates a temporary tarball, checks the packed file list, and
performs an MCP initialize handshake through `bunx`, `npm exec`, and `npx`.

## Package contents

The npm package intentionally includes:

- the `ennodia` executable wrapper in `bin/`
- source files needed by the Bun runtime
- README, license, contribution guide, docs, and docs assets
- benchmark fixtures and scorer source

The npm package must not contain:

- `.github/`
- `AGENTS.md`
- `CLAUDE.md`
- `bun.lock`
- `src/dev/`
- `*.test.ts`
- `website/`

JSR publishes the TypeScript source and docs, but not benchmark fixtures.

## Registry publishing

The release workflow publishes to npm and JSR from GitHub Actions.

npm publishing uses trusted publishing with GitHub Actions OIDC. Configure the
npm package's trusted publisher with:

- Provider: GitHub Actions
- Organization or user: `cherninlab`
- Repository: `ennodia`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`

The workflow already grants `id-token: write`, uses Node 24, and upgrades npm to
a current CLI before publishing. Do not add a long-lived `NPM_TOKEN` unless you
intentionally change the workflow back to token publishing.

JSR publishing also uses OIDC. The JSR package must be linked to the GitHub
repository:

- Scope: `@cherninlab`
- Package: `ennodia`
- Linked repository: `cherninlab/ennodia`

## Workflow

Use the `Release` GitHub Actions workflow for dry runs and manual publishes.

For a normal release:

1. Update `package.json`, `jsr.json`, and `src/version.ts`.
2. Run `bun run release:check`.
3. Commit the version change.
4. Push a matching tag, for example `v0.1.0-rc.1`.
5. Watch the `Release` workflow publish npm, JSR, and the GitHub release asset.

Manual `workflow_dispatch` is useful for dry runs. Tag pushes are the canonical
publish path.
