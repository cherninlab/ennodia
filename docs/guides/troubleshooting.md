---
title: Troubleshooting
description: Resolve failed starts without confusing configuration errors with model quality.
---

# When an attempt cannot finish

Start with the task’s failure reason and captured output.
Use `ennodia_get_task` for details and `ennodia_list_harnesses` to inspect supported commands.

## The agent is listed, but cannot run the task

Discovery establishes command availability. It does not establish login state, available models, or remaining provider quota.
Run a small task to check the selected configuration.

For an expired login, sign in through the affected agent’s supported command-line interface (CLI).
For an unavailable model, check that agent’s model list and configured provider.
Do not interpret either failure as evidence that the model could not solve the task.

## The worker cannot read or edit

Codex workers use a read-only sandbox by default.
Other agents retain their native permission rules.
Non-interactive agents can deny operations that require an interactive permission prompt.

Use accessible source material and the agent’s normal permission configuration.
Request a proposed patch when direct editing is unavailable.
Do not disable permission checks to make an example appear successful.

## Isolation rejects a symbolic link

`isolateCwd: true` copies a working directory and rejects symbolic links before launch.
Use a small self-contained fixture or an explicit separate checkout when the project contains such links.
Ennodia deletes its temporary copied directory after the task ends.
Use a persistent separate checkout for implementation work that you need to integrate.

## A task reaches its timeout

Inspect the partial output first. It can contain useful findings or only setup activity.
Narrow the next request or change its execution configuration when appropriate.
More time is useful only when the progress supports that choice.
Cancel unwanted tasks explicitly with `ennodia_cancel_task` or `ennodia_cancel_run`.

## A skill was requested but did not load

Check `ennodia_list_skills` for the selected agent’s native installation.
Then inspect the worker’s tool access and output.
The `appliedSkills` field records the request. It does not independently verify every action inside the worker.
