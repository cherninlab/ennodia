# Audio routing study

Can an agent that cannot hear answer questions about audio once Ennodia lets it hand each clip to an agent that can?

The study uses [MMAU test-mini](https://huggingface.co/datasets/gamma-lab-umd/MMAU-test-mini), revision `ccd9696c`: multiple-choice questions about sound, music, and speech clips.
Its CC-BY-NC-4.0 licence keeps the audio and question text out of this repository.
Every file the study writes goes under `bench/results/`, which git ignores.

## Conditions

| Condition | Agent | Can it hear? |
| --- | --- | --- |
| `codex-alone` | Codex with GPT-6 Astra, no MCP servers | No |
| `codex-ennodia` | The same Codex with only Ennodia's server, told that Ennodia is there | Through Ennodia |
| `claude-alone` | Claude Code with Opus 5.5, no MCP servers | No |
| `gemini-direct` | Gemini 3.8 Flash in Antigravity, started by Ennodia | Yes |

The two Codex conditions differ only in Ennodia.
Codex servers that a command-line override cannot turn off stay on in both, and the protocol file names them.
Headless Codex never asks for approval, so the Ennodia condition approves `ennodia_run` for that server only.
The sandbox stays read-only.

## Run it

1. Download `test_mini.parquet` from the dataset page, at the revision above.
2. Draw the sample. It is seeded, with ten clips from each task:

   ```sh
   uv run --with pyarrow bench/audio-routing/extract.py --parquet path/to/test_mini.parquet --out bench/results/audio-routing/data
   ```

3. Run every condition:

   ```sh
   bun bench/audio-routing/run.ts --data bench/results/audio-routing/data --out bench/results/audio-routing/<run-name>
   ```

The run writes `protocol.json` before the first trial.
It records the manifest hash, clips, models, CLI versions, and Ennodia's commit.

## Rules

- Each trial gets a fresh directory with only its clip. The answer key is read after the trial ends.
- A failure, timeout, or reply without an answer line counts as wrong. Every attempt is kept.
- Each trial records the agent's own answer to the question "did you listen?". A claim is not proof, so Codex's events are saved to check the handoff.
- Chance differs by item, because some items have two choices and some five. The summary reports expected chance for the sample.
- Text-only agents can beat chance from the wording of a question. The alone conditions measure that.
