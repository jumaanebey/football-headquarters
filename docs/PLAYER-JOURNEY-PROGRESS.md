# Player journey reconstruction — first verified batch

Based on main `ea9a2b6`; branch `codex/player-journey-reconstruction`.

Implemented preparation before reservation, plan and opening-hero choice, available squad inspection, role-specific recruiting comparison, scoring/formation breakdown, defense survivors, all-player contribution rows, explicit defense range overlay, accessible facility upgrade preview, explicit daily Claim labels and consistent Roster/Defense/editor instructions.

The protected browser run exposed an existing client bug: BattleScreen generated a random local seed even when config.authority.seed was supplied. It now uses the authoritative seed (including zero), with local randomness only for unreserved games. Recorded games retain the recorded seed. No server or shared combat rule change is required.

Validation: 359 tests / 40 files, typecheck, 547 raster decodes and build passed. A disrupted run timed out; a subsequent complete run passed. Added regression tests for seed ownership, opening-hero instruction and all three plans' replay verification.

Browser evidence: cancellation preserved Energy; reservation charged 12; selected Air Raid and Enforcer carried into battle. Defense test showed its correct 51% loss breakdown. After the seed correction, protected Campus QA FC completed an uninterrupted Air Raid opener with Enforcer/Truck Stick, the other four heroes and Hail Mary. Collect rewards advanced 67→524 Coins, 15→30 Fans and revision 18 / everything confirmed. One interrupted run expired before collection. Reused the existing QA club; no new account created.

Remaining: phone battlefield composition, defensive contribution measurements, depth-chart/lineup semantics, targeted next-action flow, complete upgrade comparisons, full navigation consolidation, ordinary-player action clarity, remaining authored hero states, distinct venues, editor strategy previews, replay timeline/attempt comparisons, Claude integration, deferred QA cleanup, physical-device and observed-player acceptance. This batch does not close the full reconstruction checklist.

Claude integration: retain the client battleSeed fix. Server-issued randomness must be used in rendered play as well as the headless evidence runner. The browser journey now includes Reserve game and the facility benefit-preview confirmation. Merge those script steps alongside backend hardening.

## Follow-through — 2026-09-10

PR #37 merged as f87e985; production deployment 6372843284 succeeded and the live alias serves index-C2AFrOoh.js with build stamp 2026-09-10 13:32 UTC.

The next batch adds a compact, expandable pre-kickoff plan control, including on the first game; explicit collect-and-train / collect-and-choose-game actions; replay plan labels from the defender perspective; corrected partial-damage instructions; and hero level/star stat comparisons with cost, duration, affordability and active training state. Protected navigation waits for a confirmed answer and checks that the account has not changed. No engine or server rules changed.

Rendered verification at 390 × 844: selected Air Raid from the in-game control, deployed five heroes, called Hail Mary, won with 100% damage, and used Collect & train heroes. Heroes opened after confirmation; Coins 524 → 1,031, Fans 30 → 45, revision 22 / everything confirmed. Reused Campus QA FC. The Franchise training preview showed Grit 240 → 300, Yardage 28 → 35, 600 Coins and 60 seconds. Starting training displayed its countdown and disabled repeat training. Full check: 359 tests / 40 files, typecheck, all 547 raster decodes and build passed.

Still open: full phone/landscape and physical-device acceptance, deeper defense measurements, lineup semantics, authored movement/venue art, editor strategy tools, replay comparisons and Claude's open PRs #33–36. Follow-through navigation is immediate-confirmation only; delayed recovery keeps the existing notice and returns players to the club.
