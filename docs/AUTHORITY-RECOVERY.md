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

## Release: what deploying the fix involves

1. `npm run authority:build` (already run; `supabase/functions/club-authority/index.ts` sha256 `10df7c51…`).
2. Deploy `club-authority` with `index.ts` as the single file, keeping `verify_jwt: true` (the gateway passes `OPTIONS` through; the function validates the bearer itself and answered 204/401 correctly under the shim).
3. Rollback: redeploy `supabase/recovery/club-authority.v2.bundle.js` as `index.ts` (restores the crashing v2), or disable the function. No migration is involved; no data changes.
4. Then run `npm run authority:evidence` (two anonymous test accounts) and `node scripts/authority-browser-check.mjs` against a preview, and record the outputs here.

No new migration is required for this package. The legacy (unprotected) publish path still sends only `layout`; carrying the full snapshot there would need an additive `fhq_bases.defense` column and is deferred (see contracts doc).

## Deferred, unchanged

- QA record cleanup and analytics exclusions (owner: "build everything else and come back to this later"). The evidence script's test accounts (`fhq-authority-evidence-A/B/C` club names, anonymous users) will join that cleanup list once it runs against a working deployment.
- `fhq_authority_configuration.activation_at` stays `2026-09-10 00:47:31 UTC`.
