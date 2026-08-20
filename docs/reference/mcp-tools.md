---
title: Model Context Protocol (MCP) Tools
description: The public Model Context Protocol (MCP) tool surface exposed by Ennodia.
---

This page describes the tools exposed by the Ennodia Model Context Protocol
(MCP) server. The normal entrypoint is `ennodia_run`. It starts a visible
orchestration and returns a run ID. Use `ennodia_get_run` to poll status,
events, child task IDs, Judge + Result Advisor state, and the final answer.

## Common Workflows

| Goal | Tool sequence |
| --- | --- |
| Check local setup | `ennodia_list_harnesses` |
| Preview route and cost | `ennodia_estimate_budget` |
| Preview compositional shard cost | `ennodia_estimate_compositional_budget` |
| Request a tailored team, inspect it, then launch it | `ennodia_start_plan_advice` -> `ennodia_get_plan_advice` -> `ennodia_start_advised_plan` |
| Start a visible end-to-end run | `ennodia_run` -> `ennodia_get_run` |
| Start focused review shards | `ennodia_start_compositional` -> `ennodia_get_compositional_status` |
| Debug raw child tasks | `ennodia_start` -> `ennodia_get_task` |
| Judge completed outputs and advise on the result | `ennodia_start_compare` -> `ennodia_get_compare` |
| Install bundled skills | `ennodia_list_skills` -> `ennodia_install_skills` |
| Inspect terminal receipts after restart | `ennodia_history` |

For harness IDs and setup notes, see
[Supported Harnesses](/docs/reference/supported-harnesses/). For budget request
examples, see [Budgets and Limits](/docs/guides/budgets-and-limits/).

## Shared behavior

`ennodia_plan`, `ennodia_estimate_budget`, `ennodia_start`, and `ennodia_run`
use local harness discovery plus either a caller-provided `category` or a
lightweight keyword fallback. Pass `category` when the agent caller knows
the task type. Pass `refresh: true` to re-scan installed commands before
planning or starting work.

`ennodia_start` and `ennodia_run` also accept `skillIds`. Ennodia treats skills
as native Agent Skills: folders containing `SKILL.md`, installed in paths
supported by each harness. It does not inline full skill content into the
delegated prompt. Task and run views include selected skill metadata in
`appliedSkills`.

`ennodia_estimate_budget`, `ennodia_estimate_compositional_budget`,
`ennodia_start`, `ennodia_run`, `ennodia_start_compare`,
`ennodia_start_plan_advice`, and `ennodia_start_advised_plan` support a `budget`
object for local preflight enforcement. Budgeting is an input-token estimate
plus child-task count guard. It does not claim to know provider billing, output
tokens, cache behavior, harness-internal context, or private subscription quota.

### Routing hints

Ennodia uses `category` before keyword classification. Valid categories are
`code`, `research`, `browser`, `image`, and `general`. The fallback classifier
uses strong browser, image, code, and research signals. Bare words such as
`review` or `page` do not route on their own. Pass `harnessId` to skip
adapter choice and target a specific adapter.

`harnessId` forces a specific adapter. Current adapter IDs are:

Each adapter starts a supported command-line interface (CLI).

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

Detects supported local artificial intelligence (AI) tools and reports
availability, runnable state, command path, version, capabilities, and adapter
notes.

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
harness, parallel execution guidance, Judge + Result Advisor guidance, and, by
default, a Mermaid route diagram. Run and
polling views do not embed that diagram.

## Plan Advisor

Plan Advisor turns a natural-language task into a suggested team without making
that suggestion executable by itself. Plan Advisor sees a frozen inventory of
allowed harnesses, caller-approved models, installed skills, and hard size
limits. It can propose only explicit worker slices containing a prompt, harness,
optional model, and skill IDs. It cannot choose `cwd`, environment variables,
arguments, permissions, isolation, timeouts, retries, or budgets.

The lifecycle is deliberately two-phase: request and inspect advice first, then
launch the exact validated plan in a separate call. Ennodia rejects invalid
Plan Advisor output as a whole and revalidates the plan digest and current inventory
before starting any worker.

### `ennodia_start_plan_advice`

