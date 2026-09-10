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

Still open: the browser journey on a preview (`scripts/authority-browser-check.mjs`), physical-device play, and the owner decisions in `docs/AUTHORITY-CONTRACTS.md`.

## Release: what deploying the fix involves

1. `npm run authority:build` (already run; `supabase/functions/club-authority/index.ts` sha256 `10df7c51…`).
2. Deploy `club-authority` with `index.ts` as the single file, keeping `verify_jwt: true` (the gateway passes `OPTIONS` through; the function validates the bearer itself and answered 204/401 correctly under the shim).
3. Rollback: redeploy `supabase/recovery/club-authority.v2.bundle.js` as `index.ts` (restores the crashing v2), or disable the function. No migration is involved; no data changes.
4. Then run `npm run authority:evidence` (two anonymous test accounts) and `node scripts/authority-browser-check.mjs` against a preview, and record the outputs here.

No new migration is required for this package. The legacy (unprotected) publish path still sends only `layout`; carrying the full snapshot there would need an additive `fhq_bases.defense` column and is deferred (see contracts doc).

## Deferred, unchanged

- QA record cleanup and analytics exclusions (owner: "build everything else and come back to this later"). The evidence script's test accounts (`fhq-authority-evidence-A/B/C` club names, anonymous users) will join that cleanup list once it runs against a working deployment.
- `fhq_authority_configuration.activation_at` stays `2026-09-10 00:47:31 UTC`.
