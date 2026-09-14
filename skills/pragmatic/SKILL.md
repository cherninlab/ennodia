---
name: pragmatic
description: Use Ennodia MCP to delegate bounded investigation or patch proposals to an explicitly selected lower-cost model while keeping bulky evidence outside the main conversation.
license: MIT
---
# Pragmatic delegation

This skill guides the main agent. Do not pass it to workers through skillIds.

Use direct search or a command when that solves the task. Delegate when interpretation of bulky material or a bounded patch benefits from a separate worker.

1. Discover harnesses with ennodia_list_harnesses. Read inputGuidance for media. Select a supported model from the user's available harness configuration. Do not guess model identifiers, prices, or subscription limits.
2. Define one bounded assignment, absolute source paths, and verifiable acceptance criteria. Give paths and targeted context, not entire logs. Confirm that the worker can access the sources.
3. Call ennodia_run with harnessId, model, cwd, prompt, and pragmatic: {recipe: "investigate" | "patch", acceptanceCriteria: "..."}. Add timeoutMs and budget limits when appropriate. The mode enforces single-worker orchestration with no automatic comparison. It does not enforce file permissions.
4. Poll ennodia_get_run at sensible intervals. Check finalAnswerChars before relying on a bounded answer. Retrieve a larger answer or relevant task output when evidence is missing.
5. Verify decisive citations and acceptance criteria. Patch workers return unified diffs. Review the diff, apply it through the main agent's authorized tools, and run appropriate checks. Do not ask the worker to write files in these recipes. Patch runs fail on truncated child answers. Submit a smaller assignment rather than applying partial output.
6. On partial or blocked work, preserve useful evidence. Try a stronger model or comparison in a separate run only when the unresolved issue warrants it. Avoid repeating the same failed approach.

Keep the main conversation focused on the result and relevant evidence. Run events, task IDs, and persisted bounded records expose the process for inspection.

Measure the whole task, including failed attempts and main-agent verification. Run metadata records the requested model and elapsed time. Inspect child tasks for usage when reported by their adapter. Missing usage is unknown, not zero. Token estimates exclude many harness-internal costs and do not prove savings. There is no automatic price routing, automatic retry, or cross-run retry counter.

Native harness permissions remain authoritative. Neither recipe grants writes or creates a security sandbox. If editing in a separate checkout is needed, use an explicitly authorized normal run and native permissions. Ephemeral isolateCwd copies are deleted at completion, so do not rely on them to retain edits.
