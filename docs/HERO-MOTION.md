# Hero identity in motion — Package B (branch `claude/fhq-hero-motion`)

Base: `claude/fhq-assets-reliability` (Package A) on `claude/fhq-integration` (main `ae34401` + PR #45). Presentation only: no simulation field is written, no balance, timing, cost or schema changes. Evidence: `docs/evidence/motion/*.webp` (before/after strips per hero) and `summary.json` (frame indices per keyframe, dense sample counts).

## 11. The motion path, before this package

Who decides what, on `main`:

| Decision | Owner | Notes |
| --- | --- | --- |
| Position (`x`, `y`) | `game/combat/engine.ts` targeting/pathing | authoritative, hashed |
| Facing (`face`) | `spriteFacing` via `spriteMotion` (engine tick) and target selection | derived from displacement; not hashed |
| Movement observed (`moving`) and stride phase | `game/spriteMotion.ts` from displacement per tick (6.3 field units per stride) | presentation, not hashed; a blocked actor keeps its phase |
| Stride cadence (`strideSeconds`) | `spriteMotion`, from actual speed (0.28–0.9 s) | presentation |
| Attack/ability windows (`actionPoseT`, `abilityPoseT`, `truckT`) | engine, when contact or an ability fires | timers count down in the simulation |
| Hit flash (`hitFlash`) | engine on damage | 0.12–0.2 s |
| Signature beat (`signatureFrame`) | engine action timing (`game/combat/actionTiming.ts`) | Set/Load/Release/Recover |
| Which frame is drawn | `game/heroMotion.ts` (battle), `game/heroPatrol.ts` (campus), `components/AnimatedHero.tsx` | the only thing this package changes |

Where every hero collapsed to the same presentation:

- `advanceHeroMotion` used one hard-coded table for all nine: start column 1 for 0.1 s, turn column 6 for the same 0.1 s, stop column 6 for 0.16 s, and `2 + floor(phase * 4)` for stride — an even four-frame split for everybody. Cadence differences existed only through `strideSeconds`, which the simulation derives from speed, so two heroes moving at the same speed animated identically.
- `heroPatrol` had three lane timings (`[5.5, 7, 4.6]` travel, `[0.58, 0.72, 0.46]` cycle) keyed by **lane index**, not by hero: the same hero animated differently depending on where it stood, and two heroes in the same lane were identical.
- `HERO_MOVEMENT_STYLE` varied only `lift` (frames 3/6 raised a few pixels) and `breath` (idle scale period).
- Attack was a single authored contact pose held for the whole `actionPoseT` window; no anticipation or recovery.
- Hit reactions were one frame (column 8, or the reaction sheet's four frames for QB/Enforcer) with no intensity difference.
- The wave/gesture frame (column 7) was never used outside the celebrate pose.

## 12–17. What this package adds

`game/heroPresentation.ts` — one typed profile per hero, `heroPresentation(key)` falls back to a shared base for unknown or legacy keys (`rb`, `''`, `undefined`):

```ts
interface HeroPresentationProfile {
  cadence: number;            // campus patrol cycle scale (battle cadence stays simulation-derived)
  contactHold: number;        // share of each half stride spent on the planted contact frame
  idle:      { column; breathSeconds; breathAmplitude; settleSeconds }
  start / turn / stop: { column; seconds }
  attack:    { anticipationSeconds; anticipationColumn; recoverySeconds; recoveryColumn }
  reaction:  { intensity: 'light' | 'medium' | 'heavy'; seconds }
  signature: { prepColumn; prepSeconds }
  gesture?:  { everySeconds; seconds }     // campus idle beat, column 7
  campus:    { travel; rest; actionSeconds; cycle }
  lift: number
}
```

Only frames that exist are referenced (asserted per hero in `tests/heroPresentation.test.ts`): motion columns 0 idle, 1 start, 2–5 stride, 6 plant, 7 gesture, 8 hit (nine-column heroes); elite poses 0–8; the reaction sheet for QB and Enforcer. `HERO_MOVEMENT_STYLE` is now derived from the profiles, so there is one source of truth.

**13 — locomotion follows displacement.** `advanceHeroMotion` takes the caller's clock; `BattleHeroSprite` passes the battle's simulation seconds, so a paused replay holds a transition frame and 0.5×/2× scales it, while stride frames continue to come from the simulation's distance-driven `stridePhase`. A zero-distance actor settles: `moving` false → stop column for the profile's window → idle column. Facing changes no longer flash a plant frame during departure (the first moving sample resolves its direction inside the start window instead of registering a turn). Frames are chosen, never positions: the sprite cannot slide.

**14–15 — the nine identities**, all from existing frames:

| Hero | What differs | Mechanism |
| --- | --- | --- |
| The Franchise | composed movement, planted read/throw posture, long recovery | `contactHold` 0.5, attack anticipation 0.12 s on the **plant** column, recovery 0.16 s, signature prep 0.12 s, light reaction |
| The Enforcer | heavier footfalls, shorter drive steps, distinct contact recovery | `contactHold` 0.66 (longest), `cadence` 0.85, start 0.14 s, stop 0.24 s, recovery 0.2 s |
| The General | measured movement, directive gestures | `contactHold` 0.64, start 0.18 s, campus gesture every 4.5 s, longest travel leg |
| The Specialist | approach → plant → kick rhythm | longest anticipation (0.14 s) on the plant column, shortest recovery (0.06 s) back through the start column, signature prep 0.14 s |
| The Burner | quick cadence, clear burst and stop | `cadence` 0.7, `contactHold` 0.4, explosive start 0.16 s, stop 0.26 s (longest), heavy reaction |
| The Medic | purposeful support movement, treatment cue | `contactHold` 0.42, quickest start (0.04 s), gesture every 5 s |
| The Captain | braced protective stance, measured turns | `contactHold` 0.6, longest settle (0.3 s), turn 0.22 s, stop 0.3 s, light reaction |
| The Playmaker | agile cuts, decoy presentation | fastest turn (0.06 s), `contactHold` 0.42, gesture every 3.5 s, heavy reaction |
| The Legend | deliberate stride, signature preparation | `cadence` 1.25 (longest), start 0.14 s, turn 0.2 s, stop 0.26 s, signature prep 0.18 s |

None of this relies on colour, emoji or a glow; the identity is in which authored frame shows and for how long.

**16 — identity across campus and battle within the art tiers.** The campus keeps its cheap tier: the derived campus sheets now carry **all eight motion columns per facing** (25 frames per hero instead of 19) so idle, start, stride, plant and gesture are all available there. Cost: 205–253 KB → 251–333 KB per hero (2.0 MB → 2.6 MB for all nine, +0.6 MB), regenerated by `npm run art:campus` from the approved elite and motion sheets with the same crop/scale/registration the renderer performs — no new authored art, no repainting. The campus still fetches no elite, motion, reaction or signature sheet.

**17 — anchors, perspective and scale.** All frames are baked at the renderer's 256 px frame with the existing registration (ground line 370 in 384-space, anchor from the head/torso centroid); left/right uses the sheet's own two rows rather than a mirror for motion frames, so foot anchors and perspective are the authored ones. Every hero was inspected, not only QB and Enforcer — the per-hero strips in `docs/evidence/motion/` show idle, start, stride, turn, stop, settle, attack anticipation/contact/recovery, hit and the signature beats at phone (48 px) and inspection (256 px) scale.

**18 — cosmetic only.** Nothing in this package writes a simulation field (asserted: `advanceHeroMotion` does not mutate its input). The replay hash covers `ticks, time, momentum, bonus, nextWave, building hp/cooldown` and per-actor `id, x, y, hp, rageT, healT, shieldT, slowT, abilityCd, dmg, healingDone, protectionDone` — no frame, column, offset or profile value is in it. The eight-match determinism corpus produces identical hashes with and without the presentation changes (`npm run determinism:corpus`, `tests/determinism.test.ts`, `tests/replayCompatibility.test.ts`).

**19 — reduced motion.** Under `prefers-reduced-motion: reduce` the renderer keeps a stable facing and a single authored pose per state, no motion-frame animation, no breathing (the CSS rule already disables the idle animation), no hit-reaction offset, and the signature keeps its static semantic cue (`heroSignaturePose` returns `cueOpacity` without pumping or travel). Campus patrol returns a fixed idle stance with no gesture and no travel. No motion, reaction or signature sheet is requested for campus or card surfaces under Save-Data or reduced motion (verified in `scripts/art-fault-check.mjs`).

**20 — dev-only fixture.** `art/hero-motion-compare.html` + `.tsx` runs all nine heroes down the same scripted path (idle → start → left → turn → right → stop → attack → hit → signature → idle) through the real `BattleHeroSprite`, with pause, single-step, speed, left/right, both scales, `?profiles=off` for the base-profile baseline and a missing-art case. It lives under `art/` and is served only by the dev server (`npx vite`), never by the production build; it exposes only a read-only snapshot plus clock controls (`window.__fhqMotionFixture`), no game-state mutation API.

**21 — rendered evidence.** `node scripts/motion-clips.mjs` captures the fixture at 20 keyframes and samples the whole path every 50 ms, with profiles off and on, and writes one strip per hero plus `summary.json`. Results are in the table below; all nine "after" sequences differ from each other (no identical pair), and each differs from its own baseline.

## Remaining source-art limitations

- There is exactly **one** gesture frame (column 7) per hero. The General's directive, the Medic's treatment cue and the Playmaker's decoy are the same authored pose used with different cadence; they are distinguishable from each other only by timing, not by a distinct drawing. A separate authored gesture per role is the missing art.
- Turn, stop and brace share **one** plant frame (column 6). The Captain's brace and the Playmaker's cut differ only in how long that frame holds.
- Attack anticipation and recovery reuse the start (1) and plant (6) columns; there is no authored wind-up or follow-through pose except the QB's `body-followthrough` rig frame.
- Nine-column heroes have a single hit frame (column 8); QB and Enforcer have four authored reaction frames. Intensity elsewhere is expressed by the cosmetic offset and its duration.
- Eight-direction movement is not authored: the sheets carry four screen-space directions (two rows × two facings), which is what the renderer uses.

## Rendered results (2026-09-10, HeadlessChrome 152, dev fixture)

Keyframes: 20 points on the scripted path; dense: every 50 ms over the whole 9.4 s path (192 samples), comparing frame index, signature beat and reaction offset with profiles off vs on.

| Hero | Keyframes differing | Dense samples differing | Most visible change |
| --- | --- | --- | --- |
| The Franchise | 4/20 | 17/192 | planted anticipation before the throw, longer recovery |
| The Enforcer | 3/20 | 16/192 | longer contact frames while driving, heavier stop and recovery |
| The General | 2/20 | 15/192 | long planted contact in the stride, slow departure |
| The Specialist | 3/20 | 14/192 | plant before the kick, immediate push-off after it |
| The Burner | 5/20 | 17/192 | explosive start, earlier lift-off in the stride, long stop |
| The Medic | 2/20 | 11/192 | quickest departure, light quick contact |
| The Captain | 4/20 | 15/192 | braced plant held through turn and stop |
| The Playmaker | 5/20 | 14/192 | fast cut through the plant, short light contact |
| The Legend | 5/20 | 26/192 | longest stride cycle, visible signature preparation |

All nine "after" sequences differ from one another (`summary.json` › `_identicalPairs`: empty). Missing-art case: with the Burner's motion sheet blocked (HTTP 500) the strip's third row shows the hero still animating from the authored elite poses (`ready: 1`, elite frame indices), never blank.

Not claimed: physical-device playtesting, observed-player acceptance, or new authored art. The differences above are timing and frame-selection differences on the existing sheets.
