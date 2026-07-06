---
title: Benchmarks
description: Deterministic benchmark snapshots for Ennodia's multi-agent bug-recall suite.
---

The first benchmark is `multi-model-bug-recall`: TypeScript review fixtures with
committed bug oracles. It measures whether a condition recalls required
findings and avoids known false-positive traps.

## Current Snapshot

Snapshot date: `2026-07-06T14:49:00.060Z`

Command:

```sh
bun run bench:bug-recall -- --out /tmp/ennodia-benchmark-snapshot
```

Mode: fixture, using committed reference outputs.

| Condition | Cases | Recall | Precision | F1 | High recall | FP traps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `claude-code-solo` | 4 | 87.5% | 100% | 93.3% | 100% | 0 |
| `codex-solo` | 4 | 37.5% | 50% | 42.9% | 75% | 1 |
| `ennodia-parallel-compare` | 4 | 100% | 100% | 100% | 100% | 0 |

Fixture wins: `claude-code-solo` won 3 fixtures, and
`ennodia-parallel-compare` won 1 fixture. Ennodia's value in this snapshot is
recall consistency: it recovered every required finding without adding a
false-positive trap.

## How Scoring Works

The scorer in `bench/bug-recall/scorer.ts` compares each output with committed
case oracles:

- recall: required findings matched
- precision: claimed findings that were required
- high recall: high-severity required findings matched
- FP traps: known false positives claimed by the output

The default benchmark is deterministic. It reads committed fixture responses and
does not launch child agents:

```sh
bun run bench:bug-recall
```

Live mode starts real local harnesses and varies with installed CLI versions,
models, account state, and machine configuration:

```sh
bun run bench:bug-recall:live -- --fixture 001-missing-await
```

## Limitations

This is a small TypeScript-focused fixture set. It is recall-oriented, not a
general software-engineering leaderboard. Live runs are intentionally excluded
from `bun run verify` because they consume real agent time and depend on local
setup.
