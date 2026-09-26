# Compare strip: three agents solve one polyglot exercise at the same time,
# the tests run on each answer, and Ennodia's Compare reviews the answers
# and picks one. Each lane prints a solution as code: one column per source
# line, running down from its indent for its length. Threads join lines that
# two solutions share. Times and results come from the run's trial record.
#
#   uv run --with pyqtgraph --with PyQt6 --with numpy bench/strips/compare.py \
#     --run bench/results/polyglot/<run> --repo <polyglot-benchmark> --exercise python/bowling

import argparse
import difflib
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from strip import PALETTE as C, Recorder, canvas, header, mono, text_width  # noqa: E402

import numpy as np  # noqa: E402
import pyqtgraph as pg  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--run", required=True)
parser.add_argument("--repo", required=True, help="the polyglot benchmark checkout, for the test count")
parser.add_argument("--exercise", required=True, help="language/name, such as python/bowling")
parser.add_argument("--seconds", type=float, default=10.0)
args = parser.parse_args()

language, name = args.exercise.split("/")
run = pathlib.Path(args.run)
trials = {trial["condition"]: trial for trial in (json.loads(line) for line in (run / "trials.jsonl").read_text().splitlines() if line.strip())
          if trial["exercise"] == args.exercise}
practice = pathlib.Path(args.repo) / language / "exercises" / "practice" / name
tests = sum(len(re.findall(r"^\s*def test_", path.read_text(), re.M)) for path in practice.glob("*_test.py"))
team = trials["team"]
chosen = team["error"].removeprefix("chose ")

LANES = [("claude", "CLAUDE CODE"), ("codex", "CODEX"), ("kimi", "OPENCODE")]
suffix = ".py" if language == "python" else ".js"
source = {key: (run / "solutions" / language / name / f"{key}{suffix}").read_text().splitlines() for key, _ in LANES}

X0 = 8 + max(text_width(title, 8) for _, title in LANES) + 12
CODE_END, TESTS_AT, TEST_STEP = 870, 906, 11
step = (CODE_END - X0) / max(len(lines) for lines in source.values())

widget, plot = canvas(pixels=True)
readout, top = header(plot, f"COMPARE · {name.upper()}")
# Three bands of code with two gaps for threads, filling the space.
BAND, THREAD = 24, 13
TOPS = [top - 2 - lane * (BAND + THREAD) for lane in range(3)]
longest = max(len(line) for lines in source.values() for line in lines)
scale = BAND / longest


def print_of(lines: list[str], top: float) -> tuple[np.ndarray, np.ndarray]:
    """Segment pairs for a code print: each line runs down from its indent."""
    xs, ys = [], []
    for index, line in enumerate(lines):
        text = line.rstrip()
        if not text.strip():
            continue
        indent = len(text) - len(text.lstrip())
        x = X0 + (index + 0.5) * step
        xs += [x, x]
        ys += [top - indent * scale, top - len(text) * scale]
    return np.array(xs), np.array(ys)


prints = []
for lane, (key, title) in enumerate(LANES):
    tag = pg.TextItem(title, color=C["subtle"], anchor=(0, 0.5))
    tag.setFont(mono(8))
    tag.setPos(8, TOPS[lane] - BAND / 2)
    plot.addItem(tag)
    xs, ys = print_of(source[key], TOPS[lane])
    item = pg.PlotCurveItem(connect="pairs", pen=pg.mkPen(C["subtle"], width=step * 0.55))
    plot.addItem(item)
    squares = pg.ScatterPlotItem(symbol="s", size=7, pen=pg.mkPen(C["line"], width=1), brush=pg.mkBrush(C["card"]))
    squares.setData(x=[TESTS_AT + k * TEST_STEP for k in range(tests)], y=[TOPS[lane] - BAND / 2] * tests)
    plot.addItem(squares)
    prints.append({"key": key, "item": item, "xs": xs, "ys": ys, "squares": squares, "trial": trials[key]})

