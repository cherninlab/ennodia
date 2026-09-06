---
title: How we will measure usefulness
description: A planned comparison of complete tasks, including unsuccessful attempts and human intervention.
---

# How we will measure usefulness

Status: proposed experiment. Results are not available yet.

The primary comparison uses the same main agent with and without Ennodia.
A separate control can give the main agent the same additional models without Ennodia.
That control helps distinguish orchestration benefits from additional computation.

## Pilot design

- Select 20 tasks before running the experiment.
- Repeat each condition three times.
- Fix models, versions, source material, available skills, and resource limits.
- Define correctness checks before collecting answers.
- Keep evaluator answers outside agent materials.
- Retain failed, canceled, and incomplete attempts.

| Measure | Definition |
| --- | --- |
| Correctness | Fraction of tasks meeting the predefined checks. |
| Time | Elapsed time through planning, workers, comparison, verification, and integration. |
| Resources | Reported input, output, and cached tokens across all participants. Unknown usage stays unknown. |
| Human work | Interventions, manual transfers, and repeated setup steps. |
| Repeated attempts | Reuse of a previously unsuccessful approach under the same recorded conditions. |

Compare time together with correctness. Excluding failures from timing can hide a worse completion rate.
Report model tokens, estimated provider charges, and subscription payments separately.
A token estimate is not a measured provider bill.

[Terminal-Bench](https://github.com/harbor-framework/terminal-bench) is a candidate for terminal tasks.
[SWE-bench](https://github.com/SWE-bench/SWE-bench) provides a separate direction for repository bug fixes.
Pin the exact dataset version and evaluation environment.
Use small custom fixtures for skill trials and manual workflow measurements.

This pilot can reveal useful patterns. It cannot establish universal superiority.
