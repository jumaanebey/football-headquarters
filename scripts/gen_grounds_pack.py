#!/usr/bin/env python3
"""Grounds density pack: tree cluster, floodlight pole, goalpost — the props that
turn the empty rough around the campus into an environment."""
import subprocess, sys, os

STYLE = ("Match the reference image's art style EXACTLY: cel-shaded mobile-game prop with thick "
         "dark outlines, warm highlights, isometric 3/4 view angled as if placed on an isometric "
         "game board, night-time lighting with warm accents. ")
TAIL = (" Single prop only, centered, ~74% of canvas, clear margin on all edges. Flat solid pure "
        "bright chroma-key green background hex #00D000, perfectly flat. NO text, NO letters, NO numbers.")

JOBS = [
    ("trees", "public/assets/decor/tree-cluster.png", "public/assets/decor/club-fountain.png",
     "A CLUSTER OF THREE dense round park trees of slightly different heights growing close "
     "together from a shared grassy mound, dark night-green foliage with subtle warm rim light, "
     "sturdy dark trunks."),
    ("floodlight", "public/assets/decor/floodlight.png", "public/assets/decor/merch-stand.png",
     "A TALL STADIUM FLOODLIGHT POLE: single dark steel mast on a small concrete base, at the top "
     "a rectangular bank of six bright glowing warm-white lamps angled downward, subtle glow "
     "around the lamp bank."),
    ("goalpost", "public/assets/decor/goalpost.png", "public/assets/decor/merch-stand.png",
     "A FOOTBALL FIELD GOALPOST: bright yellow-gold Y-shaped goal post with a single center pole "
     "on a small pad, two tall uprights and a crossbar, clean and simple."),
]

for name, out, ref, prompt in JOBS:
    if os.path.exists(out):
        print("skip", out, flush=True); continue
    print("===", out, flush=True)
    subprocess.run([sys.executable, "scripts/gen_asset.py", "--out", out, "--size", "1024",
                    "--ref", ref, "--prompt", STYLE + prompt + TAIL])
print("GROUNDS PACK DONE", flush=True)
