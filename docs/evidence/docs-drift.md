---
title: Find stale documentation
description: Review current documentation without deleting useful historical records.
---

# Find stale documentation

A current guide can disagree with code while a historical document remains correct for its period.
This exercise gives an additional agent a bounded review task.

The fixture lives in `examples/docs-drift` in the Ennodia checkout.
It contains deliberate documentation errors and a labeled migration record.

## Try it

The recording below shows an actual MCP run from the release candidate checkout.
The final frame includes ten extra seconds for reading.

<video controls preload="metadata" aria-label="Recorded Ennodia documentation review" style="width:100%; height:auto;" src="/demos/docs-drift.mp4"></video>

The [terminal recording](/demos/docs-drift.cast) preserves the captured output and timing.
The text below provides the same findings without video.

1. Use a local checkout of Ennodia.
2. Run the fixture’s behavior check.

```sh
bun examples/docs-drift/check.ts
```

3. Give this request to your primary agent.

```text
Use Ennodia MCP to review examples/docs-drift in a separate read-only task.
Compare the current README with config.ts. Identify each conflicting claim.
Distinguish current instructions from the labeled historical migration record.
Return proposed corrections with file references. Bring the findings back here.
```

4. Review each proposed correction against the source.
5. Update the current guide in your copy.
6. Keep the historical migration record labeled as history.

## Check the result

The current implementation uses port `4545`, the variable `APP_PORT`, and the response `{ "ready": true }`.
The README contains three conflicting current claims.
The migration record describes the previous release and does not need the same changes.

A useful review finds the three conflicts and preserves the historical distinction.
A model can still miss a conflict or recommend deleting useful history.
This exercise has known answers. It is not a general benchmark.

## Recorded development trial

On September 6, 2026, an Antigravity task through Ennodia found all three current documentation conflicts.
It also identified the archive as a historical record that did not need changes.
The primary agent checked each finding against the fixture source.
This is one successful trial on a small known-answer example, not a general performance result.

The fixture includes `recorded-run.json` with the answer, task IDs, timing, and verification notes.
Local file URL prefixes were normalized for sharing.

The video records a later successful repetition through the candidate's MCP server.
It uses the configured default Antigravity model, with no model override.
The opt-in script starts one real agent using your configured provider access:

```sh
bun examples/docs-drift/demo.ts --live antigravity
```

Replace `antigravity` with another installed, authenticated harness ID when needed.
The recording uses the [asciicast format](https://docs.asciinema.org/manual/asciicast/v2/).
