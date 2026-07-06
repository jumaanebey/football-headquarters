# Missing Assets — Round 4 queue (nano_banana_pro)

**Rounds 1–3: ✅ 100% complete** (buildings, units, heroes, coaches ×18, single-player
sprites ×4, ground, brand, rivals, fences). Round 3's rival-stadium redo is ACCEPTED.

**Round 4 = TEAM IDENTITY.** The club's colors are black `#111827` + orange `#f97316` —
but the HOME buildings are still blue/teal from the original asset pool, so the player's
own base doesn't look like their team. This round repaints the home facilities in club
colors. Plus two small currency icons the UI design-system pass needs.

**Style law:** `ART-DIRECTION.md` §4/§6 as always. Every recolor is REFERENCE-ATTACHED:
attach the existing PNG and keep the camera, silhouette, and footprint IDENTICAL —
repaint accents only. Knockout via `remove_background.py`. Do not edit code.

---

## TIER 1 — Home building recolors (21 files, work top-to-bottom; okay to span quota cycles)

> (per-file prompt) The exact same building as the reference image — identical camera,
> silhouette, footprint, and cel-shaded style — repainted in the HOME club identity:
> black (#111827) and charcoal structure with ORANGE (#f97316) accents, trim, banners,
> roof details and lighting, white secondary trim, a small orange shield crest replacing
> any other marks. Keep glass/windows cool-neutral. Flat solid chroma-green (#00d000)
> background, no text.

Priority order (highest-visibility first — the levels players actually see):

| # | File (overwrite in place) | Ref |
|---|---|---|
| 1 | `public/assets/buildings/stadium-5.png` | itself |
| 2 | `public/assets/buildings/stadium-3.png` | itself |
| 3 | `public/assets/buildings/stadium-1.png` | itself |
| 4 | `public/assets/buildings/headquarters-5.png` | itself |
| 5 | `public/assets/buildings/headquarters-3.png` | itself |
| 6 | `public/assets/buildings/headquarters-1.png` | itself |
| 7 | `public/assets/buildings/practice-field-5.png` | itself |
| 8 | `public/assets/buildings/practice-field-3.png` | itself |
| 9 | `public/assets/buildings/practice-field-1.png` | itself |
| 10 | `public/assets/buildings/film-room-5.png` | itself |
| 11 | `public/assets/buildings/film-room-3.png` | itself |
| 12 | `public/assets/buildings/film-room-1.png` | itself |
| 13 | `public/assets/buildings/weight-room-5.png` | itself |
| 14 | `public/assets/buildings/weight-room-3.png` | itself |
| 15 | `public/assets/buildings/weight-room-1.png` | itself |
| 16 | `public/assets/buildings/stadium-4.png` | itself |
| 17 | `public/assets/buildings/stadium-2.png` | itself |
| 18 | `public/assets/buildings/headquarters-4.png` | itself |
| 19 | `public/assets/buildings/headquarters-2.png` | itself |
| 20 | `public/assets/buildings/practice-field-4.png` | itself |
| 21 | `public/assets/buildings/practice-field-2.png` | itself |

⚠️ These overwrite live files — if a result drifts off the reference silhouette, SKIP it
and report rather than overwriting good art with a mismatch.

## TIER 2 — Currency icons (2 files, 512², knockout)

The UI is standardizing: currencies = PNG art icons (coins + energy already exist in
`public/assets/icons/` — match their look exactly; attach `icons/coins.png` as style ref).

### 22. Crowns → `public/assets/icons/crowns.png`
> Small glossy cel-shaded royal crown game icon, purple-magenta gems and gold body,
> thick outline, reads at 16px, same rendering style as the reference coin icon,
> flat solid chroma-green (#00d000) background, no text.

### 23. Fans → `public/assets/icons/fans.png`
> Small cel-shaded game icon of a rose-red foam "#1" fan hand, thick outline, reads at
> 16px, same rendering style as the reference coin icon, flat solid chroma-green
> (#00d000) background, no text.

---

## TIER 3 — Round 4b: decor recolors (5 files — AFTER Tiers 1–2)

The board's buildings now wear club colors, so the old blue/teal decor pieces are the
last off-identity things on the field. Same reference-attached recolor drill: attach the
existing PNG, identical silhouette/camera, repaint accents to black `#111827` / charcoal
+ orange `#f97316`, white trim, orange shield crest where a mark exists. Keep natural
materials natural (water stays water, grass stays grass, stone stays stone). 1024²,
knockout, overwrite in place; skip-on-drift rule applies.

| # | File |
|---|---|
| 24 | `public/assets/decor/statue-legends.png` |
| 25 | `public/assets/decor/merch-stand.png` |
| 26 | `public/assets/decor/club-fountain.png` |
| 27 | `public/assets/decor/tailgate-tent.png` |
| 28 | `public/assets/decor/parking-lot.png` |

(`team-bus.png` is already on-identity — do not touch.)

## TIER 4 — Round 4c: off-identity HERO redos (2 files — Phase C playtest finding)

On-device review caught two heroes from the very first art session that predate the
style law: **The Franchise (`heroes/qb.png`) is GREEN & GOLD — Packers colors, both
off-identity and trademark-adjacent** — and The Enforcer (`heroes/enforcer.png`) is navy.
Regenerate both in HOME identity. 512², knockout, overwrite in place.

### 29. `public/assets/heroes/qb.png` — The Franchise
> Cel-shaded heroic star QUARTERBACK for a mobile base-builder, full body, eye-level 3/4
> view, clutching a glowing golden football, confident superstar energy, HOME identity:
> black (#111827) helmet with orange (#f97316) center stripe, orange jersey with white
> trim (BLANK chest), white pants, golden aura flames, thick confident outlines, bold
> flat shading, plain shield crest only, flat solid chroma-green (#00d000) background,
> no text, no real-team marks.

### 30. `public/assets/heroes/enforcer.png` — The Enforcer
> Cel-shaded hulking BRUISER lineman hero, full body, eye-level 3/4 view, cracking his
> knuckles, intimidating wall-of-muscle energy, HOME identity: black (#111827) helmet
> with orange (#f97316) center stripe, charcoal (#1f2937) jersey with orange trim (BLANK
> chest), white pants, thick confident outlines, bold flat shading, plain shield crest
> only, flat solid chroma-green (#00d000) background, no text, no real-team marks.

**After 4c the art pipeline is CLOSED** until the on-device playtest (Phase C) surfaces
something else specific. No speculative art.

## Wiring notes (code side — do not edit code)
- Building recolors overwrite existing paths → they appear on every board instantly.
- Currency icons: code adopts `icons/crowns.png` / `icons/fans.png` during the Phase B
  design-system pass (fallback to current lucide icons until then — safe either order).

## Delivery report format
Path list of what landed, anything skipped for silhouette drift, 2–3 samples pasted.