Starts one Plan Advisor task. It starts no proposed worker task and returns an
advice `id` for polling with `ennodia_get_plan_advice`.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Work for which Plan Advisor proposes a team. |
| `cwd` | server process cwd | Target directory used only to inventory project skills. The Plan Advisor task runs in a separate empty temporary directory. |
| `refresh` | `false` | Re-scan harnesses before freezing the inventory snapshot. |
| `advisorHarnessId` | harness priority | Harness used for the single Plan Advisor task. |
| `advisorModel` | Plan Advisor harness default | Optional model override for the Plan Advisor task. |
| `allowedHarnessIds` | all runnable public adapters | Worker harness IDs the proposal may select. |
| `allowedModels` | `{}` | Exact caller-approved worker model IDs grouped by harness. An omitted worker model means the harness default. |
| `maxSlices` | `8` | Maximum explicit worker slices. Capped at 64 and by `budget.maxChildTasks` when supplied. |
| `maxSkillsPerSlice` | `8` | Maximum native skills on one slice. Capped at 64. |
| `maxTotalSkillAssignments` | `32` | Maximum skill assignments across the plan. Capped at 1024. |
| `timeoutMs` | `300000` | Timeout for the one Plan Advisor task, capped at 1 hour. |
| `budget.maxEstimatedInputTokens` | none | Fail before Plan Advisor starts, or reject its proposal, if the estimate exceeds this value. |
| `budget.maxChildTasks` | none | Bound both the Plan Advisor start and proposed worker count. |

The returned view begins in `advising`. Terminal states are `ready`, `consumed`,
`invalid`, `failed`, and `cancelled`. Only `ready` advice can be authorized.
Authorization changes the status to `consumed`. A consumed plan cannot run
again. A ready view has a validated `plan` and `planDigest`.

### `ennodia_get_plan_advice`

Returns Plan Advisor status, validation issues, inventory snapshot ID, proposal,
validated inert plan, and plan digest. It also returns budget checks, events,
timing, and estimated time of arrival (ETA). A consumed view also returns
`consumedAt`.

| Input | Default | Meaning |
| --- | --- | --- |
| `adviceId` | required | ID returned by `ennodia_start_plan_advice`. |
| `includeProposal` | `true` | Include the untrusted model-authored proposal when available. |
| `includePlan` | `true` | Include the validated inert plan when ready. |
| `includeEvents` | `true` | Include bounded lifecycle events. |
| `maxEvents` | `100` | Maximum events to return. Capped at 300. Use 0 to omit them. |

### `ennodia_start_advised_plan`

Explicitly launches the exact plan from a `ready` advice result. Before the first
worker starts, Ennodia checks the supplied digest and refreshes the inventory.
It validates every harness and skill again. It confirms that explicit models
remain in the unchanged caller allowlist and enforces the caller-owned runtime budget.

Provider model availability remains unverified until its harness runs. Digest
mismatch, inventory drift, or deterministic validation failure starts zero
workers. Successful authorization consumes the advice before task launch. The
same advice cannot authorize a second launch.

| Input | Default | Meaning |
| --- | --- | --- |
| `adviceId` | required | Ready advice ID returned by `ennodia_start_plan_advice`. |
| `expectedPlanDigest` | required | Exact `planDigest` returned by `ennodia_get_plan_advice`. |
| `cwd` | inventoried directory | Working directory for worker tasks. |
| `isolateCwd` | `false` | Run each worker against an ephemeral isolated copy of `cwd`. Isolation fails before task spawn if the copied tree contains a symbolic link. The reported task `cwd` is an execution trace. Ennodia deletes the temporary copy after the task becomes terminal. |
| `timeoutMs` | `300000` | Per-worker timeout, capped at 1 hour. |
| `budget.maxEstimatedInputTokens` | none | Fail before any worker starts if the exact plan estimate exceeds this value. |
| `budget.maxChildTasks` | none | Fail before any worker starts if the exact slice count exceeds this value. |

The response reports the frozen plan and digest, task IDs mapped to slice IDs,
execution controls, and the budget check. It also reports unrequested installed
skills observed on the selected harnesses. This operation does not automatically run the Judge
and Result Advisor comparison.

