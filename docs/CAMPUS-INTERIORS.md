# Campus interiors and current gate heroes

The owner found legacy hero pictures in Home defense → Gates, approved the improved gym style but asked for straight lines, and requested enterable buildings.

## Delivered

- Gates now uses the shared current HeroArt renderer, with full-opacity readable choices for both gates. The stored assignment and one-gate-per-hero rule are unchanged; buttons lock during pending confirmation.
- Gym v3 corrects the orange training-box edges, floor seams, turf boundary, rack and bench geometry while retaining the approved illustration and player placement.
- Stadium opens its clubhouse/tunnel interior, stored Coins, income rate, home Fans, direct collection, Game Day, Home defense and Your program.
- Film Room opens a coaching theater with real team readiness, actual workout multiplier, the next unclaimed Season goal, direct workout and Game Day routes.
- Rehab opens a recovery room with the real Energy balance, recovery cadence and estimated time to full. Recovery remains automatic; there is no invented healing purchase or injury system.
- Scouting building opens directly into the actual prospect report. The selected candidate is shown in the room, with position/rarity, current-player stat comparison, Coin price and wait, in-progress/ready states, signing and roster access. It no longer opens a generic building page before another modal. Existing Roster → Scout uses the same room.
- All four rooms keep real building upgrades and a visible exterior progression strip on the entry page. Busy builders, Stadium gates, pending operations, insufficient currency and upgrade jobs are respected.

## Artwork

Built-in image_gen produced four distinct interiors from the approved gym/campus references and a geometry-only gym revision. The full prompt set and reference paths are in CAMPUS-INTERIORS-PROMPTS.json. Saved project assets: `art/rooms/film-room-interior-v1.webp` (355278 bytes), `scouting-room-interior-v1.webp` (357574), `rehab-room-interior-v1.webp` (341340), `stadium-interior-v1.webp`, and `weight-room-interior-v3.webp` (336168). All are 1536×1024, WebP quality92 without resizing, decoded after export, imported with Vite content-hashed URLs and requested only when the room opens. These rooms are not added to startup precache. The prior gym asset remains in source history/workspace.

The interior illustrations are shared across building levels; the exterior goal strip shows authored level appearances. They are inside views with working controls, not a walkable simulation. Film art is decorative, not a recorded match. Roster sprites use static existing poses.

## Verification

- Strict offline release: 638 tests across81 files, typecheck, authority parity, atlas verification, restore rehearsal, asset decode/build, fingerprints and balance passed. Optional Chrome/offline/live-account suites were skipped; no authority rules or deployment changed. Final spacing/label changes were rendered and typechecked, followed by a production build.
- Native 319×811: all four entry pages fit the 712px body with 712px scroll height, including action/upgrade controls and visible building goals. At390×844 all four rooms were visually inspected. Scouting at1280×720 fits518/518px, with the room and progression beside the full report and upgrade.
- Real-rule isolated preview: scouting spent300Coins, counted down, signed exactly one candidate (10→11 roster); Film Room upgrade spent1400Coins and settled toL2 with+20% readiness; Film Room→Weight Room opened directly. Stadium collection reset accrued Coins and credited the displayed amount (5000→5388).
- Gates native preview uses current rendered heroes. Assigning Franchise north then south cleared north and left south selected through the real gate.assign action. No live currency or gate assignments changed during preview checks.
- A dedicated dev/departments fixture exercises these real client action reducers without creating an account.

## Release

PR #75 merged as b63c04d after final-head CI passed; Vercel production succeeded. Live bundle index-CPlWkVXz.js, build2026-09-11 06:44 UTC. All five building art taps opened their correct interiors directly in the existing live club. Stadium interior rendered on return; Gates rendered ten current hero canvases (five heroes at each gate). Resources stayed1469Coins/100Energy/12Fans/18Crowns, and no gate assignment was changed in production. A final narrow-phone text correction keeps long gate names on one line and shortens the full-recovery label. Final deployment evidence is copied into the task output report and shared handoff.
