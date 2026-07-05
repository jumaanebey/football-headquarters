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

## Wiring notes (code side — do not edit code)
- Building recolors overwrite existing paths → they appear on every board instantly.
- Currency icons: code adopts `icons/crowns.png` / `icons/fans.png` during the Phase B
  design-system pass (fallback to current lucide icons until then — safe either order).

## Delivery report format
Path list of what landed, anything skipped for silhouette drift, 2–3 samples pasted.
