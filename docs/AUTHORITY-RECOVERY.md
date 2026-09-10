# Club authority — recovery, provenance and reconciliation

Prepared 2026-09-10 (UTC) on branch `claude/fhq-authority-defense` from main `39bf464`. Read-only inspection of Supabase project `ruzkpbvgzvqrrnexrffz` (`football-headquarters`, ACTIVE_HEALTHY, us-west-1, Postgres 17.6). No database writes, schema changes, deployments or deletions were performed by this recovery; the live evidence script only creates clearly named anonymous test accounts and rows the service itself writes.

## What was deployed and what was in git

| Item | Live state (verified) | Repository at main `39bf464` | Now |
| --- | --- | --- | --- |
| Migration `20260910004731_authoritative_clubs_and_matches` | Applied; SQL present in `supabase_migrations.schema_migrations` (md5 `b1106c2a69587bacff8242d8feab1b21`, 14 011 bytes) | Absent | Recovered verbatim to `supabase/migrations/20260910004731_authoritative_clubs_and_matches.sql` (same md5). Live function/policy definitions from `pg_proc`/`pg_policies` match it. |
| Edge Function `club-authority` | ACTIVE, version 2, `verify_jwt: true`, eszip digest `48147951…`; entrypoint is a 226 375-byte esbuild bundle (sha256 `28ae01c1a43ce9953c7d40cd08e16f3420d6c4289f49247e9191a8d63cc23551`) | Absent | Deployed bundle preserved verbatim at `supabase/recovery/club-authority.v2.bundle.js`. Sources reconstructed (below). `supabase/functions/club-authority/index.ts` is now GENERATED from `main.ts` by `npm run authority:build`. |
| Authority tables `fhq_authority_configuration/clubs/matches/operations` | Present, RLS on, no policies (service-role only), 1/0/0/0 rows; `activation_at = 2026-09-10 00:47:31 UTC` | Absent | Described by the recovered migration. |
| Legacy tables | `fhq_bases` 10 rows, `fhq_attacks` 16, `fhq_saves` 3, `fhq_events` 175; policies and triggers match `20260909232039_online_integrity.sql` | Present | Unchanged. |
| `auth.users` | 55 users, 53 anonymous | — | Unchanged. |

Advisors (security): only the expected findings — RLS-without-policy on the service-only authority/backup tables, anonymous-access policies on the legacy tables, leaked-password protection disabled.

## Source reconstruction and proof

The bundle carried esbuild section comments naming its modules. Ten of them never existed in git: `server/authorityStore.ts`, `server/authorityAdmission.ts`, `server/authorityService.ts`, `server/authorityHttp.ts`, `game/authority/clubActions.ts`, `game/authority/matches.ts`, `game/authority/protection.ts` (only its read path survived tree-shaking), `game/defenseSnapshot.ts`, `game/campusLayout.ts` and the Deno entry (now `main.ts`). They were de-transpiled into typed TypeScript preserving control flow, limits, codes and strings.

Rebuilding from the reconstructed sources with the same tool (`esbuild --bundle`) and comparing module by module after normalizing esbuild's identifier renames:

- 29 of 35 modules are **identical** (every shared game module, the store, HTTP layer, campus layout, defense snapshot, match rules, persistence, save validation).
- `clubActions.ts`, `authorityAdmission.ts`, `authorityService.ts`: cosmetic only (quoted keys, a named constant, a local alias).
- `game/combat/actions.ts` and `game/combat/engine.ts`: the deployed copies carried uncommitted bookkeeping (`creditHype`, `hypeSource`, `reinforcementsSent`) that is **not** part of the verification hash and never existed in git history; it is deliberately not ported. One behavioral delta **was** ported to main: the crowd pulse now also fires when an attacker faces a defense snapshot (`defenseSnapshotId`), so rivals meet the same crowd as Test Defense.

Shared-module deltas the bundle depended on and main lacked (now on main): `campusLayout`/`recruitBoard` on `GameState`; `authority`, `defenseLayoutId`, `defenseSnapshotId`, `defenseFormation` on `BattleConfig`/`BattleResult`; `authorityMatchId`/`defenseLayoutId` on `DefenseLogEntry`; seeded `generateRaidTargets`; the protected-club hook in `loadState`; campus-layout validation in `parseSavedClub`.

## Live finding: the deployed function never served a request

