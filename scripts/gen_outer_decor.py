#!/usr/bin/env python3
"""Outer-grounds props: scoreboard + bleacher stand for the de-floated campus
surroundings. Style ref = existing decor so they sit in the same art family."""
import subprocess, sys, os

STYLE = ("Match the reference image's art style EXACTLY: cel-shaded mobile-game prop with thick "
         "dark outlines, warm highlights, black and orange team identity accents, isometric 3/4 "
         "view angled as if placed on an isometric game board. ")
TAIL = (" Single prop only, centered, ~72% of canvas, clear margin on all edges. Flat solid pure "
        "bright chroma-key green background hex #00D000, perfectly flat. NO text, NO letters, NO numbers.")

JOBS = [
    ("scoreboard", "public/assets/decor/scoreboard.png", "public/assets/decor/merch-stand.png",
     "A tall STADIUM SCOREBOARD on two sturdy dark steel posts: a big rectangular display board "
     "with a glowing dark screen showing only abstract orange glowing segment bars and dots "
     "(unreadable, purely decorative), orange trim frame, small floodlights on top rail."),
    ("bleachers", "public/assets/decor/bleachers.png", "public/assets/decor/merch-stand.png",
     "A small outdoor BLEACHER STAND section: four rising rows of aluminum bench seating on a "
     "dark steel frame, side rails, a few black-and-orange seat cushions and a draped orange "
     "team banner on the side, empty seats."),
]

for name, out, ref, prompt in JOBS:
    if os.path.exists(out):
        print("skip", out, flush=True); continue
    print("===", out, flush=True)
    subprocess.run([sys.executable, "scripts/gen_asset.py", "--out", out, "--size", "1024",
                    "--ref", ref, "--prompt", STYLE + prompt + TAIL])
print("OUTER DECOR DONE", flush=True)
