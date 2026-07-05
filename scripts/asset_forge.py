#!/usr/bin/env python3
"""
asset_forge.py — your own game-asset pipeline. Generate → knockout → resize → save.

Reusable across projects (Football HQ, Kickoff Club, HomeIQ, …): describe assets in a
manifest, run one command, get transparent PNGs at exact paths.

SETUP (once):
  pip install pillow
  export GEMINI_API_KEY=...        # aistudio.google.com/apikey — image model = "nano banana"

USAGE:
  # One-off:
  python3 scripts/asset_forge.py --prompt "cel-shaded football helmet icon, thick outline, \
      flat solid chroma-green (#00d000) background" --out public/assets/icons/helmet.png --size 512

  # With a style/silhouette reference (recolors, conformance):
  python3 scripts/asset_forge.py --prompt "same building, repainted black+orange" \
      --ref public/assets/buildings/stadium-5.png --out public/assets/buildings/stadium-5.png

  # Batch from a manifest:
  python3 scripts/asset_forge.py --manifest art/round4.json

MANIFEST FORMAT (JSON list):
  [
    { "prompt": "…", "out": "public/assets/icons/crowns.png",
      "size": 512, "ref": null, "knockout": true, "tolerance": 1 },
    …
  ]
Fields: prompt (required), out (required), size (default 512; or [w,h]),
        ref (optional reference-image path), knockout (default true),
        tolerance (0 = strict chroma, 1 = wide/fringe-hunting), skip_if_exists (default false).

RULES THAT MAKE RESULTS GOOD (learned over 4 art rounds on Football HQ):
  • Always end prompts with: "flat solid chroma-green (#00d000) background, no text".
  • Recolors: pass --ref with the original and say "identical camera, silhouette and
    style — repaint accents only".
  • Icons: add "reads clearly at 16px".
  • Characters: "eye-level 3/4 view", buildings: "isometric aerial view".
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

from PIL import Image

MODEL = os.environ.get("FORGE_MODEL", "gemini-2.5-flash-image")
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


from typing import NoReturn


def die(msg: str) -> NoReturn:
    print(f"❌ {msg}", file=sys.stderr)
    sys.exit(1)


def generate(prompt: str, ref_path: str | None, api_key: str, retries: int = 3) -> bytes:
    """Call the Gemini image model; returns raw PNG bytes."""
    parts: list[dict] = [{"text": prompt}]
    if ref_path:
        with open(ref_path, "rb") as f:
            parts.append({"inline_data": {"mime_type": "image/png",
                                          "data": base64.b64encode(f.read()).decode()}})
    body = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }).encode()

    url = ENDPOINT.format(model=MODEL) + f"?key={api_key}"
    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, data=body,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.load(resp)
            for part in data["candidates"][0]["content"]["parts"]:
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    return base64.b64decode(inline["data"])
            raise RuntimeError("response contained no image part")
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:300]
            if e.code == 429 and attempt < retries:
                wait = 20 * attempt
                print(f"   ⏳ rate-limited, retrying in {wait}s… ({detail[:80]})")
                time.sleep(wait)
                last_err = e
                continue
            raise RuntimeError(f"HTTP {e.code}: {detail}") from e
        except Exception as e:  # noqa: BLE001 — retry any transient failure
            last_err = e
            if attempt < retries:
                time.sleep(5 * attempt)
                continue
    raise RuntimeError(f"generation failed after {retries} attempts: {last_err}")


def knockout(img: Image.Image, tolerance: int) -> Image.Image:
    """Remove the chroma-green backdrop (same math as remove_background.py, proven over 60+ assets)."""
    img = img.convert("RGBA")
    px = img.load()
    assert px is not None
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]  # type: ignore[misc]
            if tolerance >= 1:
                if g > 100 and r < 130 and b < 130 and g > r + 10 and g > b + 10:
                    px[x, y] = (0, 0, 0, 0)
            else:
                if g > 150 and r < 80 and b < 80:
                    px[x, y] = (0, 0, 0, 0)
    return img


def process(raw: bytes, out_path: str, size, do_knockout: bool, tolerance: int) -> None:
    from io import BytesIO
    img = Image.open(BytesIO(raw))
    if do_knockout:
        img = knockout(img, tolerance)
    if size:
        w, h = (size, size) if isinstance(size, int) else (size[0], size[1])
        img = img.resize((w, h), Image.Resampling.LANCZOS)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    img.save(out_path)


def run_job(job: dict, api_key: str, idx: int, total: int) -> bool:
    out = job["out"]
    if job.get("skip_if_exists") and os.path.exists(out):
        print(f"[{idx}/{total}] ⏭  exists, skipping {out}")
        return True
    print(f"[{idx}/{total}] 🎨 {out}")
    try:
        raw = generate(job["prompt"], job.get("ref"), api_key)
        process(raw, out, job.get("size", 512), job.get("knockout", True), job.get("tolerance", 1))
        print(f"[{idx}/{total}] ✅ saved {out}")
        return True
    except Exception as e:  # noqa: BLE001 — a batch keeps going past one bad job
        print(f"[{idx}/{total}] ❌ {out}: {e}", file=sys.stderr)
        return False


def main() -> None:
    p = argparse.ArgumentParser(description="Generate game assets: prompt → transparent PNG at an exact path.")
    p.add_argument("--manifest", help="JSON list of jobs")
    p.add_argument("--prompt", help="single-shot prompt")
    p.add_argument("--out", help="single-shot output path")
    p.add_argument("--ref", help="single-shot reference image", default=None)
    p.add_argument("--size", help="single-shot size (N or WxH)", default="512")
    p.add_argument("--no-knockout", action="store_true", help="keep the background (full-bleed art)")
    p.add_argument("--tolerance", type=int, default=1, choices=[0, 1])
    args = p.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        die("set GEMINI_API_KEY (get one at aistudio.google.com/apikey)")

    if args.manifest:
        with open(args.manifest) as f:
            jobs = json.load(f)
        ok = sum(run_job(j, api_key, i + 1, len(jobs)) for i, j in enumerate(jobs))
        print(f"\n{'✅' if ok == len(jobs) else '⚠️'} {ok}/{len(jobs)} assets landed")
        sys.exit(0 if ok == len(jobs) else 2)
    elif args.prompt and args.out:
        size = [int(v) for v in args.size.split("x")] if "x" in args.size else int(args.size)
        job = {"prompt": args.prompt, "out": args.out, "ref": args.ref,
               "size": size, "knockout": not args.no_knockout, "tolerance": args.tolerance}
        sys.exit(0 if run_job(job, api_key, 1, 1) else 1)
    else:
        p.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