Every request to `club-authority` — including CORS preflight — returned HTTP 500 `WORKER_ERROR`. `function_logs` show `Error: Authority storage is server-only. at createSupabaseAuthorityStore (index.ts:58)`: the Supabase edge runtime defines a global `window`, so the store's browser guard threw at startup. Reproduced locally by initializing the v2 bundle with a `window` global; the rebuilt bundle (guard on a real `document`) starts and answers. The fix is in `server/authorityStore.ts` with a regression test. **Version 2 remains deployed; deploying the rebuilt bundle is a production change awaiting authorization** (see "Release" below). Because the authority tables hold zero rows, no player data depends on v2.

## Implemented / missing / risky matrix (authority path)

| Area | Status | Evidence |
| --- | --- | --- |
| Server-owned club state, revisions, idempotent operations (`fhq_authority_commit`) | Implemented | Migration + `tests/authorityService.test.ts` (memory store mirrors the SQL branch order) |
| Server-issued match: seed, rules version, expiry, Energy reservation, one open match | Implemented | `game/authority/matches.ts`; tests: reserve/begin/expire/cancel/refund |
| Shared-engine film verification, exactly-once settlement, retry returns the receipt | Implemented | tests: tampered hash → `simulation_mismatch`, early ticks → `invalid_time`, duplicate finish → same receipt, no double credit |
| Eligibility: beginner protection (2 Season games), shields, self-attack, busy target | Implemented (server) | tests |
| Legacy admission (accounts created before activation may carry a validated save; later accounts must start fresh unless pristine) | Implemented (server policy) | tests; **product decision to confirm** (see contracts doc) |
| One defense snapshot for local test, rival attack, film and server verification | Implemented | `game/defenseSnapshot.ts` used by `startDefense`, Gauntlet, `issueMatch`; test proves the attacked config carries the defender's gate hero and slot level and the film replays under the same `defenseSnapshotId` |
| Client integration (protected clubs) | Implemented, untested against the live function | `game/online/authorityClient.ts` (durable ledger), `useAuthority.ts`, App wiring; `tests/authorityClient.test.ts` |
| Honest pending/failed/confirmed UI | Implemented | Settings "Online protection" panel, result confirmation notices; rewards shown only after the server answer |
| Deployed function works | **Missing** | v2 crashes at startup; rebuilt v3 bundle staged, not deployed |
| Two-account live evidence | **Open** | `npm run authority:evidence` ran against v2 and recorded the crash (`WORKER_ERROR`); rerun after the v3 deploy |
| Browser journey on preview | **Open** | Blocked by the same crash (CORS preflight fails); script in `scripts/authority-browser-check.mjs` |
| Cross-device: protection detected from the server club on any device | Implemented | `useAuthority.detect` writes the device record when the account has a server club; legacy cloud sync is gated behind detection |
| Risk: `window` guard also exists in client bundles? | Checked | Store is imported only by `server/*`; `tests/authorityStore.test.ts` |
| Risk: protected club still raidable through the legacy `fhq_bases` path | Mitigated | Enabling protection deletes the published base and stops publishing; protected clubs raid only protected clubs |
| Risk: two tabs / two devices | Handled by revision conflicts (latest club adopted, stale request fails), stale reservations released on load | tests + hook |
| Risk: rewards displayed before confirmation | Prevented | `handleBattleFinish` credits nothing locally for authority matches |

## Deployment record

- 2026-09-10 ~03:24 UTC: `club-authority` **version 3** deployed (owner-authorized), `verify_jwt: true`, eszip digest `dce9609573f3082695e4e5ffb681bd0d409f6caaf1da7adeb42b1dad2cb2e916`. The deployed `index.ts` is a one-line entry that imports the commit-pinned artifact `supabase/recovery/club-authority.v3.min.js` (sha256 `9ebeed1b…`, commit `e5d8238`) through jsDelivr; the bundler embeds it at deploy time, so repository changes cannot alter the deployment. Reason for the indirection: the deploy tool takes file contents inline and the 225 KB bundle exceeded what one call could carry.
- Verified after deploy: CORS preflight `OPTIONS` → 204 (was 500); `POST` without a bearer → gateway 401 `UNAUTHORIZED_NO_AUTH_HEADER` (was 500).
- Rollback: redeploy the preserved v2 bundle (`supabase/recovery/club-authority.v2.bundle.js`) as `index.ts`, or an entry importing it by commit.

## Live evidence (v3) — run 1, 2026-09-10 ~03:31 UTC

`npm run authority:evidence` against the deployed v3, run by the owner from this session: **54 passed, 3 failed**. Test accounts (anonymous, clubs renamed `fhq-authority-evidence-A/B`): `c5f960d1-cc2e-4e29-bf80-7ad2e4e460a4`, `bb5e10d0-cf14-4be2-9448-a45c95a116ca`, `7e275a6a-cd30-45b6-861a-bed148fd6c4a` — add to the deferred QA cleanup list.

