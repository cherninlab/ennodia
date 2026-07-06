---
title: MCP Tools
description: The public MCP tool surface exposed by Ennodia.
---

This page describes the tools exposed by the Ennodia MCP server. The normal
entrypoint is `ennodia_run`: it starts a visible orchestration and returns a run
ID. Use `ennodia_get_run` to poll status, events, child task IDs, Compare state,
and the final answer.

## Common Workflows

| Goal | Tool sequence |
| --- | --- |
| Check local setup | `ennodia_list_harnesses` |
| Preview route and cost | `ennodia_estimate_budget` |
| Preview compositional shard cost | `ennodia_estimate_compositional_budget` |
| Start a visible end-to-end run | `ennodia_run` -> `ennodia_get_run` |
| Start focused review shards | `ennodia_start_compositional` -> `ennodia_get_compositional_status` |
| Debug raw child tasks | `ennodia_start` -> `ennodia_get_task` |
| Compare completed outputs | `ennodia_start_compare` -> `ennodia_get_compare` |
| Install bundled skills | `ennodia_list_skills` -> `ennodia_install_skills` |
| Inspect terminal receipts after restart | `ennodia_history` |

For harness IDs and setup notes, see
[Supported Harnesses](/docs/reference/supported-harnesses/). For budget request
examples, see [Budgets and Limits](/docs/guides/budgets-and-limits/).

## Shared behavior

`ennodia_plan`, `ennodia_estimate_budget`, `ennodia_start`, and `ennodia_run`
use local harness discovery plus either a caller-provided `category` or a
lightweight keyword fallback. Pass `category` when the agent caller already
knows the task type, and pass `refresh: true` to re-scan installed commands
before planning or starting work.

`ennodia_start` and `ennodia_run` also accept `skillIds`. Ennodia treats skills
as native Agent Skills: folders containing `SKILL.md`, installed in the paths
each harness already understands. It does not inline full skill content into the
delegated prompt. Task and run views include selected skill metadata in
`appliedSkills`.

`ennodia_estimate_budget`, `ennodia_estimate_compositional_budget`,
`ennodia_start`, `ennodia_run`, and `ennodia_start_compare` support a `budget`
object for local preflight enforcement. Budgeting is an input-token estimate plus
child-task count guard. It does not claim to know provider billing, output
tokens, cache behavior, harness-internal context, or private subscription
quota.

### Routing hints

Ennodia uses `category` before keyword classification. Valid categories are
`code`, `research`, `browser`, `image`, and `general`. The fallback classifier
uses strong browser, image, code, and research signals; bare words such as
`review` or `page` are not enough on their own. Pass `harnessId` to skip
adapter choice and target a specific adapter.

`harnessId` forces a specific adapter. Current adapter IDs are:

| ID | Tool |
| --- | --- |
| `claude-code` | <span class="agent-logo agent-logo--claude-code" aria-hidden="true"></span>Claude Code |
| `codex` | <span class="agent-logo agent-logo--codex" aria-hidden="true"></span>Codex CLI |
| `opencode` | <span class="agent-logo agent-logo--opencode" aria-hidden="true"></span>OpenCode |
| `kilo` | <span class="agent-logo agent-logo--kilo-code" aria-hidden="true"></span>Kilo Code |
| `kiro` | <span class="agent-logo agent-logo--kiro" aria-hidden="true"></span>Kiro CLI |
| `cline` | <span class="agent-logo agent-logo--cline" aria-hidden="true"></span>Cline CLI |
| `hermes-agent` | <span class="agent-logo agent-logo--hermes-agent" aria-hidden="true"></span>Hermes Agent |
| `antigravity` | <span class="agent-logo agent-logo--antigravity" aria-hidden="true"></span>Antigravity |

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
| `category` | fallback classifier | Optional caller-provided category: `code`, `research`, `browser`, `image`, or `general`. |
| `refresh` | `false` | Re-scan harness discovery before planning. |
| `includeMermaid` | `true` | Include a presentational Mermaid route diagram. Set `false` for compact machine reads. |

Returns the category, routing reasons, ordered candidate harness IDs, selected
harness, whether parallel execution is suggested, whether Compare is suggested,
and, by default, a Mermaid route diagram. Run and polling views do not embed
that diagram.

### `ennodia_estimate_budget`

