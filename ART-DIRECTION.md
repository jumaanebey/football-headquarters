# Art Direction — House Style (read before generating ANY asset)

nano_banana_pro regenerates every image from scratch, so consistency does **not** happen by
accident. It happens because every asset is built from the **locked template** below, uses the
**locked palette**, and is **checked against a reference** before it's accepted. If a generation
misses camera, palette, linework, or base — regenerate it. Don't ship a near-miss.

This doc governs. `MISSING-ASSETS.md` = the queue (what to make); this = how to make it match.

---

## 1. The locked palette (the #1 matching lever)

**HOME TEAM — every player character wears this** (units, heroes, mascot, fan mob):
| Role | Hex | Use |
|---|---|---|
| Primary | `#111827` black | jersey base, helmet shell, pants |
| Secondary | `#f97316` orange | stripes, numbers, trim, gloves accents |
| Trim | `#ffffff` white | outlines on numbers, socks, facemask highlights |

**RIVAL — all enemy bases (Valley State, Tech University)**:
| Role | Hex | Use |
|---|---|---|
| Primary | `#b91c1c` crimson | enemy accents, flags, banners |
| Secondary | `#1f2937` charcoal | enemy structure trim |

**NEUTRAL — equipment & environment (same for everyone):**
| Thing | Hex |
|---|---|
| Turf (must match the battle field) | `#2f9e44` green |
| Dirt / base tile | `#c8a165` tan |
| Stone base edge | `#9ca3af` gray |
| Steel / metal equipment | `#94a3b8` steel |
| Hazard stripes | `#facc15` yellow + `#111827` black |

> **Generic marks only — legal requirement.** No real team logos, names, or trademarks
> (no Bears "C", Eagles wings, Rams horns, etc.). The home team's mark is **a simple orange
> flame or a bold orange star** on a black helmet. Enemy mark = a plain crimson shield.

---

## 2. Two style families (match WITHIN each family)

### A. STRUCTURES — buildings, turrets, walls, decor
- **Camera:** isometric 3/4 aerial, ~30° top-down, viewed from the front-left. Same angle every time.
- **Base:** every structure sits on a **square isometric tile** — green turf top, tan dirt sides, thin gray stone edge. Same footprint treatment as the existing building sprites.
- **Framing:** object centered, fills **80–90%** of frame.
- **Canvas:** 1024×1024.

### B. CHARACTERS — units, heroes, mascot, fan mob
- **Camera:** eye-level 3/4 front view, **full body, feet visible**. Heroes get a slight low "hero" angle.
- **Pose:** standing or mid-action, centered, fills **~85% of frame height**.
- **Canvas:** 1024×1024 heroes/mascot; 512×512 unit trios & fan mob.

### PROJECTILES (footballs, flags) — 512×512, single object, motion streak, no base tile.

---

## 3. Rendering style (identical for BOTH families)
- **Cel-shaded**: 2 light bands + 1 shadow band. No photoreal gradients.
- **Outlines**: thick uniform black outer outline, thinner interior lines. Chunky mobile-game look.
- **Light**: soft key light from **top-left**, single soft contact shadow under the object.
  The background stays flat — **no cast shadow onto the green** (it must knock out cleanly).
- **Color**: saturated, high-contrast.
- **Proportions**: slightly exaggerated, sturdy, Clash-of-Clans/Boom-Beach chunk.
- **Background**: flat solid chroma-green `#00d000`, nothing else.

---

## 4. The LOCKED prompt template

Paste the matching family block, then fill `{SLOT}` with the per-asset line from MISSING-ASSETS.md.
Do not drop or reorder the fixed clauses — they are what make assets match.

