# Benchmarks

Ennodia's first release-candidate benchmark is `multi-model-bug-recall`: small
TypeScript review fixtures with committed oracles. It measures if
parallel peer review plus Compare recovers more required findings than a solo
harness answer.

The default command is deterministic and uses committed reference outputs:

```sh
bun run bench:bug-recall
```

The live command starts a fresh Ennodia Model Context Protocol (MCP) server and
runs real harnesses. It is intentionally not part of `bun run verify`.

```sh
bun run bench:bug-recall:live -- --fixture 001-missing-await
```

Useful flags:

- `--fixture <id>` runs one fixture. Repeat it to select multiple fixtures.
- `--harness <id>` adds a solo baseline harness in live mode. Defaults to
  `codex` and `claude-code`.
- `--judge-harness <id>` and `--advisor-harness <id>` select Compare roles.
- `--synthesizer-harness <id>` is a deprecated alias for
  `--advisor-harness <id>`.
- `--timeout-ms <ms>` sets the per-run timeout for live harness calls.
- `--out <dir>` writes results to a specific directory.

Results are written under `bench/results/bug-recall/`. Raw benchmark output is
gitignored by default because live runs include model output and environment
metadata.
