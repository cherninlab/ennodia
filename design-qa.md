# Landing-page visual QA — September 8, 2026

Final result: passed

## Sources and comparison method

The brief was to restore Ennodia's minimal character, establish optical spacing
and alignment, and explain agent handoffs with readable animated graphics.

- Studied the live [Supermemory page](https://supermemory.ai/) as images and
  rendered DOM. At 1280 pixels, its content starts at x282 with a 640-pixel main
  column. Its diagram uses Geist Mono at 13/18.2 pixels and a nine-second glyph
  trace. These observations informed layout and animation; its claims and
  system architecture were not copied.
- Viewed the original Ennodia hero and the prior local hero, examples, and lower
  sections directly as screenshots.
- Generated and inspected three independent compositions. Chose the third,
  centered introduction with an open branch-and-return diagram, using the
  owner's authorization to make design decisions.
- GPT-6 Astra independently viewed all six reference screenshots through
  Ennodia MCP. Run `da925dbf-ce06-4650-aca1-f484963ec01e` completed in 94.309
  seconds. Its critique identified competing widths, uneven visual weight,
  and graphics that did not explain the handoff. This is an actual tool-use
  example, not a performance comparison against working without Ennodia.

Evidence directory:
`/Users/theochernin/Documents/Codex/2026-09-08/ennodia-layout-audit/`

Source visual truth:
`/Users/theochernin/Documents/Codex/2026-09-08/ennodia-layout-audit/concept-3-open-workbench.png`

Matched implementation capture:
`/Users/theochernin/Documents/Codex/2026-09-08/ennodia-layout-audit/19-design-comparison-1199.png`

Both images were presented together in one comparison input. Each is 1199 ×
1312 pixels. The implementation viewport was 1199 × 1312 CSS pixels, captured
at one output pixel per CSS pixel. The generated image has no intrinsic CSS
density and was treated as a 1:1 composition target; neither image was stretched.
State: top of page, Developers selected, completed automatic trace. The target
is art direction, not a screenshot of an existing interface.

## Findings and iteration history

1. **[P1, fixed] Animated text had a second baseline.** The first implementation
   showed blue duplicate text below static glyphs. See `07-revised-hero.png`.
   Inline spans were positioning the overlay against a different line box.
   Making `.trace-part` an inline block aligned both layers. Direct screenshot
   review confirmed the fix in `08-revised-hero-fixed.png`, then again in
   `24-final-hero-1280.png`.
2. **[P2, fixed] The diagram's loose leading weakened the connections.** The
   initial 1.7 line height produced large gaps between vertical strokes and a
   tall hero. Changed it to 1.5, preserving 15-pixel desktop and 14-pixel mobile
   text. Verified in the matched full-view comparison and
   `15-narrow-sales-320.png`. Compact rows retain a fixed minimum height so
   switching examples does not move the next section.
3. **[P2, fixed] The skill diagram was off-center within its graphic column.**
   `20-mobile-skill-390.png` and `10-revised-lower.png` show the visible diagram
   pushed toward the column's left edge. Centered its intrinsic width inside
   the existing grid track. Rechecked at the same 390-pixel viewport in
   `21-mobile-skill-centered-390.png` and at desktop in
   `23-desktop-skill-final.png`.

No actionable P0/P1/P2 findings remain in the inspected states.

## Required visual surfaces

| Surface | Review and final decision |
| --- | --- |
| Typography | Kept the existing Helvetica Neue/Arial family and actual SVG wordmark. Display weight 500 and a 54-pixel maximum are deliberately quieter than the generated concept. Body text is 17 pixels; desktop navigation is 15 pixels and tabs are 16 pixels. Monospace diagram labels remain readable without animation. No decorative uppercase subtitles were added. |
| Spacing and layout | One 880-pixel outer grid, a 640-pixel centered hero group, and equal lower columns with a 64-pixel gap. Major sections share 72-pixel separation and 48-pixel top inset. At 1280 pixels, lower text starts at x200 and graphic tracks at x672. Content is top-aligned; artwork receives a small optical offset for its internal blank margin. Mobile uses one shared content width. |
| Colors and tokens | Near-white paper, dark ink, subdued body text, and one blue trace/interaction accent. Removed dark simulated chat surfaces, pastel rectangles, tilted paper cards, and decorative elevation. The dark video remains actual recorded evidence. |
| Image quality | Existing three illustrations were edited with image generation, preserving objects and stipple detail while reducing background color and shadow weight. Inspected rendered developer/student images and the sales asset directly. All exports are 960 × 640 WebP. Actual brand and integration SVGs remain intact. Unicode diagrams implement the owner's explicitly requested TUI treatment. |
| Copy and content | The install address remains directly visible, with the centered instruction above it. Examples name a task, materials, finding, and next action. The generated concept's generic benefit paragraph was replaced by existing concrete examples and evidence links. Previously deleted captions remain absent. |

The implementation deliberately uses a narrower diagram than the generated
concept, avoids boxes around every conversation line, and retains existing
case artwork rather than the mockup's new laptop image. These choices reduce
visual weight and preserve the site's identity. They are accepted adaptations.

Focused evidence beyond the matched full view:

- `09-revised-cases.png`: readable headings, body text, artwork edges, and
  repeated spacing at 1280 × 900.
- `24-final-hero-1280.png`: final wordmark, install field, tabs, and trace.
- `23-desktop-skill-final.png`: aligned lower headings and centered skill art.
- `13-mobile-students-390.png`, `14-mobile-hero-390.png`: mobile text, tabs,
  and install address. These precede the final tighter diagram leading.
- `15-narrow-sales-320.png`: final diagram leading at 320 × 760.
- `18-tablet-640.png`: compact diagram at the intermediate 640 × 900 width.
- `17-mobile-example-expanded-320.png`: expanded prompt and copy feedback.

## Interaction and implementation checks

- Installation copy produced exactly `try-ennodia.cherninlab.com`.
- Example prompt opened and copied in place, with visible success feedback.
- Audience click, keyboard arrows, and a fresh `#tab-sales` load selected the
  correct panel. Only that panel carried the automatic trace attribute.
- The actual landing script passed targeted rapid-switch, hidden-document,
  and reduced-motion cancellation checks. Native browser reduced-motion
  emulation was unavailable; static CSS and cancellation logic were checked.
- Native FAQ disclosure opened and showed the complete answer.
- Browser-reported page width matched viewport width at 320, 390, 640, 1199,
  and 1280 pixels. No horizontal page overflow in the inspected states.
- Browser error log was empty. Screenshots include Astro's development toolbar;
  that overlay is absent from the production build.
- Strict targeted TypeScript check and `git diff --check` passed.
- `bun run verify` passed: 192 tests, website build, controlled-English check,
  and task/MCP/IO smoke checks.

## Remaining limits

This pass establishes visual consistency and checks the implemented interactions.
It does not establish conversion improvement or prove that new visitors
understand the product. No live deployment or publication occurred.

## Follow-up: rotating harness title — September 9, 2026

The owner requested harness names and monochrome logos in the two title slots.
`HeroTitle.astro` now uses the existing Ennodia Agent Logos font and the eight
supported adapters. It cycles through 56 directed pairs, excluding self-pairs,
with both names changing on each step. The first pair is Codex → Claude Code.

Each pair remains for 4.2 seconds. A short fade and vertical transition changes
only the names and logos inside fixed-size slots; “let” and “call in” remain
stationary and fully visible. The install field does not move.
At 320 pixels, the second phrase occupies two lines consistently for every name.
At 390 pixels and above, both phrases fit on one line each. Shared columns keep
the fixed words and name slots aligned as names change. Keyboard focus and pointer hover pause the
rotation; offscreen, hidden-document, and reduced-motion states also stop it.
A static accessible title avoids announcing every decorative name change.

Evidence: `/Users/theochernin/Documents/Codex/2026-09-09/ennodia-hero-title/`.
Desktop and mobile screenshots were directly inspected. Rendered measurements
confirmed no page overflow at 320, 390, 512, and 1280 pixels; title height and
installation position stayed identical across different desktop pairs. An
independent fake-time check of the actual client script covered the full cycle
and the pause/resume conditions. Strict TypeScript and the full repository
verification passed after the change.

The Ennodia SVG wordmark was then moved from the navigation to the title,
immediately before lowercase “let”. It remains static. On narrow screens the
wordmark occupies its own centered line above the words. The navigation now
uses two columns for Examples and the Docs/GitHub links. Desktop and 320-pixel
screenshots confirmed placement and no horizontal overflow; repository
verification and the rotation checks passed again.
