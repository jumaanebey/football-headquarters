# Missing Assets — Round 3 queue (nano_banana_pro)

**Round 1: ✅ complete** (buildings, units, heroes, mascot, fan mob, defenses, projectiles).
**Round 2: ✅ complete** (ground tileset, brand, rival skins). **Round 2b: ✅ complete**
(fence-straight + fence-post — shipped and wired neighbor-aware).

This file is now the **Round 3** queue: **rival coach portraits** (the season is a story with
12 named coaches now — they talk trash pre-game and react post-game, currently emoji), the
**4 single-player battle sprites** (players still render as jersey chips in battle), and two
**conformance fixes**.

**Style law:** every prompt MUST be composed with the locked templates in `ART-DIRECTION.md`
(§4, CHARACTERS family for portraits) and pass its §6 checklist. Home palette black `#111827`
/ orange `#f97316` / white; rival crimson `#b91c1c` / charcoal `#1f2937`; **generic marks
only — no real-team logos**. Knockout via `remove_background.py` on everything below.

**Code is already wired**: every slot below renders an emoji/chip fallback today and
auto-swaps to the PNG the moment the file lands at the exact path. Drop PNGs only — do not
edit code.

---

## TIER 1 — Season rival coach portraits (12) → `public/assets/coaches/<slug>.png` (512², knockout)

Bust portrait, eye-level 3/4 view, cel-shaded with thick outlines (same style family as the
hero portraits — attach `public/assets/heroes/coach.png` as the style reference). Head +
shoulders composed to read inside a CIRCLE crop (keep face centered, nothing important in
corners). Each coach wears a polo/headset/jacket in THEIR accent color listed below (these
are opposing teams — not the home black/orange). Expressive faces with personality; varied
ages, builds, ethnicities; 4 of the 12 are women (Chalmers, Wilder, Voss + make Olsen a
woman). No text, no logos beyond a plain shield crest.

| # | File | Coach | Accent | Personality direction |
|---|------|-------|--------|----------------------|
| 1 | `grimes.png` | "Salty" Pete Grimes | #ca8a04 | weathered old cowboy, straw hat, toothpick, warm scrappy grin |
| 2 | `chalmers.png` | Deb Chalmers | #0ea5e9 | 50s professor, glasses on chain, red grading pen behind ear, unimpressed |
| 3 | `marino.png` | Sal Marino | #0891b2 | burly dockworker energy, sea-captain beard, chewing gum, squint |
| 4 | `nakamura.png` | "Binary" Bob Nakamura | #6366f1 | young analytics nerd, tablet clutched, taped glasses, smug |
| 5 | `wilder.png` | June Wilder | #d97706 | athletic 30s woman, whistle, puma-print collar, predator smile |
| 6 | `olsen.png` | "Icebox" Olsen | #38bdf8 | stoic Nordic woman in a huge parka, frost on eyebrows, dead stare |
| 7 | `laroux.png` | Remy LaRoux | #16a34a | charming bayou schemer, gator-tooth necklace, sly grin, gold tooth |
| 8 | `kowalski.png` | "Bricks" Kowalski | #78716c | massive square-jawed steelworker, flat-top, neck wider than head |
| 9 | `deluxe.png` | Vince Deluxe | #a855f7 | slick showman, sunglasses at night, blinding smile, popped collar |
| 10 | `cross.png` | Sterling Cross | #eab308 | silver-haired aristocrat, gold-trimmed blazer, chin high |
| 11 | `voss.png` | Vera Voss | #b91c1c | severe empire-builder in crimson, sharp bob, ice-cold command |
| 12 | `hale.png` | Marcus "The GOAT" Hale | #f97316 | legendary champion, ring-heavy fingers steepled, knowing smirk, 11 tiny championship pins on jacket |

> (per-portrait prompt skeleton) Cel-shaded bust portrait of [personality direction], a rival
> American-football head coach for a mobile base-builder game, eye-level 3/4 view, head and
> shoulders centered for a circular avatar crop, coaching polo and headset in [accent color],
> thick confident outlines, bold flat shading, expressive face, plain shield crest only,
> flat solid chroma-green (#00d000) background, no text.

## TIER 1b — Raid scrimmage coach portraits (6) → same spec, same folder

| # | File | Coach | Accent | Personality direction |
|---|------|-------|--------|----------------------|
| 13 | `tanner.png` | Buck Tanner | #dc2626 | red-faced hothead mid-yell, vein popping, crushed clipboard |
| 14 | `vega.png` | Rosa Vega | #db2777 | cool smirking tactician, arms crossed, one eyebrow up |
| 15 | `holloway.png` | Duke Holloway | #7c3aed | tweedy over-thinker, monocle vibe, wall-of-string energy |
| 16 | `frost.png` | Mabel Frost | #0284c7 | sweet-looking older woman with villain eyes, knitted team scarf |
| 17 | `twotimes.png` | Tony Two-Times | #ea580c | fast-talking wise guy, two watches, pointing with both hands |
| 18 | `hux.png` | Grandma Hux | #65a30d | tiny fierce grandma, whistle AND reading glasses, cookie in pocket |

---

## TIER 2 — Single-player battle sprites (4) → `public/assets/units/<slug>-player.png` (512², knockout)

ONE full-body football player each (NOT the trio compositions — battle deploys individuals
now). Eye-level 3/4 action pose, cel-shaded, thick outlines, HOME identity: black `#111827`
helmet with orange `#f97316` center stripe, jersey in the position color below, white
pants. Blank jersey (numbers are composited in code — keep the chest clean). Same style
family as the hero art.

| # | File | Position group | Jersey color | Pose direction |
|---|------|----------------|--------------|----------------|
| 19 | `offensive-line-player.png` | Lineman | steel #475569 | huge blocker mid drive-block, low pad level |
| 20 | `skill-positions-player.png` | Skill | orange #f97316 | lean receiver sprinting with the ball tucked |
| 21 | `defensive-line-player.png` | Front 7 | charcoal #1f2937 | linebacker exploding forward into a tackle |
| 22 | `secondary-player.png` | Secondary | gold #eab308 | DB backpedaling then breaking, fast and twitchy |

---

## TIER 3 — Conformance fixes (regenerate, same paths)

### 23. `public/assets/buildings/rival-stadium.png` — REDO (style drift)
Current file reads 3D-rendered, off the cel-shaded house style. Regenerate with
`stadium-3.png` attached as the reference: identical camera, silhouette and footprint,
cel-shaded thick-outline style, repainted crimson `#b91c1c` / charcoal `#1f2937` accents,
plain crimson shield crest, moodier lighting.

### 24. Green-fringe cleanup on rival skins
`rival-headquarters.png`, `rival-film-room.png`, `rival-weight-room.png`,
`rival-practice-field.png` have chroma-green halo pixels on some edges. Re-run the knockout
with a wider tolerance (or regenerate) — no green fringe at 2× zoom.

---

## Wiring notes (code side — already done, just drop the PNGs)
- Coach portraits: `RivalCoach.art` renders over the emoji in the pre-game presser bubble,
  the post-game reaction, and the Season list the moment the file exists.
- Player sprites: `unitPlayerSprite()` already points at `units/<slug>-player.png`; the
  jersey-chip fallback hides itself when the image loads.
- Rival stadium / fringe fixes: same filenames — overwrite in place.
