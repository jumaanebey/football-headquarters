#!/usr/bin/env python3
"""Card idle LEG-LOOP frames: two weight-shift variants of each hero's rig body.
The card alternates idleA/idleB during the pose-A window so legs live instead of
holding one pose. Ref = the rig body itself (exact card layer) so the upper body,
arms and facing match — only the legs may differ frame to frame.
Outputs: rig/<key>-idleA/B.png (qb refs franchise-rig/body.png)."""
import subprocess, sys, os

HEROES = ["qb", "enforcer", "coach", "kicker", "burner", "medic", "captain", "playmaker", "legend"]
ANCHOR = {"medic": "a MAN with SHORT dark hair (the male athletic trainer), ", "coach": "the older bearded coach in the tracksuit and cap, "}
# Per-hero ARM LOCK: appended after the leg pose for heroes whose card rig positions a
# prop at a specific hand (qb: the in-hand ball rides his extended palm — if the arms
# move, the ball floats). First qb run WITHOUT this drifted both arms to his sides.
ARMLOCK = {"qb": (" CRITICAL — THE ARMS MUST NOT MOVE FROM THE REFERENCE: keep his LEFT arm "
                  "extended out to the viewer's left at shoulder height with the open EMPTY palm "
                  "up, and his RIGHT arm bent in front of his chest, EXACTLY as in the reference "
                  "image. Same wide quarterback pre-throw stance, same torso twist, same head "
                  "direction. ONLY the leg weight shifts.")}
BASE = ("The EXACT same character as the reference image — IDENTICAL face, uniform, colors, build, "
        "arm position, facing angle, and cel-shaded thick-outline style. Change ONLY the legs: ")
POSES = {
    "idleA": ("standing in place with his weight planted on the LEFT leg — left leg straight and "
              "bearing weight, RIGHT knee slightly bent with the right heel lifted off the ground, "
              "toe touching. A subtle relaxed idle shuffle, NOT a walking stride."),
    "idleB": ("standing in place with his weight planted on the RIGHT leg — right leg straight and "
              "bearing weight, LEFT knee slightly bent with the left heel lifted off the ground, "
              "toe touching. A subtle relaxed idle shuffle, NOT a walking stride."),
}
TAIL = (" Hands empty, no ball, no effects, no aura. Full body head to feet, centered, ~78% of canvas "
        "height, clear margin on all edges. Flat solid pure bright chroma-key green background hex "
        "#00D000, perfectly flat. NO text.")

def run(key):
    ref = ("public/assets/heroes/franchise-rig/body.png" if key == "qb"
           else f"public/assets/heroes/rig/{key}-body.png")
    for frame, pose in POSES.items():
        path = f"public/assets/heroes/rig/{key}-{frame}.png"
        if os.path.exists(path):
            print("skip", path, flush=True); continue
        print("===", path, flush=True)
        subprocess.run([sys.executable, "scripts/gen_asset.py", "--out", path, "--size", "1024",
                        "--ref", ref, "--prompt", BASE + ANCHOR.get(key, "") + pose + ARMLOCK.get(key, "") + TAIL])

if __name__ == "__main__":
    for k in HEROES:
        run(k)
    print("CARD IDLE DONE", flush=True)
