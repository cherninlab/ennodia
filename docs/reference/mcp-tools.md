---
title: MCP tools
description: The public MCP tool surface exposed by Ennodia.
---

This page describes the tools exposed by the Ennodia MCP server. The normal
entrypoint is `ennodia_run`: it starts a visible orchestration and returns a run
ID. Use `ennodia_get_run` to poll status, events, child task IDs, Compare state,
and the final answer.

## Shared behavior

`ennodia_plan`, `ennodia_start`, and `ennodia_run` use lightweight prompt
classification plus local harness discovery. Pass `refresh: true` to re-scan
installed commands before planning or starting work.

`ennodia_start` and `ennodia_run` also accept `skillIds`. Ennodia treats skills
as native Agent Skills: folders containing `SKILL.md`, installed in the paths
each harness already understands. It does not inline full skill content into the
delegated prompt. Task and run views include selected skill metadata in
`appliedSkills`.

`ennodia_estimate_budget`, `ennodia_start`, `ennodia_run`, and
`ennodia_start_compare` support a `budget` object for local preflight
enforcement. Budgeting is an input-token estimate plus child-task count guard.
It does not claim to know provider billing, output tokens, cache behavior, or
private subscription quota.

### Routing hints

Ennodia classifies prompts before dispatching. UI and rendered-page prompts are
directed to browser-capable harnesses first. Audit, review, critique,
assessment, and comparison prompts suggest parallel execution and Compare when
more than one runnable harness is available. Pass `harnessId` to skip
classification and target a specific adapter.

`harnessId` forces a specific adapter. Current adapter IDs are:

| ID | Tool |
| --- | --- |
| `claude-code` | Claude Code |
| `codex` | Codex CLI |
| `opencode` | OpenCode |
| `kilo` | Kilo Code |
| `kiro` | Kiro CLI |
| `cline` | Cline CLI |
| `hermes-agent` | Hermes Agent |
| `antigravity` | Antigravity |

Fields named `maxOutputChars`, `maxAnswerChars`, or `maxCandidateChars` bound
returned text. `0` omits that text while still returning status, IDs, timing,
and character counts.

## Discovery and planning

### `ennodia_list_harnesses`

Detects supported local AI tools and reports availability, runnable state,
command path, version, capabilities, and adapter notes.

| Input | Default | Meaning |
| --- | --- | --- |
| `refresh` | `false` | Ignore the short discovery cache and re-scan. |

Use this first when a client setup, command path, or adapter is not behaving as
expected.

### `ennodia_list_skills`

Discovers native Agent Skills from supported harness locations, plus bundled
Ennodia skills that can be installed into those locations:

- Codex and agent-compatible: `.agents/skills`, `~/.agents/skills`
- Claude Code: `.claude/skills`, `~/.claude/skills`
- OpenCode native: `.opencode/skills`, `~/.config/opencode/skills`
- OpenCode compatible: `.agents/skills`, `~/.agents/skills`,
  `.claude/skills`, `~/.claude/skills`
- Antigravity: `.agent/skills`, `~/.gemini/antigravity/skills`
- Ennodia bundled installable skills under `skills`

The list response returns summaries, searched directories, installation
metadata, and load warnings. It does not return full instruction text.

| Input | Default | Meaning |
| --- | --- | --- |
| `cwd` | server process cwd | Optional working directory to locate project-specific skills. |

### `ennodia_install_skills`

Installs bundled Ennodia skills into native harness skill directories. It
defaults to `dryRun: true`, so callers can inspect planned writes first.

| Input | Default | Meaning |
| --- | --- | --- |
| `skillIds` | all bundled | Bundled skill IDs to install. |
| `harnessIds` | Codex, Claude Code, OpenCode, Antigravity | Native harness locations to target. |
| `scope` | `project` | `project` or `user`. |
| `cwd` | required for project scope | Project directory used for project installs. |
| `overwrite` | `false` | Replace existing target skill folders. |
| `dryRun` | `true` | Preview without copying files. |

### `ennodia_plan`

Classifies a prompt and previews the route Ennodia would take without starting a
child process.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Task text to classify. |
| `refresh` | `false` | Re-scan harness discovery before planning. |

Returns the category, routing reasons, ordered candidate harness IDs, selected
harness, whether parallel execution is suggested, whether Compare is suggested,
and a Mermaid route diagram.

### `ennodia_estimate_budget`

Plans a run without starting child tasks, then estimates preflight input tokens
and checks optional limits.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Task text to classify, route, and estimate. |
| `harnessId` | planner choice | Force one adapter by ID. |
| `mode` | `auto` | `auto`, `single`, or `parallel`. |
| `compare` | `auto` | Include Compare in the estimate. |
| `refresh` | `false` | Re-scan harness discovery before planning. |
| `maxOutputChars` | bounded default | Characters per successful task assumed for Compare. |
| `budget.maxEstimatedInputTokens` | none | Mark the estimate exceeded above this input-token count. |
| `budget.maxChildTasks` | none | Mark the estimate exceeded above this child-task count. |
| `budget.requireKnownSubscriptionLimits` | `false` | Mark the estimate exceeded if any selected harness has unknown subscription quota. |

The response includes the route plan, selected harness IDs, estimate
assumptions, subscription-limit check status, and exceeded issues.

## End-to-end runs

### `ennodia_run`

