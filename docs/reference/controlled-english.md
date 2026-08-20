---
title: Controlled English
description: Ennodia terminology and writing rules for ASD-STE100 Issue 9.
---

# Controlled English

Ennodia documentation uses ASD-STE100 Issue 9 as its writing standard.
This policy applies to the README, documentation, website text, and visible asset text.

Commands, API fields, status values, model IDs, and quoted interface text are data.
Keep this data exact, even when its text does not use controlled English.

## Writing Rules

- Use American English.
- Use active voice when the agent is known.
- Give one instruction in each procedural sentence.
- Use 20 words or fewer in a procedural sentence.
- Use 25 words or fewer in a descriptive sentence.
- Use six sentences or fewer in one paragraph.
- Do not use semicolons.
- Do not use a contraction.
- Use one approved term for each concept.
- Define a necessary abbreviation at its first use on each independent page.
- Preserve exact product names, commands, paths, model IDs, and API fields.

The landing page uses `AI makes mistakes` as an approved fixed tagline.
Define `artificial intelligence (AI)` in the sentence directly below it.

Automated checks can find some defects, but they cannot certify compliance.
A human reviewer must confirm meaning, grammar, and correct technical use.

## Ennodia Termbase

The Ennodia project approves the following terms for its software documentation.
Use the listed meaning and part of speech.

| Term | Type | Approved meaning |
| --- | --- | --- |
| Ennodia | technical noun | The software product in this repository. |
| artificial intelligence (AI) | technical noun | Software that produces or evaluates model output. |
| AI makes mistakes | approved tagline | The exact Ennodia landing-page headline. Keep this phrase unchanged. |
| Model Context Protocol (MCP) | technical noun | The protocol that exposes Ennodia tools to a compatible client. |
| command-line interface (CLI) | technical noun | A text interface that accepts commands. |
| application programming interface (API) | technical noun | A defined interface that software uses to exchange data. |
| Hypertext Transfer Protocol (HTTP) | technical noun | The protocol that Ennodia IO uses for local requests. |
| user interface (UI) | technical noun | The visible controls and output that a user can operate. |
| Ennodia IO | product name | The separate local HTTP package for Ennodia. |
| harness | technical noun | An Ennodia adapter that starts one supported local CLI. |
| model | technical noun | A named AI model that a harness can select. |
| large language model (LLM) | technical noun | A model that processes and produces language or code. |
| Agent Skill | technical noun | Installed instructions that a compatible harness can load. |
| skill | technical noun | The short form of Agent Skill after the full term appears. |
| task | technical noun | One harness process that Ennodia starts and tracks. |
| worker | technical noun | A task that performs one assigned part of a plan. |
| worker pool | technical noun | A defined group of workers with the same assignment type. |
| slice | technical noun | One focused part of a compositional task. |
| plan | technical noun | Validated data that defines ordered worker tasks. |
| plan digest | technical noun | A hash that identifies the exact validated plan. |
| inventory | technical noun | The runnable harnesses and installed skills that Ennodia finds. |
| inventory fingerprint | technical noun | A hash that identifies one inventory state. |
| Plan Advisor | technical noun | The role that proposes a bounded plan as inert data. |
| Judge | technical noun | The Compare role that maps agreements, conflicts, and risks. |
| Result Advisor | technical noun | The Compare role that recommends an answer from available evidence. |
| Compare | technical noun or verb | The Ennodia operation that uses a Judge and a Result Advisor. |
| run | technical noun or verb | A tracked orchestration, or the action that starts it. |
| receipt | technical noun | A bounded record of tasks, events, results, and execution data. |
| route | technical noun or verb | A harness selection, or the action that selects a harness. |
| poll | technical verb | To request current status at controlled intervals. |
| review | technical noun or verb | An inspection of code, documentation, or model output for defects. |
| standard input/output (stdio) | technical noun | The paired input and output streams of an MCP server process. |
| standard input (stdin) | technical noun | The input stream of a local process. |
| standard output (stdout) | technical noun | The normal output stream of a local process. |
| standard error (stderr) | technical noun | The error output stream of a local process. |
| token | technical noun | A model input or output unit. |
| budget | technical noun | A caller limit for tasks or estimated input tokens. |
| provider | technical noun | A company or service that supplies a model or harness. |
| subscription | technical noun | A provider plan that can set access or usage limits. |
| quota | technical noun | A provider limit on available usage. |
| estimated time of arrival (ETA) | technical noun | An estimate of the time until a task ends. |
| Cross-Origin Resource Sharing (CORS) | technical noun | An HTTP mechanism that controls browser access from another origin. |
| bring your own key (BYOK) | technical noun | An app pattern that uses credentials supplied by the user. |
| Codex | product name | The OpenAI coding-agent product. |
| Claude Code | product name | The Anthropic coding-agent product. |
| Antigravity | product name | The Google coding-agent CLI used by Ennodia. |
| Gemini | product name | A Google model family. |
| GPT | product name | An OpenAI model family. |
| OpenCode | product name | A supported coding-agent CLI. |
| Kilo Code | product name | A supported coding-agent CLI. |
| Hermes Agent | product name | A supported coding-agent CLI. |
| Kiro CLI | product name | A supported coding-agent CLI. |
| Cline | product name | A supported coding-agent CLI. |
| AutoGen | product name | An external multi-agent framework. |
| ChatHub | product name | An external multi-model comparison product. |
| LangGraph | product name | An external agent workflow framework. |
| OpenRouter | product name | An external model routing service. |
| Mixture-of-Agents | technical noun | An external multi-model inference method. |
| model merging | technical noun | A method that combines model parameters. |
| fine-tuning | technical noun | A method that adapts a model with additional training. |
| mergekit | product name | An external toolkit for model merging. |
| npm | product name | The package registry and command-line tool for JavaScript packages. |
| JavaScript Registry (JSR) | product name | The registry that distributes the Ennodia JavaScript package. |
| Model Context Protocol Registry | product name | The official registry for MCP server metadata. |
| GitHub Actions | product name | The service that runs Ennodia release and deployment workflows. |
| Cloudflare Pages | product name | The service that hosts the Ennodia website. |
| Astro | product name | The framework that builds the Ennodia website. |
| Starlight | product name | The Astro documentation framework used by the Ennodia website. |
| Semantic Versioning (SemVer) | technical noun | The version format that identifies compatible and incompatible releases. |
| JSON Lines | technical noun | A text format that stores one JSON value on each line. |
| JavaScript Object Notation (JSON) | technical noun | A structured text format for data exchange. |
| YAML | technical noun | A structured text format that Ennodia uses for Agent Skill metadata. |
| OpenID Connect (OIDC) | technical noun | The identity protocol used for tokenless registry publication from GitHub Actions. |
| identifier (ID) | technical noun | A value that uniquely identifies an Ennodia object. |
| F1 score | technical noun | The harmonic mean of precision and recall in a benchmark. |
| false positive (FP) | technical noun | A reported finding that the benchmark oracle does not require. |
| TypeScript | product name | The typed programming language used by Ennodia. |
| benchmark | technical noun or verb | A repeatable quality test, or the action that runs that test. |

Use `Plan Advisor` and `Result Advisor` in full.
Do not use `Advisor` alone when the role can be unclear.

Legacy fields can contain `synthesizer` or `synthesis` in their exact names.
Use `Result Advisor` for the current public role.

## Source

Use the official [ASD-STE100 Issue 9 standard](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf).
The ASD Simplified Technical English Maintenance Group controls that standard.
Do not copy its dictionary into this repository.
