---
title: Releasing Ennodia
description: Release gates and first-RC publishing steps for Ennodia.
---

Ennodia releases are intentionally conservative. A release should prove that the
MCP server starts through the packaged CLI, reports the correct version, and does
not publish private repo scaffolding.

## Versioning

The first release candidate is `0.1.0-rc.0`.

Prerelease versions are published under npm's `next` dist-tag. Stable versions
will use `latest`. The same version is also published to JSR as
`@cherninlab/ennodia`.

The package version is tracked in `package.json`, `jsr.json`, and
`src/version.ts`. `bun test` verifies that they match.

## Local gates

Run the full gate before tagging or publishing:

```bash
bun run release:check
```

That runs:

- `bun run verify`
- `npm pack --dry-run`
- `npx jsr publish --dry-run --allow-dirty`
- `bun run src/dev/package-smoke.ts`

The package smoke creates a temporary tarball, checks the packed file list, and
performs an MCP initialize handshake through `bunx`, `npm exec`, and `npx`.
The JSR dry-run validates the TypeScript source package without publishing it.

## Public repo gate

Before changing the GitHub repository to public, run a history scan:

```bash
git log --all -p | grep -iE '(token|secret|api.key|password)' | head -40
git log --all --full-history -- ".env*"
```

Every hit must be a false positive or removed from history before publication.

## First RC publish

1. Confirm the npm name is still available:

   ```bash
   npm info ennodia
   ```

   `E404` means the name is not currently published.

2. Run the release gate:

   ```bash
   bun run release:check
   ```

3. Make the GitHub repository public. npm provenance for public packages requires
   a public source repository.

4. Create the JSR scope/package if needed:

   - Scope: `@cherninlab`
   - Package: `ennodia`
   - Linked GitHub repository: `cherninlab/ennodia`

   JSR publishing from GitHub Actions uses OIDC, so it does not require a
   registry token. The package must be linked to this GitHub repository in JSR
   before the workflow can publish it.

5. For the first publish, use the `Release` GitHub Actions workflow with
   `dry_run` disabled. Because npm trusted publishing requires the package to
   already exist, the first publish can use a granular `NPM_TOKEN` secret with
   publish permission. JSR uses the workflow's `id-token: write` permission
   instead of a long-lived secret.

6. After the first publish, configure npm trusted publishing for this package:

   - Provider: GitHub Actions
   - Organization or user: `cherninlab`
   - Repository: `ennodia`
   - Workflow filename: `release.yml`
   - Allowed action: `npm publish`

7. After a trusted-publishing release succeeds, delete or rotate the first-publish
   `NPM_TOKEN`.

## Tagging

For the first RC:

```bash
git tag v0.1.0-rc.0
git push origin v0.1.0-rc.0
```

Tags containing a hyphen publish to `next`. Tags without a hyphen publish to
`latest`. JSR uses the exact SemVer version from `jsr.json`; it does not use
npm dist-tags.

## Do not include in the package

The published tarball must not contain:

- `.github/`
- `AGENTS.md`
- `CLAUDE.md`
- `bun.lock`
- `src/dev/`
- `*.test.ts`
- `website/`
