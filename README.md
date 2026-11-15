<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <img alt="Ennodia" src="docs/assets/logo.svg" width="235" height="50">
</picture>

# Keep your favorite agent. Bring in the others

You like working in Claude Code, but you want Codex's opinion on a plan.
Getting that opinion can mean copying context between apps, waiting, and carrying the answer back.
Every exchange waits for your attention.

Ennodia lets your agent make that exchange for you.
After setup, a request in Claude Code can be:

```text
Ask Codex to review this plan through Ennodia.
```

Claude Code prepares the context.
Ennodia starts Codex with the task and returns its findings.
Claude Code can use those findings to continue working with you in the same conversation.

Ennodia is a free, open-source set of tools for calling other agents installed on your computer.
It uses their configured access, including existing subscriptions where supported.
The same connection works in other directions, across supported agents.

[Get started](#try-it-with-your-agents) · [See recorded exchanges](https://ennodia.cherninlab.com/examples/exchanges/)

## More than a second opinion

An agent is more than its model.
Its tools, instructions, skills, and permissions determine what it can do.
Another agent may have a capability yours lacks.

In one [recorded check](https://ennodia.cherninlab.com/articles/can-gemini-hear-this-file/), a Codex conversation got help from Gemini through Antigravity.
The worker reported listening to an eight-second MP3 and returned the spoken words in about 20 seconds.
The field note records that configuration, its evidence, and the limits of the result.

An example request for that route:

```text
Use Gemini through Antigravity to transcribe clip.mp3 via Ennodia.
Test a short excerpt first and report any access or format limits.
```

Available capabilities depend on the installed agent, model, tools, and permissions.

Independent work can also run while you continue the conversation.
Your agent can start another task, keep working with you, and collect its result later.
Tasks that do not depend on each other can run in parallel.

```text
Send this specification to another agent through Ennodia.
Have it list the open questions while we continue here.
```

You can name an agent, model, or installed skill, or let your main agent choose.

## Try it with your agents

Give the agent you work in this request:

```text
Help me set up Ennodia: https://try-ennodia.cherninlab.com
Check which supported agents I can use on this computer.
Tell me about any sign-in, configuration, or restart I need.
```

The address opens installation instructions your agent can follow.
Setup can require your approval, native sign-in, configuration, or an app restart.

You need:

- **An app to work in** that can launch a local Model Context Protocol (MCP) server.
- **A supported agent to call**, installed with working model access.

The standard install downloads the executable for your platform.
It includes its runtime and bundled skills.

Ennodia calls each supported agent through its command-line interface (CLI).
A browser-only chat cannot launch these local programs.

Supported agents: Codex CLI, Claude Code, OpenCode, Kilo Code, Kiro CLI, Cline CLI, Hermes Agent, and Antigravity.
Available models and tools depend on each installation.

Then use the opening review request on a real plan or change.
Check the findings against your work and decide what to use.

Your main agent selects and sends the task context.
The other agent does not automatically receive your full conversation.
You may need to identify a missing file or decision, supply more context, or approve access.

[Quickstart](https://ennodia.cherninlab.com/docs/getting-started/) ·
[Agent compatibility and setup](https://ennodia.cherninlab.com/docs/reference/supported-harnesses/) ·
[Troubleshooting](https://ennodia.cherninlab.com/docs/guides/troubleshooting/)

<details>
<summary>Manual MCP setup</summary>

Ennodia runs as a local MCP server that your client starts.
Add it through your client's supported configuration method.
For clients using this JSON format:

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

`npx` downloads Ennodia and selects the executable for your platform.
It requires Node.js `18` or newer.
For installation without npm, use a standalone executable from [GitHub Releases](https://github.com/cherninlab/ennodia/releases).
Use its absolute path as the MCP server command.

Preserve existing server entries.
Reload tools or restart the client when required.

[Installation instructions](https://ennodia.cherninlab.com/docs/install/) ·
[Tool reference](https://ennodia.cherninlab.com/docs/reference/mcp-tools/)

</details>

## Costs and data

Tasks use the accounts and provider access configured in each agent.
Their normal charges and usage limits apply.
Ennodia requires no account or subscription of its own.

You can cap task counts and estimated input tokens before a run starts.
Input estimates exclude work inside an agent and do not cap provider bills.
The optional Compare step adds model passes and usage.

Ennodia runs locally without an Ennodia-hosted backend.
The agents it calls can send task material to their configured model providers.
Run history is local by default.
Set `ENNODIA_HISTORY=0` to disable durable history.

[Budgets and limits](https://ennodia.cherninlab.com/docs/guides/budgets-and-limits/) ·
[Data governance](https://ennodia.cherninlab.com/docs/concepts/data-governance/)

## Why I built Ennodia

Choosing an agent app often means choosing an interface, a model, a set of tools, and an ecosystem together.
I wanted to keep the interface I like without giving up another agent's capabilities.
I wanted my existing tools to work together.

In my own use, agents have used the connection differently.
Some sought second opinions, some delegated parts of a task, and others made parallel calls.
Their behavior depended on the model, instructions, and task.

Ennodia connects separate agent environments.
You or your agent can decide when to consult, delegate, or compare.
Routing and planning tools are available, but you do not have to adopt a fixed team or collaboration strategy.
Use it alongside built-in subagents or as a tool in a larger autonomous workflow.

Start with two agents and one question.

Stay where you like.

[Task recipes](https://ennodia.cherninlab.com/docs/guides/recipes/) ·
[Agent Skills](https://ennodia.cherninlab.com/docs/guides/agent-skills/) ·
[Documentation](https://ennodia.cherninlab.com/docs/) ·
[Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)
