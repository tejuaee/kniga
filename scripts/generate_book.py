#!/usr/bin/env python3
"""
generate_book.py: builds "Kniga", an animated ASCII-art 3D book that spins in
place, as one self-contained SVG for a GitHub README.

The book is ray-traced: a leather hardcover (front board, back board, spine)
around a block of cream pages, lit from the upper left, casting a shadow on
the floor. Every cell of the grid gets a character picked by brightness and a
colour picked by material, exactly like a donut.c render. Each frame of the
spin is one <g>; pure CSS @keyframes show them in turn (GitHub strips scripts
from SVGs). Visitors who prefer reduced motion see one still frame.

Standard library only.

    python3 scripts/generate_book.py                     # writes docs/kniga-book-3d.svg
    python3 scripts/generate_book.py --frames 72 --loop 12
    python3 scripts/generate_book.py --play              # watch it in the terminal
"""
import argparse
import math
import os
import sys
import time
from xml.sax.saxutils import escape

CW, CH = 6, 11            # cell size in SVG units (monospace ~0.6em wide)
FONT_SIZE = 10.5
BASE = 9                  # baseline offset inside a cell
FONT_STACK = ('ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'
              '"Liberation Mono","DejaVu Sans Mono","Courier New",monospace')

RAMP = " .,:;-=+*cxo%#&@"     # dark -> bright (shadow)
CHARS = {                      # per-material ramps, dark -> bright
    "leather": ".,:;+x*",
    "edge": ".,:;",
    "gold": "+*%#",
    "page_v": ".:;|",          # fore-edge: page layers run vertically
    "page_h": ".-=~",          # top/bottom: page layers run horizontally
}
LEVELS = 3                     # colour steps per material

LEATHER_DARK, LEATHER = "#2a0a0a", "#c2410c"
EDGE_DARK, EDGE = "#1f0707", "#7f1d1d"
GOLD_DARK, GOLD = "#5c3a06", "#fde68a"
PAGE_DARK, PAGE = "#3b2f22", "#fff4dc"
SHADOW = "#3a1f4d"
CAPTION, ORNAMENT = "#fde68a", "#ea580c"

TITLE = "KNIGA"
TITLE_Y = 0.34          # centre of the title band on the front cover (book units)
STARS_Y = -0.02         # centre of the band of five stars

# ------------------------------------------------------------------ helpers ---
def rgb(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    a, b = rgb(a), rgb(b)
    t = max(0.0, min(1.0, t))
    return "#%02x%02x%02x" % tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def norm(v):
    l = math.sqrt(sum(x * x for x in v)) or 1.0
    return tuple(x / l for x in v)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def rot_x(v, a):
    c, s = math.cos(a), math.sin(a)
    return (v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c)


def rot_y(v, a):
    c, s = math.cos(a), math.sin(a)
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)


# --------------------------------------------------------------- the book ---
HX, HY, HZ = 0.52, 0.74, 0.17      # outer half-size of the closed book
BOARD = 0.035                      # board thickness
BOXES = [  # (name, min corner, max corner)
    ("front", (-HX, -HY, HZ - BOARD), (HX, HY, HZ)),
    ("back", (-HX, -HY, -HZ), (HX, HY, -HZ + BOARD)),
    ("spine", (-HX - BOARD, -HY, -HZ), (-HX, HY, HZ)),
    ("pages", (-HX, -HY + 0.03, -HZ + BOARD), (HX - 0.025, HY - 0.03, HZ - BOARD)),
]


def hit_box(o, d, lo, hi):
    """Slab test. Returns (t, axis, sign) of the entry face, or None."""
    t0, t1, axis, sign = -1e9, 1e9, 0, 1
    for i in range(3):
        if abs(d[i]) < 1e-9:
            if o[i] < lo[i] or o[i] > hi[i]:
                return None
            continue
        a, b = (lo[i] - o[i]) / d[i], (hi[i] - o[i]) / d[i]
        s = -1
        if a > b:
            a, b, s = b, a, 1
        if a > t0:
            t0, axis, sign = a, i, s
        t1 = min(t1, b)
        if t0 > t1:
            return None
    return (t0, axis, sign) if t0 > 1e-6 else None


