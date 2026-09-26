# Review strip: two agents review one patch at the same time, and Ennodia's
# Compare maps where the reviews agree and differ. The two changed files are
# drawn as a signal, one column per group of lines, with the patch's lines in
# olive. Each finding hangs above the line it cites, sized by severity. Each
# range the second reviewer cites sits below. The Judge's map fills the
# meters at the right. Times come from the OpenCode session export and the
# Compare record.
#
#   uv run --with pyqtgraph --with PyQt6 --with numpy bench/strips/review.py \
#     --run run.json --patch patch.diff --files <reviewed tree> --session kimi-session.json

import argparse
import datetime
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from strip import PALETTE as C, WIDTH, Recorder, canvas, header, mono, text_width  # noqa: E402

import numpy as np  # noqa: E402
import pyqtgraph as pg  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--run", required=True, help="the panel record: both reviews and the Compare")
parser.add_argument("--patch", required=True)
parser.add_argument("--files", required=True, help="a tree with the files as the reviewers saw them")
parser.add_argument("--session", required=True, help="opencode export of the second review")
parser.add_argument("--seconds", type=float, default=10.0)
args = parser.parse_args()

record = json.loads(pathlib.Path(args.run).read_text())
parse = lambda value: datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()  # noqa: E731
session = json.loads(pathlib.Path(args.session).read_text())
started = session["info"]["time"]["created"] / 1000
compare = record["compare"]
reviews = {task["label"]: task for task in record["tasks"]}
findings = {label: json.loads(re.findall(r"```json\s*([\s\S]*?)```", task["answer"])[-1]) for label, task in reviews.items()}
events = {event["type"]: parse(event["at"]) - started for event in compare["events"]}
judged, total = events["judge-succeeded"], parse(compare["endedAt"]) - started

# The changed files, in patch order, with the lines the patch added.
# In patch order, which keeps every label and finding within the part of
# the strip that a phone shows.
names = re.findall(r"^\+\+\+ b/(\S+)", pathlib.Path(args.patch).read_text(), re.M)
added: dict[str, set[int]] = {name: set() for name in names}
current, line = None, 0
for text in pathlib.Path(args.patch).read_text().splitlines():
    if text.startswith("+++ b/"):
        current = text[6:]
    elif text.startswith("@@"):
        line = int(re.search(r"\+(\d+)", text).group(1))
    elif current and text.startswith("+"):
        added[current].add(line)
        line += 1
    elif current and not text.startswith("-"):
        line += 1
files = {name: (pathlib.Path(args.files) / name).read_text().splitlines() for name in names}

LANES = [("claude", "CLAUDE CODE"), ("kimi", "OPENCODE")]
METERS = [("AGREE", "consensus"), ("DIFFER", "contradictions"), ("PARTIAL", "partial_coverage"),
          ("UNIQUE", "unique_insights"), ("BLIND", "blind_spots")]
PITCH = 26
X0 = 8 + max(text_width(title, 8) for _, title in LANES) + 12
# The files end well short of the meters, so that the findings fall in the
# first 680 pixels, which a 320-pixel phone shows.
X1, GAP_LINES = 905, 40
span = sum(len(lines) for lines in files.values()) + GAP_LINES * (len(files) - 1)
offsets, at = {}, 0
for name in names:
    offsets[name] = at
    at += len(files[name]) + GAP_LINES
x_of = lambda name, number: X0 + (offsets[name] + number - 0.5) / span * (X1 - X0)  # noqa: E731

widget, plot = canvas(pixels=True)
readout, top = header(plot, "REVIEW · PATCH")
LANE_Y = {"claude": top - 12, "kimi": 18}
WAVE_Y, WAVE_H = (LANE_Y["claude"] + LANE_Y["kimi"]) / 2 + 2, 15

# The files as a signal, as in the reading strip: how much ink each column's
# lines carry. Columns that hold the patch's lines are olive.
COLUMN = 3.0
bars = {"x": [], "h": [], "patch": []}
for name in names:
    lines = files[name]
    count = max(1, int((x_of(name, len(lines)) - x_of(name, 1)) / COLUMN))
    edges = np.linspace(0, len(lines), count + 1).astype(int)
    ink = np.array([sum(1 for ch in text if not ch.isspace()) for text in lines], float)
    for a, b in zip(edges[:-1], edges[1:]):
        bars["x"].append(x_of(name, (a + b) / 2 + 0.5))
        bars["h"].append(ink[a:b].mean() if b > a else 0)
        bars["patch"].append(any(number in added[name] for number in range(a + 1, b + 1)))
level = np.array(bars["h"])
low, high = np.percentile(level, [3, 97])
heights = 2 * WAVE_H * (np.clip((level - low) / (high - low), 0, 1) * 0.85 + 0.15)
patch = np.array(bars["patch"])
for mask, color in ((~patch, C["line"]), (patch, C["accent"])):
    plot.addItem(pg.BarGraphItem(x=np.array(bars["x"])[mask], y0=WAVE_Y - heights[mask] / 2, height=heights[mask],
                                 width=COLUMN * 0.62, brush=color, pen=None))