Plans a run without starting child tasks, then estimates preflight input tokens
and checks optional limits.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Task text to classify, route, and estimate. |
| `category` | fallback classifier | Optional caller-provided category. |
| `harnessId` | planner choice | Force one adapter by ID. |
| `mode` | `auto` | `auto`, `single`, or `parallel`. |
| `compare` | `auto` | Include Compare in the estimate. |
| `refresh` | `false` | Re-scan harness discovery before planning. |
| `maxOutputChars` | effective 24000 | Characters per successful task assumed for Compare; values above the judge prompt cap are estimated at 24000. |
| `budget.maxEstimatedInputTokens` | none | Mark the estimate exceeded above this input-token count. |
| `budget.maxChildTasks` | none | Mark the estimate exceeded above this child-task count. |

The response includes the route plan, selected harness IDs, estimate
assumptions, subscription-limit check status, and exceeded issues.

### `ennodia_estimate_compositional_budget`

Resolves focused compositional slices to harnesses, then estimates preflight
input tokens and child task count without starting child processes.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Overall question or synthesis goal that every slice belongs to. |
| `slices[].id` | generated | Optional stable slice ID. Supplied IDs must be unique. |
| `slices[].title` | none | Optional short label for the slice. |
| `slices[].prompt` | required | Focused task prompt for the slice. |
| `slices[].category` | fallback classifier | Optional caller-provided route category for this slice. |
| `slices[].harnessId` | slice planner choice | Optional adapter ID for this slice. |
| `slices[].model` | adapter default | Optional model override retained in the resolved slice summary. |
| `cwd` | server process cwd | Optional working directory used to validate requested native skills. |
| `refresh` | `false` | Re-scan harness discovery before resolving slice routes. |
| `skillIds` | `[]` | Optional installed native skill IDs to validate against every selected slice harness. |
| `includeCompareEstimate` | `true` | Include a later Compare pass in the returned budget estimate. |
| `maxOutputChars` | effective 24000 | Characters per successful slice output assumed for Compare; values above the judge prompt cap are estimated at 24000. |
| `budget.maxEstimatedInputTokens` | none | Mark the estimate exceeded above this input-token count. |
| `budget.maxChildTasks` | none | Mark the estimate exceeded above this child-task count. |

The response includes resolved slice summaries, selected harness IDs, budget
assumptions, subscription-limit check status, and exceeded issues.

## End-to-end runs

### `ennodia_run`

Starts the full orchestration: plan, execute one or more child tasks, optionally
Compare successful outputs, and expose the final answer through `ennodia_get_run`.
Runs usually take minutes; callers should poll `ennodia_get_run` with sensible
spacing and trust `remainingMs`/`etaConfidence` instead of giving up after a few
seconds.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Task sent to the selected local AI tools. |
| `category` | fallback classifier | Optional caller-provided category. |
| `harnessId` | planner choice | Force one adapter by ID. |
| `mode` | `auto` | `auto`, `single`, or `parallel`. |
| `cwd` | server process cwd | Working directory for child commands. |
| `model` | adapter default | Optional model override passed to task harnesses. |
| `timeoutMs` | `300000` | Timeout for each child task, capped at 1 hour. |
| `compare` | `auto` | `auto`, `true`, or `false`. |
| `refresh` | `false` | Re-scan harness discovery before planning. |
| `judgeHarnessId` | Compare priority | Harness used for the judge pass. |
| `judgeModel` | judge default | Optional judge model override. |
| `synthesizerHarnessId` | judge harness | Harness used for final synthesis. |
| `synthesizerModel` | judge model | Optional synthesizer model override. |
| `maxOutputChars` | `80000` | Characters per successful task loaded for Compare before the 24000-character judge-prompt cap. |
| `skillIds` | `[]` | Optional list of installed native skill IDs to ask selected harnesses to use. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if selected child tasks exceed this value. |

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
| `maxEvents` | `100` | Maximum run events to return. Capped at 300. |
| `maxAnswerChars` | `80000` | Maximum final-answer characters. Capped at 200000. |

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
| `maxEvents` | `25` | Maximum events per run. Capped at 300. |
| `maxAnswerChars` | `2000` | Maximum answer characters per run. Capped at 200000. |

Live run history is bounded and in-memory. Restarting the MCP server clears
in-progress state; terminal receipts can still be read through
`ennodia_history` when history is enabled.

### `ennodia_history`

Lists terminal run snapshots persisted under the local history directory. Use it
after a restart to inspect previous final answers and Compare disagreement
analysis.

