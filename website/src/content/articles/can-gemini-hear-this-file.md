---
title: "Can Gemini hear this file?"
description: "A Codex conversation needed to know what an audio file said. Ennodia handed the file to Gemini through Antigravity. The MP3 worked. FLAC and WAV told a different story."
kind: "Field note"
published: 2026-09-25
recorded: 2026-09-10
rank: 1
agents: ["Codex", "Antigravity", "Gemini 3.8 Flash"]
tags: ["audio", "native media"]
devtoTags: ["ai", "gemini", "mcp", "showdev"]
series: "Ennodia field notes"
related: "/docs/reference/supported-harnesses/#antigravity"
---

Most coding agents read text well. Few of them can listen. When a Codex conversation needed to know what an audio file said, the answer had to come from another model.

Gemini models accept audio natively. The open question was narrower. Does that ability survive the trip through a command-line agent, launched from another agent’s conversation? We ran the smallest useful check on September 10, 2026.

## The setup

Ennodia doesn’t upload media. It starts the selected agent with a text prompt that names a local file and a range.[^transport] The worker then has to open the file with its own tools.

For Antigravity, that matters. Its documented headless input accepts text blocks and rejects media blocks.[^headless] Any listening has to happen through the agent’s native file tool, `view_file`.

The primary agent chose the harness and model explicitly: Antigravity 1.2.0 with `gemini-3.8-flash-medium`. The request mentioned an audio file, so Ennodia added its media input guidance to the prompt.

<figure class="data-figure">
<div class="data-figure-head"><span class="label"><span class="figure-number">Fig. 1</span> Run receipt</span></div>
<dl class="receipt">
<div><dt>Elapsed</dt><dd class="receipt-big">20.0 s</dd></div>
<div><dt>Status</dt><dd class="receipt-big">Succeeded</dd></div>
<div><dt>Run</dt><dd>e16d914d</dd></div>
<div><dt>Harness</dt><dd>Antigravity 1.2.0</dd></div>
<div><dt>Requested model</dt><dd>gemini-3.8-flash-medium</dd></div>
<div><dt>Input</dt><dd>MP3, 8 s, range 0 to 8 s</dd></div>
</dl>
<figcaption>Condensed from the sanitized receipt. The original audio, spoken excerpt, prompt, and local paths are omitted.</figcaption>
</figure>

## What came back

The worker returned the spoken words from the sample. It reported that it used `view_file` on the entire eight-second file. The whole run took 20 seconds, from start to recorded result.

<figure class="data-figure">
<div class="data-figure-head"><span class="label"><span class="figure-number">Fig. 2</span> Run events, UTC</span></div>
<ol class="timeline">
<li><time>11:00:30.209</time><span>Run started with one selected harness.</span></li>
<li><time>11:00:30.210</time><span>Media input guidance added to the worker prompt.</span></li>
<li><time>11:00:50.248</time><span>The worker process exited with code 0.</span></li>
<li><time>11:00:50.250</time><span>Ennodia completed the run and recorded its result.</span></li>
</ol>
</figure>

The next day, a separate process read the run back from local history. Its final answer matched the captured result. The task still showed the input guidance event.[^receipt]

## Three formats, three outcomes

The same configuration didn’t handle every format. On the same day, a FLAC file and a comparison of four WAV samples went differently.[^harness]

<figure class="data-figure">
<div class="data-figure-head"><span class="label"><span class="figure-number">Fig. 3</span> Formats tried on September 10, 2026</span></div>
<ul class="outcomes">
<li><span class="format">MP3</span><span>One eight-second sample returned its spoken words.</span><span class="outcome outcome-pass">Succeeded</span></li>
<li><span class="format">FLAC</span><span>Rejected as the unsupported type audio/x-flac.</span><span class="outcome outcome-fail">Rejected</span></li>
<li><span class="format">WAV</span><span>One comparison of four samples timed out without output.</span><span class="outcome outcome-open">Unresolved</span></li>
</ul>
<figcaption>Antigravity 1.2.0 with Gemini 3.8 Flash Medium. These observations apply to that configuration only.</figcaption>
</figure>

The WAV result doesn’t show that WAV fails. A timeout with four files can come from file size, task size, or the time limit. The question stays open.

The Gemini API publishes its own list of audio formats.[^api] That list describes a separate interface. It doesn’t guarantee what `view_file` can open inside the CLI.

## What this shows, and what it doesn’t

This was one listening check. It shows that a Codex conversation can reach Gemini’s native listening through Ennodia and Antigravity, for one short MP3.

- Tool use is worker-reported. The record has no independent provider trace.
- A spoken excerpt and an exit code don’t establish transcription or cleanup quality.
- The run didn’t compare audio cleanup outputs or rank alternatives.
- The 20 seconds describe this run only. They aren’t a speed or cost benchmark.

For a larger audio job, start with a short excerpt like this one. Match the excerpts, levels, and references before you compare candidates.

## Try it

Paste this into the conversation that has the audio file:

```text
The user sent me an audio file. Can anyone listen to it natively?
Check the available agents and try a short excerpt first.
```

The request has your agent list the installed agents, choose one with native audio access, and probe a short range first. Record the file, range, model, and task ID with the answer.

[^transport]: Ennodia passes local paths in a text prompt. See [Media inputs](/docs/reference/supported-harnesses/#media-inputs).
[^headless]: Antigravity documents its [headless input](https://antigravity.google/docs/cli/headless/#send-a-prompt). Its [changelog](https://antigravity.google/changelog) records audio attachment changes.
[^receipt]: The [sanitized receipt](/examples/native-audio-check.json) includes the run and task IDs, timestamps, events, and limits.
[^harness]: The [Antigravity notes](/docs/reference/supported-harnesses/#antigravity) in the Ennodia docs record all three observations.
[^api]: See the [Gemini API audio guide](https://ai.google.dev/gemini-api/docs/audio).