### `ennodia_cancel_plan_advice`

Cancels an `advising` request and its single Plan Advisor task. Pass `adviceId` from
`ennodia_start_plan_advice`. Calling it for a terminal request returns
the existing terminal view.

| Input | Default | Meaning |
| --- | --- | --- |
| `adviceId` | required | ID returned by `ennodia_start_plan_advice`. |

### `ennodia_list_plan_advice`

Lists recent Plan Advisor requests from the current MCP server process.

| Input | Default | Meaning |
| --- | --- | --- |
| `includeProposal` | `false` | Include model-authored proposals. |
| `includePlan` | `false` | Include validated inert plans. |
| `includeEvents` | `false` | Include bounded event history. |
| `maxEvents` | `25` | Maximum events per item when included. Capped at 300. |

### `ennodia_estimate_budget`

Plans a run without starting child tasks, then estimates preflight input tokens
and checks optional limits.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Task text to classify, route, and estimate. |
| `category` | fallback classifier | Optional caller-provided category. |
| `harnessId` | planner choice | Force one adapter by ID. |
| `mode` | `auto` | `auto`, `single`, or `parallel`. |
| `compare` | `auto` | Include the Judge + Result Advisor pass in the estimate. |
| `refresh` | `false` | Re-scan harness discovery before planning. |
| `maxOutputChars` | effective 24000 | Characters assumed for each successful task in Compare. Ennodia estimates values above the Judge prompt cap at 24000. |
| `budget.maxEstimatedInputTokens` | none | Mark the estimate exceeded above this input-token count. |
| `budget.maxChildTasks` | none | Mark the estimate exceeded above this child-task count. |

The response includes the route plan, selected harness IDs, estimate
assumptions, subscription-limit check status, and exceeded issues.

### `ennodia_estimate_compositional_budget`

Resolves focused compositional slices to harnesses, then estimates preflight
input tokens and child task count without starting child processes.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Overall task or question that every slice belongs to. |
| `slices[].id` | generated | Optional stable slice ID. Supplied IDs must be unique. |
| `slices[].title` | none | Optional short label for the slice. |
| `slices[].prompt` | required | Focused task prompt for the slice. |
| `slices[].category` | fallback classifier | Optional caller-provided route category for this slice. |
| `slices[].harnessId` | slice planner choice | Optional adapter ID for this slice. |
| `slices[].model` | adapter default | Optional model override retained in the resolved slice summary. |
| `slices[].skillIds` | inherited | Slice-specific native skill IDs. An explicit list, including `[]`, replaces batch `skillIds`. |
| `cwd` | server process cwd | Optional working directory used to validate requested native skills. |
| `refresh` | `false` | Re-scan harness discovery before resolving slice routes. |
| `skillIds` | `[]` | Default installed native skill IDs for slices that omit `slices[].skillIds`. |
| `includeCompareEstimate` | `true` | Include a later Judge + Result Advisor pass in the returned budget estimate. |
| `maxOutputChars` | effective 24000 | Characters assumed for each successful slice in Compare. Ennodia estimates values above the Judge prompt cap at 24000. |
| `budget.maxEstimatedInputTokens` | none | Mark the estimate exceeded above this input-token count. |
| `budget.maxChildTasks` | none | Mark the estimate exceeded above this child-task count. |

The response includes resolved slice summaries, selected harness IDs, budget
assumptions, subscription-limit check status, and exceeded issues.

## End-to-end runs

### `ennodia_run`

Starts the full orchestration. It plans and executes one or more child tasks.
It can run the Judge + Result Advisor over successful outputs. It exposes the
final answer through `ennodia_get_run`.

