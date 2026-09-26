---
title: How we will measure usefulness
description: A planned comparison of complete tasks, including unsuccessful attempts and human intervention.
---

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

Two public sets fit a first pilot on one computer:

- [Aider polyglot](https://github.com/Aider-AI/polyglot-benchmark): Exercism exercises in Python and JavaScript, graded by each exercise's own tests.
- [MMAU test-mini](https://huggingface.co/datasets/gamma-lab-umd/MMAU-test-mini): multiple-choice questions about audio clips. It tests routing audio away from agents that cannot hear it.

[Terminal-Bench](https://github.com/harbor-framework/terminal-bench) and [SWE-bench](https://github.com/SWE-bench/SWE-bench) need a container runtime for grading.
Pin the exact dataset version and evaluation environment.

This pilot can reveal useful patterns. It cannot establish universal superiority.
