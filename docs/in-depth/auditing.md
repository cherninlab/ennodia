---
title: Running better audits
description: How to ask Ennodia for audits that catch user-facing product problems, not only consistency issues.
---

Ennodia can ask several agents for review, but the quality of the result still
depends on the audit rubric. A vague request such as "audit the website" often
turns into a consistency pass: broken links, mismatched docs, release metadata,
type errors, and copy drift. That is useful, but it does not prove the page is
clear to a first-time visitor.

## Pick the audit mode

Name the failure mode you want reviewers to catch.

| Audit mode | Main question |
| --- | --- |
| Consistency | Do the docs, website, package metadata, and behavior agree? |
| Conversion | Would a first-time visitor understand why to install this? |
| Visual QA | Does the rendered page look balanced on desktop and mobile? |
| Accessibility | Can the page be navigated and understood with assistive technology? |
| Release | Can the package be published, installed, and launched safely? |

Use separate passes when the stakes are different. A page can pass consistency
and still fail conversion.

## Landing page rubric

For landing pages, ask each reviewer to answer these questions:

- Can a first-time visitor explain what the product does within ten seconds?
- Is the reason to install visible in the hero or first section?
- Is the install path visible before architecture details?
- Does the page use user language instead of maintainer language?
- Are screenshots or rendered viewports available for visual judgment?
- Does the final section strengthen trust instead of ending on defensive copy?

For Ennodia itself, prefer `mode: "parallel"` and `compare: true` for this kind
of review. A single source-only answer is not enough for product-facing pages.

## Include rendered evidence

Source-only review misses visual problems. Before asking Ennodia to judge a
website, include desktop and mobile screenshots or ask a harness with browser
access to inspect the rendered page.

Rendered evidence catches problems such as oversized logos, unbalanced hero
spacing, text that feels too large or too small, delayed content, and accidental
visual hierarchy.

When screenshots or other local files matter, include both the file paths and a
short text description. Then check the child outputs for access errors. If a
harness cannot read the files, stage them somewhere it can access and rerun; do
not treat that failure as a normal design review.

## Good prompt shape

```text
Audit this landing page as a first-time visitor, not as a code consistency
reviewer.

Read:
- website/src/pages/index.astro
- website/src/styles/landing.css

If screenshots are available, judge the rendered page too.

Return:
1. The top conversion blockers, prioritized.
2. Whether the first viewport explains what this is and why to install it.
3. Exact replacement copy for weak sections.
4. Visual changes needed for desktop and mobile.
5. Which issues a consistency-only audit would miss.
```

The last item matters. It forces the reviewer to state the limits of the audit,
which helps decide whether another pass is needed.