for name in names:
    tag = pg.TextItem(name.split("/")[-1].upper(), color=C["subtle"], anchor=(0, 0))
    tag.setFont(mono(5))
    tag.setPos(x_of(name, 1), WAVE_Y - WAVE_H - 2)
    plot.addItem(tag)

items = []
for lane, title in LANES:
    tag = pg.TextItem(title, color=C["subtle"], anchor=(0, 0.5))
    tag.setFont(mono(8))
    tag.setPos(8, LANE_Y[lane])
    plot.addItem(tag)

# Findings above the text, each on a stem to the line it cites.
SIZE = {"high": 11, "medium": 8, "low": 6}
for finding in findings["claude"]:
    x = x_of(finding["file"], finding["line"])
    assert x < 680, f"a finding at {x:.0f} px falls where a phone crops the strip"
    stem = pg.PlotCurveItem([x, x], [LANE_Y["claude"], WAVE_Y + WAVE_H + 2], pen=pg.mkPen(C["ink"], width=1))
    mark = pg.ScatterPlotItem([x], [LANE_Y["claude"]], symbol="s", size=SIZE[finding["severity"]], pen=None, brush=pg.mkBrush(C["ink"]))
    for item in (stem, mark):
        item.setVisible(False)
        plot.addItem(item)
        items.append((reviews["claude"]["elapsedMs"] / 1000, item))

# The second reviewer read both files early, then cited ranges it checked.
reads = []
for message in session["messages"]:
    for part in message.get("parts", []):
        if part.get("type") == "tool" and part["tool"] == "read":
            path = part["state"]["input"]["filePath"]
            name = next((name for name in names if path.endswith(name)), None)
            if name:
                reads.append((part["state"]["time"]["start"] / 1000 - started, name))
for when, name in reads:
    y = LANE_Y["kimi"] + 9
    xs = [x_of(name, 1), x_of(name, 1), x_of(name, len(files[name])), x_of(name, len(files[name]))]
    item = pg.PlotCurveItem(xs, [y - 3, y, y, y - 3], pen=pg.mkPen(C["line"], width=1.5))
    item.setVisible(False)
    plot.addItem(item)
    items.append((when, item))
cited = [(match.group(1), int(match.group(2)), int(match.group(3)))
         for match in re.finditer(r"(\w+(?:\.test)?\.ts):(\d+)-(\d+)", reviews["kimi"]["answer"])]
for file, a, b in dict.fromkeys(cited):
    name = next(name for name in names if name.endswith(file))
    xa, xb = x_of(name, a), x_of(name, b)
    y = LANE_Y["kimi"]
    bracket = pg.PlotCurveItem([xa, xa, xb, xb], [y + 5, y, y, y + 5], pen=pg.mkPen(C["ink"], width=2))
    stem = pg.PlotCurveItem([(xa + xb) / 2] * 2, [y + 5, WAVE_Y - WAVE_H - 2], pen=pg.mkPen(C["ink"], width=1))
    for item in (bracket, stem):
        item.setVisible(False)
        plot.addItem(item)
        items.append((reviews["kimi"]["elapsedMs"] / 1000, item))

# The Judge's map, one meter per kind of point: agreements, contradictions,
# partial coverage, unique insights, and blind spots. The meters carry no
# labels, for the same reason as the draw strip's swatches.
analysis = compare["analysis"]
for index, (title, key) in enumerate(METERS):
    x = WIDTH - 12 - (len(METERS) - index) * PITCH + PITCH / 2
    for k in range(len(analysis[key])):
        square = pg.ScatterPlotItem([x], [LANE_Y["kimi"] + k * 12], symbol="s", size=9, pen=None,
                                    brush=pg.mkBrush(C["accent"] if key == "contradictions" else C["subtle"]))
        square.setVisible(False)
        plot.addItem(square)
        items.append((judged + index * 2 + k * 0.5, square))

recorder = Recorder(widget)
frames = int(args.seconds * 24)
total_found = sum(len(found) for found in findings.values())
for n in range(frames):
    t = min(total, total * n / (frames * 0.85))
    for when, item in items:
        item.setVisible(bool(t >= when))
    minutes, seconds = divmod(int(t), 60)
    clock = f"T+{minutes:02d}:{seconds:02d}"
    if t >= total:
        text = f"{clock}  {len(analysis['contradictions'])} DISAGREE  {len(compare['advisor']['openQuestions'])} OPEN"
    elif t >= judged:
        text = f"{clock}  {len(analysis['contradictions'])} DISAGREE"
    elif t >= reviews["claude"]["elapsedMs"] / 1000:
        done = [label for label, task in reviews.items() if t >= task["elapsedMs"] / 1000]
        text = f"{clock}  {sum(len(findings[label]) for label in done)} FINDINGS"
    else:
        text = f"{clock}  READING"
    readout.setText(text)
    recorder.frame()
recorder.save("review-strip", poster_at=0.99)
print({label: len(found) for label, found in findings.items()}, "findings,", len(reads), "reads,", len(set(cited)), "cited ranges,",
      round(total), "s, judged at", round(judged), "s, all", total_found)
