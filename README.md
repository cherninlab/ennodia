<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <img alt="Ennodia" src="docs/assets/logo.svg" width="235" height="50">
</picture>

**Keep your agent. Get another way forward.**

When a task stalls, Ennodia lets your primary artificial intelligence (AI) agent try another agent, model, or skill.
The findings come back to the same conversation.
You keep your familiar interface and decide what to try next.

```text
Use Ennodia MCP to get a second opinion on this bug.
Give one available agent the failing test and our attempted fixes.
Request a different explanation and a way to test it.
Bring the findings back here.
```

## When it helps

- A task is stuck and you want to check another approach.
- A skill looks useful, but you want to try it in a separate task first.
- Two answers disagree and you need to identify the next check.
- An unsuccessful attempt can help you avoid repeating the same approach under the same conditions.

Your main agent checks the findings and integrates useful work.
Additional attempts consume time and resources. General time or token savings have not been established.

## Install

Send this address to your primary agent:

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

Requirements: Bun `1.3.14` or newer, a compatible MCP client, and a supported agent with working provider access.
`npx` downloads Ennodia. Bun runs it. You can also use `bunx ennodia`.

[Get your first result](https://ennodia.cherninlab.com/docs/getting-started/) ·
[Installation for agents](https://ennodia.cherninlab.com/docs/install/)

## Use your installed agents and skills

Supported agents: Codex CLI, Claude Code, OpenCode, Kilo Code, Kiro CLI, Cline, Hermes Agent, and Antigravity.
Model availability and tool permissions depend on the installed agent and its provider configuration.
Discovery finds executable commands. It does not verify authentication or model access.
Codex workers use a read-only sandbox by default.

Ennodia discovers native Agent Skills and can request them for specific tasks.
A separate task keeps the trial outside the main conversation.
Native agents can also select unrequested skills from their own environment.

[Recipes](https://ennodia.cherninlab.com/docs/guides/recipes/) ·
[Using skills](https://ennodia.cherninlab.com/docs/guides/agent-skills/) ·
[Understand results](https://ennodia.cherninlab.com/docs/guides/understand-results/)

## See it in practice

- [Building Ennodia with Ennodia](https://ennodia.cherninlab.com/docs/evidence/building-ennodia/): a worker patch, a failed login, and primary-agent corrections.
- [Find stale documentation](https://ennodia.cherninlab.com/docs/evidence/docs-drift/): a small review with known answers.
- [Try a skill separately](https://ennodia.cherninlab.com/docs/evidence/skill-trial/): two attempts against the same contract.

The existing saved-answer benchmark is a regression check, not a live speed or cost comparison.
[Measurement plan](https://ennodia.cherninlab.com/docs/evidence/measurement/)

## Data and limits

Ennodia runs locally without an Ennodia-hosted service.
Selected agents can send material to their configured model providers.
Terminal run history is stored locally and can be disabled with `ENNODIA_HISTORY=0`.

Ennodia can limit child tasks and estimated input tokens.
Those estimates exclude internal harness work and are not provider bills.
Automatic agent updates and recommendations learned from past results remain future work.

[Data governance](https://ennodia.cherninlab.com/docs/concepts/data-governance/) ·
[Budgets](https://ennodia.cherninlab.com/docs/guides/budgets-and-limits/) ·
[Roadmap](https://ennodia.cherninlab.com/docs/roadmap/)

## Technical reference and contribution

The main entrypoint is `ennodia_run`. The optional Plan Advisor proposes explicit tasks before execution.
Compare examines completed answers and returns advice with its evidence and limitations.

[MCP tools](https://ennodia.cherninlab.com/docs/reference/mcp-tools/) ·
[Experimental Ennodia IO](https://ennodia.cherninlab.com/docs/reference/ennodia-io/) ·
[Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

```sh
bun install
bun run verify
```

### Experimental Pragmatic mode

Version 0.3.0 supports independent model attempts, tailored planning, skill trials and evidence comparison.
The published `ennodia@next` recipes retain the earlier single-worker restriction.
[Pragmatic mode](docs/guides/pragmatic-mode.md) keeps bulky evidence outside the main conversation and returns findings for verification.
Savings are not yet validated.
