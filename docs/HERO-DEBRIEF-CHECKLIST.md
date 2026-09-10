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
- [x] Preview: practice, signature, result, retry and return journey.
- [x] Preview: result scrolling, disclosure and keyboard controls.
- [x] Preview: defending hero size, planted contact and movement.
- [x] Remote CI and preview deployment succeed.
- [x] Publish and verify production.

## Release evidence

- PR #26 merged as `2803c0f`; its exact preview payload passed remote CI run 78.
- Vercel production deployment `dpl_5GhA9pbHdbEQF1kjWvy1m76zCEuF`
  reached READY with `football-headquarters.vercel.app` assigned to that commit.
- Preview: locked Dr. Sloane deployed and used Field Medic. The new debrief
  separately credited 401 yards and 166 recovered grit. Opening all hero stats
  made the body scroll (641px content / 582px visible); footer controls remained
  inside the viewport. Tab reached the disclosure; Tab from the final return
  control wrapped to Close. Free retry reset to 1:00 and 0% with fresh deployment.
- Return to the Film Room preserved the displayed 100 Energy, 500 Coins,
  0 Fans and 10 Crowns. Dr. Sloane remained locked.
- Preview defense: Enforcer and Burner rendered at 68.66px with the shared
  `translate(-50%, -96%)` anchor and no wrapper animation. Sampled Enforcer run
  frames 4, 5, 1, 2, 6, 1 as position changed; Burner transitioned from moving
  frames to a fixed contact location and frame 7. The defense test ended in a
  hold at 34% damage and zero coin loss.
- Production browser: Heroes → Hail Mary practice → deploy → signature → End
  showed the new debrief, The Franchise credited with 995 yards, expandable
  hero stats, free retry and return controls. The live page was verified at
  https://football-headquarters.vercel.app/.

The browser observations above used a desktop viewport. They do not claim
physical-phone, all-nine directional-art, or online two-account acceptance.

## Remaining evidence and scope

Real iPhone/Android touch, sustained frame pacing and heat/battery acceptance remain
open. Eight heroes still need independently authored signature sequences; mirrored
directional art remains. Server-authoritative online progression and the deferred
database cleanup remain separate. No live player save or database record is used
as a test fixture in this pass.
