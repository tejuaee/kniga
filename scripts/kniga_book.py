#!/usr/bin/env python3
"""Animated ASCII book for KNIGA.

    python3 scripts/kniga_book.py                # play in the terminal (Ctrl+C to stop)
    python3 scripts/kniga_book.py --once         # play one loop and exit
    python3 scripts/kniga_book.py --svg docs/kniga-book.svg   # rebuild the README animation
"""
import argparse
import os
import sys
import time
from html import escape

W, H = 50, 12          # grid size (chars)
LB, SP, RB = 3, 24, 46 # left border col, left spine col (right spine = SP+1), right border col
TOP, BOT = 1, 9        # border rows; content rows are 2..8

LEFT = [
    "",
    "   K  N  I  G  A",
    "   ~~~~~~~~~~~~~",
    "",
    "   read. rate.",
    "   remember.",
    "",
]
RIGHT = ["  " + "~" * n for n in (16, 14, 15, 12, 16, 14, 15)]


def blank():
    return [[" "] * W for _ in range(H)]


def put(g, r, c, s):
    for i, ch in enumerate(s):
        if 0 <= c + i < W:
            g[r][c + i] = ch


def page(g, x0, x1, lifted=False, hatch=False):
    """Draw a page box with borders at columns x0 and x1, blank interior."""
    top = TOP - 1 if lifted else TOP
    for r in range(top, BOT + 1):
        for c in range(x0, x1 + 1):
            g[r][c] = "/" if hatch and (c + r) % 3 == 0 else " "
    put(g, top, x0, "." + "-" * (x1 - x0 - 1) + ".")
    put(g, BOT, x0, "'" + "-" * (x1 - x0 - 1) + "'")
    for r in range(top + 1, BOT):
        g[r][x0] = "|"
        g[r][x1] = "|"


def spread(left=LEFT, right=None, stars="", cursor=None):
    g = blank()
    page(g, LB, SP)
    page(g, SP + 1, RB)
    for i, line in enumerate(left):
        put(g, 2 + i, LB + 1, line)
    if stars:
        put(g, 8, LB + 1, "   " + stars)
    for i, line in enumerate(right or []):
        put(g, 2 + i, SP + 2, line)
    if cursor:
        r, c = cursor
        g[r][c] = "_"
    put(g, 10, LB + 2, "~" * (RB - LB - 2))
    return g


frames = []  # (grid, seconds)

# 1. empty right page, blinking cursor
for on in (1, 0, 1, 0):
    frames.append((spread(cursor=(2, SP + 4) if on else None), 0.35))

# 2. right page "types" in, a few characters at a time
done = []
for line in RIGHT:
    for n in range(4, len(line) + 1, 4):
        part = line[:n]
        frames.append((spread(right=done + [part], cursor=(2 + len(done), SP + 2 + len(part))), 0.06))
    frames.append((spread(right=done + [line], cursor=(2 + len(done), SP + 2 + len(line))), 0.06))
    done.append(line)

# 3. rating fills in, then a heart
for k in range(6):
    stars = " ".join(["*"] * k + ["."] * (5 - k))
    frames.append((spread(right=RIGHT, stars=stars), 0.18 if k else 0.4))
frames.append((spread(right=RIGHT, stars="* * * * *  <3"), 1.6))

# 4. page turn: right page narrows, flips over the spine, lands on the left
final_stars = "* * * * *  <3"
for w in (14, 8, 3):
    g = spread(right=None, stars=final_stars)           # new blank page underneath
    page(g, SP + 1, SP + 2 + w, lifted=w <= 8, hatch=True)
    frames.append((g, 0.09))
for w in (3, 8, 14):
    g = spread(right=None, stars=final_stars)
    page(g, SP - 1 - w, SP, lifted=w <= 8, hatch=True)
    frames.append((g, 0.09))
frames.append((spread(), 0.5))  # turned page lands: back to the first frame

# ---------------------------------------------------------------- SVG
FS, CW, LH, PAD = 14, 8.43, 18, 18
COLORS = {
    "b": "#5b6b7f",  # borders
    "w": "#a99f90",  # scribbles
    "t": "#2f3a4a",  # title / text
    "s": "#c9a97a",  # stars
    "h": "#d08c6a",  # heart
    "c": "#5b9ccc",  # cursor
    "p": "#a9d3ee",  # turning page hatch
}


