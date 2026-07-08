#!/usr/bin/env python3
"""Frames C+D for 4-frame walk cycles: the 'passing' positions between steps.
Heroes: rig/<key>-walkC/D (ref = base art). Units: units/<slug>-walkC/D."""
import subprocess, sys, os

HEROES = ["qb", "enforcer", "coach", "kicker", "burner", "medic", "captain", "playmaker", "legend"]
UNITS = ["offensive-line", "skill-positions", "defensive-line", "secondary"]
ANCHOR = {"medic": "a MAN with SHORT dark hair (the male athletic trainer), ", "coach": "the older bearded coach in the tracksuit and cap, "}
BASE = ("The EXACT same character as the reference image — same face, uniform colors, build, "
        "and cel-shaded thick-outline style — ")
POSES = {
    "walkC": ("WALKING toward the VIEWER'S LEFT, 3/4 side view, captured at the PASSING position "
              "of the stride: legs close together under the body, RIGHT leg swinging forward past the "
              "planted left leg, body at its tallest point, arms near the sides mid-swing."),
    "walkD": ("WALKING toward the VIEWER'S LEFT, 3/4 side view, captured at the PASSING position "
              "of the stride: legs close together under the body, LEFT leg swinging forward past the "
              "planted right leg, body at its tallest point, arms near the sides mid-swing."),
}
TAIL = (" Hands empty, no effects. Full body head to feet, centered, ~78% of canvas height, margin "
        "on all edges. Flat solid pure bright chroma-key green background hex #00D000, perfectly flat. NO text.")

def run(out, ref, anchor):
    for frame, pose in POSES.items():
        path = out.replace("FRAME", frame)
        if os.path.exists(path):
            print("skip", path); continue
        print("===", path, flush=True)
        subprocess.run([sys.executable, "scripts/gen_asset.py", "--out", path, "--size", "1024",
                        "--ref", ref, "--prompt", BASE + anchor + "now " + pose + TAIL])

if __name__ == "__main__":
    for k in HEROES:
        run(f"public/assets/heroes/rig/{k}-FRAME.png", f"public/assets/heroes/{k}.png", ANCHOR.get(k, ""))
    for u in UNITS:
        run(f"public/assets/units/{u}-FRAME.png", f"public/assets/units/{u}-player.png", "")
    print("WALK4 DONE", flush=True)
