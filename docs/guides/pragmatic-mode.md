---
title: Pragmatic mode
description: Organize independent model attempts and compare evidence against complete acceptance criteria.
---

Pragmatic mode is an opt-in beta in `0.3.0`, available through `ennodia`.
It helps your main agent delegate bounded work without loading entire logs or files into the main conversation.
It does not guarantee lower costs or select the cheapest model automatically.

## Organize independent attempts

Use this prompt in your main agent:

```text
Use Ennodia MCP in Pragmatic mode to solve this task.
Organize independent model attempts and tailor questions where useful.
Discover relevant skills and compare a skill trial with a matched trial without requested skills.
Compare the evidence with Judge and Result Advisor, then verify the complete acceptance criteria.
Count planning, all attempts, retries, comparison and verification in the total cost.
```

Ennodia supports one main agent coordinating N independent workers.
N=1 remains useful for a specialist or handoff.
The main agent can delegate planning through Plan Advisor. It does not need to design every specialist question or locate every skill manually.

1. Discover harnesses, supported model IDs and native skills.
2. Start Plan Advisor with the full objective, model allowlists and explained limits.
3. Inspect the validated plan and launch it with its exact digest.
4. Inspect terminal task evidence and compare useful results with Judge and Result Advisor.
5. Verify the complete task locally and include all attempts in the measurement.

For caller-defined assignments, compositional tasks support a separate prompt, model and skill list per slice.
A slice with `skillIds: []` requests no skills but can still discover native skills.
A controlled skill trial requires matching environments and evidence of actual skill loading.

## Finish difficult work in chunks

Workers do not need to occupy a session for the full timeout.
Use bounded chunks for investigation, implementation and integrated verification.
Each chunk returns its artifacts, executed checks, remaining work and next step.
A completed chunk is distinct from an accepted complete task.

Independent workers can explore alternatives within a stage.
Compare evidence at useful decision points and continue with owned sessions or compact handoffs.
Count every chunk and handoff in the total cost.
A deadline is a maximum allowance, not a target duration.

## Evidence contracts in version 0.3.0

`ennodia_run`, `ennodia_estimate_budget`, `ennodia_start_compositional` and `ennodia_estimate_compositional_budget` accept:

```json
{
  "pragmatic": {
    "recipe": "investigate",
    "acceptanceCriteria": "Cite decisive source evidence and executed checks. Report unresolved requirements."
  }
}
```

The contract preserves routing and comparison choices. It does not force one worker.
Explicit models are optional. Omitted models use native harness defaults.

Use discovered model IDs for reproducible comparisons. Use compositional slices for different models on the same harness.
Version 0.3.0 preserves independent workers and comparison.

### Select reasoning effort

Source builds accept `reasoningEffort` on `ennodia_run` and `ennodia_start` for Codex workers. For example, select `model: "gpt-5.6-luna"` with `reasoningEffort: "max"`, or `model: "gpt-6-astra"` with `reasoningEffort: "low"`, when supported by your installed Codex and account. Ennodia forwards the setting to the native CLI. It does not infer the cheapest setting. Other adapters reject explicit effort settings. Omit the field to preserve native defaults.

This setting applies to workers, not the Judge or Result Advisor. Run and task records preserve the requested setting. That does not prove the provider used it or establish its price.

## Get findings or a patch

| Recipe | Worker instruction | Main agent responsibility |
| --- | --- | --- |
| `investigate` | Return cited findings, small excerpts, coverage limits, and unresolved questions | Verify decisive evidence |
| `patch` | Return a complete unified diff proposal without applying it | Review, apply, and test the patch |

Both recipes instruct workers to avoid file changes, side effects and repeated failed approaches.
Additional delegation stays within caller-authorized scope and allowance and must be counted.
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
Plan Advisor, independent workers, Judge and Result Advisor all contribute to total task cost.
Escalate unresolved work in a separate run after inspecting its evidence.
Compare total elapsed time, verified outcomes, and all reported usage across attempts before claiming savings.

## Install the main-agent skill

The bundled `pragmatic` skill guides delegation from your main conversation.
Install it through [Agent Skills](/docs/guides/agent-skills/) using `skillIds: ["pragmatic"]`.
A delegated coordinator can use this skill when its assignment includes orchestration.

In version 0.3.0, wait for the worker with `ennodia_get_run`, `waitMs: 30000`, and `includeEvents: false`. A nonterminal response means the worker is still running. Read its terminal answer and verify the acceptance criteria before reporting completion. The wait itself never cancels the run.

## Deadlines, permissions and continuation

Workers receive an execution deadline and their configured permissions. Inspect partial findings before continuing. Use a normal authorized run for file edits.

See [execution deadlines and session continuation](/docs/reference/mcp-tools/#execution-deadlines), [Troubleshooting](/docs/guides/troubleshooting/) and [Budgets and Limits](/docs/guides/budgets-and-limits/) for details.
