# Landing page assets

The landing page uses the existing Ennodia wordmark and agent logos from
`docs/assets`. Their use identifies supported tools, not endorsements.

Interface icons come from `@lucide/astro`. Each imported icon renders as static
SVG, without a client-side icon runtime. The package's ISC and Feather MIT
notices are included in `public/third-party-notices.txt`.

- [Lucide Astro documentation](https://lucide.dev/guide/astro/getting-started)
- [Lucide license](https://lucide.dev/license)

The three images in `public/illustrations` were generated for this website on
September 6, 2026. They share an editorial stipple-print style, with apricot,
lavender, and blue backgrounds. Each asset was composed separately for a 3:2
slot, then exported as a 960-pixel-wide WebP. They are illustrations, not
customer photographs or screenshots of actual results.

The interactive agent conversation is an illustrative HTML sequence. The
documentation review video in `public/demos` is an actual recorded MCP run.
Its poster is extracted from the final result in that recording. The landing
page labels those two kinds of material separately.

## Design references

The redesign uses these references for communication and visual hierarchy,
without copying their branding, interfaces, product claims, or customer data:

- [Codex](https://openai.com/codex/): a strong identity and visible product work.
- [Claude](https://claude.com/product/overview): tasks paired with concrete output.
- [Gemini Deep Research](https://gemini.google/overview/deep-research/): examples
  that connect a research question to a useful result.
- [Noah](https://www.heynoah.io/): recognizable jobs and familiar tools.
- [Trace](https://www.trace.so): expressive dithered artwork and workflow graphics.

Changes to the examples belong in `src/data/workflows.ts`. The audience tabs,
illustration cards, and copyable prompts all use that same source.
