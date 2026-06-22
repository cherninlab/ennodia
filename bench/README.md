# Benchmarks

Ennodia's first release-candidate benchmark is `multi-model-bug-recall`: small
TypeScript review fixtures with committed oracles. It measures whether
parallel peer review plus Compare recovers more required findings than a solo
harness answer.

The default command is deterministic and uses committed reference outputs:

```sh
bun run bench:bug-recall
```

The live command starts a fresh Ennodia MCP server and runs real harnesses. It
is intentionally not part of `bun run verify`.

```sh
bun run bench:bug-recall:live -- --fixture 001-missing-await
```

Useful flags:

- `--fixture <id>` runs one fixture; repeat it to select several.
- `--harness <id>` adds a solo baseline harness in live mode. Defaults to
  `codex` and `claude-code`.
- `--judge-harness <id>` and `--synthesizer-harness <id>` pin Compare roles.
- `--timeout-ms <ms>` sets the per-run timeout for live harness calls.
- `--out <dir>` writes results to a specific directory.

Results are written under `bench/results/bug-recall/`. Raw benchmark output is
gitignored by default because live runs include model output and environment
metadata.
