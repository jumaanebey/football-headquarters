# Claude package reconciliation — September 10, 2026

Reviewed against production main cbed256 (PR #58).

| PR | Disposition | Reason |
|---|---|---|
| #45 | Already merged through earlier integration | Performance/install baseline in main. |
| #47 / #48 | Already integrated by ancestry | Package A/C implementations landed through Codex integration, not separate merges of these PRs. |
| #56 | Superseded; close, retain branch | Main's nine-hero implementation is already shipped. #59 supplies independent comparison tooling/evidence. |
| #57 | Superseded combined tree; close, retain branch | Pre-reshuffle product stack must not overwrite newer campus/phone work. Its integration evidence remains historical. |
| #59 | Integrated by ancestry in this reconciliation | Additive motion/journey/worker scripts and evidence. Evidence provenance corrected below. |
| #55 | Keep open for selective extraction | Rollback lifecycle fix carried here. Worker/register/funnel replacements overlap newer main and must not be merged wholesale. Richer connection assessment, per-account counters/reset and listener teardown remain candidates requiring current-client wiring and tests. Physical-device checklist needs updating before use: it assumes automatic deferred update and per-tab cache eviction, which main does not implement. |

## Evidence correction

At review time #59 was OPEN, not merged or live. Its motion and journey reports are attributed to 44f3519; the 619-test and transfer measurements from #57 belong to that older combined tree. Do not describe those numbers as measurements of PR #58 or this integration.

Original main rollback worker lacked the claim-before-navigation and repeat-navigation guard from #55's 278dc3c. Therefore the historical 13/13 claim does not prove main's previous rollback worker. This integration ports that correction while preserving unrelated feature caches; tests run the actual worker source in a VM and verify ordering, repeat activation, storage preservation and navigation failure recovery. A new native-browser run has not been completed here.

The multi-tab script now uses the current boolean applyUpdate, shell-precached lazy editor, controller-change observation rather than the unsupported GET_VERSION message, and two-prior-version retention rather than acknowledgement-based deletion. It creates a new lazy chunk for the simulated deploy, so the new install does not depend on a file it just removed. It restores dist in finally. This adaptation is syntax-checked but is not browser acceptance.

The kill-switch and multi-tab scripts reject non-loopback hosts. The normal production worker remains active: this PR updates the rollback source available for emergency builds; it does not deploy the kill switch.

## Remaining acceptance

Physical iOS/Android install and landscape acceptance; adapted multi-tab browser run; rerun journey measurements after product navigation changes; runtime-injected credentials for a real funnel report; derived battle-sheet art review. Current game-product priorities remain the deeper position-specific defense rules, authored skins, and board design acceptance described in PHONE-PLAY-AND-DEFENSE-CLARITY.md.
