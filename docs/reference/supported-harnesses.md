---
title: Supported Harnesses
description: Current Ennodia adapter IDs, local command-line interface (CLI) surfaces, and setup notes for each supported harness.
---

Ennodia coordinates local agents through thin adapters. Each harness uses a
local command-line interface (CLI). Use `ennodia_list_harnesses` to see what is
installed and runnable on the current machine.

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

## First Check

```json
{
  "tool": "ennodia_list_harnesses",
  "arguments": {
    "refresh": true
  }
}
```

The response reports availability, runnable state, command path, version,
capabilities, adapter notes, and optional `inputGuidance`.

`inputGuidance` is a bounded `string[]` of adapter observations and input advice.
It does not guarantee media support, authentication, or access to a requested model.
Plan Advisor receives this guidance in its harness inventory.

Discovery checks installed commands, not active authentication or model access.
A stalled version probe stops at its deadline and adds an adapter note.
Use a small real task to check the selected agent before sending larger work.

## Media Inputs

Ennodia sends a text prompt through the selected CLI. Include local file paths and requested ranges in that prompt.
The harness must read those files through its available tools and normal permissions.
Model application programming interface (API) capabilities do not establish support through a harness's input transport or file tools.
Run a small native-media probe before a larger review or comparison.

Record the files, ranges, model, tool results, errors, and task IDs.
For audio comparisons, match excerpts, playback level, and reference material across candidates.
Native audio findings need evidence of successful media ingestion and observations tied to the requested excerpt.
Transcription, digital signal processing (DSP), and text-only judging provide distinct evidence. Label each method explicitly.

## Claude Code Models

Claude Code model aliases can change. When exact model selection matters, pass
the full model ID, such as `claude-sonnet-5` or `claude-fable-5`, rather than an
alias like `sonnet` or `fable`.

Do not add permission-bypass flags by default.

## Codex

Codex runs through the supported Codex CLI. Ennodia-launched Codex tasks default
to read-only sandboxing.

When exact effort matters, verify it in the Codex run output or local Codex
profile. Ennodia passes the requested model through the `model` field.

## OpenCode

OpenCode model IDs use the provider/model format reported by `opencode models`,
such as `opencode-go/kimi-k2.7-code`.

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

If the shell cannot find `agy` at all, open Antigravity and use its supported
CLI install or shell-integration flow first. Then restart the Model Context
Protocol (MCP) client and call `ennodia_list_harnesses` again.
