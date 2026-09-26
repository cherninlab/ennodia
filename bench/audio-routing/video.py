# Renders a study's trials as a short video with pyqtgraph: one row per
# condition, one mark per clip, filled in clip by clip. Right answers are
# filled dots, wrong ones hollow, and failed runs crosses. Every mark comes
# from trials.jsonl, so the video shows the recorded run and nothing else.
#
#   uv run --with pyqtgraph --with PyQt6 --with numpy bench/audio-routing/video.py \
#     --run bench/results/audio-routing/<run-name> --out website/public/studies/audio-routing.mp4

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pyqtgraph as pg  # noqa: E402
from PyQt6 import QtCore, QtGui, QtWidgets  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--run", required=True)
parser.add_argument("--out", required=True)
parser.add_argument("--fps", type=int, default=30)
args = parser.parse_args()

run = pathlib.Path(args.run)
trials = [json.loads(line) for line in (run / "trials.jsonl").read_text().splitlines() if line.strip()]
summary_file = run / "summary.json"
summary = json.loads(summary_file.read_text()) if summary_file.exists() else {}
clips = sorted({trial["clip"] for trial in trials})

# Rows, top to bottom. The two Codex rows sit together, since they differ only in Ennodia.
ROWS = [
    ("codex-alone", "Codex alone"),
    ("codex-ennodia", "Codex + Ennodia"),
    ("claude-alone", "Claude alone"),
    ("gemini-direct", "Gemini"),
]
rows = [(key, label) for key, label in ROWS if any(trial["condition"] == key for trial in trials)]

PAPER, INK, SUBTLE, LINE, RIGHT, WRONG = "#f6f4ee", "#000000", "#666666", "#d8dad0", "#4f6339", "#adb6a5"
WIDTH, HEIGHT = 1280, 720

app = QtWidgets.QApplication([])
root = pathlib.Path(__file__).resolve().parents[2]
font_id = QtGui.QFontDatabase.addApplicationFont(str(root / "website/public/fonts/martian-mono-regular.ttf"))
mono = QtGui.QFontDatabase.applicationFontFamilies(font_id)[0]
pg.setConfigOptions(antialias=True, background=PAPER, foreground=SUBTLE)

widget = pg.GraphicsLayoutWidget()
widget.resize(WIDTH, HEIGHT)
widget.ci.setContentsMargins(48, 40, 48, 40)
title = widget.addLabel(f"Can Codex answer questions about audio? {len(clips)} MMAU clips", color=INK, size="15pt", col=0)
title.item.setFont(QtGui.QFont(mono, 15))
widget.nextRow()
plot = widget.addPlot(col=0)
plot.setMouseEnabled(False, False)
plot.hideButtons()
plot.setXRange(0.5, len(clips) + 0.5, padding=0)
plot.setYRange(-0.6, len(rows) - 0.4, padding=0)
plot.invertY(True)
tick_font = QtGui.QFont(mono, 11)
left = plot.getAxis("left")
left.setTicks([[(index, label) for index, (_, label) in enumerate(rows)]])
left.setWidth(190)
bottom = plot.getAxis("bottom")
bottom.setTicks([[(index + 1, str(index + 1)) for index in range(0, len(clips), 5)] + [(len(clips), str(len(clips)))]])
bottom.setLabel("clip", color=SUBTLE, **{"font-family": mono, "font-size": "11pt"})
for axis in (left, bottom):
    axis.setTickFont(tick_font)
    axis.setPen(pg.mkPen(LINE))
    axis.setTextPen(pg.mkPen(SUBTLE))
for index in range(len(rows)):
    plot.addItem(pg.InfiniteLine(pos=index, angle=0, pen=pg.mkPen(LINE, width=1)))

marks = pg.ScatterPlotItem(pxMode=True)
plot.addItem(marks)
scores = []
for index in range(len(rows)):
    text = pg.TextItem("", color=INK, anchor=(0, 0.5))
    text.setFont(QtGui.QFont(mono, 12))
    text.setPos(len(clips) + 0.9, index)
    plot.addItem(text)
    scores.append(text)
plot.getViewBox().setLimits(xMax=len(clips) + 5)
plot.setXRange(0.5, len(clips) + 4.5, padding=0)

by_key = {(trial["condition"], trial["clip"]): trial for trial in trials}
frames = pathlib.Path(tempfile.mkdtemp())
frame = 0


def spot(row: int, column: int, trial: dict) -> dict:
    failed = trial.get("exitCode") != 0 or trial.get("timedOut")
    if failed:
        return {"pos": (column, row), "symbol": "x", "size": 11, "pen": pg.mkPen(WRONG, width=1.5), "brush": pg.mkBrush(PAPER)}
    if trial["correct"]:
        return {"pos": (column, row), "symbol": "o", "size": 11, "pen": pg.mkPen(RIGHT, width=1.5), "brush": pg.mkBrush(RIGHT)}
    return {"pos": (column, row), "symbol": "o", "size": 11, "pen": pg.mkPen(WRONG, width=1.5), "brush": pg.mkBrush(PAPER)}


def capture(count: int = 1) -> None:
    global frame
    app.processEvents()
    image = widget.grab()
    for _ in range(count):
        image.save(str(frames / f"f{frame:05d}.png"))
        frame += 1


# Clips fill in one column at a time, about six columns a second.
spots: list[dict] = []
for column, clip in enumerate(clips, 1):
    for row, (key, _) in enumerate(rows):
        trial = by_key.get((key, clip))
        if trial:
            spots.append(spot(row, column, trial))
    marks.setData(spots)
    for row, (key, _) in enumerate(rows):
        done = [by_key[(key, c)] for c in clips[:column] if (key, c) in by_key]
        scores[row].setText(f"{sum(t['correct'] for t in done)}/{len(done)}")
    capture(max(1, args.fps // 6))

# Hold the final state, with the chance line named under the plot.
chance = summary.get("chance")
# The label renders HTML, which collapses runs of spaces, so items get dots.
legend = " · ".join(["filled: right", "hollow: wrong", "x: the run failed"] + ([f"chance: {chance} of {len(clips)}"] if chance is not None else []))
note = widget.addLabel(legend, color=SUBTLE, size="11pt", row=2, col=0)
note.item.setFont(QtGui.QFont(mono, 11))
capture(args.fps * 4)

out = pathlib.Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
encode = ["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(args.fps), "-i", str(frames / "f%05d.png")]
if out.suffix == ".webm":
    subprocess.run(encode + ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-pix_fmt", "yuv420p", str(out)], check=True)
else:
    subprocess.run(encode + ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-movflags", "+faststart", str(out)], check=True)
poster = out.with_suffix(".jpg")
shutil.copy(sorted(frames.glob("*.png"))[-1], out.with_suffix(".png"))
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(out.with_suffix(".png")), "-q:v", "3", str(poster)], check=True)
out.with_suffix(".png").unlink()
shutil.rmtree(frames)
print(out, poster)
