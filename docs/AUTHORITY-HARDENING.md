# Authority hardening — findings and completion matrix

Work package started 2026-09-10 from main `ea9a2b6` (PR #32 merged; `club-authority` v3 deployed). Companion to `docs/AUTHORITY-CONTRACTS.md`, `docs/AUTHORITY-RELIABILITY.md` and `docs/AUTHORITY-RECOVERY.md`. Status vocabulary: **verified already** (existing evidence cited), **fixed and tested**, **deployed and checked**, **blocked** (concrete dependency). Evidence types: deterministic tests through the real service on the SQL-equivalent store; live two-account evidence; browser viewport checks; none of these are physical-device tests.

## Tranche 1 — server entitlement and validation (PR: `claude/fhq-entitlement-guards`)

### Reproduced and fixed

| # | Finding | Before | After | Test |
| --- | --- | --- | --- | --- |
| 1 | `campus.apply` applied a layout's formation without the `formationUnlocked` gate that `formation.set` enforces. **Not a live exploit**: `formationUnlocked` returns true for every formation since the July 2026 decision, so both paths currently allow every scheme. | Two rules for one choice | One rule: `campus.apply` fails `locked` when the layout's formation is not unlocked; balances, revision and campus unchanged; allowed custom edits still apply | `tests/authorityEntitlements.test.ts` › 1 (policy mocked to lock a formation, plus the current-policy case) |
| 2 | Legacy admission accepted equipment levels above the Stadium level and hero levels above the Stadium training cap. The legacy client always enforced both, so only a hand-edited save could carry them, and only for accounts created before activation. | Admitted | `invalid_legacy`, no club created; honest boundary saves (slot level = Stadium level, hero at the cap) admitted | › 2 "a legacy save cannot smuggle…" |

### Inspected and passed (no change)

- `campus.apply` cannot add, drop, retype, duplicate or rename facilities/slots/gates, change wall counts, place on the edge or overlap; extra attributes such as a forged facility `level` are stripped by canonicalization and never applied.
- `gate.assign` requires an owned hero and an existing post; the defense snapshot drops any recorded assignment to a hero that is not owned.
- Equipment: locked slots, crown slots without purchase, levels above the Stadium and the cap are refused; the snapshot fields only entitled equipment.
- Facility upgrades stay behind the Stadium; hero training behind the Stadium cap; drills behind field level; starters cannot be "unlocked"; forged recruit ids are refused.
- Rival matches: a reservation is bound to its target; a second reservation is refused while one is open; a film produced against a different config is a `simulation_mismatch`, and the target receives no receipt.
- Defense consistency after edits: the snapshot captured at reservation equals the defender's local Test Defense snapshot (ids, buildings, guards); edits and upgrades made while the match is open do not change it; the settled result, the defender's receipt and the shared film all carry the attacked ids and replay to the same result; the next raid captures the new snapshot.
- Bounds at the parsing boundary: `1e999` (Infinity) in layout coordinates, `expectedRevision`, campaign stage and ticks is refused; fractional coordinates, 101 seen-ids, 121-char ids, 25-char names, extra choice fields, non-UUID ids, negative revisions and non-object bodies are refused with no state change. Film limits (1 501 commands, ticks > 1400, unordered ticks, unknown kinds/heroes/plans, off-field coordinates, extra/missing fields, non-hex hash, string script) are refused before any simulation; an altered-snapshot film is a mismatch; the worst valid film (1400 ticks) verifies well under five seconds in-process.
- Oversized legacy saves (> 450 KB) are refused before work.

### Deployment status

The reducer and admission changed, so the deployed function must be rebuilt and redeployed for the fixes to be live. Staged: readable `supabase/functions/club-authority/index.ts` (regenerated) and the minified artifact `supabase/recovery/club-authority.v4.min.js` (sha256 recorded in the PR). Deployment follows the pinned process in `docs/AUTHORITY-RECOVERY.md` and needs the owner's go-ahead; until then production runs v3, which has the two gaps above (both without a practical exploit).

## Tranche 2 — save ownership and compatibility (PR stacked on tranche 1)

### Fixed and tested

| # | Finding | Before | After | Test |
| --- | --- | --- | --- | --- |
| 8 | Signing into an account that already has a protected club adopted the server state on a device whose local save was a different (guest) club, and the autosave then overwrote that local club with the mirror. Enabling protection from the Settings button did back the local club up, but the tutorial and sign-in adoption paths did not. | Local guest club overwritten on adoption | `preserveLocalClub()` keeps the device's save as `fhq_backup_preprotect` (+ timestamp) before any adoption on a device that was not already mirroring that account, and before every `enable()` | `tests/authorityStorageFaults.test.ts` › preservation; call sites in `useAuthority.detect/enable` |

### Verified already / extended

- **6 Legacy save fixture matrix** (`tests/fixtures/legacySaves.ts`, `tests/saveFixtures.test.ts`): synthetic saves for the pre-fixed-base era (free-placed equipment, heroes without unlock fields), the fixed-base era, return progression + live defense cursor, custom campus, the protected mirror and a future client. Each loads with identity intact (name, currencies, trophies, roster ids/levels, heroes, facilities, campaign, history, equipment); pre-fixed-base equipment maps to slots and refunds once only when no unlocked slot exists; repeated load/migration is idempotent (excluding clock-driven regen, production, patrol positions and the daily/gauntlet day); truncated/negative/mistyped/mismatched saves throw `SaveLoadError` without touching the file or the last readable backup, and the existing `ErrorBoundary` offers restore-last-readable-backup, download-original and archive-before-fresh (no silent reset). No compensation or admission change.
- **7 Old-client write protection**: unknown fields written by a newer client survive the older loader and validator; a bootstrap carrying an old-shaped save for an account that already has a protected club returns the existing club unchanged (no downgrade path exists: browser roles have no privileges on the authority tables, only the pinned function writes them); film under other rules or with commands impossible under the current rules is refused explicitly (`invalid_film`/`simulation_mismatch`), never replayed under different rules. Unsupported-version fixture: `futureSave` + `CORRUPT_SAVES`. **Proposed, not built**: an explicit `stateVersion` on the authority club state would let the server refuse a downgrade *by an old function build*; today builds are pinned and deployed deliberately, so this is an owner decision.
- **8 Account-linking ownership** (`tests/accountOwnership.test.ts`): linking attaches credentials to the *current* uid (PUT), so the club, ledger and published base keep their owner; a rejected link changes nothing; signing into another account rebinds every authority request to the new owner; an answer that arrives after the account changed is discarded; sign-out never mints a new identity silently and leaves the local file alone. No merge policy was introduced.
- **9 Persistence failure recovery** (`tests/authorityStorageFaults.test.ts`): quota errors while recording send nothing and report `storage`; a read-blocked storage yields an empty ledger but fresh requests still work; malformed/foreign/corrupted persisted operations are ignored without erasing valid ones; a write interrupted at confirmation time keeps the last readable ledger and the reload retries safely (server dedupes); diagnostics storage failures never break an operation. Guest autosave failures still only log a warning (player-facing notice is Codex UI territory; recorded as a gap).

## Tranche 3 — time, economy, match lifecycle, history (PR stacked on tranche 2)

No code defects were reproduced in this tranche; every item closed on new executable evidence against the real service.

- **10 Time advancement parity** (`tests/authorityTime.test.ts`): for the same elapsed time the client's `advanceCampus` (with the server's UTC day) and the server's `settleClubState` produce identical energy, production, facility/hero levels, upgrade queues and day fields: a seven-day closed tab caps Energy and production and completes timed work; a hidden tab that catches up in one step equals many small steps; a clock that runs backwards leaves the client unchanged and makes the server refuse with `invalid_clock` (no state change); the UTC day boundary resets dailies/Gauntlet attempts exactly once on both sides; guest clubs keep the documented local-day reset.
- **11 Resource conservation** (`tests/authorityInvariants.test.ts`): a seeded 300-request random walk across every action type holds all invariants (finite, non-negative, Energy ≤ 100, production ≤ cap, level caps) and every accepted receipt accounts exactly for its balance change (Energy regen excepted), refused requests change nothing, and commits equal revisions; exact affordability (cost exactly → ok, one short → refused) for coins and Crowns; maximum levels (five stars, slot 10, parking 3, builders 5, three crown slots) refuse with `limit_reached`; Energy never exceeds 100 through rally, regen or a cancel refund; the campaign first-clear bonus and shards pay once across replays; the Gauntlet first-clear Crowns pay once per best; the daily sweep bonus pays once on the last claim. Prices unchanged.
- **12 Match lifecycle boundaries** (`tests/authorityLifecycle.test.ts`): begin/finish are allowed at the exact expiry instant and refused one millisecond later; an expired reserved game cancels with a refund, an expired started game cannot settle and cancels without one; an abandoned reservation blocks club changes until released and the release is idempotent; beginner protection lifts exactly at the third Season game for both sides; a shield ending at this instant no longer protects; kickoff drops the attacker's shield, a lost defense raises the defender's for two hours, a held defense earns a mastery hold; busy and missing targets are refused without an Energy charge; Energy is accounted once across reserve→cancel, reserve→begin→cancel, reserve→expire→cancel and reserve→finish.
- **13 Defense consequence and history integrity** (`tests/defenseHistory.test.ts`): thirty-five settled raids leave thirty newest-first receipts with every coin consequence applied exactly once at settlement (aged-out receipts keep their consequences); repeated status reads and reloads change nothing; marking seen touches only the flag; film for an aged-out match stays fetchable by both participants; two raids settled at the same millisecond are both kept in deterministic order. The legacy paginated inbox keeps its existing evidence (`tests/defenseInbox.test.ts`). Retention (30 receipts) unchanged.