# Threads between neighbouring lanes, one per line the two solutions share.
threads = []
for upper, lower in ((0, 1), (1, 2)):
    a, b = source[LANES[upper][0]], source[LANES[lower][0]]
    norm = lambda lines: [" ".join(line.split()) for line in lines]  # noqa: E731
    match = difflib.SequenceMatcher(None, norm(a), norm(b), autojunk=False)
    y0, y1 = TOPS[upper] - BAND - 2, TOPS[lower] + 2
    for block in match.get_matching_blocks():
        for k in range(block.size):
            if not norm(a)[block.a + k]:
                continue
            xa, xb = X0 + (block.a + k + 0.5) * step, X0 + (block.b + k + 0.5) * step
            s = np.linspace(0, 1, 16)
            ease = s * s * (3 - 2 * s)
            threads.append((min(xa, xb), xa + (xb - xa) * ease, y0 + (y1 - y0) * s))
threads.sort(key=lambda thread: thread[0])
thread_item = pg.PlotCurveItem(pen=pg.mkPen(C["subtle"], width=1))
thread_item.setOpacity(0.55)
plot.addItem(thread_item)
cursor = pg.PlotCurveItem([0, 0], [TOPS[2] - BAND, TOPS[0]], pen=pg.mkPen(C["ink"], width=1))
cursor.setVisible(False)
plot.addItem(cursor)

# The singles run side by side. Compare starts when the last one finishes
# and reviews for as long as the team's trial took.
written = {entry["key"]: entry["trial"]["elapsedMs"] / 1000 for entry in prints}
review_from = max(written.values())
total = review_from + team["elapsedMs"] / 1000
FILL = 6.0

recorder = Recorder(widget)
frames = int(args.seconds * 24)
for n in range(frames):
    t = min(total, total * n / (frames * 0.85))
    passed = 0
    for entry in prints:
        done = min(1.0, t / written[entry["key"]])
        count = int(len(entry["xs"]) / 2 * done) * 2
        entry["item"].setData(entry["xs"][:count], entry["ys"][:count], connect="pairs")
        filled = int(tests * min(1.0, max(0.0, t - written[entry["key"]]) / FILL)) if entry["trial"]["pass"] else 0
        passed += filled
        entry["squares"].setBrush([pg.mkBrush(C["accent"] if k < filled else C["card"]) for k in range(tests)])
        entry["squares"].setPen([pg.mkPen(C["accent"] if k < filled else C["line"], width=1) for k in range(tests)])
    # Compare reads the answers from left to right, and threads follow it.
    reviewing = review_from <= t < total
    head = X0 + (CODE_END - X0) * min(1.0, max(0.0, (t - review_from) / (total - review_from)))
    cursor.setVisible(reviewing)
    cursor.setData([head, head], [TOPS[2] - BAND, TOPS[0]])
    shown = [thread for thread in threads if t >= review_from and thread[0] <= head]
    if shown:
        xs = np.concatenate([thread[1] for thread in shown])
        ys = np.concatenate([thread[2] for thread in shown])
        joins = np.ones(len(xs), bool)
        joins[15::16] = False
        thread_item.setData(xs, ys, connect=joins)
    else:
        thread_item.setData([], [])
    if t >= total:
        for entry in prints:
            entry["item"].setPen(pg.mkPen(C["accent"] if entry["key"] == chosen else C["line"], width=step * 0.55))
    minutes, seconds = divmod(int(t), 60)
    clock = f"T+{minutes:02d}:{seconds:02d}"
    if t >= total:
        readout.setText(f"{clock}  CHOSE {dict(LANES)[chosen].split()[0]}")
    else:
        readout.setText(f"{clock}  {passed}/{tests * len(LANES)} TESTS PASS")
    recorder.frame()
recorder.save("compare-strip", poster_at=0.99)
print({key: len(lines) for key, lines in source.items()}, len(threads), "threads,", tests, "tests,", round(total), "s, chose", chosen)
