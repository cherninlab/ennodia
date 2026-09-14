---
title: Recipes
description: Three small ways to get useful help from Ennodia.
---

# Start with one useful attempt

A focused request is easier to check and integrate.
Give your primary agent the relevant files, attempted fixes, and the result you need.

## A task is stuck

```text
Use Ennodia MCP to get a second opinion on this bug.
Give one available agent the failing test and our attempted fixes.
Request a different explanation and a concrete check for it.
Keep the review read-only and return the findings here.
```

A useful result names a different hypothesis and a way to test it.
Repeating the same suggestion is a result to record, not a reason to restart the whole conversation.

## A skill might help

```text
Use Ennodia MCP to try an installed review skill on this change in a separate task.
Keep the review read-only. Bring back useful findings and unsupported suggestions.
Show which skill and model were requested and what remains unverified.
```

Check native installation with your agent before the task starts.
A requested skill is not proof that the worker loaded it.
Use the [small skill trial](/docs/evidence/skill-trial/) to practice comparing two attempts.

## Two answers disagree

```text
Use Ennodia MCP to compare these two answers.
Identify the assumption behind each disagreement and the evidence for each side.
Recommend the smallest check that can settle it.
Keep useful partial findings even if neither answer solves the whole task.
```

Compare adds a Judge pass and a Result Advisor pass.
Use it when those additional checks are useful for your next decision.
Your primary agent can directly inspect one short worker answer without Compare.

## Agent implementation notes

`ennodia_run` starts a tracked run. For one explicit attempt, use `mode: "single"`, a discovered `harnessId`, and `compare: false`.
Use `ennodia_get_run` to inspect the result.
The [tool reference](/docs/reference/mcp-tools/) contains exact parameters.

For independent work on the same files, use separate checkouts or `isolateCwd: true`.
Ennodia refuses symbolic links in copied directories. It deletes each temporary copy when the task ends.
Save required changes before relying on a temporary directory as an output artifact.
