---
title: Supported Harnesses
description: Current Ennodia adapter IDs, local CLI surfaces, and setup notes for each supported harness.
---

Ennodia coordinates local agent CLIs through thin adapters. Use
`ennodia_list_harnesses` to see what is installed and runnable on the current
machine.

## Adapter IDs

| ID | Tool | Notes |
| --- | --- | --- |
| `claude-code` | <span class="agent-logo agent-logo--claude-code" aria-hidden="true"></span>Claude Code | Runs through `claude -p` without permission-bypass flags. |
| `codex` | <span class="agent-logo agent-logo--codex" aria-hidden="true"></span>Codex CLI | Runs through `codex exec`; Ennodia-launched tasks default to read-only sandboxing. |
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
capabilities, and adapter notes.

## Claude Code Models

Claude Code model aliases can change. When exact model selection matters, pass
the full model ID, such as `claude-sonnet-5` or `claude-fable-5`, instead of an
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

Antigravity can fail setup when the `agy` CLI is not on `PATH`. Ask the user or
primary agent to verify:

```sh
command -v agy
agy --version
agy models
```

If the shell cannot find `agy` at all, open Antigravity and use its supported
CLI install or shell-integration flow first. Then restart the MCP client and
call `ennodia_list_harnesses` again.
