# Changelog

This file records all notable Ennodia changes.

## [0.4.1] - 2026-09-28

### Added

- Added a Questions page to the docs. It answers setup, data, cost, and time questions in one place.

### Changed

- Rewrote the README around what Ennodia does for you. You keep your agent, and it hands one part of a task to an agent with the ability.
- Changed the package description to match. The npm, JSR, and MCP Registry listings show both.

## [0.4.0] - 2026-09-26

### Added

- Marked tools that only read with the MCP read-only annotation, so clients such as Codex run them without an approval prompt.
- Let the Compare Result Advisor name, in `chosenSourceId`, one candidate that answers the prompt as it stands. `ennodia_run` then returns that candidate's own text, unchanged, after the Advisor's reason. A choice of an unlisted candidate, or of one the Advisor saw only in part, is dropped with an `advisor-choice-ignored` event.

### Changed

- Loaded six core tools by default: about 10,000 characters of tool definitions in each agent session, down from 45,000. Set `ENNODIA_TOOLS=all` or pass `--tools all` for the full set.
- Redesigned the website around an interactive agent graph, with capability strips drawn from recorded runs.

### Removed

- Removed the bug-recall benchmark, the docs-drift and skill-trial examples, and their evidence pages. Studies on public benchmarks will replace them.

### Fixed

- Tagged Ennodia's execution notice and media guidance as separate blocks, so workers do not read them as task content. Claude Code receives them as operator instructions through `--append-system-prompt`.
- Reported an agent CLI that is too old for the requested model as its own cause, not as a bad configuration.
- Named every unsupported harness setting in one error, so a caller fixes them in one retry, not one per setting.
- Reported a tool that a headless agent could not get permission for as its own cause, with the narrow fix, not as a provider failure.
- Restarted an OpenCode task that stopped at startup because another OpenCode run held its local database. A conflict that outlasts three restarts is reported as its own cause.

## [0.3.0] - 2026-09-18

### Added

- Optional Pragmatic beta contracts for cited investigation and unapplied patch proposals, preserving independent workers and comparison.
- Opt-in Codex session continuation, reasoning effort, native sandbox selection and native subagent controls.
- Bounded waits and compact run status responses.

### Changed

- Show execution deadlines and permission context to workers.
- Organize independent attempts and chunked work in the Pragmatic skill. Token savings and equal quality are not established.
- Clarify website categories and copy a complete setup prompt from the installation control.

### Fixed

- Treat interrupted or truncated usage as unknown rather than a complete token total.
- Preserve cancellation evidence after child output drains.
- Report comparison truncation and explicit Codex quota failures.

### Earlier release candidate changes

### Added

- Added three task recipes, two reproducible examples, and recorded development cases.
- Added guides for interpreting results, recovering from failed attempts, and measuring usefulness.
- Added `hasOutput` and `finalMessageChars` to task views, including compact views.

### Changed

- Rebuilt the homepage and README around trying alternatives from the same conversation.
- Organized documentation around first use, practical tasks, evidence, and technical reference.
- Made timeout advice suggest inspecting the attempt before choosing a retry strategy.
- Kept failed attempts visible in published examples without claiming measured savings.

### Fixed

- Bounded task cancellation and cleaned up owned process groups on macOS and Linux.
- Shut down active workers when the MCP input stream closes.
- Canceled earlier workers when a later raw or compositional task cannot start.
- Bounded version probes so one stalled CLI does not block discovery.
- Protected positional prompts from being parsed as CLI options.
- Retained active run evidence until comparison and receipt capture finish.
- Rejected invalid Judge JSON and bounded all selected comparison candidates.
- Recognized final-file answers in compact task and compositional views.
- Applied output limits to final messages as well as captured streams.
- Preserved new history receipts after a truncated previous line.
- Rejected unintended browser origins, forged local hosts, and non-JSON chat requests in Ennodia IO.
- Distinguished expired agent authentication from evidence about model quality.
- Marked Antigravity's explicit no-output error as failed, even with exit code zero.
- Isolated skill-discovery tests from developer home directories.

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
