#!/usr/bin/env python3
"""One-command art pipeline: Gemini image gen → chroma knockout → full verification.

Replaces the copy-paste-into-Antigravity loop with the same model family (nano banana),
plus the checks Antigravity kept missing (interior green residue, edge pixels).

Usage:
  python3 scripts/gen_asset.py --out public/assets/fx/thing.png --size 1024 \
      --prompt "cel-shaded ... flat solid chroma-green (#00d000) background, no text" \
      [--ref public/assets/heroes/qb.png]   # identity/style reference image
  Add --no-knockout for soft glow layers where fringe rules don't apply.

Key: put GEMINI_API_KEY=... in .env at the repo root (gitignored) or export it.
"""
import argparse, base64, json, os, subprocess, sys, urllib.request

MODEL = "gemini-2.5-flash-image"

def api_key():
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    if os.path.exists(".env"):
        for line in open(".env"):
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("No GEMINI_API_KEY found. Put GEMINI_API_KEY=... in .env (gitignored) or export it.")

def generate(prompt: str, ref_path: str | None) -> bytes:
    parts = []
    if ref_path:
        with open(ref_path, "rb") as f:
            parts.append({"inline_data": {"mime_type": "image/png", "data": base64.b64encode(f.read()).decode()}})
        prompt = "Use the attached image as the identity/style reference — same character, camera, proportions, and palette.\n" + prompt
    parts.append({"text": prompt})
    body = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
    }).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=body, headers={"Content-Type": "application/json", "x-goog-api-key": api_key()})
    with urllib.request.urlopen(req, timeout=180) as r:
        resp = json.load(r)
    for part in resp.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if "inlineData" in part:
            return base64.b64decode(part["inlineData"]["data"])
    sys.exit(f"No image in response: {json.dumps(resp)[:800]}")

def verify(path: str) -> bool:
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    greens = sum(1 for x in range(0, w, 3) for y in range(0, h, 3)
                 if (lambda r, g, b, a: a > 40 and g > 110 and g > r + 40 and g > b + 40)(*px[x, y]))
    edges = sum(1 for x in range(w) if px[x, 1][3] > 0 or px[x, h - 2][3] > 0) \
          + sum(1 for y in range(h) if px[1, y][3] > 0 or px[w - 2, y][3] > 0)
    print(f"verify {path}: {w}x{h} | interior green samples: {greens} | near-edge opaque px: {edges}")
    return greens == 0 and edges == 0

def defringe(path: str):
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    n = 0
    for x in range(w):
        for y in range(h):
            r, g, b, a = px[x, y]
            if a and g > r and g > b:
                ex = g - max(r, b)
                if ex > 60: px[x, y] = (r, g, b, 0); n += 1
                elif ex > 10: px[x, y] = (r, max(r, b), b, max(0, a - ex)); n += 1
    im.save(path)
    print(f"defringed {n} px")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--ref", default=None, help="reference image path (identity-attached generation)")
    ap.add_argument("--no-knockout", action="store_true", help="skip bg removal (soft glow layers)")
    a = ap.parse_args()

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    png = generate(a.prompt, a.ref)
    open(a.out, "wb").write(png)
    print(f"saved {a.out} ({len(png)//1024}kb)")

    if not a.no_knockout:
        subprocess.run([sys.executable, "remove_background.py", a.out, str(a.size), str(a.size), "1"], check=True)
        if not verify(a.out):
            defringe(a.out)
            ok = verify(a.out)
            print("PASS after defringe" if ok else "⚠️ STILL FAILING — inspect manually before shipping")
        else:
            print("PASS")
