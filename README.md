<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <img alt="Ennodia" src="docs/assets/logo.svg" width="235" height="50">
</picture>

**Ennodia isn't another agent. It connects the agents you use.**

Stay in Codex, Claude Code, or any agent you like.
When a task needs another model, your agent hands that part over through Ennodia and brings the answer back.
Ennodia runs on your computer, and each agent uses your own account.

```text
Have Gemini listen to meeting.mp3 through Ennodia and tell me what was decided.
```

## What each agent adds

No model leads every task, so each agent you connect brings an ability the others lack.

- **Listen.** Gemini hears audio files. Codex hands it the file path and gets back what Gemini heard.
- **Draw.** Codex draws with GPT Image. Claude Code can hand it a brief and get the images back.
- **Review.** Two other agents review the same patch in fresh sessions. Compare maps where they agree and differ.
- **Read.** Kimi K3 in OpenCode reads long documents. Your agent hands it a spec and gets back the rules, each with its line number.

When your own agent has the ability, it does the task itself, with no handoff.
[See each route](https://ennodia.cherninlab.com/#abilities) and the [public scores behind each strength](https://ennodia.cherninlab.com/#evidence).

## Install

Send this address to your agent:

```text
try-ennodia.cherninlab.com
```

For manual setup, add this Model Context Protocol (MCP) server to your client:

```json
{
  "mcpServers": {
    "ennodia": {
      "command": "npx",
      "args": ["-y", "ennodia"]
    }
  }
}
```

Ennodia loads six core tools by default: about 10,000 characters of tool definitions in each session.
Add `"--tools", "all"` to `args` for the [full tool set](https://ennodia.cherninlab.com/docs/reference/mcp-tools/#tool-sets).

Requirements: Bun `1.3.14` or newer, a compatible MCP client, and a supported agent with working provider access.
`npx` downloads Ennodia. Bun runs it. You can also use `bunx ennodia`.

[Get your first result](https://ennodia.cherninlab.com/docs/getting-started/) ·
[Installation for agents](https://ennodia.cherninlab.com/docs/install/)

## How a handoff works

1. Your agent calls `ennodia_run` with the task, the agent or model to use, and a time limit.
2. Ennodia starts that agent's own command-line tool in a fresh session, with its own tools and your account for it.
3. The answer comes back to your conversation, with its status and a receipt saved on your computer.

Your conversation history stays in your agent.
For two or more answers, Compare maps agreements, contradictions, and gaps.
When one answer is complete as it stands, Compare can choose it, and `ennodia_run` returns it unchanged.

## Supported agents

Codex CLI, Claude Code, OpenCode, Kilo Code, Kiro CLI, Cline, Hermes Agent, and Antigravity.
Model availability and tool permissions depend on the installed agent and its provider configuration.
Discovery finds executable commands. It does not verify authentication or model access.
Codex workers use a read-only sandbox by default.

Ennodia discovers native Agent Skills and can request them for specific tasks.
A separate task keeps the trial outside the main conversation.
Native agents can also select unrequested skills from their own environment.

[Recipes](https://ennodia.cherninlab.com/docs/guides/recipes/) ·
[Using skills](https://ennodia.cherninlab.com/docs/guides/agent-skills/) ·
[Understand results](https://ennodia.cherninlab.com/docs/guides/understand-results/)

## Evidence

- [Can Gemini hear this file?](https://ennodia.cherninlab.com/articles/can-gemini-hear-this-file/): a Codex conversation hands an audio file to Gemini through Antigravity.
- [Measurement plan](https://ennodia.cherninlab.com/docs/evidence/measurement/): how Ennodia compares single agents with teams on public benchmarks.
- [Audio routing study](bench/audio-routing/README.md): can an agent that cannot hear answer questions about audio once Ennodia lets it hand each clip to one that can?

## Data and limits

Ennodia runs locally without an Ennodia-hosted service.
Selected agents can send material to their configured model providers.
Terminal run history is stored locally and can be disabled with `ENNODIA_HISTORY=0`.

Each handoff costs time and uses your agents' own quotas and charges.
General time or token savings have not been established.
Ennodia can limit child tasks and estimated input tokens.
Those estimates exclude internal harness work and are not provider bills.

[Data governance](https://ennodia.cherninlab.com/docs/concepts/data-governance/) ·
[Budgets](https://ennodia.cherninlab.com/docs/guides/budgets-and-limits/) ·
[Roadmap](https://ennodia.cherninlab.com/docs/roadmap/)

## Technical reference and contribution

The main entry point is `ennodia_run`.
The full tool set adds raw tasks, separate Compare calls, budget estimates, and the Plan Advisor, which proposes explicit tasks before execution.

[MCP tools](https://ennodia.cherninlab.com/docs/reference/mcp-tools/) ·
[Experimental Ennodia IO](https://ennodia.cherninlab.com/docs/reference/ennodia-io/) ·
[Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

```sh
bun install
bun run verify
```

### Experimental Pragmatic mode

[Pragmatic mode](docs/guides/pragmatic-mode.md) runs independent model attempts, tailored plans, and skill trials, then compares the evidence.
It keeps bulky evidence outside the main conversation and returns findings for your agent to verify.
Savings are not yet validated.
