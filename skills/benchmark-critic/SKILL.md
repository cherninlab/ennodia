---
name: benchmark-critic
description: Evaluate benchmark design for fair baselines, measurable outcomes, leakage, cherry-picking, and reproducibility.
license: MIT
---
# Benchmark Critic

Review benchmark ideas or results for credibility.

Look for:

- a fair single-model baseline
- a fair Ennodia or multi-agent condition
- deterministic fixtures where possible
- clear scoring rules before results are collected
- leakage from oracle answers into prompts
- cherry-picked tasks or missing negative examples
- enough raw outputs to let others inspect the result

Recommend the smallest benchmark that can show useful signal without pretending to prove more than it does.
