# Website assets

The website uses the existing Ennodia wordmark and agent logos from
`docs/assets`. Their use identifies supported tools, not endorsements.
The wordmark is inlined so it follows the text color in both themes.

Interface icons come from `@lucide/astro`. Each imported icon renders as static
SVG, without a client-side icon runtime. The package's ISC and Feather MIT
notices are included in `public/third-party-notices.txt`.

- [Lucide Astro documentation](https://lucide.dev/guide/astro/getting-started)
- [Lucide license](https://lucide.dev/license)

## Type, spacing, and color

The site uses Geist for text and Martian Mono only for the page's own labels:
figure titles, figure controls, and data. Their SIL Open Font License files
are in `public/fonts`.

`src/styles/site.css` defines the systems as tokens:

- Type: 13 for figures, captions, and notes, 16 carries content, 19 for
  article reading, 25 titles a section, 52 titles a page, and 78 sets the
  opening line. The landing uses four of these: 78, 25, 16, and 13.
- Spacing: steps of 8px. Text sits on a 4px baseline: 16px text on 24px
  lines, 13px text on 20px lines.
- Grid: a title column and a content column in a 1 to 1.7 ratio with a 72px
  gap. Every section, figure, and article uses these edges.
- Color: running text is ink. Gray is for captions, notes, and parts of a
  figure that are not in play. Olive means one thing: Ennodia's path, and
  what comes back along it. Agent logos render in ink from the agent font.
  The docs theme in `src/styles/starlight.css` uses the same palette.
- Figures: each has a number and a caption below it, with a plain title, then
  its date and source. The text reads each figure by its number, and one key
  under Fig. 2 names the kinds of line. Corners are square.

## Charts

Charts use Recharts through the Astro React integration. The token estimate
chart loads when it becomes visible. Its stages use an ordinal olive ramp,
`#2c3625`, `#4f6339`, and `#7f975a`. It passes the ordinal palette checks on
the page background `#f6f4ee`, where the lightest step has 2.95:1 contrast.
Totals are labeled on each column, and a hidden table repeats every value for
screen readers. Diagrams stay in HTML and CSS on the same grid.

## Capability strips

Each strip shows one capability as raw material, drawn with pyqtgraph from a real run.
They are decoration: they carry no claim and screen readers skip them.
Fig. 2 shows one strip per task, from `public/studies/`, and its caption says what each strip shows and when:

| Task | Strip | Run |
| --- | --- | --- |
| Listen | `perception-strip` | Clip 27 of the audio study, a speech clip. Codex answered it right only once Ennodia handed it to Gemini. |
| Draw | `draw-strip` | Codex drew four stone textures with its image tool. A probe traces each tiling seam. |
| Review | `review-strip` | Claude Code and Kimi K3 reviewed one Ennodia patch, and Compare mapped where they differ. |
| Read | `read-strip` | Kimi K3 read all of RFC 9110 in OpenCode, with each read call and the rules it listed. |

Two more strips wait for a place: `compare-strip`, three solutions of a polyglot exercise under Compare, and `orchestrate-strip`, the audio study as it ran.

A phone crops a strip from the right, at a point that moves with the screen width.
So all text sits in the first 680 of the 1260 pixels, which a 320-pixel screen shows.
`bench/strips/strip.py` holds the shared palette, size, and header.

Render the perception strip:

```sh
uv run --with pyqtgraph --with PyQt6 --with numpy bench/audio-routing/scope.py --layout strip --palette site --clip clip-27 --size 1260x170 --text-scale 1.8 --run <run> --data <data> --out strip.mp4
```

Each script in `bench/strips/` renders one of the others, and its header names its inputs.

## Content sources

- `src/assets/why/` holds the six 21:9 photographs above the benefits on the
  landing page, generated with ChatGPT: a stream, geese in formation, open
  grass, a fern, a nest, and a path to the sea. They set the mood and carry
  no claim, so their alt text is empty. Astro serves each as WebP at 640,
  960, and 1280 pixels wide.
- `src/data/agents.ts` holds Fig. 2, the agent graph. Agents are its boxes
  and Ennodia is the path between them. `graph-layout.ts` places both. Each agent's one strength has a
  public source in `leaders.ts`. Only the audio route has a recorded run. The
  others are example requests, and the figure labels them so.
- `src/data/leaders.ts` holds Figs. 3 and 4. Every value was read at its source on
  the date the file states. The two mixing findings come from the papers'
  abstracts.
- `src/content/articles` holds long-form write-ups. Each article cites its
  receipts or development records. The controlled-English check covers them.

Only add a recorded run with a receipt, a development record, or a run ID.
Only add a date that the record states.

Fig. 2 opens in a given state from a link, for posts that discuss one
route: `/?from=claude&task=review#abilities`. `ennodia=off` shows the same
task without Ennodia.

To cross-post an article to DEV Community, export it as Markdown:

```sh
bun run --cwd website export:devto can-gemini-hear-this-file > post.md
```

The export sets `canonical_url` to the website article and keeps
`published: false`. Figures become Markdown tables and lists. An article's
`devtoTags` and `series` fields set its DEV tags and series. Render its
1000 by 420 cover first:

```sh
bun run --cwd website make:cover can-gemini-hear-this-file
```

The three images in `public/illustrations` were generated for this website on
September 6, 2026. They share an editorial stipple-print style, originally with
apricot, lavender, and blue backgrounds, refined to neutral paper on September 8.
Each asset was composed separately for a 3:2
slot, then exported as a 960-pixel-wide WebP. They are illustrations, not
customer photographs or screenshots of actual results. The current pages don't
use them.

## Design references

The September 25, 2026 figures follow how the
[Arena Physica DJI teardown](https://www.arenaphysica.com/publications/dji-teardown)
explains complex information: figures with their own controls, to-scale
timelines, side-by-side comparisons, captions that say how to use the figure,
and sources kept next to the data. The colors, type, and content are Ennodia’s.
The page was inspected as screenshots and rendered styles on that date.

Earlier iterations used these references for communication and visual
hierarchy, without copying their branding, interfaces, product claims, or
customer data:

- [Codex](https://openai.com/codex/): a strong identity and visible product work.
- [Claude](https://claude.com/product/overview): tasks paired with concrete output.
- [Gemini Deep Research](https://gemini.google/overview/deep-research/): examples
  that connect a research question to a useful result.
- [Noah](https://www.heynoah.io/): recognizable jobs and familiar tools.
- [Trace](https://www.trace.so): expressive dithered artwork and workflow graphics.
- [Supermemory](https://supermemory.ai/): stable text columns and a monospace
  diagram whose animation traces a labeled route through the system. The live
  page was inspected as screenshots and rendered DOM on September 8, 2026.

## Illustration refinement — September 6, 2026

The three existing illustrations were edited with the built-in image generation
tool after inspecting each original. The original edit targets are preserved in
Git at commit `d5bf838`, under the same `public/illustrations/*.webp` paths.
The edits preserve the original print style and palettes. They simplify
microscopic marks, correct object relationships, and clarify each task.

The generated PNGs were inspected before export. Final website assets are
960 × 640 WebP files, exported with Sharp 0.35.2 at quality 88. Resizing and
format conversion were the only operations after image generation. The original
generated files remain in the local Codex image archive; they are not runtime
dependencies.

### developers

- Website asset: `public/illustrations/developers.webp`
- Generated source: `/Users/theochernin/.codex/generated_images/01a076d9-c412-7793-9daf-d24b751b9c39/exec-4825234a-3a52-462f-a637-229790a9c855.png`
- Edit target: the corresponding illustration from commit `d5bf838`.

Exact edit prompt:

```text
Use case: precise-object-edit. Asset type: website editorial illustration, 3:2 landscape composition.
Edit target: the attached existing developers illustration. Refine it; preserve its identity, warm apricot background, cream laptop, black ink engraving/stipple texture and restrained orange accent, overall laptop-at-left and two companion panels-at-right composition.
Repair details: remove both loose orange cables and their plugs entirely, since software windows should not have cables attached. Keep the laptop physically believable with a coherent keyboard, clean screen bezel and generous space around the composition. Simplify the laptop screen to about six or seven short, elegant ink line groups suggesting code, not dense dotted pseudo-text. On the two floating companion panels, show one sparse code excerpt and one simple branching flow with only three or four clean connected nodes. A single small orange highlighted line should be the visual finding. Keep the panel perspectives consistent with each other.
Retain tactile hand-drawn stipple shading at the objects' lower edges, but reduce noisy grain across the empty screen interiors. Clean, purposeful, quiet editorial drawing. No words, letters, branding, logos, decorative icons, badges, extra objects or marketing text. This is careful art cleanup, not a different style. Preserve 3:2 framing and leave comfortable negative space around every object.
```

### students

- Website asset: `public/illustrations/students.webp`
- Generated source: `/Users/theochernin/.codex/generated_images/01a076d9-c412-7793-9daf-d24b751b9c39/exec-3a99a056-9739-47e2-b3c9-9a5c68dac734.png`
- Edit target: the corresponding illustration from commit `d5bf838`.

Exact edit prompt:

```text
Use case: precise-object-edit. Asset type: website editorial illustration, 3:2 landscape composition.
Edit target: the attached existing students illustration. Refine it; preserve its identity, soft pale lavender background, warm cream paper, black ink engraving/stipple texture, sparse purple accent, open book in front and two research pages behind it.
Repair details: remove the dense microscopic pseudo-writing. Replace it with a small number of evenly spaced, clean ink strokes suggesting paragraphs, with generous blank paper margins. Keep each research page simple: the left has one clearly drawn line chart, the right one restrained bar chart. On the left chart mark one questionable data point with a single purple circle. Make the magnifying glass about two thirds its current size and have it rest fully on the left research page, magnifying that circled point; its handle must end visibly on that same sheet, with a clear gap before the open book. No handle penetrating the book or ambiguous object joins. Give the open book believable page curvature, sparse short paragraph strokes and one simple small figure on each spread.
Retain tactile hand-drawn stipple shading at the objects' lower edges but use clean interior surfaces and readable silhouettes. Balanced whitespace, graceful proportions, quiet editorial drawing. No words, letters, numbers, branding, logos, badges, extra objects or marketing text. This is careful cleanup, not a different style. Preserve 3:2 framing and comfortable negative space around every object.
```

### sales

- Website asset: `public/illustrations/sales.webp`
- Generated source: `/Users/theochernin/.codex/generated_images/01a076d9-c412-7793-9daf-d24b751b9c39/exec-d5a395f1-447e-4a3a-b502-d42d2b9d3a7e.png`
- Edit target: the corresponding illustration from commit `d5bf838`.

Exact edit prompt:

```text
Use case: precise-object-edit. Asset type: website editorial illustration, 3:2 landscape composition.
Edit target: the attached existing sales illustration. Refine it; preserve the pale powder-blue background, warm cream paper, black ink engraving/stipple texture and restrained blue accent. Keep the spiral-bound call preparation notebook at the center-left, the fountain pen at its lower-left, the tabletop still-life viewpoint and balanced negative space.
Change the right-hand objects: remove the oversized podcast microphone, its stand and cable, and both hovering empty speech bubbles. In their place, put a modest, neatly folded single-ear business call headset resting physically on the tabletop to the right of the notebook, with a small clear boom microphone, realistically proportioned and visually secondary. Behind the notebook, show the upper portion of one cream printed call brief sheet, resting flat on the same table, with three short rows of sparse ink strokes and a simple small circular contact silhouette. No floating UI or bubbles.
Clean up the notebook: only four generously spaced checklist rows, each with two short ink strokes; one row has a discreet blue underline and a blue check in its small checkbox, so the image conveys a prepared conversation and a reviewed brief. Preserve plausible spiral binding and page edges. No dense fake text.
Keep the hand-drawn stipple shading near object edges but leave paper interiors quiet. No legible text, letters, numbers, brands, logos, extra decorative objects or marketing text. This is careful refinement within the existing style, not a redesign. Maintain 3:2 landscape framing and comfortable margins around all objects.
```

## Illustration background refinement — September 8, 2026

The September 6 refined WebPs were inspected and edited separately with the
built-in image generation tool. The edits replace the full-color backdrops with
neutral near-white paper, reduce broad cast shadows, and preserve the original
object arrangements, engraving details, and small orange, purple, or blue accents.
They use the near-white target `#fbfbf9`; generated backgrounds are visually
neutral and may vary slightly at pixel level.

Each generated image and final WebP was inspected directly. The final assets
remain 960 × 640 pixels, exported using Sharp 0.35.2 at quality 88. Only resizing
and WebP conversion occurred after generation; no color filters or pixel keying
were applied. The generated source files are local provenance, not runtime assets.

### developers — neutral background

- Website asset: `public/illustrations/developers.webp`
- Generated source: `/Users/theochernin/.codex/generated_images/01a0813c-1c28-77d1-8e8c-fa4f56995ca4/exec-2d418395-de0e-48e1-a518-8f98b9ea9b62.png`
- Edit target: the corresponding September 6 refined WebP documented above.

Exact edit prompt:

```text
Use case: precise-object-edit. Asset type: existing website editorial illustration, 3:2 landscape.
Edit target: the attached developers illustration. Make one focused art-direction change: replace the entire colored rectangular background and colored surface wash with a flat, uniform, neutral near-white paper backdrop, exact target #fbfbf9, from edge to edge. The backdrop should have no vignette, gradient, hue cast, paper grain, border, or colored rectangle.
Preserve ALL recognizable object arrangement, proportions, perspective, contours, and fine black stipple/engraving detail: laptop at left and the two companion panels at right. Maintain the same object bounds, placement, scale, and comfortable negative space as the original image so it fits the same 320–400 pixel editorial column. Keep the same 3:2 framing.
Reduce only the broad dense cast-shadow masses around the objects: confine shadow to delicate, sparse black stipple close to contact edges. Keep internal object shading and fine ink detail. Object interior paper and cream surfaces should be neutral near-white, without the previous colored reflected wash.
Predominantly crisp black ink. Retain only the existing orange highlighted code line and orange node; the tiny accent should remain subtle. No new objects, rearrangements, new text, logos, badges, generic icons, or extra marks. This is careful background and visual-weight cleanup of the existing illustration, not a redraw into another style.
```

### students — neutral background

- Website asset: `public/illustrations/students.webp`
- Generated source: `/Users/theochernin/.codex/generated_images/01a0813c-1c28-77d1-8e8c-fa4f56995ca4/exec-12c77785-9766-449c-bd82-a2041c2849e6.png`
- Edit target: the corresponding September 6 refined WebP documented above.

Exact edit prompt:

```text
Use case: precise-object-edit. Asset type: existing website editorial illustration, 3:2 landscape.
Edit target: the attached students illustration. Make one focused art-direction change: replace the entire colored rectangular background and colored surface wash with a flat, uniform, neutral near-white paper backdrop, exact target #fbfbf9, from edge to edge. The backdrop should have no vignette, gradient, hue cast, paper grain, border, or colored rectangle.
Preserve ALL recognizable object arrangement, proportions, perspective, contours, and fine black stipple/engraving detail: open book in front, two research pages behind, and magnifying glass on the left page. Maintain the same object bounds, placement, scale, and comfortable negative space as the original image so it fits the same 320–400 pixel editorial column. Keep the same 3:2 framing.
Reduce only the broad dense cast-shadow masses around the objects: confine shadow to delicate, sparse black stipple close to contact edges. Keep internal object shading and fine ink detail. Object interior paper and cream surfaces should be neutral near-white, without the previous colored reflected wash.
Predominantly crisp black ink. Retain only the existing tiny purple circle on the inspected chart point; the tiny accent should remain subtle. No new objects, rearrangements, new text, logos, badges, generic icons, or extra marks. This is careful background and visual-weight cleanup of the existing illustration, not a redraw into another style.
```

### sales — neutral background

- Website asset: `public/illustrations/sales.webp`
- Generated source: `/Users/theochernin/.codex/generated_images/01a0813c-1c28-77d1-8e8c-fa4f56995ca4/exec-9af2de44-d852-4c60-8075-51ccc57e887a.png`
- Edit target: the corresponding September 6 refined WebP documented above.

Exact edit prompt:

```text
Use case: precise-object-edit. Asset type: existing website editorial illustration, 3:2 landscape.
Edit target: the attached sales illustration. Make one focused art-direction change: replace the entire colored rectangular background and colored surface wash with a flat, uniform, neutral near-white paper backdrop, exact target #fbfbf9, from edge to edge. The backdrop should have no vignette, gradient, hue cast, paper grain, border, or colored rectangle.
Preserve ALL recognizable object arrangement, proportions, perspective, contours, and fine black stipple/engraving detail: spiral notebook at center-left, pen below, call brief behind it, and modest headset at right. Maintain the same object bounds, placement, scale, and comfortable negative space as the original image so it fits the same 320–400 pixel editorial column. Keep the same 3:2 framing.
Reduce only the broad dense cast-shadow masses around the objects: confine shadow to delicate, sparse black stipple close to contact edges. Keep internal object shading and fine ink detail. Object interior paper and cream surfaces should be neutral near-white, without the previous colored reflected wash.
Predominantly crisp black ink. Retain only the existing tiny blue check and underline on the reviewed notebook item; the tiny accent should remain subtle. No new objects, rearrangements, new text, logos, badges, generic icons, or extra marks. This is careful background and visual-weight cleanup of the existing illustration, not a redraw into another style.
```
