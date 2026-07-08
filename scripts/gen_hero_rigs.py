#!/usr/bin/env python3
"""Batch-generate rig layers (clean body + action pose) for every hero except qb
(who already has franchise-rig/). Ref-attached to each hero's existing art so
identity holds. Output: public/assets/heroes/rig/<key>-body.png / <key>-action.png.

Run: python3 scripts/gen_hero_rigs.py [key ...]   (no args = all 8)
"""
import subprocess, sys, os

BASE = ("The EXACT same character as the reference image — same face, same helmet/hair, "
        "same uniform colors and details, same cel-shaded thick-outline style, same camera "
        "angle and proportions — with ALL flames, auras, glows, sparkles, and energy effects "
        "REMOVED, and any held object removed (hands empty), ")
TAIL = (" Full body head to feet, centered, ~80% of canvas height, margin on all four edges. "
        "Flat solid pure bright chroma-key green background hex #00D000, perfectly flat and "
        "uniform. NO text, NO letters, NO numbers.")

HEROES = {
    "enforcer":  ("standing in his ready stance, cracking his knuckles.",
                  "in a TRUCK STICK charge pose: shoulder lowered, driving forward off his back foot, forearm braced in front, explosive power."),
    "coach":     ("standing tall with arms crossed, headset on, stern.",
                  "in a fired-up PLAY CALL pose: leaning forward, one arm thrust out pointing downfield, mouth open mid-shout."),
    "kicker":    ("standing relaxed in his ready stance.",
                  "in a KICK FOLLOW-THROUGH pose: kicking leg swung up high across his body, arms out for balance, plant foot grounded."),
    "burner":    ("standing in a loose sprinter's ready stance.",
                  "in a full SPRINT pose: deep forward lunge mid-stride, arms pumping, body low and horizontal-leaning, blazing fast."),
    "medic":     ("standing in her ready stance, medical bag at her side.",
                  "in a RALLY-HEAL pose: both arms raised high spreading outward, palms open to the sky, uplifting energy."),
    "captain":   ("standing in his ready stance.",
                  "in a SHIELD WALL pose: braced low and wide, both forearms crossed in front like a wall, immovable."),
    "playmaker": ("standing in a loose ready stance.",
                  "in a JUKE pose: mid sidestep-spin, one foot planted, body twisting, off arm stiff-arming."),
    "legend":    ("standing in his ready stance, calm and confident.",
                  "in a SHOWBOAT pose: both arms spread wide, chest out, chin up, soaking in the crowd's roar."),
}

def run(key: str):
    ref = f"public/assets/heroes/{key}.png"
    for kind, pose in (("body", HEROES[key][0]), ("action", HEROES[key][1])):
        out = f"public/assets/heroes/rig/{key}-{kind}.png"
        if os.path.exists(out):
            print(f"skip {out} (exists)")
            continue
        prompt = BASE + ("standing " if False else "") + ("now " if kind == "action" else "") + pose + TAIL
        print(f"=== {key} {kind} ===")
        r = subprocess.run([sys.executable, "scripts/gen_asset.py", "--out", out, "--size", "1024",
                            "--ref", ref, "--prompt", prompt])
        if r.returncode != 0:
            print(f"FAILED: {key} {kind}")

if __name__ == "__main__":
    keys = sys.argv[1:] or list(HEROES)
    os.makedirs("public/assets/heroes/rig", exist_ok=True)
    for k in keys:
        run(k)
    print("BATCH DONE")
