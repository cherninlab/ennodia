# Orchestrating strip: the audio study as it ran. One lane per setup, one bar
# per trial, and in the Codex + Ennodia lane, each handoff to Gemini as a
# short bar below the trial that started it. Trial times come from the run's
# own record; handoff times come from Ennodia's run history.
#
#   uv run --with pyqtgraph --with PyQt6 --with numpy bench/strips/orchestrate.py --run bench/results/audio-routing/<run>

import argparse
import datetime
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from strip import HEIGHT, PALETTE as C, Recorder, canvas, label, mono  # noqa: E402

import pyqtgraph as pg  # noqa: E402
from PyQt6 import QtWidgets  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--run", required=True)
parser.add_argument("--history", default=str(pathlib.Path.home() / ".ennodia/history/runs.jsonl"))
parser.add_argument("--seconds", type=float, default=10.0)
args = parser.parse_args()

run = pathlib.Path(args.run)
protocol = json.loads((run / "protocol.json").read_text())
trials = [json.loads(line) for line in (run / "trials.jsonl").read_text().splitlines() if line.strip()]
start = datetime.datetime.fromisoformat(protocol["started"].replace("Z", "+00:00"))

LANES = [("codex-alone", "CODEX"), ("codex-ennodia", "CODEX + ENNODIA"), ("claude-alone", "CLAUDE"), ("gemini-direct", "GEMINI")]
# Within a setup, clips ran one after another, so each trial starts where
# the one before it ended.
bars = []
for lane, (condition, _) in enumerate(LANES):
    t = 0.0
    for trial in sorted((tr for tr in trials if tr["condition"] == condition), key=lambda tr: tr["clip"]):
        seconds = trial["elapsedMs"] / 1000
        failed = trial.get("exitCode") != 0 or trial.get("timedOut")
        bars.append({"lane": lane, "t0": t, "t1": t + seconds, "state": "failed" if failed else "right" if trial["correct"] else "wrong"})
        t += seconds

# Handoffs: runs that Codex started through its own Ennodia server, found in
# the history by the trial directory named in their prompt.
end = start + datetime.timedelta(seconds=max(bar["t1"] for bar in bars) + 60)
handoffs = []
with open(args.history) as history:
    for line in history:
        if 'ennodia-audio-codex-ennodia' not in line:
            continue
        record = json.loads(line)["run"]
        created = datetime.datetime.fromisoformat(record["createdAt"].replace("Z", "+00:00"))
        ended = datetime.datetime.fromisoformat((record.get("endedAt") or record["updatedAt"]).replace("Z", "+00:00"))
        if start <= created <= end:
            handoffs.append({"t0": (created - start).total_seconds(), "t1": (ended - start).total_seconds(), "ok": record["status"] == "succeeded"})

total = max(bar["t1"] for bar in bars)
widget, plot = canvas()
lanes_y = {lane: len(LANES) - 1 - lane for lane in range(len(LANES))}
# The left margin holds lane names, with room for the longest one. The top
# band holds the two tags.
MARGIN = total * 0.25
plot.setXRange(-MARGIN, total * 1.01, padding=0)
plot.setYRange(-0.7, len(LANES) + 0.95, padding=0)
for lane, (_, name) in enumerate(LANES):
    y = lanes_y[lane]
    plot.addItem(pg.InfiniteLine(pos=y, angle=0, pen=pg.mkPen(C["line"], width=1)))
    tag = pg.TextItem(name, color=C["subtle"], anchor=(0, 0.5))
    tag.setFont(mono(8))
    tag.setPos(-MARGIN * 0.97, y)
    plot.addItem(tag)

items = []
for bar in bars:
    y = lanes_y[bar["lane"]]
    rect = QtWidgets.QGraphicsRectItem(bar["t0"] + 0.6, y - 0.22, max(1.0, bar["t1"] - bar["t0"] - 1.2), 0.44)
    right = bar["state"] == "right"
    rect.setPen(pg.mkPen(C["accent"] if right else C["subtle"], width=1, cosmetic=True))
    rect.setBrush(pg.mkBrush(C["accent"] if right else C["card"]))
    rect.setVisible(False)
    plot.addItem(rect)
    items.append((bar["t0"], rect))
    if bar["state"] == "failed":
        cross = pg.ScatterPlotItem([(bar["t0"] + bar["t1"]) / 2], [y], symbol="x", size=9, pen=pg.mkPen(C["subtle"], width=1.5))
        cross.setVisible(False)
        plot.addItem(cross)
        items.append((bar["t0"], cross))
# Each handoff hangs below the Codex + Ennodia lane, joined to it by a spike.
lane_y = lanes_y[1]
for handoff in handoffs:
    spike = pg.PlotCurveItem([handoff["t0"], handoff["t0"]], [lane_y - 0.22, lane_y - 0.5], pen=pg.mkPen(C["deep"], width=1))
    rect = QtWidgets.QGraphicsRectItem(handoff["t0"], lane_y - 0.62, max(0.8, handoff["t1"] - handoff["t0"]), 0.12)
    rect.setPen(pg.mkPen(C["deep"], width=1, cosmetic=True))
    rect.setBrush(pg.mkBrush(C["deep"] if handoff["ok"] else C["card"]))
    for item in (spike, rect):
        item.setVisible(False)
        plot.addItem(item)
        items.append((handoff["t0"], item))

playhead = pg.InfiniteLine(angle=90, pen=pg.mkPen(C["ink"], width=1))
plot.addItem(playhead)
chip = label(plot, "ORCHESTRATING · AUDIO STUDY", -MARGIN * 0.97, len(LANES) + 0.9)
clock = label(plot, "", total * 1.0, len(LANES) + 0.9, anchor=(1, 0), dark=False)

recorder = Recorder(widget)
frames = int(args.seconds * 24)
for n in range(frames):
    t = min(total, total * n / (frames * 0.85))
    playhead.setValue(t)
    for t0, item in items:
        item.setVisible(bool(t >= t0))
    done = sum(1 for bar in bars if bar["t1"] <= t)
    minutes, seconds = divmod(int(t), 60)
    clock.setText(f" T+{minutes:02d}:{seconds:02d}   {done}/{len(bars)} TRIALS   {sum(1 for h in handoffs if h['t0'] <= t)} HANDOFFS ")
    recorder.frame()
recorder.save("orchestrate-strip")
print(len(bars), "trials,", len(handoffs), "handoffs,", round(total), "s")
