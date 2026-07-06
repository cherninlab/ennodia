---
title: Ennodia vs Model Merging
description: How Ennodia differs from model merging tools such as mergekit and other weight-level model-combination approaches.
---

Model merging combines model weights or checkpoints into a new model artifact.
[mergekit](https://github.com/arcee-ai/mergekit) is a toolkit for merging
pretrained language models, and the [MergeKit paper](https://aclanthology.org/2024.emnlp-industry.36/)
describes it as tooling for model-checkpoint merging strategies.

Ennodia does not touch model weights.

## Choose Model Merging When

- You control compatible model weights.
- You want one merged model artifact.
- You want changes to happen before inference.
- You are evaluating merge recipes, checkpoints, or open-weight model behavior.

## Choose Ennodia When

- You want separate agents to run at task time.
- You want to keep provider subscriptions and installed CLIs separate.
- You want traces, child task IDs, failure states, and Compare output.
- You do not want to produce or host a new model artifact.

## Key Difference

Model merging changes the model artifact. Ennodia coordinates multiple agents at
runtime.

## Common Mistake

Do not describe Ennodia as model merging, fine-tuning, or weight composition. It
is runtime orchestration over installed local agents.