Observed on the live service: fresh bootstrap for both accounts; `club.rename` confirmed; stale revision → `revision_conflict`; unknown action → `invalid_command`; unaffordable → `insufficient_resources`; rival before two Season games → `beginner_protection`; six Season games settled with the server's result equal to the client simulation and coins credited exactly once each (e.g. 500 → 932 → 1410 → 2407 for A); duplicate `match.finish` returned the receipt without a second credit; finishing a settled match → `match_conflict`; forged `finalHash` → `simulation_mismatch`; cancelling a started game → released without refund; `facility.upgrade` Stadium (1 400 coins) settled to L2 by the server timer; `formation.set cover3` confirmed; B saw A as a protected rival; B's raid config carried A's `cover3` layout, `defenseSnapshotId`/`defenseLayoutId`, and the upgraded Stadium (HQ hp 720); settlement credited B once (+550) and gave A one receipt (`stars 3, pct 100, coinsLost 120`, `authorityMatchId` set) with A's revision advancing exactly twice (reserve + settle); a repeated settlement left A untouched; both accounts fetched the identical film, which replayed to the settled result under the attacked snapshot (hash `a0dc1792`); a third account got `film_unavailable`; raiding A again → `shielded`.

The three failures were one script defect: the gate assignment used `rb`, which is not a hero key, so the server correctly refused it and the two dependent checks (verbatim-retry receipt, assigned gate hero in the attacked snapshot) could not pass. Fixed in the script (starter hero `kicker`); rerun pending.

## Live evidence (v3) — run 2, 2026-09-10 ~03:40 UTC

Rerun after the script fix: **57 passed, 0 failed**. Test accounts: `d38b8c11-9ee0-4b5d-8634-827a27737954` (A), `79d451a1-7033-4e28-8e0e-92b267270417` (B), `147c15d7-30f1-4fe2-b07c-4684c840c03c` (C) — add to the deferred QA cleanup list. New in this run: `gate.assign south → kicker` confirmed at revision 2 with a verbatim retry returning the same receipt; reusing that operation id for a different request → `operation_conflict`; B's raid config listed **The Specialist** at A's south gate alongside the auto-filled Enforcer, under A's `cover3` layout and L2 Stadium (HQ hp 720); A's receipt `stars 3, pct 100, coinsLost 119` with `authorityMatchId c29955db…`; the shared film replayed to the settled result (hash `c36a67d0`). This closes the two-account acceptance for Work Package 2 on the protected path: a gate assignment and a saved upgrade on A were attacked by B under the same snapshot the server verified and both accounts can replay.

## Browser journey (preview, v3) — 2026-09-10 ~04:25 UTC

`node scripts/authority-browser-check.mjs` against `vite preview` of the merged branch (build stamp 2026-09-10 04:20 UTC), Chrome 151 headless at 430×932, run by the owner from this session. Observed: fresh guest → tutorial ("Look around first") → Settings showed **Online protection: OFF** → "Protect this club online" → **PROTECTED, revision 0**, notice "A fresh protected club is ready" → Game Day → Season game 1 reserved through the authority → deploy taps, kickoff (`match.begin`), drive played, whistle → debrief → "Collect rewards" → Settings showed **revision 3 · everything confirmed** (reserve + begin + finish) and the HUD reflected the server-settled club: coins 500 → 677, fans 0 → 6, Crowns 10 → 18 (first-clear bonus). No console errors. Screenshots 01–12 in the scratch directory of that session. The transient "Confirmed" toast had already cleared by the time the script sampled the page (it checks four seconds after leaving the debrief), so its boolean printed false; the revision and balances are the confirmation evidence. The script's optional Stadium-tap step failed on an off-viewport click and is not part of the acceptance.

Still open: physical-device play and observed-player acceptance. Reliability hardening (recovery, coverage matrix, admission boundaries, name rule, diagnostics) is in `docs/AUTHORITY-RELIABILITY.md`.

## Recovery and rollback procedure (v3 baseline)

Working baseline: `club-authority` **version 3**, deployed 2026-09-10 from commit `e5d8238` (artifact `supabase/recovery/club-authority.v3.min.js`, sha256 `9ebeed1b…`), rules `hero-actions-3`, request/answer shapes as in `docs/AUTHORITY-CONTRACTS.md`. The preserved v2 bundle **crashes at startup and is not a rollback target**.

