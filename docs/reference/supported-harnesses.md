---
title: Supported harnesses
description: Current Ennodia adapter IDs, local command-line interface (CLI) surfaces, and setup notes for each supported harness.
---

Ennodia coordinates local agents through thin adapters. Each harness uses a
local command-line interface (CLI). Use `ennodia_list_harnesses` to see what is
installed and runnable on the current machine.

On macOS, discovery checks the existing `PATH` first, then `/opt/homebrew/bin`,
`/usr/local/bin`, and `~/.local/bin`. This covers restricted GUI and MCP launch
paths without changing the selected account, model, or child process environment.
Explicit command paths and routes with no command candidates stay unchanged.
Restart the MCP server after updating Ennodia to load discovery changes.

## Adapter IDs

| ID | Tool | Notes |
| --- | --- | --- |
| `claude-code` | <span class="agent-logo agent-logo--claude-code" aria-hidden="true"></span>Claude Code | Runs through `claude -p` without permission-bypass flags. |
| `codex` | <span class="agent-logo agent-logo--codex" aria-hidden="true"></span>Codex CLI | Runs through `codex exec`. Ennodia tasks use read-only sandboxing by default. |
| `opencode` | <span class="agent-logo agent-logo--opencode" aria-hidden="true"></span>OpenCode | Runs through `opencode run`. |
| `kilo` | <span class="agent-logo agent-logo--kilo-code" aria-hidden="true"></span>Kilo Code | Uses the supported Kilo CLI surface when available. |
| `kiro` | <span class="agent-logo agent-logo--kiro" aria-hidden="true"></span>Kiro CLI | Uses the supported Kiro CLI surface when available. |
| `cline` | <span class="agent-logo agent-logo--cline" aria-hidden="true"></span>Cline CLI | Ennodia reports it as unavailable when the local CLI cannot run non-interactively. |
| `hermes-agent` | <span class="agent-logo agent-logo--hermes-agent" aria-hidden="true"></span>Hermes Agent | Uses the supported Hermes Agent CLI surface when available. |
| `antigravity` | <span class="agent-logo agent-logo--antigravity" aria-hidden="true"></span>Antigravity | Runs through `agy` and supports browser-oriented review tasks. |

## First check

```json
{
  "tool": "ennodia_list_harnesses",
  "arguments": {
    "refresh": true
  }
}
```

The response reports availability, runnable state, command path, version,
capabilities, adapter notes, optional `inputGuidance`, and `readiness`.

`inputGuidance` is a bounded `string[]` of adapter observations and input advice.
It does not guarantee media support, authentication, or access to a requested model.
Plan Advisor receives this guidance in its harness inventory.

Discovery checks installation and native login status through supported commands.
Model access remains unverified until an explicit verification request or a successful task returns an answer.
A stalled check stops at its deadline and leaves access unverified.
Ennodia checks selected worker, Judge, and Advisor routes before execution.
Known blockers prevent requested work from starting.
Automatic routing excludes blocked routes and reports missing coverage.

Normal runs check native status without making a separate model request.

## Media inputs

Ennodia sends a text prompt through the selected CLI. Include local file paths and requested ranges in that prompt.
The harness must read those files through its available tools and normal permissions.
Model application programming interface (API) capabilities do not establish support through a harness's input transport or file tools.
Run a small native-media probe before a larger review or comparison.

Record the files, ranges, model, tool results, errors, and task IDs.
For audio comparisons, match excerpts, playback level, and reference material across candidates.
Native audio findings need evidence of successful media ingestion and observations tied to the requested excerpt.
Transcription, digital signal processing (DSP), and text-only judging provide distinct evidence. Label each method explicitly.

## Claude Code models

Claude Code model aliases can change. When exact model selection matters, pass
the full model ID, such as `claude-sonnet-5` or `claude-fable-5`, rather than an
alias like `sonnet` or `fable`.

Ennodia passes its execution notice through `--append-system-prompt`, so workers read it as their session's limits.

Do not add permission-bypass flags by default.

## Codex

Codex runs through the supported Codex CLI. Ennodia-launched Codex tasks default
to read-only sandboxing.

When exact effort matters, verify it in the Codex run output or local Codex
profile. Ennodia passes the requested model through the `model` field.

## OpenCode

OpenCode model IDs use the provider/model format reported by `opencode models`,
such as `opencode-go/kimi-k2.7-code`.

OpenCode runs that start at the same moment can fail with `database is locked`.
Ennodia restarts those starts automatically. A task that still fails reports the conflict as its likely cause.

