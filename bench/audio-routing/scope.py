# An instrument-style video of one study clip, drawn with pyqtgraph from
# real data only: the clip's spectrogram with tracking boxes on its actual
# energy peaks, its waveform under a moving playhead, and a grid of every
# clip in the run marked with each agent's recorded result.
#
#   uv run --with pyqtgraph --with PyQt6 --with numpy bench/audio-routing/scope.py \
#     --run bench/results/audio-routing/<run> --data bench/results/audio-routing/data \
#     --palette site --size 720x1280 --out website/public/studies/audio-scope.mp4

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import numpy as np  # noqa: E402
import pyqtgraph as pg  # noqa: E402
from PyQt6 import QtCore, QtGui, QtWidgets  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--run", required=True)
parser.add_argument("--data", required=True)
parser.add_argument("--clip", help="Defaults to the first clip that listening got right and guessing got wrong.")
parser.add_argument("--palette", choices=["site", "reference"], default="site")
parser.add_argument("--size", default="720x1280")
parser.add_argument("--seconds", type=float, default=10.0)
parser.add_argument("--fps", type=int, default=24)
parser.add_argument("--out", required=True)
# strip: the spectrogram alone, for a decorative band on the website.
parser.add_argument("--layout", choices=["full", "strip"], default="full")
parser.add_argument("--text-scale", type=float, default=1.0)
args = parser.parse_args()

PALETTES = {
    # The website's paper, ink, and olive, with the ramp's light step for marks.
    "site": {"paper": "#f6f4ee", "ink": "#000000", "subtle": "#666666", "line": "#d8dad0", "deep": "#2c3625", "mid": "#7f975a", "light": "#fffefa", "accent": "#4f6339", "tag": "#fffefa", "tagText": "#000000", "tagBorder": "#000000"},
    # The reference video's ultramarine and orange.
    "reference": {"paper": "#e9eaf0", "ink": "#101218", "subtle": "#5b6070", "line": "#c9ccd8", "deep": "#1a2fd4", "mid": "#6d7ff0", "light": "#f4f5fa", "accent": "#f2641d", "tag": "#1d2233", "tagText": "#e9eaf0"},
}
C = PALETTES[args.palette]
WIDTH, HEIGHT = (int(value) for value in args.size.split("x"))
PORTRAIT = HEIGHT > WIDTH

run = pathlib.Path(args.run)
data = pathlib.Path(args.data)
trials = [json.loads(line) for line in (run / "trials.jsonl").read_text().splitlines() if line.strip()]
manifest = json.loads((data / "manifest.json").read_text())
by = {(trial["condition"], trial["clip"]): trial for trial in trials}
CONDITIONS = [("codex-alone", "CODEX ALONE"), ("codex-ennodia", "CODEX + ENNODIA"), ("claude-alone", "CLAUDE ALONE"), ("gemini-direct", "GEMINI")]
CONDITIONS = [entry for entry in CONDITIONS if any(trial["condition"] == entry[0] for trial in trials)]


def outcome(condition: str, clip: str) -> str:
    trial = by.get((condition, clip))
    if not trial:
        return "none"
    if trial.get("exitCode") != 0 or trial.get("timedOut"):
        return "failed"
    return "right" if trial["correct"] else "wrong"


def pick() -> str:
    if args.clip:
        return args.clip
    for entry in manifest:
        listened = [outcome(c, entry["clip"]) for c in ("codex-ennodia", "gemini-direct") if (c, entry["clip"]) in by]
        guessed = [outcome(c, entry["clip"]) for c in ("codex-alone", "claude-alone") if (c, entry["clip"]) in by]
        if listened and all(o == "right" for o in listened) and guessed and all(o == "wrong" for o in guessed):
            return entry["clip"]
    return manifest[0]["clip"]


clip_id = pick()
clip = next(entry for entry in manifest if entry["clip"] == clip_id)


def decode(path: pathlib.Path, rate: int = 16000) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(rate), "pipe:1"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


RATE = 16000
audio = decode(data / "clips" / f"{clip_id}.mp3", RATE)
duration = len(audio) / RATE