def trace(o, d):
    best = None
    for name, lo, hi in BOXES:
        h = hit_box(o, d, lo, hi)
        if h and (best is None or h[0] < best[0]):
            best = (h[0], h[1], h[2], name)
    return best


# Gold tooling is sized in screen cells, not book units: `du` and `dv` are the
# width of one text column and the height of one text row, measured on the face
# being drawn at the current angle. Each rule and each letter then covers
# exactly one cell, so nothing doubles up or drops out as the book turns.

def letter_band(u, v, text, pitch, centre_v, du, dv):
    """Spell `text` across a band: the glyph under (u, v), or None."""
    if abs(v - centre_v) > dv / 2 or du > pitch * 0.8:   # too edge-on to read
        return None
    g = (u + pitch * len(text) / 2) / pitch
    if not 0 <= g < len(text):
        return None
    k = int(g)
    return text[k] if abs((g - k - 0.5) * pitch) < du / 2 else None


def frame_line(ix, iy, inset, du, dv):
    """A gold rule `inset` in from the edges, one cell thick both ways."""
    return (inset < iy < inset + dv and ix > inset) or \
           (inset < ix < inset + min(du, 0.12) and iy > inset)


def gold_on_cover(x, y, du, dv):
    """Front cover: a frame, the title, a rule and five stars."""
    ix, iy = HX - abs(x), HY - abs(y)
    if frame_line(ix, iy, 0.06, du, dv):
        return True
    ch = letter_band(x, y, TITLE, 0.13, TITLE_Y, du, dv) or \
        letter_band(x, y, "*****", 0.11, STARS_Y, du, dv)
    if ch:
        return ch
    mid = (TITLE_Y + STARS_Y) / 2
    return abs(y - mid) < dv / 2 and abs(x) < 0.16 or None


def gold_on_spine(z, y, du, dv):
    """Spine: bands at head and tail, the title stacked down the middle."""
    if any(abs(abs(y) - b) < dv / 2 for b in (0.5, 0.6)):
        return True
    if abs(z) < du / 2 and du < 0.2:
        g = (0.3 - y) / 0.12                # one letter every 0.12 units, top down
        if 0 <= g < len(TITLE) and abs((g - int(g) - 0.5) * 0.12) < dv / 2:
            return TITLE[int(g)]
    return None


def shade(name, axis, sign, p, n_world, view, light, cell):
    """Return (brightness 0..1, material, glyph or None) for a hit.

    `cell` is (column width, row height) on screen, in scene units.
    """
    diff = max(0.0, dot(n_world, light))
    h = norm(tuple(l - v for l, v in zip(light, view)))
    spec = max(0.0, dot(n_world, h))
    if name == "pages" and not (axis == 2):
        # page edges: fine stripes across the thickness
        stripe = 0.75 + 0.25 * math.cos(p[2] * 240)
        return (0.25 + 0.75 * diff) * stripe, "page_v" if axis == 0 else "page_h", None
    outer = (name == "front" and axis == 2 and sign > 0) or \
            (name == "back" and axis == 2 and sign < 0) or \
            (name == "spine" and axis == 0 and sign < 0)
    if not outer:
        return 0.2 + 0.8 * diff, "edge", None
    # the face's horizontal axis turns away from the viewer as the book spins:
    # n_world.z is how squarely the face looks at us
    du = cell[0] / max(abs(n_world[2]), 1e-3)
    dv = cell[1]
    gold = None
    if name == "front":
        gold = gold_on_cover(p[0], p[1], du, dv)
    elif name == "back":
        gold = frame_line(HX - abs(p[0]), HY - abs(p[1]), 0.06, du, dv) or None
    elif name == "spine":
        gold = gold_on_spine(p[2], p[1], du, dv)
    if gold:
        lum = min(1.0, 0.35 + 0.65 * diff + 0.8 * spec ** 24)
        return lum, "gold", (gold if isinstance(gold, str) else None)
    return min(1.0, 0.1 + 0.55 * diff + 0.35 * spec ** 20), "leather", None


PALETTE = {"leather": (LEATHER_DARK, LEATHER), "edge": (EDGE_DARK, EDGE), "gold": (GOLD_DARK, GOLD),
           "page_v": (PAGE_DARK, PAGE), "page_h": (PAGE_DARK, PAGE)}