def cls(ch, row, line, i):
    if ch in "|-'" or (ch == "." and row <= TOP):
        return "b"
    if ch == "/":
        return "p"
    if ch == "~":
        return "w"
    if ch in "<3":
        return "h"
    if ch in "*." and row == 8:
        return "s"
    if ch == "_":
        return "c"
    return "t"


def render_line(row, chars):
    line = "".join(chars).rstrip()
    out, cur, buf = [], None, ""
    for i, ch in enumerate(line):
        k = None if ch == " " else cls(ch, row, line, i)
        if k is None and cur is not None:
            k = cur  # keep spaces in the current run
        if k != cur and buf:
            out.append((cur, buf))
            buf = ""
        cur = k
        buf += ch
    if buf:
        out.append((cur, buf))
    return "".join(f'<tspan class="{k}">{escape(s)}</tspan>' if k else escape(s) for k, s in out)



def write_svg(path):
    total = sum(d for _, d in frames)
    vw, vh = round(W * CW + PAD * 2), round(H * LH + PAD * 2 - 6)
    css, groups, t = [], [], 0.0
    for n, (g, d) in enumerate(frames):
        a, b = t / total * 100, (t + d) / total * 100
        t += d
        kf = f"0%{{opacity:1}}{b:.3f}%{{opacity:0}}" if n == 0 else \
             f"0%{{opacity:0}}{a:.3f}%{{opacity:1}}{b:.3f}%{{opacity:0}}"
        css.append(f"@keyframes k{n}{{{kf}}}#f{n}{{animation-name:k{n}}}")
        lines = []
        for r in range(H):
            body = render_line(r, g[r])
            if body:
                lines.append(f'<text x="{PAD}" y="{PAD + (r + 1) * LH - 6}">{body}</text>')
        groups.append(f'<g id="f{n}">{"".join(lines)}</g>')

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{vw}" height="{vh}" viewBox="0 0 {vw} {vh}" role="img" aria-label="KNIGA: an animated ASCII book whose page fills with writing, gets a five-star rating and turns">
<style>
text{{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:{FS}px;white-space:pre}}
g{{opacity:0;animation-duration:{total:.2f}s;animation-iteration-count:infinite;animation-timing-function:step-end}}
#f0{{opacity:1}}
{"".join(f".{k}{{fill:{v}}}" for k, v in COLORS.items())}
{chr(10).join(css)}
</style>
<rect width="{vw}" height="{vh}" rx="12" fill="#f7f2e9"/>
<rect x="0.5" y="0.5" width="{vw - 1}" height="{vh - 1}" rx="12" fill="none" stroke="#e4daca"/>
<g xml:space="preserve" style="opacity:1;animation:none">{"".join(groups)}</g>
</svg>
'''
    open(path, "w").write(svg)
    print(f"{len(frames)} frames, {total:.1f}s loop, {vw}x{vh}, {len(svg)} bytes")


# ---------------------------------------------------------------- terminal
def ansi(hex_color):
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return f"\033[38;2;{r};{g};{b}m"


def term_frame(g, color):
    rows = []
    for r in range(H):
        line = "".join(g[r]).rstrip()
        if not color:
            rows.append(line)
            continue
        out, cur = [], None
        for i, ch in enumerate(line):
            k = None if ch == " " else cls(ch, r, line, i)
            if k and k != cur:
                out.append(ansi(COLORS[k]))
                cur = k
            out.append(ch)
        rows.append("".join(out) + "\033[0m")
    return rows


def play(once=False, speed=1.0):
    color = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
    rendered = [(term_frame(g, color), d) for g, d in frames]
    out = sys.stdout
    out.write("\033[?25l\n")  # hide cursor
    try:
        first = True
        while True:
            for rows, d in rendered:
                if not first:
                    out.write(f"\033[{H}F")  # move back up to redraw in place
                first = False
                out.write("\n".join("\033[2K" + r for r in rows) + "\n")
                out.flush()
                time.sleep(d / speed)
            if once:
                break
    except KeyboardInterrupt:
        pass
    finally:
        out.write("\033[0m\033[?25h\n")  # restore cursor
        out.flush()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Animated ASCII book for KNIGA.")
    ap.add_argument("--once", action="store_true", help="play one loop and exit")
    ap.add_argument("--speed", type=float, default=1.0, help="playback speed multiplier")
    ap.add_argument("--svg", metavar="PATH", help="write the animated SVG instead of playing")
    args = ap.parse_args()
    if args.svg:
        write_svg(args.svg)
    else:
        play(once=args.once, speed=args.speed)
