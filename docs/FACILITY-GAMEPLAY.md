# Connected facility gameplay

Owner decisions (11 September 2026): scheduled development continues while closed; Stadium starts with one possession per team and permits ties; Coins and activities reveal different prospects.

## Implemented

- Direct actions inside Weight Room, Rehab, Film and Practice. A selected unit or the full roster can follow a finite schedule of up to six stops. Energy is prepaid. Ending early refunds only future stops. Existing legacy workouts can still be collected.
- Weights build Strength, Film builds IQ/readiness/selected-play mastery, Practice builds Speed/readiness, and Rehab restores club Energy. Reports show actual changes. Assigned players appear in their current room. Reloading does not repeat growth.
- Timed free scouting uncovers athletes with higher potential. Paid agent reports uncover more developed, immediately signable athletes. Calls, praise, school visits and campus visits each contribute once to interest. The shortlist supports signing and dismissal; building levels unlock regional and national trips.
- Film demonstrates eleven-on-eleven Four Verticals, Quick Slants, Flood and Power concepts, with receiver routes, quarterback reads and blocking. This is authored football practice, not professional footage or a raid replay.
- Stadium is a separate, player-present football game: kickoff return, offensive call, kick/goal-line or conversion choice, opponent kickoff, defensive call and conversion defense. Both teams get one possession; ties remain ties. Roster talent, readiness, studied plays and calls influence outcomes. Results show exact Coins and require collection. Reload returns to the current decision.
- Renovated Level 3 art for all five interiors, using the existing room geometry and player anchors. Original interiors remain at Levels 1–2; higher levels improve room function and scouting access. This does not promise a new image at every level.
- Practice Field opens directly from campus, roster and rooms. Game Day opens Stadium; Base raids retain campaign and rival combat. Four large sideline buttons provide valid deployment points using the existing recorded combat inputs.

## Verification

- Offline release verification: 673 tests across 88 files, typecheck, authority parity, atlas verification, isolated restore rehearsal, production asset decode/build, cache filename checks and raid balance guard passed.
- Native desktop: Film → Rehab → Practice completed, with IQ/mastery/readiness, recovered Energy and Speed reflected in the roster. Stadium restored the exact decision after reload. Additional phone and live server evidence is recorded below when completed.
- The active Stadium game uses a dedicated field/decision workspace rather than remaining below the building controls.

## Release and boundaries

The client needs authority v6 before production release. Combat rule identifiers remain hero-actions-3 and defense-counters-4; the backend continues accepting both. No database migration is needed. New protected activity rewards are only applied from server answers.

Rollback the frontend while retaining v6 authority if any new schedules, prospects or Stadium games exist. Restoring v5 would strand new state. Physical device acceptance remains separate from browser viewport checks. Raid deployment usability is improved here; a deeper raid mechanics redesign is not claimed complete.

## Live authority v6 evidence

Deployed 2026-09-11 15:11:10 UTC with JWT verification enabled. The complete index.ts readback equals the artifact pinned at `652169296a8a432053f043c421cd245aba08df0c`, SHA-256 `519031c02a2a9019c37457a76ae2028343653836b18786826fb563a04045723d`. Strict deployed-current parity passes.

`npm run facility:evidence` passed **41/41** against production authority: prepaid schedule, duplicate/reload recovery, no early growth, player assignment snapshot, actual Rehab Energy recovery, Film mastery/IQ and Practice Speed, different paid/free prospect pools, signing exactly once, timed relationship interest, mutually exclusive raids/Stadium, stale-turn rejection and reward collection exactly once. Result: 0–7, 20 Coins collected. Token stayed in memory; public configuration was supplied from the existing runtime environment file. No service-role key was needed.

QA account `e774b44e-e1d7-4664-b29b-4f6444d32fb7` (Facility Loop QA) is listed in scripts/qa-accounts.json for funnel exclusion and deferred cleanup. No accounts were deleted. Sanitized transcript: docs/evidence/facility-gameplay-live-2026-09-11.txt.

Native browser Stadium journey: return left → Flood against Zone → touchdown → PAT → deep kickoff → Zone against Verticals → opponent misses → 7–0 → Collect 100 Coins. Reload before the first call restored the exact decision. On phone, the final score, confirmed event and collection action fit together. Rehab’s own Start rehab action was reachable at 390×844 without scrolling; the room retained its shirtless player seated at the left edge of the bath.

Additional phone acceptance: Film’s Study this play button is directly reachable at 390×844; the selected play is visible and timed study starts in the Film Room. A paid 120-Coin scout report returned Rocco Wolfe after 15 seconds, moved the ready prospect above new-search options, and signed him for no additional Coins (roster 10 → 11). No prospect dropdown is involved.
