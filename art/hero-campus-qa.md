# Hero and campus release QA

Validated the deployed Vercel review build in Chrome at 1363 × 936 and the actual app in a 390 × 844 iframe viewport. The browser could not reach the local preview, so visual testing used the hosted build.

- Inspected all nine heroes running in the film room, plus idle and celebration playback. Preserved canonical character identities. Corrected stray pixels from neighboring source poses with connected-component attribution before atlas cropping.
- Checked the four new starter facilities, marked practice field, scoreboard and entrance signs. Adjusted the scoreboard and training sign after desktop screenshots exposed HUD overlap.
- Phone review exposed an overly distant camera. Increased default action scale and added three 44-pixel camera controls; verified Zoom out changes the transform and Recenter restores it exactly.
- Completed the preseason match using three linemen and five heroes. Fired Hail Mary, Truck Stick, Inspire, Onside Bomb and Jet Sweep. Won with 100% of the rival base taken and three game balls. The Enforcer earned MVP with 857 yards.
- Collected +707 Coins, +15 Fans and the first-clear Crowns reward. The UI advanced to Week 2 with 1,207 Coins, 15 Fans and 18 Crowns. A reload retained both the 1,207 Coins and Week 2 progression.
- A deployment during testing exposed a stale dynamic-import failure. Match and hero screens now ship with the loaded application bundle so an open game does not request a removed scene chunk after a release. The resulting bundle is approximately 179 KB gzip.
- Corrected the opening match clock from `0:60` to `1:00`.

Validation: TypeScript, 79 tests across 12 suites, and production build pass. The regression test covers cross-pose contamination while retaining a detached football.

Evidence: `campus-before.jpg`, `campus-after.jpg`, `campus-phone.jpg`, `heroes-after.jpg`, `battle-after.jpg`, `match-result.jpg`. Phone evidence is a viewport layout check, not a claim of physical-device testing.
