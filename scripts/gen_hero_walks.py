#!/usr/bin/env python3
"""Walk cycle frames for every hero: <key>-walkA.png (left foot forward) and
<key>-walkB.png (right foot forward), both facing the VIEWER'S LEFT so battle code
can flip with scaleX by movement direction. Ref-attached to the hero's base card art
(identity canon). Run: python3 scripts/gen_hero_walks.py [key ...]
"""
import subprocess, sys, os

KEYS = ["qb", "enforcer", "coach", "kicker", "burner", "medic", "captain", "playmaker", "legend"]

# Explicit identity anchors where the ref alone has proven insufficient.
ANCHOR = {
    "medic": "a MAN with SHORT dark hair (the male athletic trainer in the reference), ",
    "coach": "the older bearded coach in the tracksuit and cap from the reference, ",
}

BASE = ("The EXACT same character as the reference image — same face, same uniform colors "
        "and details, same cel-shaded thick-outline style, same proportions — ")
POSE = {
    "walkA": ("WALKING at a steady pace toward the VIEWER'S LEFT, seen from a 3/4 side view: "
              "LEFT foot forward and planted, right foot lifting off behind, arms swinging "
              "naturally in opposition, relaxed stride."),
    "walkB": ("WALKING at a steady pace toward the VIEWER'S LEFT, seen from a 3/4 side view: "
              "RIGHT foot forward and planted, left foot lifting off behind, arms swinging "
              "naturally in opposition (opposite arm/leg phase), relaxed stride."),
}
TAIL = (" No held objects, hands empty, no flames or glows or effects. Full body head to feet, "
        "centered, ~78% of canvas height, margin on all edges. Flat solid pure bright chroma-key "
        "green background hex #00D000, perfectly flat. NO text, NO letters.")

if __name__ == "__main__":
    keys = sys.argv[1:] or KEYS
    os.makedirs("public/assets/heroes/rig", exist_ok=True)
    for k in keys:
        for frame in ("walkA", "walkB"):
            out = f"public/assets/heroes/rig/{k}-{frame}.png"
            if os.path.exists(out):
                print(f"skip {out}")
                continue
            prompt = BASE + ANCHOR.get(k, "") + "now " + POSE[frame] + TAIL
            print(f"=== {k} {frame} ===", flush=True)
            subprocess.run([sys.executable, "scripts/gen_asset.py", "--out", out, "--size", "1024",
                            "--ref", f"public/assets/heroes/{k}.png", "--prompt", prompt])
    print("WALK BATCH DONE", flush=True)