Starts the full orchestration: plan, execute one or more child tasks, optionally
Compare successful outputs, and expose the final answer through `ennodia_get_run`.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Task sent to the selected local AI tools. |
| `harnessId` | planner choice | Force one adapter by ID. |
| `mode` | `auto` | `auto`, `single`, or `parallel`. |
| `cwd` | server process cwd | Working directory for child commands. |
| `model` | adapter default | Optional model override passed to task harnesses. |
| `timeoutMs` | task default | Timeout for each child task. |
| `compare` | `auto` | `auto`, `true`, or `false`. |
| `refresh` | `false` | Re-scan harness discovery before planning. |
| `judgeHarnessId` | Compare priority | Harness used for the judge pass. |
| `judgeModel` | judge default | Optional judge model override. |
| `synthesizerHarnessId` | judge harness | Harness used for final synthesis. |
| `synthesizerModel` | judge model | Optional synthesizer model override. |
| `maxOutputChars` | bounded default | Characters per successful task sent into Compare. |
| `skillIds` | `[]` | Optional list of installed native skill IDs to ask selected harnesses to use. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if selected child tasks exceed this value. |
| `budget.requireKnownSubscriptionLimits` | `false` | Fail if selected harness subscription limits are unknown. |

Returns a run view with `id`, status, selected harnesses, child task IDs, Compare
ID when one exists, events, timing, ETA, budget estimate/check, and final answer
when already available. The important value is `id`; poll it with
`ennodia_get_run`.

### `ennodia_get_run`

Returns the current run state.

| Input | Default | Meaning |
| --- | --- | --- |
| `runId` | required | ID returned by `ennodia_run`. |
| `includeEvents` | `true` | Include run event history. |
| `maxEvents` | bounded default | Maximum run events to return. |
| `maxAnswerChars` | bounded default | Maximum final-answer characters. |

Terminal run states are `succeeded`, `failed`, and `cancelled`. A run should not
be considered complete before it reaches one of those states.

### `ennodia_cancel_run`

Cancels a high-level run and any active child task or Compare.

| Input | Default | Meaning |
| --- | --- | --- |
| `runId` | required | ID returned by `ennodia_run`. |

Cancellation is explicit. A cancelled run should not be presented as a normal
model failure.

### `ennodia_list_runs`

Lists runs started by the current MCP server process.

| Input | Default | Meaning |
| --- | --- | --- |
| `includeEvents` | `false` | Include bounded event history. |
| `maxEvents` | bounded default | Maximum events per run. |
| `maxAnswerChars` | bounded default | Maximum answer characters per run. |

Run history is bounded and in-memory. Restarting the MCP server clears it.

## Direct tasks

### `ennodia_start`

Starts one or more raw child tasks without run-level Compare or final synthesis.
Use it for debugging adapters or for manual Compare workflows.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Task sent to the selected local AI tools. |
| `harnessId` | planner choice | Force one adapter by ID. |
| `mode` | `single` | `single` or `parallel`. |
| `cwd` | server process cwd | Working directory for child commands. |
| `model` | adapter default | Optional model override. |
| `timeoutMs` | task default | Timeout for each child task. |
| `refresh` | `false` | Re-scan harness discovery before planning. |
| `skillIds` | `[]` | Optional list of installed native skill IDs to ask selected harnesses to use. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if selected child tasks exceed this value. |
| `budget.requireKnownSubscriptionLimits` | `false` | Fail if selected harness subscription limits are unknown. |

Returns started task IDs, the route plan, and the budget estimate/check.

### `ennodia_get_task`

Returns task status, captured output, events, timing, and ETA.

| Input | Default | Meaning |
| --- | --- | --- |
| `taskId` | required | ID returned by `ennodia_start`, `ennodia_run`, or Compare. |
| `includeOutput` | `true` | Include bounded stdout and stderr. |
| `includeEvents` | `true` | Include bounded task events. |
| `maxOutputChars` | bounded default | Maximum stdout and stderr characters. |
| `maxEvents` | bounded default | Maximum task events. |

A task is terminal only after the child process exits and stdout/stderr have
drained or timed out visibly.

### `ennodia_cancel_task`

Cancels a running task by task ID.

### `ennodia_list_tasks`

Lists recent tasks started by the current MCP server process. By default it
returns a compact view; request output or events only when you need them.

## Compare

### `ennodia_start_compare`

Runs a judge pass and then a synthesizer pass over completed Ennodia tasks or
caller-supplied responses.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Original user task or question the candidates answer. |
| `taskIds` | `[]` | Completed Ennodia task IDs to compare. |
| `responses` | `[]` | Caller-supplied responses with IDs, labels, and text. |
| `judgeHarnessId` | Compare priority | Harness used for the judge pass. |
| `judgeModel` | judge default | Optional judge model override. |
| `synthesizerHarnessId` | judge harness | Harness used for final synthesis. |
| `synthesizerModel` | judge model | Optional synthesizer model override. |
| `maxOutputChars` | bounded default | Characters per candidate sent to Compare. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated judge/synthesizer input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if the judge plus synthesizer task count exceeds this value. |
| `budget.requireKnownSubscriptionLimits` | `false` | Fail if selected judge/synthesizer subscription limits are unknown. |

Compare asks the judge for agreements, contradictions, unique insights, blind
spots, and risks. The synthesizer uses that analysis plus the original
candidates to produce one answer. This is model-led comparison, not formal
voting.

### `ennodia_get_compare`

Returns Compare status, candidate inputs, judge analysis, synthesis, child task
IDs, timing, and ETA.

### `ennodia_cancel_compare`

Cancels a running Compare and its active child task.

### `ennodia_list_compares`

Lists recent Compare runs started by the current MCP server process.
