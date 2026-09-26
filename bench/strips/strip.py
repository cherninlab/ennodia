# Shared look for capability strips: decorative bands that show one
# capability as raw material, drawn with pyqtgraph from a real run. Every
# strip uses the site's card, ink, and olive, Martian Mono for its few
# labels, and the same size, so the family reads as one instrument. On
# phones the site crops a strip from the right, so tags sit at the left.

import os
import pathlib
import shutil
import subprocess
import tempfile

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pyqtgraph as pg  # noqa: E402
from PyQt6 import QtGui, QtWidgets  # noqa: E402

PALETTE = {"paper": "#f6f4ee", "card": "#fffefa", "ink": "#000000", "subtle": "#666666", "line": "#d8dad0",
           "deep": "#2c3625", "mid": "#7f975a", "light": "#fffefa", "accent": "#4f6339", "wash": "#e7ecbe"}
# Rendered at twice the figure column's width, and shown at half size.
WIDTH, HEIGHT, TEXT_SCALE = 1260, 170, 1.8
ROOT = pathlib.Path(__file__).resolve().parents[2]

app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
_font = QtGui.QFontDatabase.addApplicationFont(str(ROOT / "website/public/fonts/martian-mono-regular.ttf"))
MONO = QtGui.QFontDatabase.applicationFontFamilies(_font)[0]
pg.setConfigOptions(antialias=True, background=PALETTE["card"], foreground=PALETTE["subtle"])


def mono(size: float) -> QtGui.QFont:
    return QtGui.QFont(MONO, round(size * TEXT_SCALE))


def text_width(text: str, size: float = 10) -> float:
    """Rendered width of a tag, in pixels."""
    return QtGui.QFontMetricsF(mono(size)).horizontalAdvance(f" {text} ")


def canvas(pixels: bool = False) -> tuple[pg.GraphicsLayoutWidget, pg.PlotItem]:
    """A bare plot. With pixels, one data unit is one rendered pixel, with
    y running up from the bottom edge."""
    widget = pg.GraphicsLayoutWidget()
    widget.resize(WIDTH, HEIGHT)
    widget.ci.setContentsMargins(0, 0, 0, 0)
    plot = widget.addPlot()
    plot.layout.setContentsMargins(0, 0, 0, 0)
    for axis in ("left", "bottom"):
        plot.hideAxis(axis)
    plot.setMouseEnabled(False, False)
    plot.hideButtons()
    plot.setMenuEnabled(False)
    if pixels:
        plot.setXRange(0, WIDTH, padding=0)
        plot.setYRange(0, HEIGHT, padding=0)
    return widget, plot


def label(plot: pg.PlotItem, text: str, x: float, y: float, anchor=(0, 0), dark: bool = True) -> pg.TextItem:
    """A tag: ink on paper-light, or paper on ink when dark."""
    item = pg.TextItem(f" {text} ", color=PALETTE["paper"] if dark else PALETTE["ink"],
                       fill=pg.mkBrush(PALETTE["ink"] if dark else PALETTE["card"]), anchor=anchor)
    item.setFont(mono(10))
    item.setPos(x, y)
    plot.addItem(item)
    return item


def header(plot: pg.PlotItem, chip: str) -> tuple[pg.TextItem, int]:
    """The chip at the top left of a pixel canvas, with a smaller readout
    beside it. Keep both short: a 320-pixel phone shows the first 680
    pixels. Returns the readout and the top of the space under them."""
    top = HEIGHT - 8
    tag = label(plot, chip, 8, top)
    height = tag.textItem.boundingRect().height()
    readout = pg.TextItem("", color=PALETTE["ink"], anchor=(0, 0.5))
    readout.setFont(mono(8))
    readout.setPos(8 + tag.textItem.boundingRect().width() + 8, top - height / 2)
    plot.addItem(readout)
    return readout, int(top - height - 8)


class Recorder:
    """Collects frames, then writes MP4, WebM, and a poster frame."""

    def __init__(self, widget: pg.GraphicsLayoutWidget):
        self.widget = widget
        self.dir = pathlib.Path(tempfile.mkdtemp())
        self.count = 0

    def frame(self) -> None:
        app.processEvents()
        self.widget.grab().save(str(self.dir / f"f{self.count:05d}.png"))
        self.count += 1

    def save(self, name: str, fps: int = 24, poster_at: float = 0.7) -> None:
        out = ROOT / "website/public/studies"
        out.mkdir(parents=True, exist_ok=True)
        pattern = str(self.dir / "f%05d.png")
        base = ["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(fps), "-i", pattern, "-an"]
        subprocess.run(base + ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-movflags", "+faststart", str(out / f"{name}.mp4")], check=True)
        subprocess.run(base + ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1", str(out / f"{name}.webm")], check=True)
        poster = self.dir / f"f{min(self.count - 1, int(self.count * poster_at)):05d}.png"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(poster), "-q:v", "4", str(out / f"{name}.jpg")], check=True)
        shutil.rmtree(self.dir)
        print(out / f"{name}.mp4")
