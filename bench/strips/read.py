# Reading strip: Kimi K3 in OpenCode reads all of RFC 9110 for its
# conditional request rules, as it ran. The document is drawn as a signal,
# one column per group of lines, as tall as those lines are long. Each read
# call lights the lines it returned, each grep marks the lines it matched,
# and the rules in the answer stack under the lines they cite. Times come
# from the OpenCode session export, and the rules from Ennodia's run record.
#
#   opencode export <session> > session.json
#   uv run --with pyqtgraph --with PyQt6 --with numpy bench/strips/read.py \
#     --doc rfc9110.txt --session session.json --run run.json

import argparse
import datetime
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from strip import PALETTE as C, WIDTH, Recorder, canvas, header  # noqa: E402

import numpy as np  # noqa: E402
import pyqtgraph as pg  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--doc", required=True)
parser.add_argument("--session", required=True, help="opencode export of the reading session")
parser.add_argument("--run", required=True, help="Ennodia's record of the run, with its answer")
parser.add_argument("--seconds", type=float, default=10.0)
args = parser.parse_args()

lines = pathlib.Path(args.doc).read_text().rstrip("\n").split("\n")
N = len(lines)
run = json.loads(pathlib.Path(args.run).read_text())["run"]
parse = lambda value: datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()  # noqa: E731
started, total = parse(run["createdAt"]), parse(run["endedAt"]) - parse(run["createdAt"])
rules = json.loads(re.search(r"```json\s*([\s\S]*?)```", run["finalAnswer"]).group(1))

# What each call returned. A read reports the lines it showed, and a grep
# prints the number of each line it matched.
session = json.loads(pathlib.Path(args.session).read_text())
calls = [part for message in session["messages"] for part in message.get("parts", []) if part.get("type") == "tool"]
reads, greps = [], []
for call in calls:
    output = str(call["state"].get("output", ""))
    at = call["state"]["time"]["start"] / 1000 - started
    numbers = [int(n) for n in re.findall(r"^\s*(\d+):", output, re.M)]
    if call["tool"] == "read" and numbers:
        reads.append({"t": at, "a": numbers[0], "b": numbers[-1]})
    elif call["tool"] == "bash" and numbers:
        greps.append({"t": at, "lines": numbers})
# The first reads started together and fill the top row. The reads that
# filled their gaps sit in the row below.
for read in reads:
    read["row"] = 0 if read["t"] < reads[0]["t"] + 5 else 1

LEFT, RIGHT = 16, WIDTH - 16
x_of = lambda line: LEFT + (line - 0.5) / N * (RIGHT - LEFT)  # noqa: E731

# The document as a signal: how much ink each column's lines carry,
# stretched so that prose, tables, and blank runs differ at a glance.
COLUMNS = 300
edges = np.linspace(0, N, COLUMNS + 1).astype(int)
ink = np.array([sum(1 for ch in line if not ch.isspace()) for line in lines], float)
level = np.array([ink[a:b].mean() for a, b in zip(edges[:-1], edges[1:])])
low, high = np.percentile(level, [3, 97])
level = np.clip((level - low) / (high - low), 0, 1) * 0.85 + 0.15
centers = np.array([x_of((a + b) / 2) for a, b in zip(edges[:-1], edges[1:])])
column_width = (RIGHT - LEFT) / COLUMNS * 0.62

# Top to bottom under the header: two rows of read brackets, the text,
# a row of grep ticks, and the stacked rules.
widget, plot = canvas(pixels=True)
readout, top = header(plot, "READING · RFC 9110")
WAVE_H = 18
WAVE_Y = top - 17 - WAVE_H
TICK_Y = WAVE_Y - WAVE_H - 13
heights = 2 * WAVE_H * level
plot.addItem(pg.BarGraphItem(x=centers, y0=WAVE_Y - heights / 2, height=heights, width=column_width, brush=C["line"], pen=None))
lit = pg.BarGraphItem(x=centers, y0=WAVE_Y, height=np.zeros(COLUMNS), width=column_width, brush=C["subtle"], pen=None)
plot.addItem(lit)

# One bracket per read call, above the text.
brackets = []
for read in reads:
    y = top - 2 - 7 * read["row"]
    xs = [x_of(read["a"]), x_of(read["a"]), x_of(read["b"]), x_of(read["b"])]
    item = pg.PlotCurveItem(xs, [y - 3, y, y, y - 3], pen=pg.mkPen(C["deep"], width=2))
    item.setVisible(False)
    plot.addItem(item)
    brackets.append((read, item))

# One tick per matched line, just under the text.
ticks = []
for grep in greps:
    xs = np.repeat([x_of(line) for line in grep["lines"]], 2)
    ys = np.tile([TICK_Y, TICK_Y + 6], len(grep["lines"]))
    item = pg.PlotCurveItem(xs, ys, connect="pairs", pen=pg.mkPen(C["mid"], width=1.5))
    item.setVisible(False)
    plot.addItem(item)
    ticks.append((grep["t"], item))

# The answer's rules, stacked under the lines they cite.
STEP = 5
stacks: dict[int, int] = {}
dots = []
for rule in sorted(rules, key=lambda rule: rule["line"]):
    column = int(x_of(rule["line"]) // STEP)
    height = stacks.get(column, 0)
    stacks[column] = height + 1
    dots.append((column * STEP + STEP / 2, TICK_Y - 7 - height * STEP))
dot_item = pg.ScatterPlotItem(symbol="s", size=4, pen=None, brush=pg.mkBrush(C["accent"]))
plot.addItem(dot_item)

# How much of the text a read has shown by time t. A read returns at once,
# so each one sweeps its lines in over six seconds to stay visible.
SWEEP = 6.0
def read_lines(t: float) -> np.ndarray:
    seen = np.zeros(N + 1, bool)
    for read in reads:
        if t >= read["t"]:
            upto = read["a"] + (read["b"] - read["a"]) * min(1.0, (t - read["t"]) / SWEEP)
            seen[read["a"]:int(upto) + 1] = True
    return seen[1:]


recorder = Recorder(widget)
frames = int(args.seconds * 24)
for n in range(frames):
    t = min(total, total * n / (frames * 0.85))
    seen = read_lines(t)
    fraction = np.array([seen[a:b].mean() if b > a else 0 for a, b in zip(edges[:-1], edges[1:])])
    shown = np.where(fraction >= 0.5, heights, 0)
    lit.setOpts(y0=WAVE_Y - shown / 2, height=shown)
    for read, item in brackets:
        item.setVisible(bool(t >= read["t"]))
    for at, item in ticks:
        item.setVisible(bool(t >= at))
    # The rules arrive with the answer and drop in over a second of film.
    count = 0 if n < frames * 0.85 else min(len(dots), int(len(dots) * (n - frames * 0.85) / 24) + 1)
    dot_item.setData(pos=dots[:count])
    minutes, seconds = divmod(int(t), 60)
    clock = f"T+{minutes:02d}:{seconds:02d}"
    readout.setText(f"{clock}  {count} RULES" if count else f"{clock}  {int(seen.sum()):,} LINES")
    recorder.frame()
recorder.save("read-strip", poster_at=0.99)
print(len(reads), "reads,", sum(len(g["lines"]) for g in greps), "grep hits,", len(rules), "rules,", round(total), "s, lowest dot at", min(y for _, y in dots))
