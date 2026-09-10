# Asset reliability — Package A (branch `claude/fhq-assets-reliability`)

Base: `claude/fhq-integration` = main `ae34401` (PR #46) + PR #45 `89856e2`, merged clean (commit `cccdd4e`) and verified with the full release suite (13/13, 48 s). This package depends on #45; nothing here changes server rules, balance or saved-state schema. Evidence files live in `docs/evidence/`.

## A1 — reconciliation of #45 with #44/#46

`git merge 89856e2` onto `ae34401` produced no conflicts. Behavioural interactions checked by hand:

- **Campus art gate vs the rebuilt campus (#46)**: the refitted IsometricMap still mounts `CampusHero`/`BuildingArt`/`MatteSprite`; the gate only delays their requests until naming, so the container fit and compact anchors are unaffected. Facility panels (`ActionModal`, `ScoutingModal`) render `BuildingArt` after naming, when the gate is already open.
- **Install UI (#44)**: Codex's `useClubInstall` captures `beforeinstallprompt` itself and shows its control once a manifest link exists — which #45 adds. Both hooks call `preventDefault`; whichever prompts first consumes the event, the other reports "unavailable". Recommendation (Codex file, not changed here): back `useClubInstall` with `installSupport()/promptInstall()/onInstallSupportChange` from `pwa/install.ts` so there is one captured event and one platform decision.
- **Result sharing (#44)**: `ResultShare` draws its own card and hard-codes the game URL; `game/publicUrl.ts` exports the same value (`PUBLIC_GAME_URL`). No conflict; a one-line import would keep them in sync.
- **Shared styles**: `game-theme.css` changed in #44/#46; #45 does not touch it.

## A2 — hero mount matrix (current main + #45)

| Surface | Component / mount | Tier | What it requests | Notes |
| --- | --- | --- | --- | --- |
| Campus patrol | `IsometricMap` → `CampusHero` → `AnimatedHero` (default) | campus | derived campus sheet only, after naming | five starters on a new club (six on the QA club) |
| Roster (player-first, #46) | `SquadModal` hero rows: `<img src={def.art}>` | portrait | 512 px portrait, fixed URL | no renderer, no sheets |
| Hero cards | `HeroModal` grid → `HeroArt` | campus | derived campus sheet | nine cards → nine sheets (~2 MB) on first open |
| Hero details / reveal | `HeroModal` reveal → `HeroArt mode="celebrate"` | campus | campus frame 8 | — |
| Film Room idle | `HeroTrainingPreview` → `AnimatedHero tier="campus"` | campus | campus sheet | — |
| Film Room run/signature/celebrate | same, `tier="battle"` once a non-idle preview is chosen | battle | elite + motion (+ reaction, + signature) for that hero only | explicit player action |
| Preparation | `MatchPreparation`: text only | — | no hero art | the Game Day header image `game-day-tunnel.png` (1.9 MB PNG) loads here — Codex call site, see A7 |
| Active match, field | `BattleScreen` → `BattleHeroSprite` → `AnimatedHero tier="battle"` | battle | elite + motion + reaction (+ signature) at first draw of each drawn hero | only heroes actually deployed or guarding |
| Active match, command bar / ability flash | `HeroCommandBar`, `BattleScreen` → `HeroArt` | campus | campus sheet | no battle sheets |
| Defense replay | same `BattleScreen` path | battle | as active match, for the heroes in the film | — |
| Result | `BattleDebrief` → `HeroArt` | campus | campus sheet | — |

Missed heavy loads found on the current product (beyond the old baseline): none on campus/roster/scouting; the only multi-megabyte requests outside battle are the Game Day tunnel PNG (Codex call site) and, until this package, the six lossless cutout atlases.

## A3 — warming API (`components/heroArtLoader.ts`)

```ts
warmHeroArt(keys: string[], { kinds?, maxHeroes = 5, concurrency = 2, respectPreferences = true, supersede = true }): WarmHandle
// WarmHandle = { generation, cancel(), done: Promise<{ requested, loaded, failed, cancelled }> }
heroesInConfig(config): string[]   // the exact heroes a battle config draws (attackers + hero guards)
```
Exact keys only (bounded to a lineup); a newer call supersedes the older queue and abandons its unretained in-flight downloads (`cancelHeroArt`, which rejects the request and clears `img.src`), so a stale selection never widens to the library; duplicates are suppressed by the shared cache; failures retry once after 2.5 s and again on `online`; the renderer's portrait fallback covers the wait. Tested in `tests/heroArtLoader.test.ts` (supersede, cancellation, bounds, Save-Data, reduced motion).

**Codex call sites** (typed, not applied here): when a game is reserved or the prep sheet confirms a lineup — `import { warmHeroArt, heroesInConfig } from '../components/heroArtLoader'; const warm = warmHeroArt(heroesInConfig(config)); /* on cancel/unmount: */ warm.cancel();` and when the Film Room selects a hero: `warmHeroArt([key], { kinds: ['elite', 'motion'] })`.

## A4 — decoded-art lifecycle

`retainHeroArt(kind, key)` (used by every `AnimatedHero` mount for the kinds it draws), `releaseUnretainedHeroArt({ keep?, kinds? })`, `cancelHeroArt`, and the read-only `heroArtStats()` (also `window.__fhqHeroArt.stats()` for measurements): entries with frame counts, retain counts, in-flight flags, decoded frame total and subscriber count. Releasing never touches a retained entry, so a post-battle release cannot blank a mounted consumer; a released entry's frames stay referenced by the closure that is drawing them until that mount ends. Repeated match → result → campus → Film Room journeys are measured in Package E; the unit tests cover retain/release/stats. **Codex call site**: after the result screen closes, `releaseUnretainedHeroArt({ keep: heroesInConfig(nextConfig) })`.

## A5/A6 — derived alpha-baked cutout atlases

`scripts/derive-campus-cutouts.ts` (`npm run art:cutouts`, `--check`) runs the renderer's own keying (`keySceneryPixels`, or `keyHeroPixels` for the starter facilities sheet) in Node, neutralises fully transparent pixels, then encodes lossy WebP with the alpha channel at full quality. Originals are untouched; the registry is `game/derivedArt.ts`; `MatteSprite` and `BuildingArt` load the derived file without keying and fall back to the original + runtime keying if it fails. `scripts/compare-derived-art.ts` (`npm run art:compare`) renders original-keyed vs derived over light turf, dark turf and a checkerboard at 120 px and 420 px (`docs/evidence/derived-art/*.png`, metrics in `report.json`):

| Atlas | Keying | In → out | Mean / max colour Δ (visible px) | Alpha mismatches | Fringe px (original → derived) | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| buildings/starter-campus-cutouts | hero | 1177 → 152 KB | 5.66 / 85 | 0 | 7 862 → 8 613 of 401 906 | accepted q90 |
| buildings/stadium-1-cutout | scenery | 1019 → 139 KB | 5.26 / 70 | 0 | 0 → 36 of 191 940 | accepted q90 |
| buildings/upgraded-campus-cutouts | scenery | 1533 → 275 KB | 7.43 / 64 | 0 | 0 → 230 of 458 097 | accepted q90 |
| decor/tailgate-tent-cutout | scenery | 1025 → 103 KB | 2.93 / 34 | 0 | 0 → 0 | accepted q90 |
| decor/grounds-cutouts | scenery | 905 → 67 KB | 3.62 / 45 | 0 | 0 → 0 | accepted q90 |
| battle/field-equipment-cutouts | scenery | 1361 → 217 KB | 7.04 / 76 | 0 | 0 → 112 of 330 162 | accepted q90 |

Visual review of the contact sheets: edges, drop shadows, signage (playbook board, scoreboard), field markings and occlusion (fence mesh over turf, tent poles) are indistinguishable from the runtime-keyed originals on all three backgrounds at both scales; the "fringe" counts are pixels whose colour still carries backdrop tint — the starter sheet's count comes from the original art itself (purple content inside the playbook board and the rehab tub), not from encoding. Total 6.86 MB → 0.93 MB. Regeneration is deterministic for a given sharp/libwebp version.

## A7 — Game Day tunnel and field equipment

`public/assets/gpt/game-day-tunnel.webp`: 1536×1024 (framing preserved, no crop), 144 KB at WebP q85, from the existing 1 925 KB PNG. **Codex call site** (App.tsx, Game Day header): `<picture><source srcSet="/assets/gpt/game-day-tunnel.webp" type="image/webp" /><img src="/assets/gpt/game-day-tunnel.png" width="1536" height="1024" … /></picture>` — same attributes, PNG stays as the fallback. Field equipment: served through `MatteSprite` from the derived alpha atlas above (1361 → 217 KB), reviewed on the same contact sheet (rival stadium, jugs machine, ref tower, t-shirt cannon). No asset was found whose derived version looked worse; none was left unchanged for quality reasons.

## A8 — hashing, manifest and deployment overlap

Derived files carry `cutout`/`alpha` in their names and live under the fingerprinted directories, so they get content-hashed copies and immutable headers like the other sheets (`npm run build:verify`: 204 fingerprinted files). Canonical identities (`/assets/buildings/stadium-1.webp` in layouts and films, `GROUND_ART` keys) are unchanged. Overlap: the fingerprint plugin now **keeps every fixed URL** (`FHQ_DROP_LOADER_ONLY_FIXED=1` opts back into dropping the loader-only hero sheets), so a client loaded before a deploy keeps resolving `/assets/heroes/motion/qb.webp`; hashed URLs from a previous build stop existing on the production alias after a deploy (Vercel serves one deployment per alias), which the service worker covers for installed players (immutable cache) and the portrait fallback covers for others.

## A9 — waterfall on the integrated build (cold, phone, service worker blocked, club server blocked via CDP)

`docs/evidence/perf-integrated-stages-local-preview.json`, `npm run perf:waterfall -- --budget`:

| Stage | Requests | Transfer | Decoded | Budget |
| --- | --- | --- | --- | --- |
| naming | 47 | 1.16 MB | 1.73 MB | ≤ 5 MB, 0 battle sheets |
| campus | 19 | 1.79 MB (was 5.44 MB before the derived atlases) | 1.79 MB | ≤ 2.25 MB |
| hero inspection | 11 | 1.20 MB | 1.20 MB | ≤ 1.6 MB |
| roster | 0 | 0 | 0 | ≤ 0.8 MB |
| scouting | 1 | 0 | 0 | ≤ 0.8 MB |
| prep | 28 | 2.53 MB (1.93 MB is the tunnel PNG, Codex call site) | 2.59 MB | ≤ 2.6 MB |
| first deployed hero | 12 | 0.54 MB | 0.57 MB | ≤ 6 MB |
| first signature | 2 | 0 | 0 | ≤ 2 MB |
| result | 23 | 5.59 MB (QB elite/motion/reaction/signature drawn during the drive) | 5.86 MB | ≤ 6 MB |
| **cumulative** | | **12.81 MB through the result** (17.43 MB before this package; 38.99 MB on the September 10 baseline) | | |

Warm return in the same browser: 0.02 MB at the campus, ≤ 0.01 MB per later stage (immutable hits and 304s). Budgets are measured values with ~25 % headroom; stage boundaries are the same as before plus the new stages, and battle-only sheets are allowed only from "first deployed hero" onward.

## A10 — art faults (`scripts/art-fault-check.mjs`, evidence `docs/evidence/art-fault-check.txt`)

23/23 checks on the built preview: with `/assets/heroes/motion/qb.<hash>.webp` answering HTTP 500 the club is named, the Heroes modal opens, the game is reserved, the QB fights with elite frames and the result screen is reached; the failed request is named in the log; after a simulated reconnect (`online`) the QB motion sheet is re-requested and decoded (32 frames). With every sheet delayed 2.5 s the same journey completes with portraits showing meanwhile. Under Save-Data + reduced motion the campus and Heroes request no motion/reaction/signature sheet; only the battle does.

## Not in this package / dependencies

- Codex call sites listed above (warming on reserve, release after result, tunnel `<picture>`, install hook unification).
- Physical-device checks. The measurements are HeadlessChrome 152 on macOS, no throttling.
