---
title: Ennodia IO
description: The local interface for app-facing artificial intelligence (AI) provider options and chat calls.
---

Ennodia IO is a local Hypertext Transfer Protocol (HTTP) server for artificial
intelligence (AI) provider options. It uses the same Ennodia Core as the Model
Context Protocol (MCP) tools. It supports a bring your own key (BYOK) setup
without requiring a provider application programming interface (API) key.
The app can show runnable local agents in its user interface (UI). It can then
send chat-style requests to one option.

It is not a hosted model router. Ennodia does not sell model access, proxy
provider billing, or hide which local agents ran. IO ships as the separate
`@cherninlab/ennodia-io` package.

When Compare is enabled, Ennodia keeps the roles explicit. The Judge evaluates
candidate results. The Result Advisor combines the Judge analysis and candidate
evidence into the final answer.

## Start IO

```sh
npx -y @cherninlab/ennodia-io
```

From a checkout:

```sh
bun run --cwd packages/ennodia-io start
```

By default IO listens on `127.0.0.1:17273`. Non-loopback binding requires an API
key:

```sh
ENNODIA_IO_API_KEY="local-secret" npx -y @cherninlab/ennodia-io --host 0.0.0.0
```

Flags:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--host` | `127.0.0.1` | HTTP bind host. |
| `--port` | `17273` | HTTP bind port. |
| `--api-key` | `ENNODIA_IO_API_KEY` | Require `Authorization: Bearer <key>`. |
| `--max-request-body-size` | `2097152` | Maximum request body bytes before a structured `413`. |
| `--max-concurrent-chat-completions` | `4` | Maximum in-flight chat completions before a structured `429`. |

Environment variables:

| Variable | Meaning |
| --- | --- |
| `ENNODIA_IO_HOST` | Default host when `--host` is omitted. |
| `ENNODIA_IO_PORT` | Default port when `--port` is omitted. |
| `ENNODIA_IO_API_KEY` | API key required by the HTTP handler. |
| `ENNODIA_IO_MAX_REQUEST_BODY_SIZE` | Default request body byte cap. |
| `ENNODIA_IO_MAX_CONCURRENT_CHAT_COMPLETIONS` | Default in-flight chat completion cap. |

## Security and Browser Access

IO binds to loopback by default and refuses non-loopback hosts unless an API key
is configured. Bearer tokens are compared with a timing-safe comparison.

IO intentionally sends no Cross-Origin Resource Sharing (CORS) headers by
default. The browser blocks local apps unless they use their own local proxy.
There is no `--cors-origin` flag. Add one only when an app needs that trust
boundary.

## Routes

| Route | Status | Notes |
| --- | --- | --- |
| `GET /health` | Supported | Returns server name, status, and Ennodia version. |
| `GET /v1/provider-options` | Supported | Returns app-facing local provider options for settings screens. |
| `GET /v1/byok-options` | Supported alias | Same response as provider options. |
| `GET /v1/models` | Supported | Returns local virtual model IDs for compatible clients. |
| `POST /v1/chat/completions` | Supported subset | Non-streaming text messages only. |

## Provider Options

Use provider options when building a settings screen:

```sh
curl http://127.0.0.1:17273/v1/provider-options
```

The response is intentionally app-facing:

```json
{
  "object": "list",
  "defaultModel": "local/auto",
  "compareModel": "local/compare",
  "options": [
    {
      "id": "codex",
      "label": "Codex CLI",
      "kind": "local-agent-cli",
      "status": "ready",
      "available": true,
      "runnable": true,
      "configured": true,
      "model": "local/codex",
      "version": "codex-cli 0.141.0"
    }
  ]
}
```

Option statuses:

| Status | Meaning |
| --- | --- |
| `ready` | The local agent is runnable now. |
| `installed` | An app or partial install was detected, but Ennodia cannot run it through a supported command-line interface (CLI) surface yet. |
| `missing` | The supported local agent was not found. |

Add `?includeUnavailable=false` to return only ready options.

## Virtual Models

`GET /v1/models` returns local virtual models for OpenAI-compatible clients:

| Model | Meaning |
| --- | --- |
| `local/auto` | Let Ennodia choose the local harness. |
| `local/compare` | Run parallel local harnesses, evaluate them with the Judge, and combine the result with the Result Advisor. |
| `local/<harness-id>` | Force a specific harness, such as `local/codex` or `local/claude-code`. |

Older aliases `ennodia-auto`, `ennodia/auto`, and `ennodia/compare` are accepted
for compatibility. Prefer `local/*` IDs in new app integrations.

## Chat Completions

Minimal request:

```sh
curl http://127.0.0.1:17273/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "local/auto",
    "messages": [
      { "role": "user", "content": "Review this plan before I ship it." }
    ]
  }'
```

With Ennodia options:

```json
{
  "model": "local/codex",
  "messages": [
    { "role": "system", "content": "Be concise." },
    { "role": "user", "content": "Find the highest-risk issue." }
  ],
  "ennodia": {
    "category": "code",
    "harnessId": "codex",
    "mode": "single",
    "compare": false,
    "timeoutMs": 300000
  }
}
```

Supported top-level fields:

| Field | Meaning |
| --- | --- |
| `model` | Required OpenAI-compatible routing label. Use `local/auto`, `local/compare`, or a provider option's `model`. |
| `messages` | Required array of text-only `system`, `user`, `assistant`, or `tool` messages. |
| `stream` | Optional. Must be `false` or omitted. |
| `temperature`, `top_p`, `max_tokens`, `user` | Accepted for client compatibility but not used for local agent routing. |
| `ennodia` | Optional Ennodia-specific routing and timeout options. |

Supported `ennodia` fields:

| Field | Meaning |
| --- | --- |
| `category` | Optional caller-provided route category: `code`, `research`, `browser`, `image`, or `general`. |
| `harnessId` | Force one harness by adapter ID, such as `codex` or `claude-code`. |
| `mode` | `auto`, `single`, or `parallel`. |
| `compare` | `auto`, `true`, or `false`. |
| `cwd` | Working directory for child harness commands. |
| `model` | Child harness model override. Top-level `model` is only the HTTP routing label. |
| `timeoutMs` | Per-child timeout, capped at one hour. |
| `refresh` | Re-scan harnesses before planning. |
| `judgeHarnessId`, `judgeModel` | Compare judge overrides. |
| `advisorHarnessId`, `advisorModel` | Compare Result Advisor overrides. |
| `synthesizerHarnessId`, `synthesizerModel` | Deprecated aliases for `advisorHarnessId` and `advisorModel`. If both forms are supplied, their values must match. |
| `maxOutputChars` | Candidate output cap for Compare. |
| `maxWaitMs` | HTTP request wait cap, capped at one hour. |

Chat completions are non-streaming. A request waits until the Ennodia run
finishes or `maxWaitMs` elapses. The default is 10 minutes. Disable streaming in
OpenAI-compatible clients and set `ennodia.maxWaitMs` when the client or proxy
needs a shorter or longer hold time.

The response includes the normal OpenAI-style `choices[0].message.content` plus
an `ennodia` object. The object contains the run ID, status, selected harnesses,
task IDs, Compare ID when present, and budget estimate.

Limits and failures are returned as JSON with `cache-control: no-store`:

- request body above the configured cap -> `413 request_too_large`
- saturated chat completions -> `429 rate_limit_error` with `retry-after: 1`
- client abort after the run starts -> `499 client_closed_request`. IO cancels
  the Ennodia run when Core exposes cancellation
- timeout, disappeared run, or start failure -> `502 ennodia_run_error`
- failed run or run with `cancelled` status -> `502 ennodia_run_failed` plus run metadata

## Library Use

Apps can import the same primitives without running the HTTP server:

```ts
import { createDefaultEnnodiaCore } from "ennodia";
import { listAppProviderOptions } from "@cherninlab/ennodia-io";

const core = createDefaultEnnodiaCore();
const providerOptions = await listAppProviderOptions(core);
```

The app stays in control of its settings UI, labels, persistence, and consent
flow. Ennodia supplies local discovery and execution primitives.

## Smoke Test

From a checkout:

```sh
bun run io:smoke
```

The smoke test starts a local IO server and checks `/health`,
`/v1/provider-options`, and `/v1/models` without launching child agents.

## Not Implemented

IO deliberately rejects or omits:

- streaming responses. Child CLIs return text at task boundaries, not token
  deltas, so clients must set `stream: false` or omit `stream`.
- tool calls and function calls
- multimodal content arrays, image input, audio input, and file uploads
- embeddings, responses, assistants, batches, and fine-tuning routes
- hosted model fallback, provider pricing controls, or provider billing
- IO-specific history endpoints. Terminal run history is written by Core when
  history is enabled, but IO does not expose a read API for it.

Use MCP to inspect detailed run, task, Judge, Result Advisor, and Compare state
while work is in progress. Use IO when a local app needs a small HTTP bridge.
