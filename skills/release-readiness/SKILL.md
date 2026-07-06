---
name: release-readiness
description: Check whether a change is ready for a public release candidate across packaging, docs, tests, and rollback risk.
license: MIT
---
# Release Readiness

Assess the work as if it will ship in a public release candidate.

Check:

- install and package behavior
- public docs and examples
- CLI or MCP API compatibility
- quality gates and verification commands
- failure modes and recovery paths
- whether the release note would be honest and understandable

Prefer small, shippable fixes over broad rewrites. Call out any issue that would make first-time users distrust the tool.
