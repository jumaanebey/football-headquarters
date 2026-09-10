# Hero identity, progression foundations and resilient delivery — integration evidence

Four packages, four reviewable PRs, one verified integrated tree. Base: main `ae34401` (PR #46) plus PR #45 `89856e2` (merged clean as `cccdd4e` on `claude/fhq-integration`). Integrated head: `claude/fhq-milestone-integration` `7af25a6`. Nothing here is deployed; Codex coordinates merging and release.

## 44. Packages, PRs and merge order

```
main ae34401 (#44, #46)
  └── PR #45  claude/fhq-perf-install               (already open, frozen at 89856e2)
        └── claude/fhq-integration  cccdd4e          (main + #45, no conflicts)
              ├── PR #47  Package A  assets reliability      7635023 → 2e6f408
              │     └── PR #56  Package B  hero identity     cf34006 → 247fa6f
              ├── PR #48  Package C  growth/equipment models 789c884 → 6128058
              └── PR #55  Package D  PWA hardening           62f76e1 → 278dc3c
```

**Recommended merge order**: #45 → #47 → #56 → #48 → #55. C and D are independent of A and B (they touch disjoint files) and may merge in either order after #45; B must follow A. Merging #45 first and then retargeting each package to `main` also works — the integration branch proves all four combine without conflicts. **Do not delete a base branch while a PR is stacked on it**: that closes the dependent PRs (it happened to #34/#36 in the previous milestone).

## 40. Release suite on the integrated tree

`npm run release:verify -- --browser` on `7af25a6`, 174 s, **17/17 offline checks pass**: typecheck; 619 tests / 73 files; authority parity (sources ↔ generated bundle ↔ staged/deployed artifacts ↔ pinned commit ↔ rules — unchanged and intact, v4 deployed, no server change in this milestone); hero atlas verification; restore/rollback rehearsal; derived campus sheets; install icons; derived cutout atlases; production build with full raster decode; build assets content-addressed; balance regression guard; Chrome determinism corpus 8/8; startup transfer budget; offline shell and update flow; two-version tab lifecycle; kill-switch rehearsal; art fault injection.

Skipped, with the exact command and dependency:
- **live two-account evidence** — `npm run authority:evidence` (needs `.env.production` with the anon key and creates anonymous evidence accounts; owner-run). Not required here: no authority payload changed, so the deployed v4 behaviour is unaffected.
- **preview browser journey against the live club server** — `node scripts/authority-browser-check.mjs` (owner-run, creates one evidence account). The journey below runs the same path with the club server blocked, which is not a substitute for live settlement evidence.
- **real-data funnel run** — `SUPABASE_SERVICE_ROLE_KEY=… npm run funnel:weekly`; no service-role key is available in this environment, so only fixture validation ran.
- **physical iOS/Android acceptance** — `docs/PWA-DEVICE-ACCEPTANCE.md`; needs devices.

## 41. Compact journey (`scripts/journey-check.mjs`, evidence `docs/evidence/journey-rounds.json`)

Built preview, HeadlessChrome 152, 430×932 at 2×, no throttling, service worker blocked (so bytes are real), club server blocked at the network layer (no account, no analytics event). One round: name the club → campus → Roster → Scouting (reached from the roster) → Heroes → Game Day → preparation sheet with the matchup → reserve → deploy heroes → signature → result → back to the campus. All ten assertions pass; **four different heroes drawn on the field** (Enforcer, Franchise, General, Specialist), a signature became ready and was used, the result screen was reached and the campus returned. No console errors.

## 42. Repeated journeys (three rounds, same browser)

| Round | Requests | Transfer | Hero sheets | Decoded frames / entries | Retained | Art subscribers | Canvases | DOM | Heap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (cold) | 119 | 26.16 MB | 14 | 421 / 23 | 5 | 0 | 25 | 591 | 9 MB |
| 2 (warm) | 100 | 0.03 MB | 14 | 421 / 23 | 5 | 0 | 25 | 592 | 9 MB |
| 3 (warm) | 74 | 0.02 MB | 4 | 274 / 13 | 5 | 0 | 25 | 593 | 9 MB |

Nothing grows: transfer collapses to cache hits after the first round, decoded hero-art entries and retained entries do not accumulate, art subscribers return to zero, canvas count and heap are flat, DOM drifts by two nodes across three full battles. After backgrounding and returning, the campus still renders with the same canvas count and no leaked subscribers. Round 1's 26 MB is the honest cost of a **complete** journey that draws four heroes' authored battle art (~2.7 MB per hero) plus the campus, preparation and battle scenery; the staged budget check below is the per-stage view.

## 9. Startup budgets on the integrated tree (`docs/evidence/perf-milestone-integrated.json`)

| Stage | Cold transfer | Budget | Note |
| --- | --- | --- | --- |
| naming | 1.17 MB | ≤ 5 MB, zero battle sheets | budget held from PR #45 |
| campus | 2.10 MB | ≤ 2.25 MB | +0.3 MB vs #47 alone: Package B's campus sheets carry all eight motion columns |
| hero inspection | 1.47 MB | ≤ 1.6 MB | nine campus sheets |
| roster | 0.00 MB | ≤ 0.8 MB | |
| scouting | 0.00 MB | ≤ 0.8 MB | |
| prep | 2.53 MB | ≤ 2.6 MB | 1.93 MB is `game-day-tunnel.png`; the WebP (144 KB) is ready for Codex's call site |
| first deployed hero | 6.09 MB | ≤ 7.5 MB | scales with heroes deployed: authored elite + motion (+ reaction, + signature) ≈ 2.7 MB each; two heroes plus battle scenery measured here |
| first signature | 0.03 MB | ≤ 2 MB | |
| result | 0.16 MB | ≤ 6 MB | sheets already loaded |
| **cumulative through the result** | **13.54 MB** | | 38.99 MB on the September 10 baseline |

The naming budget and the "no battle sheet before its stage" rule are unchanged. The `first-deployed-hero` budget was recalibrated from 6 MB to 7.5 MB **with its breakdown stated**, because the journey now deploys two heroes rather than one; no traffic was moved across a stage boundary to achieve it.

**Measured proposal, not implemented** (needs art review): applying the same derived alpha-baked treatment as the cutout atlases to the authored battle sheets measures **39.77 MB → 5.96 MB** at WebP q90 with lossless alpha. It is not in this milestone because those sheets are cropped and attributed at runtime from their keyed pixels (`heroPixelOwners`), so a lossy alpha edge can shift a crop; it needs the same contact-sheet review the cutouts got, per hero, with Codex.

## 43. Completion matrix

Status vocabulary: **implemented** (in a branch), **tested** (automated), **evidence** (rendered/measured), **integrated** (call site live in the product), **production** (deployed).

| # | Task | Commit | Tests | Rendered evidence | Codex call site | Production | Dependency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Reconcile #45 with #44/#46 | `cccdd4e` | full suite on the merge | release suite 17/17 | n/a | no | #45 merge |
| 2 | Hero mount matrix | `2e6f408` (doc) | — | `docs/ASSET-RELIABILITY.md` § A2 | n/a | no | — |
| 3 | Bounded warming API | `74b152d` | `heroArtLoader.test.ts` (supersede, cancel, bounds) | — | **pending**: `warmHeroArt(heroesInConfig(config))` on reserve | no | Codex |
| 4 | Decoded-art lifecycle | `74b152d` | retain/release/stats tests | `journey-rounds.json` (3 rounds, no growth) | **pending**: `releaseUnretainedHeroArt({ keep })` after the result | no | Codex |
| 5 | Derived alpha cutouts | `7635023` | `art:cutouts --check` in release suite | `docs/evidence/derived-art/*.png` | live via MatteSprite/BuildingArt | no | — |
| 6 | Three-background comparison | `7635023` | — | contact sheets + `report.json` metrics | n/a | no | — |
| 7 | Tunnel + field equipment | `7635023` | — | `art:compare` row, 1 925 → 144 KB | **pending**: `<picture>` in the Game Day header | no | Codex |
| 8 | Hashing, manifest, overlap | `7635023` | `build:verify` (204 files) | preview headers in `docs/PERF-INSTALL-MILESTONE.md` | n/a | no | — |
| 9 | Ten-stage waterfall + budgets | `2e6f408` | budget check in release suite | table above | n/a | no | — |
| 10 | Art fault injection | `2e6f408` | 23/23 checks | `docs/evidence/art-fault-check.txt` | n/a | no | — |
| 11 | Motion path trace | `cf34006` (doc) | — | `docs/HERO-MOTION.md` § 11 | n/a | no | — |
| 12 | Typed profiles, all nine | `cf34006` | `heroPresentation.test.ts` (pairwise, frames exist, defaults) | profile table | n/a | no | — |
| 13 | Locomotion tied to displacement | `cf34006` | clock/pause/settle/turn tests | strips | n/a | no | — |
| 14–15 | Nine identities | `cf34006`, `18cdfa8` | identity assertions | `docs/evidence/motion/*.webp`, all nine differ | n/a | no | source art limits listed |
| 16 | Identity within art tiers | `cf34006` | campus sheet layout tests | +0.6 MB total, no battle fetch on campus | n/a | no | — |
| 17 | Anchors, perspective, scale | `cf34006` | atlas region tests | strips at both scales | n/a | no | — |
| 18 | Cosmetic only | `cf34006` | determinism corpus, replay compatibility | corpus 8/8 unchanged | n/a | no | — |
| 19 | Reduced motion / Save-Data | `cf34006` | fault check + patrol tests | `art-fault-check.txt` | n/a | no | — |
| 20 | Dev-only fixture | `b6d8adb` | typecheck | dev-server only, read-only API | n/a | no | — |
| 21 | Before/after clips | `18cdfa8` | — | nine strips + `summary.json` | n/a | no | — |
| 22–25 | Hero progression models | `789c884`, `5d87c33` | `progressionHero.test.ts` | — | **pending**: HeroModal/SquadModal | no | Codex |
| 26 | Player growth + XP limitation | `789c884` | `progressionPlayers.test.ts` | — | **pending** | no | no per-player XP field exists |
| 27 | Roster/scouting comparison | `789c884` | `progressionScouting.test.ts` | — | **pending**: ScoutingModal | no | Codex |
| 28–29 | Equipment model + prose audit | `789c884`, `6128058` | `progressionEquipment.test.ts` | corrected descriptions with file:line | **pending**: defense workshop | no | Codex |
| 30 | Stable interfaces + fixtures | `6128058` | 54 boundary tests | — | n/a | no | — |
| 31 | PWA beyond shell loading | `4e90d92` | `swRuntime.test.ts` | `pwa:check` | n/a | no | — |
| 32–33 | Readiness contract + race | `62f76e1` | `pwaUpdateReadiness.test.ts` | — | **pending**: `registerUpdateReadiness(...)` | no | Codex |
| 34 | Two-version tabs | `4e90d92` | — | multi-tab check | n/a | no | host limitation documented |
| 35 | Kill switch | `703628c`, `278dc3c` | — | 13/13 rehearsal | n/a | no | — |
| 36 | Connection states | `8a08a98` | connection tests | — | **pending**: Settings row | no | Codex |
| 37 | Install prompts + device script | `f92f5cf` | install tests | emulator only | Codex's `useClubInstall` should delegate | no | devices |
| 38 | Funnel semantics | `4b1f7cb` | funnel tests | — | **pending**: ten call sites | no | Codex |
| 39 | Weekly report robustness | `4841272` | `funnelReport.test.ts` | fixture output (bannered) | n/a | no | service-role key |
| 40–43 | Integration evidence | this document | 619 tests | release suite, journey, rounds | n/a | no | — |

"Helper implemented" is marked **pending** wherever the player-visible outcome still needs a Codex call site; none of those rows claims delivery.

## 45. Handoff

**Heads**: `claude/fhq-integration` `cccdd4e` · A `2e6f408` (#47) · B `247fa6f` (#56) · C `6128058` (#48) · D `278dc3c` (#55) · integrated `7af25a6`.

**New public interfaces** (all additive; existing component props preserved):
- `components/heroArtLoader.ts` — `loadHeroArt`, `loadHeroArtWithRetry`, `loadHeroArtWhileMounted`, `warmHeroArt → WarmHandle`, `cancelHeroArt`, `retainHeroArt`, `releaseUnretainedHeroArt`, `heroArtStats`, `heroesInConfig`, `HERO_ART_PATH`.
- `AnimatedHero` — new optional `tier?: 'campus' | 'battle'` (default `campus`) and `offset?: { dx, dy }`. `BattleHeroSprite` — new optional `simSeconds?: number`, `reduced?: boolean`.
- `game/heroPresentation.ts` — `HERO_PRESENTATION`, `heroPresentation`, `strideColumn`, `attackPhase`, `reactionOffset`. `game/heroPatrol.ts` `heroPatrol(time, lane, reduced, key?)` — the key is optional, legacy callers keep their look.
- `game/derivedArt.ts` — `DERIVED_ATLASES`, `derivedAlphaSource`.
- `game/progression/index.ts` — `heroProgression`, `heroTrainingPreview`, `playerGrowth`, `rosterGrowth`, `drillEffects`, `prospectComparison`, `scoutingBoard`, `equipmentModel`, `equipmentRoster`, `DEFENSE_BEHAVIOUR`.
- `pwa/updateReadiness.ts` + `pwa/register.ts` — `registerUpdateReadiness`, `updateReadiness`, `applyUpdate → UpdateAttempt`, `retryDeferredUpdate`. `pwa/connection.ts` — richer statuses. `game/funnel.ts` — `trackFunnel(step, props, { accountId })`.

**Required Codex patches** (exact signatures in each package doc): warm on reserve and release after the result; `tier="battle"` on any new field mount; the tunnel `<picture>`; ten funnel call sites; `registerUpdateReadiness` from App state; Settings rows for install, update and connection; growth/equipment models in HeroModal, SquadModal, ScoutingModal and the defense workshop; delegate `useClubInstall` to `pwa/install.ts` so one captured install event exists.

**Verified behaviours**: naming ≤ 1.2 MB with no battle sheet; campus 5.44 → 2.10 MB; warm return 0.02 MB; art faults never block naming, navigation, reservation or rewards; nine heroes read differently on one scripted path; no simulation or replay-hash change; offline shell, update readiness, two-version tabs and kill switch verified on built previews; three journeys with no growth in requests, decoded art, subscribers or DOM.

**Remaining source-art limitations**: one gesture frame, one plant frame, no authored wind-up or follow-through (except the QB rig), single hit frame for nine-column heroes, four screen directions. Listed per hero in `docs/HERO-MOTION.md`.

**Genuine blockers**: a service-role key for the real-data funnel run; physical devices for install acceptance; Codex for every call site above; art review for the derived battle-sheet proposal (39.77 → 5.96 MB) and for the four remaining lossless campus atlases already derived here.

**Ports used** (none belonging to another checkout was touched): previews 4187/4188/4194/4195/4197/4202/4203/4204–4208 started and stopped by `scripts/with-preview.mjs`, which now refuses a port that already answers; the dev server for the motion fixture picks a free port in 4193–4199 and is stopped by `scripts/motion-clips.mjs`.