# Spectrogram: 32 ms windows, 8 ms hops, in decibels, 0 to 8 kHz.
window, hop = 512, 128
frames_idx = range(0, max(1, len(audio) - window), hop)
hann = np.hanning(window)
spec = np.array([np.abs(np.fft.rfft(audio[i:i + window] * hann)) for i in frames_idx]).T
spec_db = 20 * np.log10(spec + 1e-6)
# A 50 dB window with a gamma: strong regions read at a glance, as in a
# stained specimen. The mapping only changes shading, not the data.
spec_db = np.clip((spec_db - (spec_db.max() - 55)) / 55, 0, 1) ** 1.2
freqs = np.fft.rfftfreq(window, 1 / RATE)
# Log-frequency rows from 80 Hz to 6 kHz, the usual audio display: equal
# heights per octave, so low sounds do not crowd into one strip.
TOP_HZ, LOW_HZ, ROWS = 6000, 80, 180
centers = np.geomspace(LOW_HZ, TOP_HZ, ROWS)
spec = np.array([np.interp(centers, freqs, column) for column in spec.T]).T
spec_db = np.array([np.interp(centers, freqs, column) for column in spec_db.T]).T
freqs = centers

# Tracking boxes on the strongest time-frequency peaks, spread across the
# clip: after each pick, a sixth of the clip around it is ruled out.
loudest = float(20 * np.log10(spec.max() + 1e-6))
peaks = []
smoothed = spec_db.copy()
# Rumble below 150 Hz is not a feature worth tracking.
smoothed[: int(np.searchsorted(freqs, 150))] = 0
span = max(1, spec_db.shape[1] // 6)
for _ in range(5):
    if smoothed.max() <= 0:
        break
    f_i, t_i = np.unravel_index(np.argmax(smoothed), smoothed.shape)
    level = float(20 * np.log10(spec[f_i, t_i] + 1e-6)) - loudest
    peaks.append((float(t_i * hop / RATE), float(f_i), level))
    smoothed[:, max(0, t_i - span // 2):t_i + span // 2] = 0
peaks.sort()

app = QtWidgets.QApplication([])
root = pathlib.Path(__file__).resolve().parents[2]
font_id = QtGui.QFontDatabase.addApplicationFont(str(root / "website/public/fonts/martian-mono-regular.ttf"))
MONO = QtGui.QFontDatabase.applicationFontFamilies(font_id)[0]
pg.setConfigOptions(antialias=True, background=C["paper"], foreground=C["subtle"])


# A strip renders at twice its display width, so its text scales to match.
# Text sizes are in rendered pixels. A strip renders at twice its display
# size, so --text-scale 1.8 shows its 10 px labels at about 9 px.
TEXT_SCALE = args.text_scale


def mono(size: int) -> QtGui.QFont:
    return QtGui.QFont(MONO, round(size * TEXT_SCALE))


def bare(plot: pg.PlotItem) -> None:
    plot.hideAxis("left")
    plot.hideAxis("bottom")
    plot.setMouseEnabled(False, False)
    plot.hideButtons()
    plot.setMenuEnabled(False)


widget = pg.GraphicsLayoutWidget()
widget.resize(WIDTH, HEIGHT)
widget.ci.setContentsMargins(0, 0, 0, 0)
widget.ci.setSpacing(0)

# 1. Spectrogram, the "specimen" of this clip.
spec_plot = widget.addPlot(row=0, col=0)
bare(spec_plot)
cmap = pg.ColorMap([0.0, 0.45, 1.0], [QtGui.QColor(C["light"]), QtGui.QColor(C["mid"]), QtGui.QColor(C["deep"])])
image = pg.ImageItem(spec_db.T)
image.setLookupTable(cmap.getLookupTable(0.0, 1.0, 256))
# The y axis is the row index: position by octave, labels in Hz.
image.setRect(QtCore.QRectF(0, 0, duration, ROWS))
spec_plot.addItem(image)
spec_plot.setXRange(0, duration, padding=0)
spec_plot.setYRange(0, ROWS, padding=0)
# A frequency cursor: it sweeps the rows and reads out the frequency it crosses.
scan = pg.InfiniteLine(angle=0, pen=pg.mkPen(C["accent"], width=2))
spec_plot.addItem(scan)
caps = pg.ScatterPlotItem(symbol="s", size=10, pen=pg.mkPen(C["accent"]), brush=pg.mkBrush(C["accent"]))
spec_plot.addItem(caps)
# The site palette outlines its tags. A solid ink tag would be the darkest
# mark on the page.
border = pg.mkPen(C["tagBorder"], width=1.5) if C.get("tagBorder") else None
scan_label = pg.TextItem("", color=C["accent"], fill=pg.mkBrush(C["paper"]), anchor=(1, 1.15))
scan_label.setFont(mono(9 if PORTRAIT else 10))
spec_plot.addItem(scan_label)
playhead = pg.InfiniteLine(angle=90, pen=pg.mkPen(C["ink"], width=1))
spec_plot.addItem(playhead)
boxes, tags = [], []
box_w, box_h = duration * 0.07, ROWS * 0.12
for t, f, db in peaks:
    hz = float(freqs[int(f)])
    # Boxes sit on a pale field, so they are drawn dark, and kept inside the image.
    y0 = min(max(0.0, f - box_h / 2), ROWS - box_h)
    box = QtWidgets.QGraphicsRectItem(t - box_w / 2, y0, box_w, box_h)
    box.setPen(pg.mkPen(C["ink"], width=1.5, cosmetic=True))
    box.setVisible(False)
    spec_plot.addItem(box)
    center = pg.ScatterPlotItem([t], [f], symbol="s", size=7, pen=pg.mkPen(C["accent"], width=1.5), brush=pg.mkBrush(None))
    center.setVisible(False)
    spec_plot.addItem(center)
    # Relative level: decibels below the clip's loudest point, not a calibrated level.
    near_edge = t > duration * (0.5 if args.layout == "strip" else 0.7)
    readings = [f"t {t:5.2f} s", f"f {hz / 1000:4.2f} kHz", f"{db:+5.1f} dB rel"]
    # A short strip has room for one line of readings.
    tag = pg.TextItem("  ".join(readings[:2]) if args.layout == "strip" else "\n".join(readings), color=C["tagText"], fill=pg.mkBrush(C["tag"]), border=border, anchor=(1.08, 1.1) if near_edge else (-0.08, 1.1))
    tag.setFont(mono(9 if PORTRAIT else 10))
    tag.setPos(t - box_w / 2 if near_edge else t + box_w / 2, y0 + box_h)
    tag.setVisible(False)
    spec_plot.addItem(tag)
    boxes.append((t, box, center, tag))
STRIP = args.layout == "strip"
chip = pg.TextItem(" PERCEPTION · " + clip_id.upper() + " " if STRIP else " LISTENING · GEMINI 3.8 FLASH ", color=C["tagText"], fill=pg.mkBrush(C["tag"]), border=border, anchor=(0, 0) if STRIP else (1, 0))
chip.setFont(mono(10))
chip.setPos(duration * 0.01 if STRIP else duration * 0.98, ROWS * 0.97)
spec_plot.addItem(chip)
readout = pg.TextItem("", color=C["ink"], anchor=(0, 1))
readout.setVisible(args.layout != "strip")
readout.setFont(mono(10))
readout.setPos(duration * 0.02, ROWS * 0.03)
spec_plot.addItem(readout)

# 2. Waveform strip with its playhead on a baseline.
if not STRIP:
  widget.nextRow()
  wave_plot = widget.addPlot(row=1, col=0)
  bare(wave_plot)
  step = max(1, len(audio) // 1400)
  envelope = audio[: len(audio) // step * step].reshape(-1, step)
  xs = np.arange(envelope.shape[0]) * step / RATE
  top, low = envelope.max(axis=1), envelope.min(axis=1)
  peak = max(1e-6, float(np.abs(audio).max()))
  bars_x = np.repeat(xs, 2)
  bars_y = np.column_stack([low / peak, top / peak]).ravel()
  wave_plot.plot(bars_x, bars_y, pen=pg.mkPen(C["deep"], width=1), connect="pairs")
  wave_plot.addItem(pg.InfiniteLine(pos=-1.25, angle=0, pen=pg.mkPen(C["mid"], width=1)))
  dot = pg.ScatterPlotItem([0], [-1.25], symbol="o", size=8, pen=pg.mkPen(C["deep"]), brush=pg.mkBrush(C["deep"]))
  wave_plot.addItem(dot)
  wave_plot.setXRange(0, duration, padding=0.01)
  wave_plot.setYRange(-1.4, 1.05, padding=0)

  # 3. Every clip in the run, a small waveform each, with one square per agent.
  widget.nextRow()
  grid_plot = widget.addPlot(row=2, col=0)
  bare(grid_plot)
  columns = 5 if PORTRAIT else 10
  rows_n = int(np.ceil(len(manifest) / columns))
  cell_items = []
  colors = {"right": C["accent"], "wrong": C["subtle"], "failed": C["subtle"], "none": C["line"]}
  for index, entry in enumerate(manifest):
      cx, cy = index % columns, rows_n - 1 - index // columns
      thumb = decode(data / "clips" / f"{entry['clip']}.mp3", 4000)
      thumb = thumb[: max(1, len(thumb) // 120) * 120].reshape(120, -1).max(axis=1) if len(thumb) >= 120 else np.zeros(120)
      thumb = thumb / max(1e-6, thumb.max())
      frame = QtWidgets.QGraphicsRectItem(cx + 0.04, cy + 0.04, 0.92, 0.92)
      frame.setPen(pg.mkPen(C["deep"] if entry["clip"] == clip_id else C["line"], width=2 if entry["clip"] == clip_id else 1, cosmetic=True))
      frame.setBrush(pg.mkBrush(C["light"]))
      items = [frame]
      curve = pg.PlotCurveItem(cx + 0.1 + np.linspace(0, 0.8, 120), cy + 0.55 + thumb * 0.28, pen=pg.mkPen(C["mid"], width=1))
      items.append(curve)
      label = pg.TextItem(f"{entry['clip'][5:]} {entry['task'][:2].upper()}", color=C["subtle"], anchor=(0, 0))
      label.setFont(mono(7 if PORTRAIT else 8))
      label.setPos(cx + 0.08, cy + 0.94)
      items.append(label)
      for n, (condition, _) in enumerate(CONDITIONS):
          state = outcome(condition, entry["clip"])
          square = pg.ScatterPlotItem([cx + 0.2 + n * 0.2], [cy + 0.22], symbol="x" if state == "failed" else "s", size=8 if PORTRAIT else 9,
                                      pen=pg.mkPen(colors[state], width=1.5), brush=pg.mkBrush(colors[state] if state == "right" else None))
          items.append(square)
      for item in items:
          item.setVisible(False)
          grid_plot.addItem(item)
      cell_items.append(items)
  grid_plot.setXRange(0, columns, padding=0.02)
  grid_plot.setYRange(0, rows_n, padding=0.02)
  # The key sits on its own line above the grid.
  key = pg.TextItem("SQUARES: " + " · ".join(label for _, label in CONDITIONS) + "\n■ RIGHT  □ WRONG  × FAILED RUN", color=C["subtle"], anchor=(0, 0))
  key.setFont(mono(7 if PORTRAIT else 9))
  key.setPos(0.05, rows_n + 0.55)
  grid_plot.addItem(key)
  grid_plot.setYRange(0, rows_n + 0.6, padding=0.02)

layout = widget.ci.layout
share = (1.0,) if STRIP else (0.44, 0.12, 0.44) if PORTRAIT else (0.5, 0.14, 0.36)
for index, part in enumerate(share):
    layout.setRowPreferredHeight(index, HEIGHT * part)
    layout.setRowMaximumHeight(index, HEIGHT * part)

frames = pathlib.Path(tempfile.mkdtemp())
total = int(args.seconds * args.fps)
answers = {condition: outcome(condition, clip_id) for condition, _ in CONDITIONS}
for n in range(total):
    progress = n / max(1, total - 1)
    t = min(duration, progress * duration * 1.15)
    playhead.setValue(t)
    if not STRIP:
        dot.setData([t], [-1.25])
    row = ROWS * (0.5 + 0.35 * np.sin(progress * np.pi * 2))
    scan.setValue(row)
    caps.setData([duration * 0.005, duration * 0.995], [row, row])
    scan_label.setText(f"{freqs[min(ROWS - 1, int(row))] / 1000:4.2f} kHz")
    scan_label.setPos(duration * 0.985, row)
    # Boxes stay once found. Only the latest one keeps its readout.
    latest = max((i for i, (peak_t, *_rest) in enumerate(boxes) if t >= peak_t), default=-1)
    for i, (peak_t, box, center, tag) in enumerate(boxes):
        seen = bool(t >= peak_t)
        box.setVisible(seen)
        center.setVisible(seen)
        tag.setVisible(i == latest)
    readout.setText(f"{clip_id}  {clip['task'].upper()}  {t:5.2f} / {duration:4.1f} s")
    for index, items in enumerate([] if STRIP else cell_items):
        visible = bool(progress >= index / (len(cell_items) * 1.1))
        for item in items:
            item.setVisible(visible)
    app.processEvents()
    widget.grab().save(str(frames / f"f{n:05d}.png"))

out = pathlib.Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(args.fps), "-i", str(frames / "f%05d.png"),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", str(out)], check=True)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(frames / f"f{total - 1:05d}.png"), "-q:v", "3", str(out.with_suffix(".jpg"))], check=True)
shutil.rmtree(frames)
print(out, clip_id, answers)
