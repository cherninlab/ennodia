# Changelog

This file records all notable Ennodia changes.

## [0.2.0] - 2026-08-20

### Added

- Added a Plan Advisor lifecycle that proposes and validates an inert work plan.
- Added digest-bound plan execution with inventory and skill checks before launch.
- Added typed Result Advisor output after the Compare Judge.
- Added skill selection for each compositional slice.
- Added controlled-English policy, an Ennodia termbase, and deterministic checks.

### Changed

- Renamed the public Compare result role to Result Advisor.
- Kept the old `synthesizer` fields as deprecated compatibility aliases.
- Made isolated tasks reject symbolic links before process launch.
- Made omitted `cwd` isolation use the server process directory.
- Made Ennodia IO depend on the matching core package version.
- Updated the release workflow to publish npm, JavaScript Registry (JSR),
  Ennodia IO, and Model Context Protocol (MCP) Registry metadata.
- Updated the README, documentation, website, package metadata, and release instructions.

### Fixed

- Prevented phantom running tasks after a synchronous process spawn failure.
- Prevented ambiguous skill content from receiving incorrect harness support.
- Bound advised-plan authorization and launch to one discovered runtime inventory.
- Corrected Result Advisor model selection when the Judge uses another harness.
- Prevented model-authored slice prompts from becoming harness command options.
- Made each advised plan single-use after successful authorization.
- Canceled earlier workers when a later advised-plan task cannot start.

## [0.1.1] - 2026-07-07

### Changed

- Simplified the agent installation prompt to `try-ennodia.cherninlab.com`.

## [0.1.0] - 2026-07-06

### Added

- Added `server.json` and `mcpName` metadata for MCP Registry compatibility.
- Added `SoftwareApplication` structured data and default social images to the website.
- Added unqualified npm installation commands to the documentation.
- Added package publication steps to [CONTRIBUTING.md](./CONTRIBUTING.md).

### Fixed

- Made `FileHistorySink` append run history in JSON Lines format.
- Made retention compaction replace the history file atomically.
- Limited each history output stream to 20,000 characters and 50 events.

---

## [0.1.0-rc.2] - 2026-07-06

### Added

- Added the `@cherninlab/ennodia-io` package for local Hypertext Transfer
  Protocol (HTTP) and TypeScript integrations.
- Added compositional workflows for focused multi-agent review.
- Added local budget checks and preflight estimate tools.
- Added Agent Skill discovery, loading, and bundled review skills.
- Added `CompareManager` for model-led comparison of task output.
- Added custom styles, logos, and an agent font to the Astro and Starlight website.

---

## [0.1.0-rc.1] - 2026-06-22

### Added

- Added adapters for local command-line interface (CLI) programs, including
  Codex CLI, Claude Code, Cline, Kiro CLI, OpenCode, and Hermes Agent.
- Improved the comparison interface and route planning.
- Expanded benchmark documentation and release procedures.
- Added Starlight style overrides and a new website layout.

---

## [0.1.0-rc.0] - 2026-06-22

### Added

- Added the bug-recall benchmark with four diagnostic fixtures.
- Standardized CLI entry points and MCP handshake tests.
- Added GitHub Actions workflows for CI, release, and website deployment.

---

## [0.0.1] - 2026-06-19

### Added

- Added the core `TaskManager`, `CompareManager`, and `RunManager` classes.
- Added thin local harness adapters, task scheduling, history storage, and the stdio MCP server.
