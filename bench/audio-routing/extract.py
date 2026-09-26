# Draws a seeded sample from MMAU test-mini, balanced across its sound, music,
# and speech tasks, and writes each clip as an MP3 with a manifest. The answer
# key goes to its own file, which workers never receive. The dataset's
# CC-BY-NC-4.0 licence keeps its audio and question text out of this repo,
# so everything here writes under bench/results/, which git ignores.
#
#   uv run --with pyarrow bench/audio-routing/extract.py \
#     --parquet path/to/test_mini.parquet --out bench/results/audio-routing/data

import argparse
import hashlib
import json
import pathlib
import random
import subprocess

import pyarrow.parquet as pq

parser = argparse.ArgumentParser()
parser.add_argument("--parquet", required=True)
parser.add_argument("--out", required=True)
parser.add_argument("--per-task", type=int, default=10)
parser.add_argument("--seed", type=int, default=20260926)
args = parser.parse_args()

table = pq.read_table(args.parquet, columns=["instruction", "choices", "answer", "other_attributes"])
rows = table.to_pylist()
for index, row in enumerate(rows):
    row["index"] = index
    row["attrs"] = json.loads(row["other_attributes"])

rng = random.Random(args.seed)
sample = []
for task in ("sound", "music", "speech"):
    ids = sorted(row["attrs"]["id"] for row in rows if row["attrs"]["task"] == task)
    chosen = set(rng.sample(ids, args.per_task))
    sample += sorted((row for row in rows if row["attrs"]["id"] in chosen), key=lambda row: row["attrs"]["id"])

out = pathlib.Path(args.out)
(out / "clips").mkdir(parents=True, exist_ok=True)
audio = pq.read_table(args.parquet, columns=["context"]).column("context")
manifest, key = [], {}
for number, row in enumerate(sample, 1):
    clip = f"clip-{number:02d}"
    wav = audio[row["index"]].as_py()["bytes"]
    mp3 = out / "clips" / f"{clip}.mp3"
    # MP3, because Antigravity read MP3 and rejected FLAC in Ennodia's tests.
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", "pipe:0", "-ac", "1", "-ar", "44100", "-b:a", "128k", str(mp3)],
                   input=wav, check=True)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
                           capture_output=True, text=True, check=True)
    manifest.append({
        "clip": clip,
        "id": row["attrs"]["id"],
        "task": row["attrs"]["task"],
        "difficulty": row["attrs"]["difficulty"],
        "seconds": round(float(probe.stdout), 1),
        "question": row["instruction"],
        "choices": row["choices"],
    })
    key[clip] = row["answer"]

(out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
(out / "answer-key.json").write_text(json.dumps(key, indent=2, ensure_ascii=False))
digest = hashlib.sha256((out / "manifest.json").read_bytes()).hexdigest()
print(f"{len(manifest)} clips, seed {args.seed}, manifest sha256 {digest}")