Compatibility rules for any new build:
1. Build from source: `npm run authority:build` (readable `index.ts`) and, for deployment, `esbuild main.ts --bundle --minify --line-limit=220` into `supabase/recovery/club-authority.vN.min.js`; commit and push; record the commit and sha256 here; deploy a one-line `index.ts` that imports the artifact pinned to that commit (`https://cdn.jsdelivr.net/gh/jumaanebey/football-headquarters@<commit>/supabase/recovery/club-authority.vN.min.js`), `verify_jwt: true`.
2. Keep `COMBAT_RULES_VERSION` and the request/answer contract unchanged unless the client ships first; the server re-simulates films with the rules it embeds, so a rules change requires bumping the version and deploying server and client together. Pending client operations survive a redeploy: they are replayed with their original id and request, and the server answers duplicates from `fhq_authority_operations`.
3. Verify after deploy: `OPTIONS` preflight → 204; `POST` without bearer → 401; `npm run authority:evidence` (two anonymous accounts; record the IDs in the cleanup list); `node scripts/authority-browser-check.mjs` on a preview.

Rollback (tested in principle by the v2→v3 replacement; not drilled in production): redeploy the previous **healthy** pinned entry — currently the v3 entry (commit `e5d8238`) — with the same `deploy_edge_function` call. Client compatibility: any client built from PR #29 or later works against v3. If a future client depends on a newer server field, keep the older client tolerant (unknown answer fields are ignored by `parseAuthorityAnswer`) and gate new features on the answer's presence. Database: no migration is involved in function rollbacks; the authority tables are only ever changed by `fhq_authority_commit`.

Operational signals: Supabase `function_logs` (`event loop error` lines mean a startup crash, as in v2), `function_edge_logs` status codes, and on the client Settings › Online protection › Connection details (availability, confirmation latency, pending/refused counts).

### Guards and rehearsal (added 2026-09-10, tranche 5)

- `supabase/recovery/deployed.json` records what is deployed (v3: artifact, sha256, pinned commit, rules, entry) and what is staged (v4). `npm run authority:build -- --check` verifies sources ↔ `index.ts` ↔ staged artifact ↔ deployed artifact ↔ pinned commit ↔ rules, scans generated output for token-shaped strings, and reports deployment lag (`--require-deployed-current` makes it a failure). After every deploy, update the `deployed` block (version, sha256, commit, `deployedAt`) and run the check.
- Restore rehearsal: `npm run authority:rehearsal` restores a synthetic backup of the four tables into an isolated memory store and replays a device's pending requests (exactly-once verified). A real restore follows the same shapes: `server/authoritySnapshot.ts` exports rows with the tables' column names (`fhq_authority_clubs(pid, state, revision, active_match, origin, updated_at)`, `fhq_authority_matches(id, owner, status, config, seed, issued_at, expires_at, metadata, result)`, `fhq_authority_operations(owner, operation_id, request_hash, result)`, `fhq_authority_configuration(activation_at)`); insert matches before clubs (the active-match foreign key), then operations; clients replay their ledgers on the next load and the operation rows answer already-applied requests with their original receipts. Never restore over production without a fresh backup taken first; never copy production rows into repository fixtures.
- `npm run release:verify` composes the offline checks; `--live` adds the credentialed evidence (owner-run).

## Release: what deploying the fix involves

1. `npm run authority:build` (already run; `supabase/functions/club-authority/index.ts` sha256 `10df7c51…`).
2. Deploy `club-authority` with `index.ts` as the single file, keeping `verify_jwt: true` (the gateway passes `OPTIONS` through; the function validates the bearer itself and answered 204/401 correctly under the shim).
3. Rollback: redeploy `supabase/recovery/club-authority.v2.bundle.js` as `index.ts` (restores the crashing v2), or disable the function. No migration is involved; no data changes.
4. Then run `npm run authority:evidence` (two anonymous test accounts) and `node scripts/authority-browser-check.mjs` against a preview, and record the outputs here.

No new migration is required for this package. The legacy (unprotected) publish path still sends only `layout`; carrying the full snapshot there would need an additive `fhq_bases.defense` column and is deferred (see contracts doc).

## Deferred, unchanged

- QA record cleanup and analytics exclusions (owner: "build everything else and come back to this later"). The evidence script's test accounts (`fhq-authority-evidence-A/B/C` club names, anonymous users) will join that cleanup list once it runs against a working deployment.
- Consolidated inventory of every QA and evidence account (ids where known, club names otherwise): `docs/AUTHORITY-HARDENING.md` › "Consolidated deferred QA cleanup inventory".
- `fhq_authority_configuration.activation_at` stays `2026-09-10 00:47:31 UTC`.