## Completion matrix (updated per tranche)

| Item | Status | Evidence / dependency |
| --- | --- | --- |
| 1 Campus/formation boundary | Fixed and tested (staged for v4) | `tests/authorityEntitlements.test.ts` › 1 |
| 2 Alternate entitlement routes | Fixed (admission bounds) and tested; other routes verified | › 2 |
| 3 Defense consistency after edits | Verified already + extended | › 3 |
| 4 Bounded input and execution | Verified already + extended | › 4 |
| 5 Reviewable result | This document + PR | — |
| 6 Legacy save fixture matrix | Verified already + fixtures added | `tests/saveFixtures.test.ts` |
| 7 Old-client write protection | Verified (no downgrade path) + tests; `stateVersion` proposal pending owner | `tests/saveFixtures.test.ts` › old-client |
| 8 Account-linking ownership | Fixed (local club preserved before adoption) and tested | `tests/accountOwnership.test.ts`, storage faults › preservation |
| 9 Persistence failure recovery | Verified + injection tests | `tests/authorityStorageFaults.test.ts` |
| 10 Time advancement parity | Verified (no defect) + tests | `tests/authorityTime.test.ts` |
| 11 Resource conservation | Verified (no defect) + invariant walk | `tests/authorityInvariants.test.ts` |
| 12 Match lifecycle boundaries | Verified (no defect) + boundary tests | `tests/authorityLifecycle.test.ts` |
| 13 Defense history integrity | Verified (no defect) + tests | `tests/defenseHistory.test.ts`, `tests/defenseInbox.test.ts` |
| 14–23 | Pending (next tranches) | — |