def render_frame(cols, rows, theta, bob, tilt=0.30, scale=180.0, eye=14.0):
    """Ray-trace one frame. Returns {(r, c): (char, colour)}."""
    W, H = cols * CW, rows * CH
    cx, cy = W / 2, H * 0.43
    light = norm((0.6, 0.7, 0.75))              # scene space: upper right, in front
    floor_y = -HY - 0.16
    cell = (CW / scale, CH / scale / math.cos(tilt))
    cells = {}
    for r in range(rows):
        for c in range(cols):
            X = (c * CW + CW / 2 - cx) / scale
            Y = -(r * CH + CH / 2 - cy) / scale
            o_w, d_w = (0.0, 0.0, eye), norm((X, Y, -eye))
            # world -> scene (undo camera tilt)
            o_s, d_s = rot_x(o_w, -tilt), rot_x(d_w, -tilt)
            # scene -> book (undo bob and spin)
            o_b = rot_y((o_s[0], o_s[1] - bob, o_s[2]), -theta)
            d_b = rot_y(d_s, -theta)
            h = trace(o_b, d_b)
            if h:
                t, axis, sign, name = h
                p = tuple(o + t * d for o, d in zip(o_b, d_b))
                n_b = [0.0, 0.0, 0.0]
                n_b[axis] = float(sign)
                n_s = rot_y(tuple(n_b), theta)
                lum, mat, glyph = shade(name, axis, sign, p, n_s, d_s, light, cell)
                ramp = CHARS[mat]
                k = min(len(ramp) - 1, int(lum * len(ramp)))
                dark, bright = PALETTE[mat]
                level = min(LEVELS, int(lum * LEVELS) + 1) / LEVELS
                cells[(r, c)] = (glyph or ramp[k], mix(dark, bright, 0.25 + 0.75 * level))
                continue
            # floor: soft shadow only
            if d_s[1] < 0:
                t = (floor_y - o_s[1]) / d_s[1]
                fp = tuple(o + t * d for o, d in zip(o_s, d_s))
                if fp[0] ** 2 + fp[2] ** 2 < 1.6:
                    sp = rot_y((fp[0], fp[1] - bob, fp[2]), -theta)
                    sd = rot_y(light, -theta)
                    if trace(sp, sd):
                        k = 1 if (r + c) % 2 else 2
                        cells[(r, c)] = (RAMP[k], SHADOW)
    return cells


