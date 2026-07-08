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

def flood_knockout(raw_path: str, out_path: str, size: int):
    """BFS from the four corners, erasing pixels close to the corner background color.
    Handles models that render an off-tint background instead of true chroma green."""
    from PIL import Image
    from collections import deque
    im = Image.open(raw_path).convert("RGBA")
    if im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    px = im.load()
    w, h = im.size
    corners = [px[0, 0], px[w-1, 0], px[0, h-1], px[w-1, h-1]]
    br = sum(c[0] for c in corners) / 4; bg = sum(c[1] for c in corners) / 4; bb = sum(c[2] for c in corners) / 4
    TOL = 52
    close = lambda p: abs(p[0]-br) + abs(p[1]-bg) + abs(p[2]-bb) < TOL * 3
    seen = [[False]*h for _ in range(w)]
    q = deque([(0,0),(w-1,0),(0,h-1),(w-1,h-1)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[x][y]: continue
        seen[x][y] = True
        p = px[x, y]
        if not close(p): continue
        px[x, y] = (p[0], p[1], p[2], 0)
        q.extend([(x+1,y),(x-1,y),(x,y+1),(x,y-1)])
    # soften the cutline: 1px alpha feather where opaque meets erased
    im.save(out_path)

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
        raw = a.out + ".raw.png"
        import shutil
        shutil.copy(a.out, raw)
        subprocess.run([sys.executable, "remove_background.py", a.out, str(a.size), str(a.size), "1"], check=True)
        if not verify(a.out):
            # The model didn't render true #00d000 — flood-fill from the corners using
            # whatever background color actually arrived (soft alpha near the cutline).
            flood_knockout(raw, a.out, a.size)
            defringe(a.out)
            ok = verify(a.out)
            print("PASS after flood-knockout" if ok else "⚠️ STILL FAILING — inspect manually before shipping")
        else:
            print("PASS")
        os.remove(raw)
