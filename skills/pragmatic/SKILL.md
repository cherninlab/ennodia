---
name: pragmatic
description: Use Ennodia MCP to organize independent model attempts, discover and compare skills, and verify results against whole-task acceptance and cost.
license: MIT
---
# Pragmatic orchestration

Use Ennodia MCP to finish the user's task with lower total cost per accepted result. This is experimental guidance, not a savings guarantee. One main agent can organize N independent attempts with tailored questions, useful model or skill differences, and evidence comparison. N=1 remains valid for a specialist or handoff. Do not treat repeated supervision and repair of one cheap worker as the default architecture.

## Organize the work

1. Establish the complete task, acceptance evidence, permitted actions, source paths, and an explained execution allowance with time for verification. A direct command is sufficient for a simple lookup. For difficult work, ask Ennodia to organize purposeful independent attempts rather than manually inventing every specialist question.
2. Discover `ennodia_list_harnesses` and `ennodia_list_skills` for the target cwd. Verify model IDs through supported harness configuration or CLI discovery. Read media `inputGuidance`; require a small native sample probe with file, range, tool and content-specific evidence. Caller tools may be absent in workers. Missing access, quota and deadlines require diagnosis, not a model-quality verdict.
3. Use `ennodia_start_plan_advice` with the full objective and discovered model allowlists. Request independent approaches, tailored questions and, when useful or requested, matched trials with a discovered skill and no requested skill. Let the Advisor choose assignments within the caller's limits. Inspect the validated plan, acceptance coverage and inventory. Launch a ready plan with `ennodia_start_advised_plan` and its exact digest. An invalid plan starts no workers: preserve it, inspect the validation issues, and correct the specific problem. Do not silently treat invalid advice as executable.
4. Use `ennodia_start_compositional` for caller-defined or revised slices with distinct models, prompts or skill lists. `skillIds: []` means no requested skills; it does not disable native skill discovery. Inspect `unrequestedSkillsPresent` and actual tool traces. A strict skill/no-skill experiment requires matching isolated environments and observed skill loading. Do not claim a skill effect when the trials also change model, prompt or fixtures.
5. Use `ennodia_run` when one prompt and its routing are sufficient. In version 0.3.0, `pragmatic: {recipe: "investigate" | "patch", acceptanceCriteria: "..."}` adds an evidence contract while preserving single, parallel and comparison choices. Compositional start and estimate accept the same contract.

## Work in chunks

A deadline is a maximum allowance, not a required session length. Break difficult tasks at useful boundaries: evidence and design, implementation, then integration and acceptance. Keep the full user objective visible while giving each chunk its own concrete deliverable and checks. Independent alternatives can run in parallel within a stage; use Judge at decisions where comparing evidence helps, not after every command.

At each completed chunk, preserve changed artifacts and return executed checks, remaining work, blockers, and a proposed next chunk. A completed chunk can leave the whole task unfinished. Do not call that a timeout. Continue through the remaining chunks without asking the user to manage each handoff. Reuse an owned native session when supported, or give a fresh worker its own concise checkpoint and artifact paths. Do not repeatedly reload the whole conversation.

Count all chunks, handoffs, comparison and verification against whole-task acceptance and cost. Chunk boundaries must not remove integration requirements or turn one strong model repeatedly repairing one weak worker into the default strategy.

## Execute and compare

Investigation returns cited findings; patch returns a complete unapplied diff. These recipes instruct workers to avoid file changes and side effects. For a full implementation use a normal run with authorized native permissions in a separate persistent candidate checkout. Codex supports explicit `nativeSandbox: "workspace-write"`; other harnesses retain their native permissions. Never bypass permission controls. Temporary `isolateCwd` copies are deleted on completion and cannot retain implementation artifacts.

Keep candidates independent until comparison. Give parallel implementers separate persistent directories; preserve source, diffs, logs, checks and partial results. Additional delegation is allowed within the authorized scope and allowance, and must be included in accounting. This skill may guide a delegated coordinator when orchestration is its assignment; it need not be added to every specialist.

Wait for terminal results. Use `ennodia_get_run` with `waitMs: 30000`, `compact: true`, and `includeEvents: false`. A wait timeout does not cancel the run. Inspect task outputs and truncation before trusting an answer; never apply an incomplete diff. Compositional status returns successful task IDs, not acceptance verdicts.

Send useful completed candidates to `ennodia_start_compare`. The Judge identifies agreement, contradictions and risks; the Result Advisor proposes a conclusion. Include acceptance results, failed attempts and access limits. A fluent comparison or process exit does not establish correctness. Verify decisive evidence locally. Retain original patch artifacts because comparison text can omit hunks. Require human review for perceptual acceptance.

## Continue from evidence

Inspect partial work before choosing a next step. Record exact access or quota errors, elapsed allowance and its rationale, findings, unresolved work and a justified continuation budget. Do not repeat unchanged failed commands. Native persistence is optional: Codex runs can use `persistSession` then `continueTaskId` only when `canContinue` is true. A persistent run owns one worker session; independent candidates use separate runs. Every continuation counts toward total work.

Measure all planning, workers, Judge, Result Advisor, coordination, retries, repairs and verification. Keep tokens, elapsed time, API-equivalent cost and subscription consumption separate. Missing usage is unknown, not zero. Preflight estimates exclude many native costs and are not spending caps. No automatic price routing or cross-run retry accounting is implemented. Recommend a strategy or skill only from quality-qualified whole-task comparisons, and test transfer to another domain before making general claims.