# ----------------------------------------------------------------- output ---
def text_rows(cells, cls=""):
    """One <text> per (colour, row); every glyph carries its own x."""
    by = {}
    for (r, c), (ch, col) in sorted(cells.items()):
        by.setdefault((col, r), []).append((c, ch))
    out = []
    for (col, r), items in sorted(by.items()):
        out.append('<text fill="%s" x="%s" y="%d">%s</text>' % (
            col, " ".join(str(c * CW + CW // 2) for c, _ in items), r * CH + BASE,
            escape("".join(ch for _, ch in items))))
    return "".join(out)


def build_frames(args):
    frames = []
    for i in range(args.frames):
        t = i / args.frames
        theta = math.radians(24) + 2 * math.pi * t
        bob = 0.035 * math.sin(2 * math.pi * t * 2)
        frames.append(render_frame(args.cols, args.rows, theta, bob))
    return frames


def render_svg(args, frames):
    W, H = args.cols * CW, args.rows * CH
    n, L = len(frames), args.loop
    still = 0  # frame shown to reduced-motion visitors (front cover, 3/4 view)
    style = (
        ".t{font-family:%s;font-size:%spx;text-anchor:middle;font-variant-ligatures:none}"
        ".f{opacity:0;animation:fr %ss step-end infinite}"
        "@keyframes fr{0%%{opacity:1}%.4f%%{opacity:0}100%%{opacity:0}}"
        ".tw{animation:tw 3.2s ease-in-out infinite}"
        "@keyframes tw{0%%,100%%{opacity:.15}50%%{opacity:1}}"
        "@media (prefers-reduced-motion:reduce){.f,.tw{animation:none!important}#f%d{opacity:1}}"
        % (FONT_STACK, FONT_SIZE, L, 100 / n, still))
    groups = []
    for i, cells in enumerate(frames):
        groups.append('<g class="f" id="f%d" style="animation-delay:%.3fs">%s</g>'
                      % (i, i * L / n, text_rows(cells)))
    # a few twinkling motes around the book
    motes = [(3, 7, "+"), (6, 56, "*"), (12, 4, "."), (17, 60, "+"), (25, 9, "*"),
             (4, 33, "."), (21, 52, "."), (9, 13, "."), (28, 57, "+")]
    tw = "".join('<text class="tw" fill="%s" x="%d" y="%d" style="animation-delay:-%.1fs">%s</text>'
                 % (mix(GOLD, ORNAMENT, (j % 3) / 2), c * CW + CW // 2, r * CH + BASE, j * 0.7, ch)
                 for j, (r, c, ch) in enumerate(motes) if r < args.rows - 3 and c < args.cols)
    cap_y = (args.rows - 1) * CH + BASE - 4
    caption = ('<text fill="%s" x="%d" y="%d" style="letter-spacing:6px">k n i g a</text>'
               '<text fill="%s" x="%d" y="%d">❦</text><text fill="%s" x="%d" y="%d">❦</text>'
               % (CAPTION, W // 2 + 3, cap_y, ORNAMENT, W // 2 - 66, cap_y, ORNAMENT, W // 2 + 66, cap_y))
    return "\n".join([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" '
        'role="img" aria-labelledby="t d">' % (W, H, W, H),
        '<title id="t">Kniga</title>',
        '<desc id="d">ASCII-art leather-bound book with a gold KNIGA title, slowly spinning '
        'in place above its shadow.</desc>',
        "<style>%s</style>" % style,
        '<defs><clipPath id="c"><rect width="%d" height="%d" rx="12"/></clipPath></defs>' % (W, H),
        '<g clip-path="url(#c)"><rect width="%d" height="%d" fill="#000"/>' % (W, H),
        '<g class="t">', tw, *groups, caption, "</g></g></svg>",
    ]) + "\n"


def play(args, frames):
    color = sys.stdout.isatty() and not os.environ.get("NO_COLOR")

    def line(cells, r):
        out, cur = [], None
        for c in range(args.cols):
            ch, col = cells.get((r, c), (" ", None))
            if color and col and col != cur:
                out.append("\033[38;2;%d;%d;%dm" % rgb(col))
                cur = col
            out.append(ch)
        return "".join(out).rstrip() + ("\033[0m" if color else "")

    rendered = ["\n".join("\033[2K" + line(f, r) for r in range(args.rows)) for f in frames]
    sys.stdout.write("\033[?25l\n")
    try:
        first = True
        while True:
            for fr in rendered:
                if not first:
                    sys.stdout.write("\033[%dF" % args.rows)
                first = False
                sys.stdout.write(fr + "\n")
                sys.stdout.flush()
                time.sleep(args.loop / len(frames))
            if args.once:
                break
    except KeyboardInterrupt:
        pass
    finally:
        sys.stdout.write("\033[0m\033[?25h\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Generate the spinning ASCII book SVG.")
    ap.add_argument("--cols", type=int, default=66, help="grid width in cells (default 66)")
    ap.add_argument("--rows", type=int, default=36, help="grid height in cells (default 36; 66x36 is square)")
    ap.add_argument("--frames", type=int, default=48, help="frames per full turn (default 48)")
    ap.add_argument("--loop", type=float, default=9.6, help="seconds per full turn (default 9.6)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                  "..", "docs", "kniga-book-3d.svg"),
                    help="output path (default docs/kniga-book-3d.svg)")
    ap.add_argument("--play", action="store_true", help="play in the terminal instead of writing the SVG")
    ap.add_argument("--once", action="store_true", help="with --play: one turn, then exit")
    args = ap.parse_args(argv)
    frames = build_frames(args)
    if args.play:
        play(args, frames)
        return
    svg = render_svg(args, frames)
    out = os.path.normpath(args.out)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(svg)
    print("wrote %s (%.0f KB, %dx%d grid, %d frames, %gs loop)"
          % (out, len(svg.encode()) / 1024, args.cols, args.rows, len(frames), args.loop), file=sys.stderr)


if __name__ == "__main__":
    main()
