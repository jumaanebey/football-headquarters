# Hero results and defense presentation — September 10, 2026

Baseline: `cc1f598`. Continuing the approved reconstruction. This release addresses
postgame clarity, accessible result controls and visual parity for defending heroes.
It does not complete the remaining authored animation or online launch gates.

## Implementation

- [x] Replace the unbounded results card with the existing scrolling Sheet and a persistent action footer.
- [x] Keep free retry and return-to-Film-Room available independently of the result body's length.
- [x] Give yardage, effective recovery and effective protection separate category leaders.
- [x] Show the actual hero portrait and name, or the saved ordinary player's name.
- [x] Preserve contributions earned by heroes who were substituted out.
- [x] Give no award for zero/invalid contributions and avoid combining unlike units into an invented MVP score.
- [x] Keep all deployed hero stats available in an expandable summary.
- [x] Correct attack replay verdicts, victory/defeat audio, team labels and reward copy for the defending viewer.
- [x] Preserve the recorded engine result, reward settlement and replay hash contracts.
- [x] Preserve campaign coach reactions and Gauntlet wave purses.
- [x] Use the same modern hero dimensions and ground-contact anchor on both sides.
- [x] Remove extra bob/lean/lunge transforms around modern defending hero sprites; preserve distance-driven sprite timing and depth ordering.
- [x] Distinguish mascot art from hero art when sizing defenders.
- [x] Include native disclosure summaries in Sheet keyboard focus traversal.
- [x] Apply the React review: derived summaries, immutable actor reads, bounded category scans, existing cached art, shared dialog and no new dependency.

## Verification

- [x] TypeScript passes.
- [x] 249 tests pass, including 11 new measured-contribution, viewer-perspective and rendered-result regressions.
- [x] All 528 shipped raster assets fully decode.
- [x] Production build passes; existing bundle-size warning remains.
- [x] Shared-engine balance regression passes all gates across 219 deterministic matches.
- [ ] Preview: practice, signature, result, retry and return journey.
- [ ] Preview: result scrolling, disclosure and keyboard controls.
- [ ] Preview: defending hero size, planted contact and movement.
- [ ] Remote CI and preview deployment succeed.
- [ ] Publish and verify production.

## Publication status

The local implementation is committed on `gpt/hero-results-and-defense`.
The user reconfirmed approval to push and publish in the current chat after the
automatic review did not accept the prior standing authorization. Publishing
and preview verification are now in progress. Browser access to the local
development server was unavailable; browser gates are checked on the deployed
preview before production publication.

Release sequence: push the prepared branch to
`jumaanebey/football-headquarters`, open a PR, verify the preview journeys and
remote CI, resolve any observed failures, then merge and verify production.

## Remaining evidence and scope

Real iPhone/Android touch, sustained frame pacing and heat/battery acceptance remain
open. Eight heroes still need independently authored signature sequences; mirrored
directional art remains. Server-authoritative online progression and the deferred
database cleanup remain separate. No live player save or database record is used
as a test fixture in this pass.
