# Club authority — contracts and integration handback

Companion to `docs/AUTHORITY-RECOVERY.md`. This is the interface Codex (art/animation/camera) and any client work should code against. Shared files touched by this package: `types.ts`, `game/combat/contracts.ts`, `game/combat/engine.ts` (result identity fields + crowd gate), `battle.ts` (seeded targets), `game/persistence.ts`, `game/saveValidation.ts`, `components/BattleScreen.tsx` (`onKickoff` prop only), `components/ScoutingModal.tsx` (`board`/`onRefreshBoard` props), `components/DefenseLogModal.tsx` (Watch for server films), `pvp.ts`, `App.tsx`.

## Vocabulary

- **Protected club**: an account with a row in `fhq_authority_clubs`. The server owns the club state; the device holds a mirror of the last confirmed state (`fhq_authority_protection_v1` marks the device). Detection is server-driven: any device that signs into the account becomes protected.
- **Legacy club**: today's client-authoritative club (local save, `fhq_saves`, `fhq_bases`, `fhq_attacks`). Unchanged behavior, plus Test Defense and the Gauntlet now use the defense snapshot.
- **Operation**: any state change, keyed by a client UUID, recorded in `fhq_authority_operations` with the request hash; a retry with the same id and payload returns the original receipt.

## HTTP contract (`POST /functions/v1/club-authority`, bearer = the player's session)

Requests: `{kind:'bootstrap', legacy?}`, `{kind:'status'}`, `{kind:'leaderboard'}`, `{kind:'film', matchId}`, and operations `{kind, operationId, expectedRevision, …}` with kinds `action {action}`, `match.reserve {choice}`, `match.begin {matchId}`, `match.cancel {matchId}`, `match.finish {matchId, submission}`.

Answers: `{ok:true, club, serverNow, match?, result?, rivals?, roadTargets?, leaderboard?}` or `{ok:false, code, message, club?, serverNow}`. Codes the client must handle: `revision_conflict` (adopt `club`, do not retry), `operation_conflict`, `match_conflict`, `active_match`, `expired`, `match_not_started`, `invalid_film`, `invalid_time`, `simulation_mismatch`, `beginner_protection`, `shielded`, `self_attack`, `target_busy`, `target_missing`, `energy`, `attempts`, `legacy_ineligible`, `invalid_legacy`, `not_found`, `unavailable` (retry later), `unauthorized`.

Club actions (`action.type`): `sync`, `club.rename {name}`, `facility.collect|upgrade {buildingId}`, `facility.rush {jobId}`, `builder.hire`, `rally`, `training.start {drillId, unit}`, `training.collect {buildingId}`, `hero.train|unlock|star {heroKey}`, `hero.scout`, `recruit.refresh|rush|sign`, `recruit.start {candidateId}`, `recruit.cut {playerId}`, `daily.claim {questId}`, `defense.seen {ids}`, `defense.buy-slot`, `defense.upgrade-slot {slotId}`, `formation.set {formation}`, `gate.assign {postId, heroKey}`, `campus.apply {layout}`, `parking.upgrade`. Exactly the listed fields; anything else is `invalid_command`.

Match choices: `{kind:'campaign', stage}`, `{kind:'road', choice:0..2}` (targets come from `status.roadTargets`, seeded per owner/trophies/day), `{kind:'rival', target}`, `{kind:'gauntlet'}`. Submission: `{plan, script, ticks, finalHash}` from `engine.getReplay()`.

## Defense snapshot (`game/defenseSnapshot.ts`, version 1, rules `hero-actions-3`)

`createDefenseSnapshot(state)` → `{version, rules, layoutId, campus, facilities, buildings, roster, heroStates, heroGates, assignedHeroes, equipment, bonusDefSlots, mastery{formation,holds,tier}, crowd{fans,parkingLot}, homeGuards, snapshotId}`. Derived values are computed inside (`buildings` already include roster boost × mastery multiplier, wall HP/count from the Stadium, slot levels; `homeGuards` include roster defenders, tailgate mobs and the 75%-strength gate heroes). Persisted values are the inputs only. `defenseBattleFields(snapshot)` is the only way to put a snapshot on a `BattleConfig` (`buildings, homeGuards, fans, parkingLot, masteryTier, defenseLayoutId, defenseSnapshotId, defenseFormation`). The match config stored with a settled match preserves the attacked snapshot; later edits do not change old films.

