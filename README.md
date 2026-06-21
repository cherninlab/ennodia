<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo.svg">
  <img alt="Ennodia" src="docs/assets/logo.svg" width="235" height="50">
</picture>

<p><strong>Helps AI tools work together</strong></p>

<p>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-informational"></a>
</p>

</div>

## Why Ennodia?

**No single model or agent is best at everything.**

One may be better at reasoning, another at code, another at research, and another at browser or image automation. Some run locally, some through APIs, and some as autonomous command-line agents.

Ennodia gives them a shared routing, tracing, and Compare layer.

## Bring your own tools

Ennodia currently ships pluggable adapters for:

- Codex CLI
- Claude Code
- OpenCode
- Antigravity

## When to use Ennodia

Use Ennodia when a task needs more than one model, agent, or tool.


## How Ennodia works

> [!NOTE]  
> See the full [architecture.md](docs/in-depth/architecture.md) for more details.

Ennodia turns one request into a visible execution graph.

1. **Discover** available tools
2. **Plan** the best route
3. **Execute** through adapters
4. **Watch** every running task, log, and ETA
5. **Recover** with explicit failure states or partial results
6. **Compare** outputs when multiple agents respond
7. **Return** one final result with a trace you can inspect


## Contributing

Ennodia is under active development. Report bugs and request features through [GitHub Issues](https://github.com/cherninlab/ennodia/issues). PRs are welcome but will likely only be merged if they're small and target a specific problem. See [the contributing guide](CONTRIBUTING.md) for more details.