Runs usually take minutes. Poll `ennodia_get_run` at sensible intervals. Trust
`remainingMs` and `etaConfidence`. Do not give up after a few seconds.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Task sent to the selected local AI tools. |
| `category` | fallback classifier | Optional caller-provided category. |
| `harnessId` | planner choice | Force one adapter by ID. |
| `mode` | `auto` | `auto`, `single`, or `parallel`. |
| `cwd` | server process cwd | Working directory for child commands. |
| `isolateCwd` | `false` | Run each selected harness against an ephemeral isolated copy of `cwd`. Isolation fails before task spawn if the copied tree contains a symbolic link. The reported task `cwd` is an execution trace. Ennodia deletes the temporary copy after the task becomes terminal. |
| `model` | adapter default | Optional model override passed to task harnesses. |
| `timeoutMs` | `300000` | Timeout for each child task, capped at 1 hour. |
| `compare` | `auto` | `auto`, `true`, or `false`. |
| `refresh` | `false` | Re-scan harness discovery before planning. |
| `judgeHarnessId` | Compare priority | Harness used for the Judge pass. |
| `judgeModel` | Judge default | Optional Judge model override. |
| `advisorHarnessId` | Judge harness | Harness used for the Result Advisor pass. |
| `advisorModel` | Result Advisor harness default | Optional Result Advisor model override. |
| `synthesizerHarnessId` | deprecated | Compatibility alias for `advisorHarnessId`. Ennodia rejects conflicting values. |
| `synthesizerModel` | deprecated | Compatibility alias for `advisorModel`. Ennodia rejects conflicting values. |
| `maxOutputChars` | `80000` | Characters per successful task loaded for Compare before the 24000-character Judge prompt cap. |
| `skillIds` | `[]` | Optional installed native skill IDs for selected harnesses. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if selected child tasks exceed this value. |

Returns a run view with `id`, status, selected harnesses, child task IDs,
comparison ID when one exists, events, timing, ETA, and budget estimate/check.
It also returns the final answer when available. The important value is `id`.
Poll it with
`ennodia_get_run`.

### `ennodia_get_run`

Returns the current run state.

| Input | Default | Meaning |
| --- | --- | --- |
| `runId` | required | ID returned by `ennodia_run`. |
| `includeEvents` | `true` | Include run event history. |
| `maxEvents` | `100` | Maximum run events to return. Capped at 300. |
| `maxAnswerChars` | `80000` | Maximum final-answer characters. Capped at 200000. |

Terminal run states are `succeeded`, `failed`, and `cancelled`. A run is not
complete before it reaches one of those states.

### `ennodia_cancel_run`

Cancels a high-level run and any active child task, Judge, or Result Advisor.

| Input | Default | Meaning |
| --- | --- | --- |
| `runId` | required | ID returned by `ennodia_run`. |

Cancellation is explicit. Do not present a run with `cancelled` status as a
normal model failure.

### `ennodia_list_runs`

Lists runs started by the current MCP server process.

| Input | Default | Meaning |
| --- | --- | --- |
| `includeEvents` | `false` | Include bounded event history. |
| `maxEvents` | `25` | Maximum events per run. Capped at 300. |
| `maxAnswerChars` | `2000` | Maximum answer characters per run. Capped at 200000. |

Live run history is bounded and in-memory. Restarting the MCP server clears
in-progress state. Terminal receipts remain available through
`ennodia_history` when history is enabled.

### `ennodia_history`

Lists terminal run snapshots persisted under the local history directory. Use it
after a restart to inspect previous final answers and Judge disagreement
analysis.

| Input | Default | Meaning |
| --- | --- | --- |
| `limit` | `20` | Maximum persisted run snapshots to return, newest first. Capped at 500. |

History is enabled by default for `createDefaultEnnodiaCore`, written under
`~/.ennodia/history/runs.jsonl`, and capped to the most recent 500 terminal
runs. Set `ENNODIA_HISTORY=0` to opt out.

## Direct tasks

### `ennodia_start`

Starts one or more raw child tasks without a run-level Judge + Result Advisor
pass. Use it for debugging adapters or manual comparison workflows.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Task sent to the selected local AI tools. |
| `category` | fallback classifier | Optional caller-provided category. |
| `harnessId` | planner choice | Force one adapter by ID. |
| `mode` | `single` | `single` or `parallel`. |
| `cwd` | server process cwd | Working directory for child commands. |
| `isolateCwd` | `false` | Run each task against an ephemeral isolated copy of `cwd`. Isolation fails before task spawn if the copied tree contains a symbolic link. The reported task `cwd` is an execution trace. Ennodia deletes the temporary copy after the task becomes terminal. |
| `model` | adapter default | Optional model override. |
| `timeoutMs` | `300000` | Timeout for each child task, capped at 1 hour. |
| `refresh` | `false` | Re-scan harness discovery before planning. |
| `skillIds` | `[]` | Optional installed native skill IDs for selected harnesses. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if selected child tasks exceed this value. |

