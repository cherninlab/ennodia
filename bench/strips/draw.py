# Drawing strip: Codex draws four stone textures with its image tool, for a
# game level. Each swatch repeats one texture in the site's olive ink, so its
# tiling seams show. The swatches carry no names: a phone crops the strip at
# a point that moves with its width, and would cut them. The textures resolve from coarse to fine in the order
# Codex saved them. Then a probe runs down each seam and swings out where
# the right edge of the tile fails to meet its left edge.
#
#   uv run --with pyqtgraph --with PyQt6 --with numpy bench/strips/draw.py --dir <textures> --run run.json

import argparse
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from strip import PALETTE as C, WIDTH, Recorder, canvas, header  # noqa: E402

import numpy as np  # noqa: E402
import pyqtgraph as pg  # noqa: E402
from PyQt6 import QtCore, QtGui  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--dir", required=True, help="the folder Codex saved the textures in")
parser.add_argument("--run", required=True, help="Ennodia's record of the run, with its answer")
parser.add_argument("--seconds", type=float, default=10.0)
args = parser.parse_args()
pg.setConfigOptions(imageAxisOrder="row-major")

# The answer names each texture and links its file.
answer = json.loads(pathlib.Path(args.run).read_text())["run"]["finalAnswer"]
named = re.findall(r"^\|\s*([^|]+?)\s*\|\s*\[([^\]]+\.png)\]", answer, re.M)
textures = [(title, pathlib.Path(args.dir) / file) for title, file in named]


def gray(path: pathlib.Path, size: int | None = None) -> np.ndarray:
    image = QtGui.QImage(str(path)).convertToFormat(QtGui.QImage.Format.Format_Grayscale8)
    if size:
        image = image.scaled(size, size, QtCore.Qt.AspectRatioMode.IgnoreAspectRatio, QtCore.Qt.TransformationMode.SmoothTransformation)
    bits = image.constBits()
    bits.setsize(image.sizeInBytes())
    return np.frombuffer(bits, np.uint8).reshape(image.height(), image.bytesPerLine())[:, :image.width()].astype(float)


widget, plot = canvas(pixels=True)
readout, TOP = header(plot, "DRAWING · GPT IMAGE")
TILE, GAP, LEFT = TOP - 8, 14, 8
CELL = (WIDTH - 2 * LEFT - 3 * GAP) / 4
ramp = pg.ColorMap([0.0, 0.35, 0.6, 0.85, 1.0], [QtGui.QColor(C[key]) for key in ("deep", "accent", "mid", "wash", "card")])
lut = ramp.getLookupTable(0.0, 1.0, 256)

cells = []
for index, (title, path) in enumerate(textures):
    full = gray(path)
    tile = gray(path, TILE)
    x = LEFT + index * (CELL + GAP)
    repeats = int(np.ceil(CELL / TILE))
    # Each texture spans part of the ramp: its own contrast, stretched, at a
    # height set by its brightness, so dark basalt stays darker than sandstone.
    low, high = np.percentile(tile, [2, 98])
    base = 0.05 + 0.35 * full.mean() / 255
    tile = base + 0.55 * np.clip((tile - low) / (high - low), 0, 1)
    swatch = np.tile(tile, (1, repeats))[:, :int(CELL)]
    frame = pg.PlotCurveItem([x, x + CELL, x + CELL, x, x], [TOP, TOP, TOP - TILE, TOP - TILE, TOP], pen=pg.mkPen(C["line"], width=1))
    plot.addItem(frame)
    image = pg.ImageItem()
    image.setLookupTable(lut)
    image.setZValue(-1)
    image.setVisible(False)
    plot.addItem(image)
    # How far each row's right edge is from its left edge, against the usual
    # step between neighbouring pixels, smoothed and fitted to the tile.
    step = np.abs(np.diff(full, axis=1)).mean()
    miss = np.convolve(np.abs(full[:, 0] - full[:, -1]) / step, np.ones(25) / 25, mode="same")
    miss = np.interp(np.linspace(0, len(miss) - 1, TILE), np.arange(len(miss)), miss)
    probes = []
    for seam in range(1, repeats):
        sx = x + seam * TILE
        if sx >= x + CELL:
            break
        ys = TOP - np.arange(TILE) - 0.5
        # A dashed line marks the seam, and the trace swings off it.
        baseline = pg.PlotCurveItem([sx, sx], [TOP, TOP - TILE], pen=pg.mkPen(C["card"], width=1, style=QtCore.Qt.PenStyle.DashLine))
        trace = pg.PlotCurveItem(sx + np.clip(miss / 3, 0, 1) * 10, ys, pen=pg.mkPen(C["card"], width=1.5))
        for probe in (baseline, trace):
            probe.setVisible(False)
            probe.setZValue(1)
            plot.addItem(probe)
            probes.append(probe)
    cells.append({"title": title, "path": path, "saved": path.stat().st_mtime, "swatch": swatch, "image": image, "probes": probes, "size": full.shape[1],
                  "rect": QtCore.QRectF(x, TOP - TILE, swatch.shape[1], TILE)})

# Coarse to fine, a few frames per level, in the order Codex saved them.
LEVELS = [59, 30, 15, 8, 4, 2, 1]
order = sorted(range(len(cells)), key=lambda index: cells[index]["saved"])
START, EACH = 0.5, 1.5
PROBES = START + EACH * len(cells) + 0.3


def coarse(swatch: np.ndarray, block: int) -> np.ndarray:
    if block == 1:
        return swatch
    h, w = swatch.shape
    padded = np.pad(swatch, ((0, -h % block), (0, -w % block)), mode="edge")
    means = padded.reshape(padded.shape[0] // block, block, padded.shape[1] // block, block).mean(axis=(1, 3))
    return np.repeat(np.repeat(means, block, axis=0), block, axis=1)[:h, :w]


recorder = Recorder(widget)
frames = int(args.seconds * 24)
for n in range(frames):
    t = n / 24
    for rank, index in enumerate(order):
        cell = cells[index]
        progress = (t - START - rank * EACH) / 1.0
        if progress < 0:
            continue
        block = LEVELS[min(len(LEVELS) - 1, int(progress * len(LEVELS)))]
        # The rect maps the image's pixels, so it follows each new image.
        cell["image"].setImage(np.flipud(coarse(cell["swatch"], block)), levels=(0, 1))
        cell["image"].setRect(cell["rect"])
        cell["image"].setVisible(True)
        for probe in cell["probes"]:
            probe.setVisible(bool(t >= PROBES + rank * 0.25))
    drawn = sum(1 for rank in range(len(cells)) if t >= START + rank * EACH + 1.0)
    readout.setText(f"{drawn}/{len(cells)} TEXTURES  {cells[0]['size']} PX")
    recorder.frame()
recorder.save("draw-strip", poster_at=0.99)
print([(cell["title"], len(cell["probes"]) // 2) for cell in cells], "tile", TILE)
