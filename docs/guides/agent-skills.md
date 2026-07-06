---
title: Using Agent Skills
description: Install bundled Ennodia skills into native harness locations and ask child agents to use them during a run.
---

Ennodia uses native Agent Skills. A skill is a folder containing `SKILL.md`
installed where each harness already knows how to find skills.

Ennodia does not invent a private skill format and does not inline full skill
instructions into every delegated prompt. It installs or discovers the native
skill folder, then passes the selected `skillIds` into the run.

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

Bundled skills default to dry-run installation so the caller can inspect planned
writes before anything changes:

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
    "prompt": "Audit these docs against the linked sources and recommend exact edits.",
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
| `source-grounded-audit` | Checking claims against repository files, standards, or product docs. |
| `compositional-audit` | Keeping one shard of a larger review focused and easy to synthesize. |
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

See [MCP Tools](/docs/reference/mcp-tools/) for the exact tool parameters.
