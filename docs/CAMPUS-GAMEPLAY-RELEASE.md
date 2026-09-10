# Campus and gameplay completion

This change connects a visual campus draft to `campus.apply` and the existing defense snapshot contract. Players can move facilities, reserved equipment slots, walls, gates and the bus; inspect placement errors; undo/redo; reset an unlocked formation template; cancel; apply; and test the saved defense. Protected clubs wait for server confirmation. Local clubs persist the same layout for campus and defense tests. Legacy rival publishing remains template-based under the existing deferred-schema policy.

All nine heroes now have directional locomotion. The remaining seven received 36-pose sheets: four directions with idle, launch, four stride poses, plant, substitution and brace. Connected-component ownership prevents neighboring artwork from entering a frame. Cached canvases are 256px with unchanged logical ground registration. A shared cosmetic animation clock pauses hidden tabs and skips offscreen actors.

Buildings fade when their art covers a hero behind them. Repeated cosmetic effects are bounded, and reduced motion preserves score feedback. The battlefield supports keyboard aim/deployment/casting. Settings uses the shared scrollable dialog and focus containment. Campus controls wrap at enlarged text sizes.

## Verification

- Typecheck, 351 tests and production build pass; all 547 raster assets fully decode.
- Local browser: saved facility move survives reload and starts defense with the custom layout. Keyboard draft undo/redo/cancel preserves the saved move.
- All seven generated sheets inspected after registration at game size; kicker substitution/brace corrected, adjacent-pose bleed removed.
- 27 simultaneous animated heroes, 60-second Mac browser sample after warmup: p50 8.3ms, p95 9.3ms, zero intervals over 50ms. This is a desktop render measurement, not a phone benchmark.
- Estimated RGBA frame-cache storage for all nine complete heroes: 110.25 MiB versus 248.06 MiB at 384px (55.6% reduction). Excludes source decodes, GPU copies and the rest of the application.
- Local accessibility harness forces reduced-motion JS/CSS and 200% root text sizing. Editor and Settings remain scrollable; keyboard operations and fixed hero close-up work. This is not an OS/device accessibility certification.
- Connected journey against live authority: campus move confirmed online; keyboard-deployed five heroes and squad; 100% Season win settled from 500 to 932 coins, 10 to 18 crowns (revision 4). Collected gate receipts, started the 1,400-coin Stadium upgrade, reloaded to Stadium level 2 and revision 9 / everything confirmed, then opened the editor at saved scouting position column 8 / row 3 and tested that defense. QA club: Campus QA FC, created via local production preview on 2026-09-10 around 05:07 UTC; retain for deferred QA cleanup.
- Integrated Claude PR #31 (9e90341), including its decided new-club auto-protection behavior. Fixed an observed reload-time local mutation before authority detection, compacted custom-layout Stadium art/hitboxes, and included defending heroes in occlusion/substitution presentation.
- Deployment verification: in progress.

## Boundaries

No combat rules, rewards, admission policy or backend deployment changed. Physical-device and observed-player acceptance still require real devices/players. Claude's protected-club recovery work remains separate.
