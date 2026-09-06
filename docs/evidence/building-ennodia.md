---
title: Building Ennodia with Ennodia
description: A real development case with a failed launch, a useful worker patch, and primary-agent review.
---

# Building Ennodia with Ennodia

Development record: September 6, 2026. These changes belong to the next release candidate.

A local server could accept browser requests that started agent work without an intended origin check.
The primary agent had a reproduced defect and a focused implementation task.
It stayed in Codex and used Ennodia to dispatch the work.

## What happened

| Attempt | Observed result | Next action |
| --- | --- | --- |
| Claude Code with Sonnet | Authentication failed before the task ran. | Use another configured agent. |
| OpenCode with its configured model | Reproduced the problem, edited four files, and added seven regression tests. | Review the patch in the primary conversation. |
| Primary agent | Tightened malformed Host and Origin validation and preserved the native request size limit. | Run the combined verification suite. |

The worker tested both the request handler and a real listening server.
It also found that Bun can return an empty oversized-request error before the handler runs.
Its proposed size-limit adjustment could not guarantee a structured response for every oversized request.
The primary agent kept the hard limit and documented the actual behavior.

The combined suite passed after integration.
This demonstrates a useful contribution that still needed review and adaptation.
It does not establish how long the primary agent alone would have taken.

## What did not help

A separate Compare review used a smaller GPT model with the rigorous-review skill.
It reached the ten-minute task limit without returning a usable proposal.
The primary agent completed those fixes locally.
The record includes that failed attempt, rather than treating every delegation as a success.

The Claude failure indicates an expired login, not model quality.
The GPT attempt does not establish that the model or skill is generally unsuitable.
Its observed result applies to this task, configuration, and time limit.

A later broad documentation assignment through OpenCode also reached its ten-minute limit without producing edits.
The primary agent completed those pages directly.
This suggests testing smaller assignments and clearer execution controls. It does not establish a general provider limitation.

## Inspect and reproduce

The implementation and regressions are in the open repository:

- [HTTP implementation](https://github.com/cherninlab/ennodia/blob/main/packages/ennodia-io/src/io.ts)
- [HTTP regressions](https://github.com/cherninlab/ennodia/blob/main/packages/ennodia-io/src/io.test.ts)

Use the release candidate checkout that contains this page.

```sh
bun install
bun test packages/ennodia-io/src/io.test.ts
bun run verify
```

The tests use local fixtures. They do not call model providers.
A live repeat requires an authenticated supported agent.
Save the worker output and the primary agent’s final diff when repeating the experiment.

The practical benefit here was a reviewed contribution from another tool without moving the primary conversation.
No token-saving or speed comparison was measured.