**STRUCTURE template:**
> Isometric 2D game asset, Clash-of-Clans / Boom Beach mobile-game style, **isometric 3/4 aerial
> view ~30° from the front-left**, cel-shaded with 2 light bands and 1 shadow band, **thick uniform
> black outlines**, soft top-left key light, saturated high-contrast colors. The object sits on a
> **square isometric tile with green turf top, tan dirt sides, and a thin gray stone edge**. Single
> object centered filling 85% of frame. Flat solid chroma-green #00d000 background, no cast shadow
> on the background, no text, no UI. Football theme. Palette: {home orange #f97316 & black #111827
> accents / rival crimson #b91c1c / neutral steel — pick per asset}. {SLOT}

**CHARACTER template:**
> Character sprite for a Clash-of-Clans / Boom Beach mobile game, **eye-level 3/4 front view, full
> body with feet visible**, cel-shaded with 2 light bands and 1 shadow band, **thick uniform black
> outlines**, soft top-left key light, saturated colors, sturdy slightly-exaggerated proportions.
> **Uniform: black #111827 base with orange #f97316 stripes/numbers and white #ffffff trim; black
> helmet with a simple orange flame/star mark — GENERIC fictional team, NO real NFL logos, names,
> or trademarks.** Single character centered filling 85% of frame height. Flat solid chroma-green
> #00d000 background, no cast shadow on the background, no text. {SLOT}

---

## 5. Reference-image workflow (this is how you actually force a match)

nano_banana_pro accepts **reference images**. Always attach one when generating so palette and
linework carry over — prompts alone drift.

- **Structures →** attach an approved structure (`blocking-sled.png` or a base building) as the style ref.
- **Characters →** once ONE home-team character is approved, attach it as the ref for every other
  character so uniforms/faces/linework stay identical.
- When iterating a variant (e.g. secondary-idle → ready → training), **reuse the same seed** and the
  same reference so only the pose changes.

**Bootstrapping the character look:** generate the **Skill unit trio first**, get it perfectly on
black/orange, lock it as the "master reference," then generate every other unit and hero against it.

---

## 6. Acceptance checklist (run before saving EVERY asset)
- [ ] Camera matches its family (structure = iso aerial / character = eye-level 3/4)?
- [ ] Palette = home black+orange (players) / rival crimson (enemy) / neutral (gear)?
- [ ] Thick black outlines + cel shading (not photoreal, not thin-line)?
- [ ] Structures: sitting on the standard turf/dirt/stone tile?
- [ ] Fills 80–90% of frame, centered?
- [ ] Generic mark only — zero real team logos?
- [ ] Clean knockout — no green halo/fringe left after `remove_background.py`?
- [ ] Correct canvas (1024² structures/heroes, 512² units/projectiles)?

If any box fails → regenerate with a stronger reference or corrected prompt. Eyeball it next to an
already-approved asset before moving on.

---

## 7. Antigravity workflow (per asset)
1. Read this doc + `MISSING-ASSETS.md`. Pick the next asset.
2. Build the prompt: family template (§4) + the asset's `{SLOT}` line + the right palette clause.
3. `generate_image` (nano_banana_pro) **with a reference image attached** (§5).
4. Knockout: `remove_background.py <path> <canvasSize>` (1024 or 512).
5. Save to the exact `public/assets/...` path from MISSING-ASSETS.md.
6. Run the §6 checklist. Compare side-by-side with the reference.
7. Mismatch → regenerate. Match → next asset.

**Stay in `public/assets/` — art only.** Code files (`battle.ts`, `assets.ts`, `BattleScreen.tsx`,
`App.tsx`) are owned by the code workstream; don't edit them.

---

## 8. Conformance pass — existing art to REDO for the new palette
The already-generated players are off-identity (Bears navy/orange, Eagles navy/red, coach navy/gold,
kicker red/gold, burner navy/red). To make everything match black+orange, regenerate these against
the master reference:

**Priority (most visible first):**
1. `units/skill-positions-*` → **make this the master reference** (black/orange trio), then:
2. `units/{offensive-line,defensive-line,secondary}-{idle,ready,training}.png`
3. `heroes/{qb,enforcer,coach,kicker,burner}.png` — black/orange kit (a distinguishing prop per hero
   is fine: QB a ball, Kicker a kicking tee, Coach a clipboard — but same uniform + generic mark).

**Keep as-is (neutral, already conform):** `blocking-sled`, `coach-tower`, base buildings, icons,
decor. **Spot-check** `tackle-sled-tower` — nudge its accent to home-orange if it reads too blue.

Enemy structures: when regenerating, apply the **crimson #b91c1c** accent so raids feel like away games.
