# Changelog

All notable changes to Ennodia will be documented in this file.

## [0.1.1] - 2026-07-07

### Changed
- Simplified copy-paste agent installation prompt on landing page and README to `try-ennodia.cherninlab.com`.

## [0.1.0] - 2026-07-06

### Added
- Official MCP Registry compatibility: Added `server.json` configuration and `mcpName` package metadata.
- Improved docs and website landing page with structured data (`SoftwareApplication`), default social images, and recommended unqualified npm installation commands.
- Documented package publishing steps in [CONTRIBUTING.md](file:///Users/theochernin/Projects/ennodia/CONTRIBUTING.md).

### Fixed
- **Atomic Run History**: Made `FileHistorySink` write runs in an append-only JSONL format to prevent concurrent-write data loss and truncate issues. Deduplication and retention compaction now run atomically using a temporary file. Capped output logs in history snapshots to 20k characters/stream and 50 events.

---

## [0.1.0-rc.2] - 2026-07-06

### Added
- **Ennodia IO**: Created the `@cherninlab/ennodia-io` subpackage, exposing a local HTTP/TS interface for BYOK-style integrations.
- **Compositional Audits & Second-Opinions**: Implemented compositional workflows and multi-agent consensus synthesis.
- **Preflight Budgets**: Added local budget limit checks and preflight estimation tools to prevent resource/token overrun.
- **Agent Skills**: Added agent skill discoverer and loaders, introducing skills like `rigorous-review`, `benchmark-critic`, `compositional-audit`, `release-readiness`, and `source-grounded-audit`.
- **Compare Synthesis**: Added `CompareManager` to run model-led synthesis across outputs.
- Custom styling, logo SVGs, and an custom agent-font for the Astro/Starlight documentation website.

---

## [0.1.0-rc.1] - 2026-06-22

### Added
- Expanded harness adapters to support Codex CLI, Claude Code, Cline, Kiro, OpenCode, and Hermes Agent.
- Enhanced comparison interface and planning logic.
- Expanded benchmark documentation and release procedures.
- Integrated Starlight styling overrides and updated website layout.

---

## [0.1.0-rc.0] - 2026-06-22

### Added
- Bug recall benchmark suite (`bench/bug-recall`) with 4 diagnostic fixtures (missing await, timeout drain, schema contract, cancel propagation).
- Standardized CLI entry points and MCP connection handshake tests.
- GitHub Action CI/CD and release build workflows.

---

## [0.0.1] - 2026-06-19

### Added
- Initial implementation containing the core orchestration classes (`TaskManager`, `CompareManager`, `RunManager`).
- thin local harness adapters, task execution scheduler, history sinks, and stdio MCP server.
