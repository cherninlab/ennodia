---
title: Pragmatic mode
description: Delegate bounded investigation and patch proposals to one explicitly selected model.
---

Pragmatic mode is experimental in `0.3.0-rc.2`, available through `ennodia@next`.
It helps your main agent delegate bounded work without loading entire logs or files into the main conversation.
It does not guarantee lower costs or select the cheapest model automatically.

## Start a bounded task

Use this prompt in your main agent:

```text
Use Ennodia MCP in Pragmatic mode to investigate the failing requests in /absolute/path/to/server.log.
Select a supported lower-cost model from my configured harnesses.
Return the affected timestamps, exact errors, likely cause, and evidence locations.
Keep the full log outside this conversation. Verify the decisive evidence before recommending a fix.
```

The main agent can call the existing run tool:

```json
{
  "tool": "ennodia_run",
  "arguments": {
    "harnessId": "claude-code",
    "model": "<supported-model-from-your-configuration>",
    "cwd": "/absolute/path/to/project",
    "prompt": "Find the cause of failed requests in /absolute/path/to/server.log between 10:00 and 10:10. Do not modify files.",
    "pragmatic": {
      "recipe": "investigate",
      "acceptanceCriteria": "Cite exact errors and timestamps. Distinguish confirmed causes from hypotheses. Report any unread ranges."
    },
    "timeoutMs": 120000,
    "budget": { "maxChildTasks": 1 }
  }
}
```

Replace the model placeholder with a supported identifier before calling the tool.
The caller supplies both `harnessId` and `model`.
The run uses `mode: single` and `compare: false`, including when these fields are omitted or set to `auto`.
Explicit parallel execution or comparison is rejected before workers start.

## Get findings or a patch

| Recipe | Worker instruction | Main agent responsibility |
| --- | --- | --- |
| `investigate` | Return cited findings, small excerpts, coverage limits, and unresolved questions | Verify decisive evidence |
| `patch` | Return a complete unified diff proposal without applying it | Review, apply, and test the patch |

Both recipes instruct workers to avoid file changes, side effects, recursive delegation, and repeated failed approaches.
These are worker instructions, not an enforced permission sandbox.
Native harness permissions remain authoritative.
A worker can fail to follow instructions, so use appropriate native permissions for sensitive work.

Patch results distinguish executed checks from proposed checks.
Check `finalAnswerChars` and request a larger answer if the response was truncated.
Do not apply an incomplete diff.
Patch runs fail when the child answer was truncated before reaching the run. Submit a smaller assignment in that case.

For authorized file edits, use a normal run in a separate checkout with appropriate native permissions.
The experimental recipes do not grant edit permissions.
Temporary `isolateCwd` copies are deleted when tasks finish and cannot serve as persistent patch artifacts.

## Inspect the work

Use `ennodia_get_run` for status, requested `model`, `pragmatic` settings, elapsed time, events, and child task IDs.
Inspect child tasks for output and adapter-reported usage when available.
Missing usage is unknown, not zero.
Persisted run records are bounded and can omit output.

Use `ennodia_estimate_budget` with the same `pragmatic` settings and model to include worker instructions in the preflight estimate.
Estimates do not measure total task spend, internal tool reads, or subscription quota consumption.

The foundation does not retry automatically or track retries across separate runs.
Escalate unresolved work in a separate run after inspecting its evidence.
Compare total elapsed time, verified outcomes, and all reported usage across attempts before claiming savings.

## Install the main-agent skill

The bundled `pragmatic` skill guides delegation from your main conversation.
Install it through [Agent Skills](/docs/guides/agent-skills/) using `skillIds: ["pragmatic"]`.
Do not request this skill on workers through run `skillIds`.
