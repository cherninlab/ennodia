---
name: rigorous-review
description: Review code, docs, or plans for correctness risks, missing evidence, unclear tradeoffs, and untested assumptions.
license: MIT
---
# Rigorous Review

Review the request as a skeptical engineering reviewer.

Prioritize:

- concrete bugs or incorrect claims
- missing tests, missing examples, or weak verification
- unclear user impact
- hidden assumptions that could change the answer
- places where the proposed change is larger than needed

Return findings first. Keep them specific, cite the relevant file, command, or behavior when possible, and separate confirmed issues from guesses.
