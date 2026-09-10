# Growth and art integration

Integrates Claude packages A (#47, 2e6f408) and C (#48, 6128058) with the shipped club workflows.

## Player-facing changes

- Hero growth uses the shared progression model for current combat stats, training eligibility and unlocks. Franchise range is 13 and Specialist range is 16, matching battle execution. Signature details explain actual cooldowns, effects and scaling.
- Roster player details show current and next-drill power, Grit and Yardage. Drill eligibility follows the shared model, including empty groups and facility gates.
- Scouting compares issued prospects against the best same-position player, explains tied comparisons and shows combat power alongside OVR.
- Every defensive machine has expandable behavior, range, firing interval, saved grid location, base/boosted stats, next-level blockers and level-10 signature details.
- Game Day uses the compact WebP tunnel with a PNG fallback. Derived alpha cutouts preserve original source art.
- Battle warming prioritizes the selected opener and one partner. Leaving cancels warming and releases unretained heavy decoded art. Film-room warming cancels when the selection/mode changes or the panel closes.
- Practice takeaway commentary no longer advertises a bonus coin reward.

## Verification

- `npm run release:verify -- --strict`: passed; 564 tests across 72 files, typecheck, authority parity, restore rehearsal, atlas verification, derived cutout check, icon check, production build, fingerprint verification and balance guard.
- Rendered at 390×844 in the in-app browser using the existing protected Campus QA FC save: hero range/details, roster current/next stats, defense behavior/location/boosted stats, compact Game Day image source and Specialist practice entry/deployment.
- The save remained at revision 45 with 878 coins, 92 fans and 28 crowns during these read-only/practice checks.
- Chrome subprocess cannot launch in this sandbox (MachPortRendezvous permission denied). Full automated browser waterfall/offline/fault suites were not rerun on this final integrated tree. Package A evidence remains documented separately in ASSET-RELIABILITY.md. Physical iOS/Android acceptance remains outstanding.
- No authority deployment or balance-rule change. No QA accounts created.

## Remaining scope

This release exposes real existing progression; it does not add an XP economy or alter server rules. New authored defensive-machine art and Claude's hero motion/reliability packages are separate remaining work. Physical-device acceptance and real-player observations are not claimed complete.