## Antigravity

An explicit `jetski: no output produced` error is treated as a failed task even if the command exits with code zero.
Check the requested tool access in normal Antigravity settings. A denied read does not measure the model or skill's quality.

Ennodia uses `agy --print` with a text prompt containing local paths.
Antigravity's documented stream input accepts text blocks only. It rejects media blocks.
Use native `view_file` inspection when the selected harness and model expose it.
Check the tool result before claiming native audio, image, video, or document inspection.
See [headless input](https://antigravity.google/docs/cli/headless/#send-a-prompt) and the [CLI changelog](https://antigravity.google/changelog).

A September 10, 2026 probe used `agy` 1.2.0 with Gemini 3.8 Flash Medium:

- An eight-second MP3 native probe succeeded.
- FLAC sent as `audio/x-flac` was rejected.
- One comparison with four WAV samples timed out. This outcome leaves WAV support unresolved.

These observations apply to that run configuration. They do not define a universal format blacklist.
The CLI changelog records audio attachment support and media-type normalization fixes.
Gemini API audio support uses a separate interface. Its [format list](https://ai.google.dev/gemini-api/docs/audio) does not guarantee `view_file` compatibility.

Antigravity can fail setup when the `agy` CLI is not on `PATH`. Tell the user or
primary agent to verify:

```sh
command -v agy
agy --version
agy models
```

If neither `PATH` nor the native install roots contain `agy`, open Antigravity
and use its supported CLI install or shell-integration flow first. Then restart the Model Context
Protocol (MCP) client and call `ennodia_list_harnesses` again.

## Recovery and updates

Run the native command returned in `readiness.recovery` in an interactive terminal.
Keep the intended account, provider, and model.
Call `ennodia_check_harnesses` after sign-in:

```json
{
  "harnessIds": ["codex"],
  "refresh": true,
  "verify": true
}
```

Pass the same `model` and `cwd` when rechecking an explicit route.
The check returns `actionRequired` for confirmed login, setup, model, and capacity blockers.
A missing CLI requires installation. A capacity failure requires capacity recovery.
Neither is fixed by repeated sign-in.

`credentials-expired` means the configured provider API key has expired.
Replace the key through the native credential flow for the intended provider.
Signing in again does not renew an expired API key.
`quota-exhausted` includes depleted credits.
Restore credits or quota through the intended provider before rechecking.

Ennodia reads terminal-formatted native errors and returns the matching recovery action.
A worker's plain-text answer does not trigger a sign-in or capacity recovery action.

Hermes uses the full `hermes chat` CLI. The legacy `hermes-agent` executable is not compatible.

Native checks cache for 30 seconds. Verified routes cache for five minutes.
A native authentication failure invalidates the route immediately.
Concurrent checks of the same route share one request.

`unverified` means model access is unknown. It does not mean a failed harness.
`ennodia_run` lets the requested task verify model access after native status checks.
Checking every supported harness is not a prerequisite for a run.

Unrelated harness blockers do not prevent work on a usable requested route.
A verified default route does not prove access to other models.
Use the existing user authorization and the host approval policy.
Ennodia does not require an additional approval step.

Model probes run in an empty temporary directory with normal native permissions.
A temporary directory is not a security sandbox.

Explicit verification uses provider capacity independently of a run's budget.
Normal runs add no model probe calls or input-token reserves.
A verification timeout after 25 seconds does not block the requested task or imply a setup problem.

Before ordinary execution, Ennodia attempts supported upgrades once per day while no Ennodia task is active.
Homebrew installations use their installed formula or cask.
An npm Codex installation uses its supported npm update command.
Other supported installations use native updaters.

Updates preserve the installed distribution and channel and use no force flags.
Pinned or unsupported installations and failed updates require native maintenance.
Updater success is not proof of model readiness.
Ennodia rediscovers the version and rechecks the route.

Set `ENNODIA_AUTO_UPDATE=false` in the MCP server environment to disable automatic upgrades.
Call `ennodia_check_harnesses` with `upgrade: true` for an immediate update attempt and recheck.
The response includes `readiness.upgrade` with the update result and native command.
Approved Advisor plans do not upgrade during execution, so their frozen inventory remains stable.
Automatic updates run on use.
Ennodia does not install a background daemon.

Report `actionRequired` and reduced `coverage` to the user on the first response that contains them.
Compact run responses retain these fields.
MCP clients control how those responses appear in the conversation.
