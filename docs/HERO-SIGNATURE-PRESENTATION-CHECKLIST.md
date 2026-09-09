# Hero signature presentation — September 9, 2026

## Implemented

- [x] Render all nine heroes' set, load, release, and recovery from the simulation's `signatureFrame` value. Ability cooldown is not an animation clock.
- [x] Preserve distance-driven six-frame locomotion and both facing directions.
- [x] Keep the Enforcer's six run frames while lowering his stance during the physical Truck Stick drive; use his approved tucked-forearm contact pose.
- [x] Add modest weight transfer around the shared foot registration. No root position changes or extra gameplay hits are introduced by artwork.
- [x] Give support and movement signatures distinct small visual cues: Trainer recovery, Captain protection, Coach rally, route, speed, turf scuffs, and Legend sparkle marks.
- [x] Register the Franchise's four authored poses at a shared scale and ground line, including an empty-hand release and follow-through. The WebP encodes the existing reviewed source losslessly; decoded pixels match exactly.
- [x] Load the extra Franchise sheet only for battle and the Film Room. Preserve approved base-pose fallback if the extra sheet cannot load.
- [x] Film Room replays the complete one-shot action. Repeated clicks restart its clock, and an extended hold never starts another release.
- [x] Add a Film Room half-speed toggle for studying a signature without changing gameplay timing.
- [x] Reduced motion holds the idle sprite, suppresses weight transfer, and retains a static support cue at release.
- [x] Hidden tabs do not advance the local presentation clock; animation loops clean up on unmount and hero change.
- [x] React review: frame updates remain transient, effects use stable dependencies, image work is cached, late loads cannot interrupt a take, and preview controls expose pressed states.

## Verification

- [x] TypeScript passes.
- [x] 36 focused hero tests pass, covering all-nine action beats, reduced motion, distance-driven motion, one-shot recovery, atlas registration, late asset loading, and fallback input rejection.
- [x] All 528 raster files fully decode.
- [x] Visually inspected all nine original source sheets and both proposed four-pose sheets. The Enforcer prototype was rejected because its extended fist reads as a punch.
- [ ] Observe the new sequence in the browser at Film Room and battle sizes.
- [ ] Verify a physical Truck Stick run and facility contact in the integrated preview.
- [ ] Check real-phone touch use, sustained performance, and reduced-motion settings.

## Remaining art work

Eight heroes use their existing authored contact pose with procedural anticipation and recovery. They do **not** yet have four independently authored signature poses. Directional art still mirrors a single facing, and the Burner and Playmaker share similar silhouettes. This pass does not claim a full directional animation production pipeline or completed real-device acceptance.
