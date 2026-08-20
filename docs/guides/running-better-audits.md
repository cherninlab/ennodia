---
title: Better Audits
description: How Ennodia audits can detect product problems that users see, not only consistency issues.
---

Ennodia can request review from multiple agents. The result still depends on the
audit rubric. A vague request such as "audit the website" often produces a
consistency pass.

This pass can find broken links, mismatched documentation, release metadata errors, type
errors, and copy drift. It does not prove that the page is clear to a first-time
visitor.

## Quick Recipe

Use a source-grounded audit for answers that depend on documentation,
standards, package behavior, or another product's public surface:

```json
{
  "tool": "ennodia_run",
  "arguments": {
    "prompt": "Audit this documentation against the linked primary sources. Separate facts from judgment and recommend exact edits.",
    "mode": "parallel",
    "compare": true,
    "skillIds": ["source-grounded-audit"]
  }
}
```

Install the skill first if the harness does not have it. See
[Agent Skills](/docs/guides/agent-skills/).

## Pick the Audit Mode

Name the failure mode you want reviewers to catch.

| Audit mode | Main question |
| --- | --- |
| Consistency | Do the documentation, website, package metadata, and behavior agree? |
| Conversion | Would a first-time visitor understand why to install this? |
| Visual quality assurance (QA) | Does the rendered page look balanced on desktop and mobile? |
| Accessibility | Can the page be navigated and understood with assistive technology? |
| Release | Can the package be published, installed, and launched safely? |

Use separate passes when the stakes are different. A page can pass consistency
and still fail conversion.

For a large review, split the work into focused slices. Do not send the entire
prompt to each reviewer. See
[Compositional Audits](/docs/concepts/compositional-audits/).

## Landing Page Rubric

For landing pages, require each reviewer to answer these questions:

- Can a first-time visitor explain what the product does within ten seconds?
- Is the reason to install visible in the hero or first section?
- Is the install path visible before architecture details?
- Does the page use user language and avoid maintainer language?
- Are screenshots or rendered viewports available for visual judgment?
- Does the final section strengthen trust and avoid defensive copy?

For Ennodia, use `mode: "parallel"` and `compare: true` for this type of review.
A single source-only answer is not sufficient for product pages.

## Include Rendered Evidence

Source-only review misses visual problems. Before an Ennodia website review,
include desktop and mobile screenshots. You can also use a harness with browser
access to inspect the rendered page.

Rendered evidence can show oversized logos, unbalanced hero space, incorrect
text size, delayed content, and accidental visual hierarchy.

When local files matter, include the file paths and a short text description.
Then inspect the child outputs for access errors.

If a harness cannot read the files, put them in an accessible location and run
the task again. Do not treat that failure as a normal design review.

## Ground Standards in Sources

Include primary sources when an audit depends on an external standard, registry
convention, or product behavior. Require reviewers to separate facts from
judgment.

Without these sources, a model council can confidently use an incorrect model
of the world.

Agent Skills are one cautionary example. They are not an Ennodia-private prompt
format. They are portable `SKILL.md` folders.

Tools such as Codex, Claude Code, OpenCode, and Antigravity discover these
folders in native locations. Reviewers must read that product documentation
before they recommend an Ennodia application programming interface (API).

The bundled `source-grounded-audit` skill supports this case. Install it in the
harnesses that perform standards-sensitive audits. Then tell Ennodia to use the
skill when the answer depends on external documentation.

## Good Prompt Shape

```text
Audit this landing page as a first-time visitor, not as a code consistency
reviewer.

Read:
- website/src/pages/index.astro
- website/src/styles/landing.css

If screenshots are available, judge the rendered page too.

Return:
1. The top conversion blockers, prioritized.
2. If the first viewport explains what this is and why to install it.
3. Exact replacement copy for weak sections.
4. Visual changes needed for desktop and mobile.
5. Which issues a consistency-only audit would miss.
```

The last item makes the reviewer state the audit limits. This information helps
you decide if another pass is necessary.