| Input | Default | Meaning |
| --- | --- | --- |
| `limit` | `20` | Maximum persisted run snapshots to return, newest first. Capped at 500. |

History is enabled by default for `createDefaultEnnodiaCore`, written under
`~/.ennodia/history/runs.jsonl`, and capped to the most recent 500 terminal
runs. Set `ENNODIA_HISTORY=0` to opt out.

## Direct tasks

### `ennodia_start`

Starts one or more raw child tasks without run-level Compare or final synthesis.
Use it for debugging adapters or for manual Compare workflows.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Task sent to the selected local AI tools. |
| `category` | fallback classifier | Optional caller-provided category. |
| `harnessId` | planner choice | Force one adapter by ID. |
| `mode` | `single` | `single` or `parallel`. |
| `cwd` | server process cwd | Working directory for child commands. |
| `model` | adapter default | Optional model override. |
| `timeoutMs` | `300000` | Timeout for each child task, capped at 1 hour. |
| `refresh` | `false` | Re-scan harness discovery before planning. |
| `skillIds` | `[]` | Optional list of installed native skill IDs to ask selected harnesses to use. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if selected child tasks exceed this value. |

Returns started task IDs, the route plan, and the budget estimate/check.

### `ennodia_start_compositional`

Starts one focused child task per slice. Use it for large reviews where each
agent should inspect a smaller part of the problem. The tool returns task IDs;
poll them with `ennodia_get_task`, then pass the useful completed task IDs to
`ennodia_start_compare`.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Overall question or synthesis goal that every slice belongs to. |
| `slices[].id` | generated | Optional stable slice ID. Supplied IDs must be unique. |
| `slices[].title` | none | Optional short label for the slice. |
| `slices[].prompt` | required | Focused task prompt for the slice. |
| `slices[].category` | fallback classifier | Optional caller-provided route category for this slice. |
| `slices[].harnessId` | slice planner choice | Optional adapter ID for this slice. |
| `slices[].model` | adapter default | Optional model override for this slice. |
| `cwd` | server process cwd | Working directory for child commands. |
| `timeoutMs` | `300000` | Timeout for each slice task, capped at 1 hour. |
| `refresh` | `false` | Re-scan harness discovery before resolving slice routes. |
| `skillIds` | `[]` | Optional installed native skill IDs to ask every selected slice harness to use. |
| `includeCompareEstimate` | `true` | Include a later Compare pass in the returned budget estimate. |
| `maxOutputChars` | effective 24000 | Characters per successful slice output assumed for Compare; values above the judge prompt cap are estimated at 24000. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if slice child tasks exceed this value. |

Returns slice task IDs, resolved harness IDs, the budget estimate/check, and a
ready-to-use `compareNext` object for the later `ennodia_start_compare` call.

### `ennodia_get_compositional_status`

Inspects several shard task IDs at once, groups their states, and returns the
successful non-empty task IDs that are ready for Compare.

| Input | Default | Meaning |
| --- | --- | --- |
| `taskIds` | required | Shard task IDs returned by `ennodia_start_compositional`. |
| `prompt` | none | Optional synthesis prompt included in `compareNext` when enough outputs are ready. |
| `minSuccessfulTasksForCompare` | `2` | Minimum successful non-empty outputs required for `compareReady`. |
| `includeOutput` | `false` | Include bounded stdout and stderr previews for known tasks. |
| `maxOutputChars` | `2000` | Maximum stdout and stderr characters per task when output is included. |

The response includes `readyTaskIds`, `runningTaskIds`, `failedTaskIds`,
`cancelledTaskIds`, `emptySucceededTaskIds`, `missingTaskIds`, grouped counts,
compact task summaries, and `compareNext` when a synthesis prompt was supplied
and enough task outputs are ready.

### `ennodia_get_task`

Returns task status, captured output, events, timing, and ETA.

| Input | Default | Meaning |
| --- | --- | --- |
| `taskId` | required | ID returned by `ennodia_start`, `ennodia_run`, or Compare. |
| `includeOutput` | `true` | Include bounded stdout and stderr. |
| `includeEvents` | `true` | Include bounded task events. |
| `maxOutputChars` | `200000` | Maximum stdout and stderr characters. Capped at 200000. |
| `maxEvents` | `300` | Maximum task events. Capped at 300. |

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
| `maxOutputChars` | `80000` | Characters per task candidate loaded for Compare before the 24000-character judge-prompt cap. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated judge/synthesizer input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if the judge plus synthesizer task count exceeds this value. |

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