Returns started task IDs, the route plan, and the budget estimate/check.

### `ennodia_start_compositional`

Starts one focused child task per slice. Use it for large reviews where each
agent can inspect a smaller part of the problem. The tool returns task IDs.
poll them with `ennodia_get_task`, then pass the useful completed task IDs to
`ennodia_start_compare`.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Overall task or question that every slice belongs to. |
| `slices[].id` | generated | Optional stable slice ID. Supplied IDs must be unique. |
| `slices[].title` | none | Optional short label for the slice. |
| `slices[].prompt` | required | Focused task prompt for the slice. |
| `slices[].category` | fallback classifier | Optional caller-provided route category for this slice. |
| `slices[].harnessId` | slice planner choice | Optional adapter ID for this slice. |
| `slices[].model` | adapter default | Optional model override for this slice. |
| `slices[].skillIds` | inherited | Slice-specific native skill IDs. An explicit list, including `[]`, replaces batch `skillIds`. |
| `cwd` | server process cwd | Working directory for child commands. |
| `isolateCwd` | `false` | Run each slice against an ephemeral isolated copy of `cwd`. Isolation fails before task spawn if the copied tree contains a symbolic link. The reported task `cwd` is an execution trace. Ennodia deletes the temporary copy after the task becomes terminal. |
| `timeoutMs` | `300000` | Timeout for each slice task, capped at 1 hour. |
| `refresh` | `false` | Re-scan harness discovery before resolving slice routes. |
| `skillIds` | `[]` | Default installed native skill IDs for slices that omit `slices[].skillIds`. |
| `includeCompareEstimate` | `true` | Include a later Judge + Result Advisor pass in the returned budget estimate. |
| `maxOutputChars` | effective 24000 | Characters assumed for each successful slice in Compare. Ennodia estimates values above the Judge prompt cap at 24000. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if slice child tasks exceed this value. |

Returns slice task IDs, resolved harness IDs, the budget estimate/check, and a
ready-to-use `compareNext` object for the later `ennodia_start_compare` call.

### `ennodia_get_compositional_status`

Inspects multiple shard task IDs at once, groups their states, and returns the
successful non-empty task IDs ready for a Judge + Result Advisor comparison.

| Input | Default | Meaning |
| --- | --- | --- |
| `taskIds` | required | Shard task IDs returned by `ennodia_start_compositional`. |
| `prompt` | none | Optional comparison prompt included in `compareNext` when the minimum outputs are ready. |
| `minSuccessfulTasksForCompare` | `2` | Minimum successful non-empty outputs required for `compareReady`. |
| `includeOutput` | `false` | Include bounded stdout and stderr previews for known tasks. |
| `maxOutputChars` | `2000` | Maximum stdout and stderr characters per task when output is included. |

The response includes `readyTaskIds`, `runningTaskIds`, `failedTaskIds`,
`cancelledTaskIds`, `emptySucceededTaskIds`, and `missingTaskIds`. It includes
grouped counts, compact task summaries, and `compareNext` when a comparison
prompt was supplied and the minimum task outputs are ready.

### `ennodia_get_task`

Returns task status, captured output, events, timing, and ETA.

| Input | Default | Meaning |
| --- | --- | --- |
| `taskId` | required | ID returned by a raw, compositional, advised-plan, run, Plan Advisor, or Compare start. |
| `includeOutput` | `true` | Include bounded stdout and stderr. |
| `includeEvents` | `true` | Include bounded task events. |
| `maxOutputChars` | `20000` | Maximum stdout and stderr characters. Capped at 200000. |
| `maxEvents` | `100` | Maximum task events. Capped at 300. |

A task is terminal only after the child process exits and stdout/stderr have
drained or timed out visibly.

### `ennodia_cancel_task`

Cancels a running task by task ID.

