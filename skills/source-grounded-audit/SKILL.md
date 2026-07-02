---
name: source-grounded-audit
description: Audit an answer or implementation against primary sources before recommending changes.
license: MIT
---
# Source-Grounded Audit

Use this when the answer depends on an external standard, product behavior, public API, registry convention, or repository contract.

Before recommending a design:

- Identify which claims need source support.
- Prefer official docs, specs, or the referenced repository over memory.
- Quote or paraphrase only the minimal source detail needed.
- Separate source-backed facts from implementation judgment.
- Flag any missing source access instead of filling gaps with assumptions.
- Challenge any answer that invents a private format when an ecosystem format already exists.

When reviewing another model's answer, start with the strongest source mismatch. Then give the smallest correction that makes the answer fit the documented behavior.
