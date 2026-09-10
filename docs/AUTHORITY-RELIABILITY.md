# Protected-club reliability — behavior and test matrix

Prepared 2026-09-10 on branch `claude/fhq-protected-reliability` from main `8b604cf` (PR #29 merged; `club-authority` v3 deployed). Companion to `docs/AUTHORITY-RECOVERY.md` (provenance, deployment, evidence) and `docs/AUTHORITY-CONTRACTS.md` (interfaces, decisions).

Legend — **Deterministic**: automated test on the real service over the SQL-equivalent memory store, run by `npm run check`. **Live**: two-account evidence against the deployed function (`npm run authority:evidence`, creates test accounts). **Browser**: Playwright journey on a preview at phone viewport (`scripts/authority-browser-check.mjs`), which is not a physical-device test.

## 1. Interrupted requests and recovery (`tests/authorityRecovery.test.ts`)

| Scenario | Before this branch | After | Evidence |
| --- | --- | --- | --- |
| Offline before submission | Request recorded, retried on reconnect | Same; nothing sent, one commit on reconnect | Deterministic |
| Answer lost after the server committed | Retry carried the same id and got the receipt | Same, asserted: identical request body, one commit, one charge, revision adopted | Deterministic (+ Live run 1/2: duplicate `match.finish`) |
| Reload with a pending operation | Retry after status re-validated the account | Same; a retry before status is refused | Deterministic |
| Expired session, then sign-in | Pending with "Reconnect" message; retry after sign-in | Same; diagnostics report `unauthorized`; Settings shows the sign-in route; `resync()` re-detects after sign-in | Deterministic (transport) · Browser flow not automated (needs credentials) |
| Sign-out / account switch with a pending operation | Ledger was owner-bound but in-memory club views lingered and the UI stayed "active" until reload | `forgetClubs()` on `resync()`; A's entry is never sent under B; B's club is never adopted as A; A's receipt delivered only when A is back | Deterministic |
| Two tabs/devices mutating the same revision | Stale device got `revision_conflict` and adopted the latest club | Same, asserted with exact coins and a single commit | Deterministic |
| Duplicate submission (double tap) | Two ledger entries; the second would conflict on revision after the first confirmed | The twin rides the first entry; one operation, one commit | Deterministic |
| Rapid distinct requests | Each captured the revision at creation, so the second could conflict | Per-account serialization: the second is sent with the confirmed revision | Deterministic |
| Request queued behind an unanswered one | The second froze a stale revision and failed | It waits for the earlier receipt, then sends with the fresh revision | Deterministic (**fixed on this branch**) |
| Twin tap arriving after the original answered | Re-sent the confirmed request (server deduped) | Not resent; the recorded answer is reported | Deterministic (**fixed**) |
| Reservation interrupted before kickoff | Cancel refunds Energy | Same, after a lost reservation answer is recovered | Deterministic (+ Live: cancel started → no refund) |
| Interrupted after kickoff | Cancel keeps the charge | Same, after a lost `match.begin` answer | Deterministic |
| Interrupted during settlement | Retry returned the receipt | Same across a reload: rewards credited once, `activeMatch` cleared, three commits total | Deterministic |
| Reservation left open on another device | Next load cancelled it | Only if still open after pending receipts are delivered (**fixed** ordering); the old device's `match.begin` fails instead of playing a phantom game | Deterministic |

## 2. Mutation coverage (`tests/authorityActions.test.ts`)

Every reducer action has a matrix entry asserting the receipt, the exact currency delta, the resulting state, a verbatim retry (same id → same receipt, revision unchanged) and a stale second session (`revision_conflict`, latest club returned), with `store.commits === revision` after each. Delayed completions use the server clock.

| Area | Actions | Notes |
| --- | --- | --- |
| Facilities/builders | `facility.upgrade`, `facility.rush`, `facility.collect`, `builder.hire`, `rally`, `sync` | Upgrade completes on the server clock through any later action; rush cost by remaining seconds; collect only once; builder cap |
| Training | `training.start`, `training.collect` | Energy charge, field occupancy, unit level/stat gains, drill level gate, wrong-unit refusal |
| Heroes | `hero.train`, `hero.unlock`, `hero.star`, `hero.scout` | Timed training on the server clock; unlock once; star costs shards; scout receipt is what the client displays and a retry never rolls twice |
| Recruiting | `recruit.refresh`, `recruit.start`, `recruit.rush`, `recruit.sign`, `recruit.cut` | Server-issued board; prospect cost; rush; roster floor of six |
| Dailies | `daily.claim` | Once per quest, sweep bonus once, on the server's UTC day |
| Defense settings | `defense.buy-slot`, `defense.upgrade-slot`, `parking.upgrade`, `formation.set`, `gate.assign`, `defense.seen`, `campus.apply` | Ladder costs; one post per hero; unknown hero/slot refused; template layout accepted, broken layout refused |
| Club | `club.rename` | Shared rule; an over-long stored legacy name survives `sync` until edited |
| Match rewards | `match.reserve/begin/finish/cancel` | `tests/authorityService.test.ts` + recovery suite; Live 57/57 |

Browser: `scripts/authority-browser-check.mjs` requires tutorial → automatic protection → Season game reserved/played/settled through the server → Settings shows revision ≥ 3 and "everything confirmed" (persistent state, not a toast). Optional: a Stadium "Level Up" through the authority using the accessible target `button[aria-label^="Stadium, level"]` scrolled into view; on a fresh club the button is correctly disabled (unaffordable) and the script reports that rather than failing. Guest play and free practice are untouched (no server calls).

## 3. Existing-club protection (`tests/authorityAdmission.test.ts`)

Policy unchanged. Fixtures around `activation_at`: account created 1 ms before activation carries a played save (origin `legacy`, progress intact); at the activation instant or later, only a pristine club is admitted (chosen name kept); a played save → `legacy_ineligible`, malformed → `invalid_legacy`, and no club is created either way so the local club stays recoverable. An interrupted bootstrap (answer lost) has already created the club; the retry finds it and never replaces it even with a different local save. A second signed-in session detects the club by `status` and adopts it; renames propagate.

## 4. Club-name consistency (`tests/clubName.test.ts`)

One rule in `game/clubName.ts`: trim, 2–24 UTF-16 code units, no control characters, whitespace collapsed on store. Parity with the server's `club.rename` guard is asserted for boundary lengths, emoji (two units each), combining marks, control characters (C0 and C1), tabs/newlines and a zero-width joiner. The tutorial input already capped at 24; `finishTutorial` now stores the shared rule's result and keeps the generated name if the rule refuses. Stored legacy names are never truncated automatically.

## 5. Diagnostics

`authorityClient.diagnostics()` keeps the last 40 events (kind, short operation id, outcome, code, latency, revision) and the last transport availability in `fhq_authority_diag_v1`; no tokens, payloads or saves. Settings › Online protection › "Connection details" shows reachability, average confirmation latency, counts of confirmed/pending/refused operations, the last five events, and a sign-in prompt when the session expired. Analytics events already carry `battle_confirmed`, `authority_enable` and failure codes through the existing bounded `track()`.

## Changed decisions and behaviors on this branch

- **Automatic protection at tutorial completion** (owner decision, 2026-09-10): when the club server is reachable, the new club is admitted before the first game; otherwise local play continues and Settings offers protection later.
- **Calendar**: protected clubs advance daily quests and Gauntlet attempts on the server's UTC day (the client passes that day to `advanceCampus`); guest clubs keep the local-midnight reset recorded in `dailies.ts`. Without this, a protected club near the UTC boundary lost daily progress on every server action.

## Browser run record

2026-09-10 ~04:55 UTC, `node scripts/authority-browser-check.mjs` on `vite preview` of commit `cd2c080` (build stamp 04:53 UTC), Chrome 151 headless at 430×932, run by the owner. Tutorial ("Look around first") → Settings already showed **PROTECTED, revision 0, club server reachable** (automatic protection at tutorial completion) → Game Day → Season game 1 reserved/begun/played/settled through the authority → "Collect rewards" → Settings: **revision 3 · everything confirmed · ~438 ms to confirm**; HUD coins 664 from the settled answer. Required assertions passed (`RESULT: required journey passed`, exit 0). Optional Stadium step: accessible target reached and reported "Level Up correctly disabled (unaffordable on a fresh club)". No console errors. One more anonymous test account was created (club "Protected Preview FC"); its ID is not printed by the script and belongs to the deferred cleanup inventory by club name.

## Remaining gaps

- Expired-session and second-device flows are covered deterministically at the transport level and by the hook's `resync`; they are not browser-automated because they need real credentials.
- Physical devices and observed players: not established; headless Chrome at a phone viewport is the only browser evidence.
- Live evidence was not rerun for this branch: the deployed function is unchanged (the regenerated readable bundle differs only by an optional parameter the server never passes), so the v3 evidence in `docs/AUTHORITY-RECOVERY.md` still describes the deployed path.