`campusLayout` (version 1) is the placement contract for the future editor: `templateCampusLayout` gives the formation template; `validateCampusLayout` enforces identity, bounds, overlap, gate access and post-breach reachability; `campus.apply` is the server action. No visual editor was added.

## Client modules

- `game/online/authorityClient.ts`: transport-agnostic ledger; `operate()` records before sending, `retry()` re-sends verbatim; answers are validated (`parseSavedClub`) before adoption.
- `game/online/useAuthority.ts`: detection on load, `enable(legacy)`, `dispatch`, `reserve/begin/cancel/finish/film`, stale-reservation release, `online` retry.
- `pvp.ts`: `postAuthority` (session-bound transport), `unpublishBase`.
- App: `protectedAction(action, onConfirmed)` guards every handler; `launchAttack(config, choice)` reserves through the server; `onKickoff` → `match.begin`; `handleBattleFinish` → `match.finish`; no local reward for authority matches.

## Behavior boundaries (explicit)

- Free practice never touches the server. Guests without a session play locally as before.
- Protected clubs cannot use the legacy cloud save/publish/inbox; enabling protection deletes the published `fhq_bases` row. Protected clubs see only protected rivals.
- A reservation that survives a reload is cancelled on the next load (Energy refunded only if the game never kicked off).
- Two devices: the second device adopts the server club on sign-in; a stale request gets `revision_conflict` and the latest club.

## Client reliability contract (this branch)

- Operations for one account are sent one at a time; a request queued behind an unanswered one waits for that receipt and then sends with the confirmed revision. `expectedRevision` is frozen at first send and reused verbatim on retry.
- A second identical request while the first is unconfirmed rides the first ledger entry (one operation). Answered entries are never resent.
- `revision_conflict` → adopt the returned club, mark the request failed, never replay it; `unavailable`/offline/unauthorized → keep pending and retry on `online`, on load, or after sign-in.
- Account changes call `resync()`: in-memory club views are dropped and the account is re-detected; a ledger entry is only ever sent under its own owner, and an answer for another account is never adopted.
- Diagnostics (`authorityClient.diagnostics()`) are bounded to 40 events with no payloads.
- Calendar: protected clubs use the server's UTC day for dailies and Gauntlet attempts (`advanceCampus(state, now, utcDay)`); guest clubs keep the local day.
- Club names: `game/clubName.ts` is the single rule (2–24 UTF-16 code units, no control characters), identical to the server's `club.rename` guard.

## Unresolved decisions for the owner

1. ~~Deploy the rebuilt function~~ — done: v3 deployed 2026-09-10 (see the deployment record in `docs/AUTHORITY-RECOVERY.md`). Rollback target is the healthy v3 pinned entry, never v2.
2. **Legacy carry-over policy**: the deployed rule admits a played save only for accounts created before `2026-09-10 00:47:31 UTC`; later accounts must be pristine. The client explains the refusal and keeps the local club. Alternative (not built): let such players start a fresh protected club and keep the local one as a backup.
3. **Rollout** — decided 2026-09-10: new clubs are protected automatically at tutorial completion when the server is reachable (fallback: local play, opt-in later from Settings). Existing guest clubs remain opt-in.
4. **Legacy publish path**: carrying the full snapshot to `fhq_bases` (additive `defense jsonb` column + client probe) is deferred; today only protected clubs get snapshot-consistent rival attacks.
5. **Rename limit**: the server caps club names at 24 characters (tutorial allows 40); protected renames are truncated.

## For Codex

No hero atlas, animation, signature or camera code changed. `BattleConfig` gained optional identity fields only; `BattleScreen` gained an optional `onKickoff`. `startDefense`/Gauntlet hero-guard spawn points now come from the snapshot (`coordinate(gate.gridX*10)`, squeezed by the parking lot) instead of `gridX*10+5`; if a gate hero's on-field position looks off, adjust in `game/defenseSnapshot.ts`, not in App.
