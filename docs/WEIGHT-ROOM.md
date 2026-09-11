# Weight Room milestone

The campus gym opens directly into a room with roster teammates, workout progress, player growth and room upgrades. Roster's previous training tab and drill menu are removed. Roster player development, the campus building and completed-workout goals use this destination.

The room uses the existing training actions and actual stored roster. Quick circuits take the existing 10–15 seconds and train the selected player's position group; whole-team conditioning unlocks at room level 5. Energy, payout, readiness, levels and stats use the current rules. No invented XP, individual-only growth or bonus interaction rewards. The selected player's next Grit and yardage come from the combat read model. Collection celebrates only a changed saved level, then offers Game Day with that roster.

The illustrated gym has animated lifts during active sessions, static poses for reduced motion, and a ready glow. Teammates train indoors instead of also appearing on the outdoor campus. Room levels add a bench, turf, a banner and a team-circuit display; the campus exterior changes too. Training building IDs and saves remain compatible. Existing authority artifacts are unchanged.

## Verification

- Strict offline release verification passed: 638 tests, typecheck, authority parity, art/assets, restore rehearsal, build and balance.
- Native browser, isolated state using the actual `applyClubAction` / `settleClubState` functions: start Strength circuit, see 15 Energy spent and three actual participants; leave and reopen; collect after completion; only Big Mike, Tank and Fridge grow from L1 to L2, with +1 each stat. Game Day callback receives the same improved roster.
- Room L1→L2 construction and a concurrent workout completed. The payout correctly used L2's 120 Coins; the new bench appeared and the next upgrade cost became 2380 Coins.
- Phone319×811 rendered; desktop1280×900 rendered; campus gym artwork and its facility tap verified. Expanded celebration or long active participant reports may require scrolling. The normal phone start/upgrade actions are together.
- Development-only acceptance fixture: `/dev/weight-room.html`; `?level=5` exercises later room state. No account creation or live resource spending required.

## Scope boundaries

This is the first complete department loop, not a completed Sims-scale campus. Players retain their existing group-based training rules. Six stations show the first participants, with additional teammates disclosed in the scene. Scouting, Rehab interiors, the wider roster redesign and new combat rules are separate work. The room illustration establishes a direction for visual feedback; it does not imply a finished art overhaul across the game.
