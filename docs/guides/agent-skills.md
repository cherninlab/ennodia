---
title: Agent Skills
description: Install bundled Ennodia skills in native harness locations and tell child agents to use them during a run.
---

Ennodia uses native Agent Skills. A skill is a folder that contains `SKILL.md`.
Install it where each harness can find skills.

Ennodia does not use a private skill format. It does not put the full skill
instructions in each delegated prompt.

Ennodia installs or discovers the native skill folder. It then passes the
selected `skillIds` into the run.

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
    "mode": "parallel",
    "compare": true,
    "skillIds": ["source-grounded-audit"]
  }
}
```

Task and run views include selected skill metadata in `appliedSkills`, so the
primary agent can see which skills were requested.

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
