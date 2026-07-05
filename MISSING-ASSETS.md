# Missing Assets — Round 2 queue (nano_banana_pro)

**Round 1 status: ✅ 100% COMPLETE** (all tiers + trademark redo shipped and wired in-game —
buildings, units, single-player battle sprites, all 9 heroes, mascot, fan mob, defenses,
projectiles, blocking sled). This file is now the **Round 2** queue: environment, brand, and
away-game identity.

**Style law:** every prompt below MUST be composed with the locked templates in
`ART-DIRECTION.md` (§4) and pass its §6 checklist. Home palette black `#111827` / orange
`#f97316` / white; rival palette crimson `#b91c1c` / charcoal `#1f2937`; generic marks only.
Knockout via `remove_background.py` **except where marked FULL-BLEED** (no chroma background
on those).

---

## TIER 1 — Ground tileset (turns the CSS island into painted terrain)
These are FLAT GROUND TILES, not objects — special rules: **exact isometric 2:1 diamond**
(width = 2 × height), artwork must run precisely to the diamond edges so tiles butt
seamlessly, NO outline stroke on the diamond border, no cast shadows.

### 1. Turf tile → `public/assets/ground/turf-tile.png` (512×256 diamond on 512×512 canvas)
> Isometric 2:1 diamond ground tile for a mobile base-builder, lush mowed stadium turf seen
> from the standard isometric angle, subtle mower sheen and fine grass texture, saturated
> healthy green (#3aa353 family), cel-shaded, **edges exactly on the diamond boundary, seamless
> when tiled, no outline, no shadow**, flat solid chroma-green (#00d000) background outside
> the diamond only.

### 2. Turf tile B (dark band) → `public/assets/ground/turf-tile-dark.png` (512×512)
> Same exact tile as the mowed stadium turf diamond but one shade deeper green (#349a4c
> family) for alternating mowed-lawn bands — identical texture direction and edge treatment
> so the two tiles interleave seamlessly.

### 3. Dirt path tile → `public/assets/ground/dirt-path-tile.png` (512×512)
> Isometric 2:1 diamond ground tile of worn tan dirt path with sparse grass creeping over
> the edges, cleat prints pressed into the dirt, warm tan (#cdb47e family), cel-shaded,
> edges exactly on the diamond boundary, seamless when tiled, no outline, no shadow.

### 4. Island edge strip → `public/assets/ground/island-edge.png` (1024×512)
> A horizontal soil cliff-edge strip for the underside of a floating turf island: rich dark
> earth with embedded pebbles and dangling root wisps, grass lip overhanging the top edge,
> reads left-to-right and tiles horizontally, cel-shaded with bold shading bands
> (#5c4630 top to #4a3826 bottom), no outline on the tiling sides.

---

## TIER 2 — Brand & identity
### 5. Wordmark / logo → `public/assets/brand/logo.png` (1024×1024, knockout)
> Bold two-line video-game logo reading "FOOTBALL" over "HEADQUARTERS", chunky varsity
> block letters with beveled cel-shaded faces, black (#111827) letters with thick orange
> (#f97316) outline and white inner trim, football-lace stitching detail across the
> crossbar of the H, slight upward arc composition, energetic sports-game logo style,
> centered, flat solid chroma-green (#00d000) background.

### 6. OG / share image → `public/assets/brand/og-image.png` (1600×900, **FULL-BLEED — no knockout**)
> Wide hero banner for a football base-builder game: the same "FOOTBALL HEADQUARTERS"
> varsity wordmark centered over a night-time stadium scene — floodlights sweeping from the
> corners, packed crowd bokeh in black and orange, an isometric turf island with a glowing
> stadium at center below the wordmark, cel-shaded mobile-game splash-art style, black/orange
> /white palette, cinematic but clean, no other text.

### 7. App icon → `public/assets/brand/app-icon.png` (1024×1024, **FULL-BLEED — no knockout**)
> Mobile game app icon: a glossy cel-shaded American football angled upward wearing a tiny
> gold championship crown, on a deep black-to-charcoal (#111827) radial background with an
> orange (#f97316) rim-light ring, bold thick outlines, reads clearly at small sizes,
> composition safely inside rounded-square margins, no text.

---

## TIER 3 — Away-game identity (rival stadium skins)
Crimson-accented variants of the 5 battle-map buildings so raids FEEL like away games.
Same silhouette/base-tile/camera as the originals (attach the original as the reference
image!), but repaint accents/banners/roofs to **crimson #b91c1c + charcoal #1f2937**, and
swap any home marks for a plain crimson shield crest.

### 8.  `public/assets/buildings/rival-stadium.png` (1024²) — ref: `stadium-3.png`
### 9.  `public/assets/buildings/rival-headquarters.png` (1024²) — ref: `headquarters-1.png`
### 10. `public/assets/buildings/rival-film-room.png` (1024²) — ref: `film-room-1.png`
### 11. `public/assets/buildings/rival-weight-room.png` (1024²) — ref: `weight-room-1.png`
### 12. `public/assets/buildings/rival-practice-field.png` (1024²) — ref: `practice-field-1.png`
> (per-building prompt) The exact same building as the reference image — identical camera,
> silhouette, footprint tile, and cel-shaded style — but repainted as the RIVAL team's
> facility: crimson (#b91c1c) and charcoal (#1f2937) accents, crimson banners and roof trim,
> a plain crimson shield crest replacing any home markings, slightly moodier lighting.

---

## Wiring notes (code side — do not edit code, just drop the PNGs)
- Ground tiles + island edge: code will adopt them in `IsometricMap.GroundLayer` once present.
- Logo: title screen/FTUE header + README. OG image: `index.html` meta og:image.
- Rival skins: `battleBuildingSprite()` will switch to the `rival-*` pool for attack mode.
- App icon: Capacitor/App-Store packaging later.
