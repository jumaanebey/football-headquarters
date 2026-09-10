# Football HQ — offline and update reliability under real game transitions

Package D on branch `claude/fhq-pwa-hardening` (from `claude/fhq-integration`, main + PR #45). Companion: `docs/PERF-INSTALL-MILESTONE.md` (the install/offline milestone this hardens), `docs/PWA-DEVICE-ACCEPTANCE.md` (physical-device script). Status vocabulary as before: **implemented**, **tested** (vitest with fake globals, or Playwright + installed Chrome on the built `vite preview`), **deployed**, **verified live**. Nothing here is deployed; nothing ran against Supabase or production; no credentials are stored.

Ownership respected: only `pwa/*`, `build/serviceWorker.ts` (unchanged in the end), `scripts/pwa-*.mjs`, `scripts/funnel-report.*`, `game/funnel.ts`, tests/fixtures and these docs changed. `App.tsx`, `index.tsx`, `components/`, `game/online/*`, `analytics.ts` and server code are untouched; the call sites they need are specified below with typed interfaces.

## 1. Update readiness contract (`pwa/updateReadiness.ts`, `pwa/register.ts`)

Activating a waiting worker reloads the page. The product now describes its state, and **no call path can activate while that state is busy** — including the QA hook `window.__fhqPwa.applyUpdate()`.

```ts
// pwa/updateReadiness.ts
export interface ReadinessInput {
  battleActive: boolean;            // a battle (attack, defence, gauntlet, practice, replay) is on screen
  awaitingConfirmation: boolean;    // a result was sent to the authority and its receipt has not arrived / been refused
  pendingOperations: number;        // useAuthority().pendingCount — locally recorded, unconfirmed operations
  pendingJobs: { upgrade: number; recruit: number }; // requests whose ANSWER is outstanding (confirmed countdown jobs do not count)
  accountSwitching: boolean;        // sign-in / sign-out / link in progress
  restoringBackup?: boolean;        // a backup import is replacing the save
}
export type ReadinessReason = 'battle_active' | 'awaiting_confirmation' | 'pending_operations' | 'pending_upgrade' | 'pending_recruit' | 'account_switching' | 'restoring_backup' | 'no_readiness_provider' | 'readiness_error';
export interface UpdateReadiness { ready: boolean; reasons: ReadinessReason[] }
export type ReadinessProvider = () => Partial<ReadinessInput> | UpdateReadiness;
export function computeReadiness(input: Partial<ReadinessInput> | null | undefined): UpdateReadiness;
export function resolveReadiness(provider: ReadinessProvider | null | undefined): UpdateReadiness; // absent → not ready (no_readiness_provider); throwing → not ready (readiness_error)
export function describeReadiness(r: UpdateReadiness): string; // "Update will apply after the game on screen ends and …"
export const READINESS_MESSAGES: Record<ReadinessReason, string>;
```

```ts
// pwa/register.ts
export function registerUpdateReadiness(provider: ReadinessProvider): () => void; // returns unregister
export function updateReadiness(): UpdateReadiness;                               // current verdict (fail-closed when none registered)
export interface UpdateAttempt { applied: boolean; reasons: ReadinessReason[]; readiness: UpdateReadiness | null }
export function applyUpdate(extra?: ReadinessProvider): UpdateAttempt;            // re-checks readiness NOW; `extra` can only add reasons
export function retryDeferredUpdate(): UpdateAttempt;                             // re-attempts only after a refused attempt; never applies by itself
export interface UpdateState {
  available: boolean; version: string | null; applying: boolean;
  deferred: boolean;                                   // an attempt was refused; the waiting worker is kept
  lastRejection: { at: number; reasons: ReadinessReason[] } | null;
  rejectedAttempts: number;
}
export function updateState(): UpdateState;
export function onUpdateAvailable(listener: (s: UpdateState) => void): () => void; // also fires on every refusal (no reload)
```

Rules, all tested in `tests/pwaUpdateReadiness.test.ts` and `tests/pwaRegister.test.ts` (and in Chrome by `scripts/pwa-check.mjs`):

- Readiness is resolved **at activation time**, not when the banner appeared. A state that became busy after the banner (kickoff tapped, result sent, upgrade requested, sign-in started) is refused: `SKIP_WAITING` is not sent, the waiting worker stays waiting, nothing reloads, and `updateState()` records `{ deferred: true, lastRejection: { at, reasons }, rejectedAttempts }` so the banner can say *"Update will apply after the game on screen ends"* without a reload.
- With **no provider registered** the gate fails closed (`no_readiness_provider`). An app that has not described its state is not known to be idle. Until Codex wires the provider, `applyUpdate()` from anywhere is refused — deliberately.
- A caller-supplied provider (`applyUpdate(extra)`) is AND-ed with the registered one: it can add reasons, never override them.
- `retryDeferredUpdate()` is a no-op unless an attempt was deferred. It exists so the UI can honour the player's earlier tap once the state is idle; it never turns into an automatic update.
- `controllerchange` reloads only when *this tab* is `applying`. Another tab activating the update never reloads this one (see §3).
- The waiting worker's version is asked over a `MessageChannel` (`GET_VERSION`) and shown in `updateState().version`.

### App.tsx integration (not applied — App.tsx is Codex-owned)

```tsx
import { registerUpdateReadiness, retryDeferredUpdate, updateState } from './pwa/register';
import type { ReadinessInput } from './pwa/updateReadiness';

// inside App(), after the state hooks. `readiness` is a ref so the provider always sees the latest render:
const readiness = useRef<ReadinessInput>({ battleActive: false, awaitingConfirmation: false, pendingOperations: 0, pendingJobs: { upgrade: 0, recruit: 0 }, accountSwitching: false });
readiness.current = {
  battleActive: !!battleConfig || !!preparedMatch,                       // App.tsx:114 battleConfig; preparedMatch = reserved, not yet kicked off
  awaitingConfirmation: authorityMatchRef.current !== null,             // set on finish (App.tsx ~950) until the receipt callback runs (~961)
  pendingOperations: authority.pendingCount,                            // useAuthority().pendingCount
  pendingJobs: { upgrade: pendingUpgradeRequests, recruit: pendingScoutRequests }, // counters incremented before protectedAction('facility.upgrade' | 'hero.train' | 'hero.scout') and decremented in its receipt/failure callbacks (App.tsx:587, 1085, 1203)
  accountSwitching,                                                     // useState flag set around the awaits at App.tsx:2097 (signOutToGuest), :2120 (linkAccount), :2134 (signInWithPassword)
  restoringBackup: importPending,
};
useEffect(() => registerUpdateReadiness(() => readiness.current), []);   // returns the unregister function
useEffect(() => { if (updateState().deferred) retryDeferredUpdate(); }, [battleConfig, preparedMatch, authority.pendingCount, accountSwitching, importPending]); // honour an earlier "Update now" once idle
```

Settings row: `onUpdateAvailable(s => …)` renders "Update ready" when `s.available`; the button calls `applyUpdate()`; when the result is `{ applied: false, reasons }` show `describeReadiness(result.readiness)`; `s.deferred` keeps that text visible until `retryDeferredUpdate()` succeeds.

## 2. Worker hardening (`pwa/sw.ts`, `pwa/swPolicy.ts`)

Tested by `tests/swRuntime.test.ts`, which loads the real worker source into a fake `ServiceWorkerGlobalScope` + `CacheStorage` (`tests/helpers/fakeServiceWorker.ts`), so install/activate/fetch/message are driven by hand with switchable failures:

| Case | Behaviour | Test |
| --- | --- | --- |
| First install, no prior cache | shell cache holds exactly the precache list; activate claims; shell served with zero network | `first install…` |
| Partial install (one precache URL 500) | `addAll` is atomic → install rejects; nothing half-written; previous version's caches untouched; no claim | `a partial install…` |
| Cached return | hashed art and the shell serve offline; navigation tries the network first, then the precached shell | `a cached return…` |
| Shell file evicted by the browser | refetched and restored into the shell cache | same |
| Uncached art offline | hashed and fixed-URL art answer a **network-error response** (never a thrown handler); the shell still renders; nothing bogus cached. The page's loader keeps the portrait fallback and retries on `online` (`components/heroArtLoader.ts`, unchanged) | `uncached art offline…` |
| Reconnect | the same request succeeds when the network returns and is cached for the next offline visit | `reconnect…` |
| `cache.put` throws `QuotaExceededError` | the page receives the identical network response; the write fails quietly; a later write lands | `a cache write that throws…` |
| Private mode / `caches.open` and `caches.match` throw `SecurityError` | reads are misses, writes are skipped, network play works; activation cannot be blocked by storage | `private mode…` |
| Eviction bound | runtime cache bounded at 80 entries, oldest first | `bounds the runtime cache` |
| Unsupported API (no `serviceWorker`, no `caches`) | registration returns null, `bootPwa()` exposes an inert hook, the app runs (page side) | `tests/pwaRegister.test.ts › boots without a service worker or Cache API` |

Implementation: `putSafely`/`matchSafely` wrap every cache access; `networkError()` falls back to a 503 if `Response.error()` is unavailable; Vite code-split chunks (`/assets/CampusEditor-<hash>.js`) are now cache-first like the bundle; `/sw-version.json` is never cached. Policy stays pure in `pwa/swPolicy.ts` (`classify`, `staleCaches`, `activationDeletions`, `versionHistory`, `clientsAllCurrent`, `artEvictions`, `isSwMessage`).

## 3. Two tabs on different versions (`scripts/pwa-multitab-check.mjs`)

**Experiment** (Chrome 152 headless, built preview on port 4191 — note 4190 is on the fetch-spec "bad port" list and `with-preview.mjs` cannot reach it): tab A opens build 1, warms a campus sheet and the campus-editor chunk. A deploy is simulated in `dist/`: the bundle is renamed in `index.html`, `sw.js` is bumped with the new precache list, and three build-1 files are removed — the campus sheet A cached, a battle sheet A has not requested, and the chunk. Tab B opens build 2, installs the new worker and applies it with an idle readiness provider. Tab A stays open on the old bundle.

**What the experiment showed.** Activation takes over every window: after B applied, A's controller answered `GET_VERSION` with the new version while still running the old bundle. The Service Worker spec switches all clients of the registration to the new active worker; `clients.claim()` only adds uncontrolled ones. So every lazy load from the old tab now goes through the new worker. With the previous lifecycle (delete all other `fhq-*` caches on activate) the old tab's assets came from the network only — and a removed hashed URL is gone. The script reproduces this at the end by deleting the old caches by hand: A's cached campus sheet immediately stops being served (on the preview the server answers the SPA fallback, `text/html` 200 — a broken image; on Vercel it is a 404).

**What changed.** `pwa/sw.ts` records a version history in `fhq-meta` and, on activate, deletes only caches **older than the immediately previous version** (`activationDeletions`); with no recorded predecessor it deletes nothing. Pages send `CLIENT_HELLO { bundle: import.meta.url pathname }` at registration, on `controllerchange` and when the tab becomes visible; the worker keeps a client-id → bundle map and removes the previous version's caches only when **every open window reports a bundle in the current precache list** (`clientsAllCurrent`; unknown windows count as old). Because `caches.match()` searches every cache, the old tab's cached assets keep being served by the new worker.

**Result (17 PASS, 2 INFO lines, 0 FAIL):** old caches survive activation while A is open; A's cached campus sheet (`image/webp`) and chunk (`text/javascript`) still load although the deploy removed them; A keeps working (Heroes opens, no error boundary); A was not reloaded by B's activation; after A reloads onto the new bundle the old caches are removed. Storage is bounded: a third activation keeps only the second (unit test `a third version keeps only the second`).

**Remaining host limitation (honest).** An old tab that needs a hashed file it never requested before the deploy — the battle sheet in the experiment — cannot be served by any cache, and Vercel does not keep a previous deployment's assets on the production alias. That request fails cleanly (404 on Vercel; on the preview the SPA fallback) and the loader keeps the portrait fallback; the tab is functional but the art is degraded until it reloads. The browser's HTTP cache (assets are `immutable` for a year on Vercel) softens this for files the tab loaded earlier in *any* session, not for never-seen files. Mitigations that remain product decisions: prompt the old tab to reload through the update banner (it already sees `available`), or warm the lineup's battle sheets on reserve (`warmHeroArt`, PR #45) so a battle rarely needs a never-seen file.

## 4. Kill switch (`scripts/pwa-killswitch-check.mjs`, 13/13 PASS)

From a controlled normal-worker fixture: `pwa/sw-killswitch.js` deployed as `dist/sw.js` (unchanged file), update triggered → every `fhq-*` cache deleted (including `fhq-meta`), worker unregistered, page re-navigated once and rendering from the network, `localStorage` club save and a marker key intact, a `not-fhq-cache` we created untouched, club-server/REST/auth requests absent from every cache before and after (network-only policy; the kill switch has no fetch handler at all), a fresh visit under the kill switch installs nothing lasting, and after restoring the normal `sw.js` the worker re-registers, controls the page and rebuilds its caches with club data intact. The script refuses `*.vercel.app` hosts.

## 5. Connection state (`pwa/connection.ts`)

`navigator.onLine` is a hint: `false` is reliable, `true` only means "not known to be offline". The club server's last observed behaviour decides:

```ts
export type ClubServerStatus = 'ok' | 'offline' | 'unauthorized' | 'unavailable' | 'unknown';
export type ConnectionAssessment = 'connected' | 'browser-offline' | 'transport-failure' | 'auth-expired' | 'server-unavailable' | 'unchecked';
export interface ConnectionState { online: boolean; clubServer: ClubServerStatus; assessment: ConnectionAssessment; settlesOffline: false; summary: string; action: 'wait' | 'sign-in' | null; lastOkAt: number | null; lastFailureAt: number | null; consecutiveFailures: number; account: string | null }
export function assess(online: boolean, status: ClubServerStatus): ConnectionAssessment; // pure
export function reportClubServer(status: ClubServerStatus): void;      // repeats update counters without re-notifying
export function resetConnectionForAccount(account: string | null): void; // status → unknown, counters cleared, listeners notified once
export function armConnectionTracking(target?): () => void;           // idempotent; returns disarm
export function onConnectionChange(listener): () => void;              // returns unsubscribe
```

Summaries never promise offline settlement (tested). The authority client already calls `reportClubServer(sent.status)` after each transport result and `reportClubServer('ok')` on an answer (`game/online/authorityClient.ts:144,149`, unchanged). Two calls it should add, in its own package:

- **Server unavailable** — where the transport observes a completed round trip with HTTP 5xx / 502 / 503 (currently folded into `'offline'`): `reportClubServer('unavailable')`. The type already accepts it; nothing else changes.
- **Account change** — in the App.tsx handlers at lines ~2097 (`signOutToGuest()`), ~2120 (`linkAccount`) and ~2134 (`signInWithPassword`), after `setProfile(...)`: `resetConnectionForAccount(playerId() ?? null)`.

Settings row: `onConnectionChange(s => …)` renders `s.summary`; when `s.action === 'sign-in'` show the sign-in control; `s.consecutiveFailures` and `s.lastOkAt` support a "last confirmed at …" line.

## 6. Install prompts (`pwa/install.ts`, tests in `tests/pwa.test.ts`)

No code change was needed; the tests now cover: successful prompt; dismissed prompt (event consumed, no second prompt); `prompt()` throwing (returns `'unavailable'`, state consistent); `appinstalled` from the browser's own UI; already installed on iOS (`navigator.standalone`) and Android (`display-mode: standalone`) → no prompt, no guidance, even with a held event; unsupported browsers (no service worker) → nothing offered; iPadOS-as-Mac → iOS guidance; `matchMedia` throwing → not installed. Physical-device steps: `docs/PWA-DEVICE-ACCEPTANCE.md`. All evidence in this package is **emulator/headless evidence** (HeadlessChrome 152, macOS).

## 7. Funnel semantics (`game/funnel.ts`)

Order: `visible_start, naming_complete, tutorial_complete, first_kickoff, result, confirmed_reward, upgrade_requested, upgrade_meaningful, backup_prompt_viewed, backup_completed, return_visit`.

| Distinction | How it is enforced |
| --- | --- |
| A viewed result is not a confirmed reward | separate steps, both keyed per `matchId`; a `result` without `matchId` is refused; repeat renders and outbox retries dedupe on the same key |
| A requested upgrade is not a completed upgrade | `upgrade_requested` (first request) vs `upgrade_meaningful` (first completed level-up); the report derives only `upgrade_requested` from legacy `building_upgrade`/`hero_upgrade` (those fire at request/acceptance, not completion) |
| Showing backup UI is not a backup | `backup_prompt_viewed` vs `backup_completed` |
| Exporting a file is not a cloud backup | `backup_completed` is **once per method**, `method: 'export' | 'account'` required (anything else refused); the report shows both counts |
| Repeats, retries, account switches | `trackFunnel(step, props, { accountId })` stores markers under `fhq_funnel_v1:<accountId>` (guests keep `fhq_funnel_v1`); switching back never re-emits, another account's markers never suppress |

Signature: `trackFunnel(step: FunnelStep, props?: Record<string, unknown>, options?: { storage?; now?; emit?; accountId?: string | null }): boolean` — `funnelStorageKey(accountId)` exported.

### Recommended App.tsx call sites (line context from `claude/fhq-integration`; not applied)

| Step | Where | Call |
| --- | --- | --- |
| `visible_start` | the boot effect that emits `session_start` (App.tsx:1197) | `trackFunnel('visible_start', { returning, installed: installSupport().installed, source }, { accountId: playerId() })` |
| `naming_complete`, `tutorial_complete` | `finishTutorial` (App.tsx:204–212, beside `club_created`/`tutorial_choice`) | `trackFunnel('naming_complete', { nameLen })`; `trackFunnel('tutorial_complete', { choice: startRaid ? 'play' : 'look' })` |
| `first_kickoff` | where `battleConfig` is first set for a real game (`launchAttack` App.tsx:832–864; `campaign_start` :1256; `gauntlet_start` :888) | `trackFunnel('first_kickoff', { mode, protected: !!config.authority })` |
| `result` | the result handler beside `track('battle_result', …)` (App.tsx:959 protected, :983 legacy) | `trackFunnel('result', { matchId: open.matchId ?? r.replay?.seed, mode: r.mode, won: r.won, stars: r.stars, protected }, { accountId: ownerAtFinish })` |
| `confirmed_reward` | inside the `outcome.status === 'confirmed' && !outcome.duplicate` branch beside `track('battle_confirmed', …)` (App.tsx:961–970) | `trackFunnel('confirmed_reward', { matchId: open.matchId, mode, won }, { accountId: ownerAtFinish })` |
| `upgrade_requested` | the receipt callback of `protectedAction({ type: 'facility.upgrade' })` (App.tsx:587) / `hero.train` (:1085), and the legacy branches (:605, :1109) | `trackFunnel('upgrade_requested', { kind: 'building' \| 'hero', toLevel, protected })` |
| `upgrade_meaningful` | where a timed job completes and the level is applied (the `upgrades` job finisher; `upgrade_finish_now` at :620 is a request, not completion) | `trackFunnel('upgrade_meaningful', { kind, toLevel, protected })` |
| `backup_prompt_viewed` | when the Settings backup section or `ClubReturnCard` backup nudge renders (App.tsx:1428 `onBackup`, :2033 Settings) | `trackFunnel('backup_prompt_viewed', { reason: 'return_card' \| 'settings' })` |
| `backup_completed` (`export`) | end of `exportSave` after the anchor click (App.tsx:170–176) | `trackFunnel('backup_completed', { method: 'export' })` |
| `backup_completed` (`account`) | after `linkAccount` / `signInWithPassword` succeed **and** `pushCloudSave` resolves ok (App.tsx:2120–2136) | `trackFunnel('backup_completed', { method: 'account' }, { accountId: playerId() })` |
| `return_visit` | the boot effect, when the save is older than today | `trackFunnel('return_visit', { daysSinceFirst, installed })` |

## 8. Weekly report (`scripts/funnel-report.mjs`)

- Malformed rows (bad `ts`, missing/empty `pid`, non-string `event`, non-object `props`, non-object rows) are counted by reason and excluded, never guessed; printed as `malformed rows excluded: …`.
- Window inclusive at exactly `since` and exactly `now`; cohort days are UTC calendar days (stated in the header); D1/D7 only once the UTC day has passed.
- QA excluded by `scripts/qa-accounts.json` ids and `props.qa === true`, from counts and cohorts.
- Legacy derivation is honest: `building_upgrade`/`hero_upgrade` → `upgrade_requested`; `upgrade_meaningful` counts direct events only.
- New `distinctions` block: results not confirmed, upgrades requested but not completed, prompt viewed but no backup, backups by method, unknown methods.
- **Source labelling**: fixture runs print `==== FIXTURE DATA: <path> — synthetic rows …, NOT real players ====` first and last, plus `source: fixture <path>`; `--json` carries `sourceKind: 'fixture' | 'real'`; real runs print `source: fhq_events via REST (service role, N rows since …)` and `source kind: REAL DATA`. Missing credentials block only the real run (exit 2); `--no-dotenv` limits credentials to the process environment. `fetchRows` is exported with an injectable fetch and tested for pagination (offsets 0/1000, stop on a short page, 401 hint, non-array body).

Fixture output on this branch (synthetic): 13 visible · result 6 / confirmed 5 · upgrade requested 3 (1 direct + 2 legacy) / completed 1 · backups export 1, account 1. **Real-data run not performed** (no service-role key here, by design).

## 9. Evidence and how to re-run

```
npx tsc --noEmit && npx vitest run                       # 68 files, 552 tests (496 before this package)
npm run build
node scripts/with-preview.mjs 4191 node scripts/pwa-check.mjs http://127.0.0.1:4191/            # 17 checks
node scripts/with-preview.mjs 4191 node scripts/pwa-multitab-check.mjs http://127.0.0.1:4191/   # 17 checks + 2 INFO, restores dist/
node scripts/with-preview.mjs 4191 node scripts/pwa-killswitch-check.mjs http://127.0.0.1:4191/ # 13 checks, restores dist/sw.js
node scripts/funnel-report.mjs --fixture tests/fixtures/funnel-events.json --now 2026-09-10T12:00:00Z
```

All browser evidence: HeadlessChrome 152 (`chromium.launch({ channel: 'chrome' })`), 430×932 mobile emulation, macOS. `package.json` was not edited (not owned); add `pwa:multitab` / `pwa:killswitch` scripts when Codex takes the package.

## 10. Not done, and why

- App.tsx, Settings UI, `authorityClient` and `analytics.ts` call sites: specified above, not applied (ownership).
- Real-data weekly report: blocked without a service-role key, by design.
- Physical iOS/Android acceptance: script written (`docs/PWA-DEVICE-ACCEPTANCE.md`), not executed — no device in this environment.
- `build/serviceWorker.ts`: read, no change required (the worker still bundles from `pwa/sw.ts`; the kill switch path is unchanged).