| Input | Default | Meaning |
| --- | --- | --- |
| `taskId` | required | ID returned by a task start. |

### `ennodia_list_tasks`

Lists recent tasks started by the current MCP server process. By default it
returns a compact view. Request output or events only when you need them.

| Input | Default | Meaning |
| --- | --- | --- |
| `includeOutput` | `false` | Include bounded stdout and stderr previews for each task. |
| `includeEvents` | `false` | Include bounded task events for each task. |
| `maxOutputChars` | `4000` | Maximum stdout and stderr characters per task. Capped at 200000. |
| `maxEvents` | `25` | Maximum events per task. Capped at 300. |

## Judge + Result Advisor

The existing `ennodia_*_compare` tool names remain for compatibility. Their
public workflow is Judge + Result Advisor: the Judge analyzes the candidates,
then Result Advisor produces the final recommendation. Result Advisor can degrade
visibly to candidate-only advice when Judge analysis is unavailable.

### `ennodia_start_compare`

Runs a Judge pass and then a Result Advisor pass over completed Ennodia tasks or
caller-supplied responses.

| Input | Default | Meaning |
| --- | --- | --- |
| `prompt` | required | Original user task or question the candidates answer. |
| `taskIds` | `[]` | Completed Ennodia task IDs to compare. |
| `responses` | `[]` | Caller-supplied responses with IDs, labels, and text. |
| `judgeHarnessId` | Compare priority | Harness used for the Judge pass. |
| `judgeModel` | Judge default | Optional Judge model override. |
| `advisorHarnessId` | Judge harness | Harness used for the Result Advisor pass. |
| `advisorModel` | Result Advisor harness default | Optional Result Advisor model override. |
| `synthesizerHarnessId` | deprecated | Compatibility alias for `advisorHarnessId`. Ennodia rejects conflicting values. |
| `synthesizerModel` | deprecated | Compatibility alias for `advisorModel`. Ennodia rejects conflicting values. |
| `cwd` | server process cwd | Working directory for the Judge and Result Advisor tasks. |
| `timeoutMs` | `300000` | Timeout for each child task. Capped at 1 hour. |
| `maxOutputChars` | `80000` | Characters per task candidate loaded for Compare before the 24000-character Judge prompt cap. |
| `budget.maxEstimatedInputTokens` | none | Fail before starting if estimated Judge/Result Advisor input tokens exceed this value. |
| `budget.maxChildTasks` | none | Fail before starting if the Judge plus Result Advisor task count exceeds this value. |

Compare requests that the Judge map agreements, contradictions, unique insights,
blind spots, and risks. The Result Advisor uses that analysis plus the original
candidates to return a typed answer, basis, confidence, and open questions.
This is model-led comparison, not formal voting.

### `ennodia_get_compare`

Returns comparison status, candidate inputs, Judge analysis, and typed Result
Advisor output, child task IDs, degradation events, timing, and ETA. Deprecated
`synthesis` fields remain available for compatibility.

| Input | Default | Meaning |
| --- | --- | --- |
| `compareId` | required | ID returned by `ennodia_start_compare` or `ennodia_run`. |
| `includeCandidates` | `true` | Include bounded candidate response previews. |
| `includeEvents` | `true` | Include bounded Judge and Result Advisor events. |
| `maxCandidateChars` | `8000` | Maximum characters per candidate. Capped at 200000. |
| `maxEvents` | `100` | Maximum comparison events. Capped at 300. |

### `ennodia_cancel_compare`

Cancels a running Judge + Result Advisor comparison and its active child task.

| Input | Default | Meaning |
| --- | --- | --- |
| `compareId` | required | ID returned by `ennodia_start_compare` or `ennodia_run`. |

### `ennodia_list_compares`

Lists recent Judge + Result Advisor comparisons started by the current MCP
server process.

| Input | Default | Meaning |
| --- | --- | --- |
| `includeCandidates` | `false` | Include bounded candidate response previews for each comparison. |
| `includeEvents` | `false` | Include bounded Judge and Result Advisor events. |
| `maxCandidateChars` | `2000` | Maximum characters per candidate. Capped at 200000. |
| `maxEvents` | `25` | Maximum events per comparison. Capped at 300. |
