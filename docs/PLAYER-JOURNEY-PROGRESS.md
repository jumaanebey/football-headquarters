# Player journey reconstruction — first verified batch

Based on main `ea9a2b6`; branch `codex/player-journey-reconstruction`.

Implemented preparation before reservation, plan and opening-hero choice, available squad inspection, role-specific recruiting comparison, scoring/formation breakdown, defense survivors, all-player contribution rows, explicit defense range overlay, accessible facility upgrade preview, explicit daily Claim labels and consistent Roster/Defense/editor instructions.

The protected browser run exposed an existing client bug: BattleScreen generated a random local seed even when config.authority.seed was supplied. It now uses the authoritative seed (including zero), with local randomness only for unreserved games. Recorded games retain the recorded seed. No server or shared combat rule change is required.

Validation: 359 tests / 40 files, typecheck, 547 raster decodes and build passed. A disrupted run timed out; a subsequent complete run passed. Added regression tests for seed ownership, opening-hero instruction and all three plans' replay verification.

Browser evidence: cancellation preserved Energy; reservation charged 12; selected Air Raid and Enforcer carried into battle. Defense test showed its correct 51% loss breakdown. After the seed correction, protected Campus QA FC completed an uninterrupted Air Raid opener with Enforcer/Truck Stick, the other four heroes and Hail Mary. Collect rewards advanced 67→524 Coins, 15→30 Fans and revision 18 / everything confirmed. One interrupted run expired before collection. Reused the existing QA club; no new account created.

Remaining: phone battlefield composition, defensive contribution measurements, depth-chart/lineup semantics, targeted next-action flow, complete upgrade comparisons, full navigation consolidation, ordinary-player action clarity, remaining authored hero states, distinct venues, editor strategy previews, replay timeline/attempt comparisons, Claude integration, deferred QA cleanup, physical-device and observed-player acceptance. This batch does not close the full reconstruction checklist.

Claude integration: retain the client battleSeed fix. Server-issued randomness must be used in rendered play as well as the headless evidence runner. The browser journey now includes Reserve game and the facility benefit-preview confirmation. Merge those script steps alongside backend hardening.
