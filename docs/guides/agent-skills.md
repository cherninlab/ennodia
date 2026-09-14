---
title: Agent Skills
description: Install bundled Ennodia skills in native harness locations and tell child agents to use them during a run.
---

A new Agent Skill can help a task, add irrelevant advice, or make no difference.
Try the skill in a separate Ennodia task and bring useful findings back to your main conversation.

A skill is a folder containing `SKILL.md` in a native agent location.
Ennodia discovers that folder and requests the selected skill by name.
It does not inline the full instructions into each delegated prompt.

The primary agent can keep useful partial findings without adopting every recommendation.
The [skill trial example](/docs/evidence/skill-trial/) shows a controlled small exercise.

## List Available Skills

```json
{
  "tool": "ennodia_list_skills",
  "arguments": {
    "cwd": "/absolute/path/to/project"
  }
}
```

The response includes bundled skills, installed native skills, searched
directories, and load warnings.

## Preview Installation

Bundled skills use dry-run installation by default. The caller can inspect the
planned writes before any change:

```json
{
  "tool": "ennodia_install_skills",
  "arguments": {
    "skillIds": ["source-grounded-audit"],
    "harnessIds": ["codex", "claude-code", "opencode", "antigravity"],
    "scope": "project",
    "cwd": "/absolute/path/to/project",
    "dryRun": true
  }
}
```

Review the planned paths. If they are correct, repeat with `dryRun: false`.

## Use a Skill in a Run

```json
{
  "tool": "ennodia_run",
  "arguments": {
    "prompt": "Audit this documentation against the linked sources and recommend exact edits.",
    "harnessId": "codex",
    "mode": "single",
    "compare": false,
    "cwd": "/absolute/path/to/project",
    "skillIds": ["source-grounded-audit"]
  }
}
```

Task and run views include selected skill metadata in `appliedSkills`, so the
primary agent can see which skills were requested.

Native agents can self-select other skills from their environment.
An empty requested skill list does not guarantee a skill-free control.
`appliedSkills` records the request, not verified execution of the skill’s instructions.
A permission denial can prevent the worker from loading the skill.

Bundled skills include:

| Skill | Use it for |
| --- | --- |
| `source-grounded-audit` | Check claims against repository files, standards, or product documentation. |
| `compositional-audit` | Limit one shard of a large review to one clear scope. |
| `rigorous-review` | General correctness and risk review. |
| `release-readiness` | Public release candidate checks. |
| `benchmark-critic` | Benchmark credibility and reproducibility review. |

## Native Install Locations

| Harness | Project path | User path |
| --- | --- | --- |
| Codex | `.agents/skills` | `~/.agents/skills` |
| Claude Code | `.claude/skills` | `~/.claude/skills` |
| OpenCode | `.opencode/skills` | `~/.config/opencode/skills` |
| Antigravity | `.agent/skills` | `~/.gemini/antigravity/skills` |

See [Model Context Protocol (MCP) Tools](/docs/reference/mcp-tools/) for the
exact tool parameters.

## Main-agent delegation skill

The bundled `pragmatic` skill guides the main agent through bounded delegation and result verification.
Install it using `skillIds: ["pragmatic"]`. Do not pass it to workers through run `skillIds`.
See [Pragmatic mode](/docs/guides/pragmatic-mode/) for the experimental recipes.
