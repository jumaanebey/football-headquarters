# Hero motion continuation — September 9, 2026

Baseline: `fa560da`, after the verified ground repair. This pass improves existing hero movement. The broader free-practice/combat reconstruction remains separate and unfinished.

## Implemented and tested

- [x] Give campus drills a 0.45-second acceleration and braking ramp while preserving endpoints and total travel time.
- [x] Drive campus run frames from the same progress sample as the hero's position, using a ref rather than rerendering on each frame.
- [x] Give each endpoint drill one action and recovery; prevent a second contact pose before the turn.
- [x] Accumulate battlefield hero stride phase from actual displacement; preserve it while blocked or stopped.
- [x] Keep simulation speed, damage, pathfinding, cooldowns, rewards, and replay rules unchanged.
- [x] Retain reduced-motion static poses, hidden-tab pause behavior, sprite fallback, and animation-loop cleanup.
- [x] Add regressions for acceleration/braking, route bounds, one-action recovery, stopped footfall, and equal-distance phase across different tick sizes.
- [x] Review React changes: transient animation refs, bounded effect dependencies, cleanup, and unchanged accessible hero controls.
- [x] TypeScript and 86 tests pass; all 527 shipped raster files decode.

## Release checks

- [x] Production build and remote CI pass (86 tests; GitHub CI run 68).
- [x] Observe preview campus running, braking, planted action, and return trip with changing sprite frames. Position samples converged to a fixed endpoint during the contact pose; returning samples reversed direction and continued cycling run frames.
- [x] Deploy the Enforcer in the preview battle and observe all six run frames as its position advances; observe the stationary Franchise retaining an idle pose.
- [x] Merge PR #23 as `d06dbcf`; Vercel production reports success. Refresh the live site and confirm hero position and sprite frames advance together.

Production: https://football-headquarters.vercel.app/

This verifies the observed desktop browser paths, not real-device performance or complete directional animation quality. The existing JavaScript bundle-size warning remains.

## Still open in the broader reconstruction

- Authored directional start/run/plant/contact/recovery animation for all nine heroes.
- Free practice and timeline-driven signatures from the unreleased reconstruction checkpoint.
- Physical Truck Stick contact, larger combat presentation, and full engine/replay parity.
- Real-phone touch, reduced-motion, and sustained performance acceptance.
