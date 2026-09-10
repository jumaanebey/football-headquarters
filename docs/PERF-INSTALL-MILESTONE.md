# Football HQ — performance, install and measurement milestone

Branch `claude/fhq-perf-install` from main `68c1818` (PR #43 merge; live build 2026-09-10 14:25 UTC), delivered as PR #45. Companion tooling docs: `docs/AUTHORITY-HARDENING.md` (release command), `docs/AUTHORITY-RECOVERY.md` (server; untouched here). Status vocabulary: **implemented** (in this branch), **tested** (automated or rendered check, this Mac), **deployed** (on production), **verified live** (checked against production). Nothing in this PR is deployed until Codex's product milestone ships it; `club-authority` v4 was not touched.

## Measurement method (task 1)

`npm run perf:waterfall` (scripts/perf-waterfall.mjs): Playwright + the installed Chrome, 430×932 viewport at 2× (phone), `--block-server` aborts every request to the club server so no production account or analytics event is created, `--profile none` (no throttling; the numbers below are transfer sizes, which do not depend on the network profile), CPU ×1. Four stages per run: **naming** (page load until the name card is idle), **campus** (after "Look around first"), **hero detail** (Heroes modal), **first battle** (Game Day → Reserve → battlefield with three sideline taps). A COLD context first, then a WARM return visit in the same context (browser cache primed, tutorial already done, so the first stage is the campus). Per stage: requests, transfer bytes (what crossed the network), encoded and decoded body bytes when reported by the Resource Timing API, wall time, largest requests, and any battle-only sheet (`/assets/heroes/{motion,signatures,reactions,elite}/`).

Baseline: production `68c1818` on 2026-09-10 ~14:40 UTC (`docs/evidence/perf-baseline-production.json`). After: the branch build served by `vite preview` (`docs/evidence/perf-after-local-preview.json`; preview serves no cache headers, so warm numbers there are full re-downloads — the Vercel preview section below has the real header behaviour). User agent for both: HeadlessChrome 152 on macOS.

| Stage (cold) | Baseline requests / transfer / decoded | Battle sheets | After requests / transfer / decoded | Battle sheets |
| --- | --- | --- | --- | --- |
| naming | 71 / **22.73 MB** / 23.26 MB | 12 | 47 / **1.16 MB** / 1.71 MB | 0 |
| campus | 4 / 0.07 MB / 0.07 MB | 0 | 21 / 5.44 MB / 5.43 MB | 0 |
| hero detail | 14 / 13.60 MB / 13.59 MB | 9 | 9 / 1.13 MB / 1.13 MB | 0 |
| first battle | 46 / 4.40 MB / 4.39 MB | 0 | 51 / 9.77 MB / 9.75 MB | 4 (the drawn hero: qb elite, motion, reaction, signature) |
| **cumulative through naming** | **22.73 MB** | | **1.16 MB** | |
| cumulative through campus | 22.80 MB | | 6.59 MB | |
| cumulative through first battle | 38.99 MB | | 17.49 MB | |

Warm return (same context): baseline 22.69 MB again at the campus (no cacheable URLs); after: 6.49 MB on the preview (no headers) — on Vercel the fingerprinted art is immutable (see headers below), so a return visit revalidates only HTML and the fixed-URL files.

## Why every eager request happened (task 2)

Traced from mounts to requests on `68c1818`:

- `IsometricMap` mounts a `CampusHero` for every unlocked hero (five starters on a new club) → `AnimatedHero` → `loadSheet` (elite atlas, 1.3–1.4 MB each) **and** `loadHeroMotion` (motion sheet, 1.7–1.9 MB each) at mount, and `loadHeroMotion` awaited `loadHeroSignatures(key, true)` (reaction sheet, 1.15 MB for QB/Enforcer) before resolving. That is the 12 battle sheets and 17.9 MB before the name card: 5 elite + 5 motion + 2 reactions. Nothing was hidden or preloaded; the campus simply used the battle renderer.
- Heroes modal (`HeroModal`): nine `HeroArt` cards + `HeroTrainingPreview` (with `loadSignatureArt`) → the remaining four heroes' elite + motion sheets and QB's signature sheet: 9 more sheets, 13.6 MB.
- Battle: `BattleHeroSprite` → the same renderer, correctly at first draw; `HeroCommandBar`/`BattleDebrief` cards use `HeroArt` (elite + motion again if not cached).
- Not hero art but worth knowing: Game Day shows `/assets/gpt/game-day-tunnel.png` (1.97 MB PNG, App.tsx, Codex-owned) and the battle loads `field-equipment-cutouts.webp` (1.39 MB lossless). No `preload` links, no service worker, no manifest, `Cache-Control: public, max-age=0, must-revalidate` on every asset (checked on production).

## What changed (tasks 3–11)

- **Tiers** (`components/AnimatedHero.tsx`, prop `tier`): `campus` (default) draws from a derived campus sheet only; `battle` (BattleHeroSprite, HeroSubstitutions, Film Room once a non-idle preview is chosen) loads the authored elite atlas, motion, reactions (eight-column heroes) and signatures (when asked) as **independent** requests that start at mount and never wait on each other. Hidden/idle mounts (cards, campus, Film Room idle) never fetch battle sheets.
- **Campus sheets** (`scripts/derive-campus-heroes.ts`, `game/heroCampusSheet.ts`, `public/assets/heroes/campus/*.webp`): nineteen frames per hero — the nine authored poses and the idle + four stride frames facing each way — cropped, owner-cleaned, scaled and registered exactly as the renderer does, baked at its native 256 px frame size, alpha stored (no runtime keying), lossy WebP q88. 205–253 KB per hero (2.0 MB for all nine) versus 3.0–3.2 MB of authored sheets per hero. Nothing under `heroes/elite|motion|signatures|reactions` was modified; `npm run art:verify` still passes on the authored atlases and `npm run art:campus -- --check` guards the derived layout.
- **Loader** (`components/heroArtLoader.ts`): one decoded cache per (kind, hero); concurrent callers share the in-flight promise; a failed download is forgotten so the next call retries; `loadHeroArtWithRetry` retries once after 2.5 s and again when the browser reports `online`; the portrait `<img>` fallback stays visible until frames exist, so a failed sheet never leaves a blank hero and never blocks naming, navigation, match controls or rewards (none of those await art). `releaseHeroArt` drops decoded battle frames after a battle when the product wants the memory back.
- **Art gate** (`game/artGate.ts`): campus scenery (`MatteSprite` for non-battle paths, `BuildingArt`, campus hero sheets and their portrait fallbacks) waits until naming completes; returning players open it at boot; a 25 s safety timer opens it regardless. Battle scenery (`/assets/battle/`) and rig frames never wait. Shared-file edit: one line in `App.tsx` (`openCampusArt()` where the tutorial completes) and two in `index.tsx`, isolated in commit `8954c91`.
- **Warming** (`warmHeroArt(keys, { kinds, maxHeroes = 5, concurrency = 2 })`): only after a real action (the product calls it with the lineup when a game is reserved or a hero is picked in the Film Room), bounded to a lineup, skipped under `navigator.connection.saveData`, and under `prefers-reduced-motion` only the elite poses (motion/reaction frames are not drawn then). It never fetches the library.
- **Fingerprinting** (`build/fingerprintAssets.ts`): at build time the heavy sheets (hero campus/elite/motion/signatures/reactions, rig frames, every `*cutout*` atlas under buildings/decor/battle) get a `name.<sha256:8>.ext` copy; the mapping is embedded in the bundle (`virtual:fhq-asset-manifest`, read by `game/assetUrl.ts`) and written to `dist/asset-manifest.json`. Canonical paths stay the identity in data, films and tests; only request URLs change. Fixed copies are removed only for the five loader-only hero sheet folders when no source file names them literally; every other file keeps its fixed URL for templated `<img>` paths. `npm run build:verify` checks all of it; `npm run art:verify` is unchanged (it reads `public/`). 198 fingerprinted files, 55.6 MB, dist 137 MB.
- **Headers** (`vercel.json`): `public, max-age=31536000, immutable` for `/assets/**/*.<hash8>.<ext>` and the Vite bundle `/assets/index-*.{js,css}`; `max-age=0, must-revalidate` for `/`, `/sw.js`, `/manifest.webmanifest`, `/asset-manifest.json`, `robots.txt`, `sitemap.xml`. No immutable caching on any fixed URL.
- **Budget** (`npm run perf:waterfall -- --budget`, run by `release:verify --browser` on the built preview): ≤ 5 MB transferred through naming and zero battle sheets before the battle stage. It failed on the baseline (22.73 MB, 12 sheets) and passes on the branch (1.16 MB, 0).

### What still costs bytes, and the decision it needs (task 12)

The campus after naming is 5.44 MB, dominated by four lossless WebP cutout atlases: `starter-campus-cutouts` 1.18 MB, `tailgate-tent-cutout` 1.03 MB, `stadium-1-cutout` 1.02 MB, `grounds-cutouts` 0.90 MB. Re-encoding those four at WebP quality 90 measures 0.16 / 0.11 / 0.12 / 0.08 MB — a 4.4 MB saving on every campus load — but they are approved campus art that the renderer chroma-keys at runtime, so a lossy re-encode is an art decision for Codex (or a derived alpha-baked copy like the campus hero sheets). The threshold was **not** weakened: it applies to the naming stage, where the gate achieves it structurally. Two more items outside this package's ownership: `game-day-tunnel.png` (1.97 MB PNG on Game Day; a WebP of the same image would be ~150 KB) and `field-equipment-cutouts.webp` (1.39 MB lossless, first battle).

## Install, offline shell and updates (tasks 13–20)

- **Manifest** `public/manifest.webmanifest`: id/name/short_name, `start_url /?src=pwa` (attributable in the funnel), scope `/`, standalone, portrait, theme and background `#0f172a`, icons 192 and 512 (`purpose any`, transparent corners kept) and 512 maskable (icon scaled into the 80 % safe zone on the theme colour), all derived from the approved `app-icon.png` by `scripts/derive-brand-icons.mjs` (`--check` in release verification). `index.html` links the manifest, a 180 px Apple touch icon and the Apple/mobile web-app metas.
- **Install helpers** `pwa/install.ts`: `installSupport()` → `{ platform: android|ios|desktop|unsupported, installed, canPrompt, manualInstructions }`; `armInstallCapture()` holds `beforeinstallprompt` (prevented, never shown by itself); `promptInstall()` shows it on request and returns the outcome; `onInstallSupportChange` for UI state; iOS gets the manual Share → Add to Home Screen text. Tested for each platform and the no-automatic-prompt rule.
- **Service worker** `pwa/sw.ts` (built to `dist/sw.js` by `build/serviceWorker.ts`, version = hash of the precache list): two caches per version, `fhq-shell-<v>` (HTML, bundle, manifest, icons, logo — 7 files) and `fhq-art-<v>` (only what the current journey requested, capped at 80 entries, oldest evicted). Policy in `pwa/swPolicy.ts` (unit-tested): cross-origin (club server, auth, analytics, fonts), any non-GET, `/functions/`, `/rest/`, `/auth/`, `sw.js`, the manifests → **never cached**; navigations network-first with the shell as offline fallback; fingerprinted assets cache-first; fixed-URL art stale-while-revalidate. Rewards, reservations, replay permissions and account data are all club-server responses and never touch a cache.
- **Local play offline**: the game state lives in localStorage; the shell loads offline, the campus renders from the art cache, and `pwa/connection.ts` exposes `{ online, clubServer, settlesOffline: false, summary }` (fed by the authority client's availability) so the UI can say plainly that online rewards, upgrades and rival games wait for the connection. Installation changes nothing about settlement.
- **Updates** `pwa/register.ts`: registration in production on secure origins; an installed-but-waiting worker is reported through `onUpdateAvailable` and **never applied automatically**; `applyUpdate()` posts SKIP_WAITING and reloads once the new worker controls the page; `checkForUpdate()` runs when the tab becomes visible. The product decides when it is safe (not during a battle, not with unconfirmed authority operations — `authority.pendingCount === 0` and no `battleConfig`).
- **Proof** `npm run pwa:check` (13 checks on the built preview, run by `release:verify --browser`): controlled after first reload; shell cache holds exactly the shell; no battle sheets in the art cache before a battle; offline return renders the campus from cache and reports offline; online return works; a bumped worker installs as waiting while the old one keeps control; `applyUpdate` activates it and deletes both old caches; the app renders on the new worker; a failing `sw.js` fetch (HTTP 500) leaves the running app untouched.
- **Rollback / removal**: `FHQ_SW_KILLSWITCH=1 npm run build` ships `pwa/sw-killswitch.js` as `/sw.js`; it installs immediately, deletes every `fhq-*` cache, unregisters and re-navigates open pages, so no player stays on obsolete cached code. `unregisterServiceWorker()` does the same for one device (Settings › reset). Because `/sw.js` is served `must-revalidate`, the swap reaches every open client within the browser's 24 h update check or on the next navigation.
- **Emulated vs physical**: all of the above was verified in HeadlessChrome 152 on macOS. Physical iOS (Safari add-to-home-screen, standalone launch, offline relaunch) and Android (Chrome install prompt, splash from the maskable icon) remain **open** acceptance items.

## Discovery and measurement (tasks 21–27)

- Canonical `https://football-headquarters.vercel.app/`, OG/Twitter title/description/image with `og:image:width/height` 1600×900 and alt, `og:site_name`; `robots.txt` (allows `/`, disallows `/assets/`, names the sitemap); `sitemap.xml` with the single public URL. `game/publicUrl.ts` exports `PUBLIC_GAME_URL`, `PUBLIC_OG_IMAGE`, `shareUrl(source)`. No player or account URL exists or is exposed. Tested (`tests/pwa.test.ts` › shipped manifest).
- **Analytics audit**: `analytics.ts` batches `track()` calls (5 s / 25 events) into `fhq_events` with the anon key, no retry, session id per load, pid resolved at flush; `tests/analyticsDelivery.test.ts` covers ordered delivery and the no-token body. The existing SQL funnel views count `session_start → club_created → battle_result → won → base_publish → live raid → returning`; there was no event for tutorial completion, kickoff, confirmed reward as a milestone, backup prompts or daily returns, and `battle_result` could repeat per match.
- **Funnel** `game/funnel.ts`: `visible_start, naming_complete, tutorial_complete, first_kickoff, result, confirmed_reward, upgrade_meaningful, backup_prompt_viewed, backup_completed, return_visit` as `funnel_<step>` events, once per player (per match for result/confirmed_reward keyed by matchId, per day for return_visit), allow-listed scalar props only. Analytics stays observational; receipts and the authority remain the source of truth.
- **Weekly report** `npm run funnel:weekly` (`scripts/funnel-report.mjs`): reads raw `fhq_events` rows for the window plus eight days through REST with the service-role key from the runtime environment (`SUPABASE_SERVICE_ROLE_KEY=… npm run funnel:weekly`) or the gitignored `.env.local`; never writes or logs it. Shows counts, the visible-player denominator, direct funnel events vs legacy-derived (until Codex wires the funnel calls), QA traffic excluded by the known ids in `scripts/qa-accounts.json` and by `props.qa === true` (accounts known only by club name cannot be excluded), "no events in window" vs "no events at all", and return cohorts with D1/D7 shown only once observable. `--json` for machines, `--fixture tests/fixtures/funnel-events.json --now …` for validation without credentials. **Real-data execution is blocked** here: no service-role key is available in this environment; fixture output below.

```
FOOTBALL HEADQUARTERS — WEEKLY FUNNEL   2026-09-03 → 2026-09-10 (7 days)
data: present · players visible: 13 · events: 97 · QA excluded: 2 players / 4 rows (known QA account ids (scripts/qa-accounts.json) and props.qa === true)

  step                        players    % of visible   source
  Game visible                    13     100%        mixed (+1 legacy-derived)
  Named the club                  10    76.9%        funnel events
  Finished the tutorial            9    69.2%        legacy events only (+9 legacy-derived)
  Kicked off a first game          7    53.8%        funnel events
  Saw a result                     6    46.2%        funnel events
  Reward confirmed                 5    38.5%        legacy events only (+5 legacy-derived)
  Meaningful upgrade               3    23.1%        legacy events only (+3 legacy-derived)
  Backup prompt viewed             2    15.4%        funnel events
  Backup completed                 1     7.7%        funnel events
  Returned another day             3    23.1%        funnel events

  returning players in window: 4
  return cohorts (new players first seen in window; D1/D7 shown only once observable)
    2026-09-04  new   3   D1 1/3   D7 not yet
    2026-09-05  new   3   D1 1/3   D7 not yet
    2026-09-07  new   1   D1 1/1   D7 not yet
    2026-09-09  new   5   D1 0/5   D7 not yet

source: fixture tests/fixtures/funnel-events.json
```

No schedule or notification was created.

## Release evidence (task 28)

- Main at start: `68c1818bf0d891e7dae056835cb107d22fc381b2`. Branch head: see PR #45 (commits `8954c91` shared-file edits, `b74cbdf` asset delivery, `d0f1cdb` install/offline/metadata, `275df95` funnel, then verification tooling).
- `npm run release:verify -- --browser` on the branch: typecheck, 492 tests / 64 files, authority parity (v4 staged/deployed record unchanged), hero atlases 9/9, restore rehearsal, derived art, icons, production build with raster decode, build assets content-addressed (198 files), balance guard, Chrome determinism corpus 8/8, startup budget PASS, PWA behaviour 13/13 — 49 s. Live checks skipped (no deployed payload changed).
- Vercel preview headers and the preview waterfall: see the section appended below once the PR preview deployed.

## Codex integration checklist

1. **Warm the lineup on intent** — when a game is reserved (prep sheet confirmed) or a hero is chosen in the Film Room: `import { warmHeroArt } from '../components/heroArtLoader'; warmHeroArt(lineupKeys)`. Optional after a battle: `releaseHeroArt(key)` for heroes not in the next lineup.
2. **Battle-only mounts** — any new `AnimatedHero` on the field passes `tier="battle"`; cards, campus and idle previews leave the default.
3. **Funnel calls** (`import { trackFunnel } from './game/funnel'`): `visible_start` at boot (`{ returning, installed: installSupport().installed, source }`), `naming_complete` in `finishTutorial` (`{ nameLen }`), `tutorial_complete` (`{ choice: 'play' | 'look' }`), `first_kickoff` when the first battle mounts (`{ mode, protected }`), `result` on the result screen (`{ matchId, mode, won, stars, protected }`), `confirmed_reward` when the authority confirms (`{ matchId, mode, won }`), `upgrade_meaningful` on the first Stadium level-up or hero training (`{ kind, toLevel, protected }`), `backup_prompt_viewed` / `backup_completed` in Settings (`{ reason }` / `{ method: 'export' | 'account' }`), `return_visit` at boot when the save is older than today (`{ daysSinceFirst, installed }`). Duplicates are suppressed by the helper; never pass names, emails or state.
4. **Install UI** (Settings): `installSupport()` decides which of three rows to show — the browser prompt (`promptInstall()`), the iOS instructions text, or nothing when installed/unsupported. Subscribe with `onInstallSupportChange`. Offer it after a meaningful moment (first confirmed reward), never on first visit.
5. **Update UI**: `onUpdateAvailable(state => …)` → show "Update ready" only when `!battleConfig && authority.pendingCount === 0`; the button calls `applyUpdate()` (reloads). Never apply during a battle or with unconfirmed operations.
6. **Connection row**: `onConnectionChange(state => …)` renders `state.summary`; when `!state.online` say local play continues and online actions wait; `state.settlesOffline` is always false.
7. **Share**: `shareUrl('result-card')` or similar sources; keep the OG image as is.
8. **Art decisions listed above**: lossy/derived campus cutouts (−4.4 MB per campus load), `game-day-tunnel.png` → WebP, `field-equipment-cutouts` re-encode.
9. **QA scripts**: `window.__fhqPwa` exposes `install()`, `connection()`, `update()`, `applyUpdate()`, `checkForUpdate()` for rendered checks.
