# Connected player journey — 2026-09-11

This release carries the approved indoor player style through the roster, Weight Room, Rehab Center, Film Room, Scouting and Stadium. It replaces the old roster card layout and connects these places directly.

## Delivered

- Roster: practice-kit portraits, differentiated combat Power, visible current and next-level stats, direct training, current activity, group/search/sort controls and explicit release confirmation. Power is also the visible comparison in Scouting and the roster average in Your program.
- Weight Room: curls, goblet squats and lateral lunges are separate authored poses. Each session assigns stations consistently; selecting another teammate does not change their exercise or the actual group being trained. Squat frames share scale and a floor baseline instead of stretching the crouched figure.
- Rehab: named teammates foam-roll, hydrate and use the cold plunge. The covered recovery station was cleared with a precise image edit, then populated with the player and tub. The foreground canopy post is layered above the occupant. Energy and recovery remain club-wide.
- Film: teammates sit facing the screen. A labelled practice crossing-route loop runs with football player art, pause/resume and reduced-motion support. Defense replays opens the existing recorded home-attack archive; the practice loop is not presented as a saved match.
- Stadium: available teammates prepare for Game Day. Room-to-roster navigation and roster-to-room navigation close the prior surface rather than stacking dialogs.
- Attendance excludes active training participants from all other rooms, including completed sessions awaiting collection. Whole-team training leaves ambient rooms empty, with an explanation. Attendance is a presentation derived from the roster, not a new paid job or individual health simulation.
- Room images and overlays share an uncropped 3:2 coordinate system at phone and desktop sizes. The previous height-only cap misaligned occupants and the screen on short desktop windows.

## Art and runtime

Built-in image generation used the approved practice atlas and existing room art as references. Exact prompts are in ROOM-ACTIVITY-PROMPTS.json. Four new lossless WebP atlases contain 32 activity poses: 8 squat, 8 lunge, 12 recovery and 4 seated film figures. Original generated files remain in the image-generation directory. Figures are packaged into 256-pixel cells with padded edges; automated decoding and matte tests check every frame. The group-based character identities remain four archetypes, not unique face art for every named roster member.

Each atlas is fetched only when its activity is mounted and is deduplicated, decoded once and retryable after failure. Hashed asset URLs use the existing cache policy. Player timers/listeners are cleaned up on unmount and suspend drawing when hidden/offscreen. Practice film retains its position when paused and does not reload its images on each toggle. No authority, combat rule, currency, deployment-contract or Claude branch change is included.

## Validation

- Strict offline release verification: typecheck, 655 tests across 86 files, current deployed authority parity, all hero atlases, isolated restore/rollback rehearsal, derived assets, full raster decode, production build, content-addressed asset guard and balance guard.
- Native browser, isolated department fixture: roster → selected player's workout → three different exercises → recovery excludes the training group → roster's Collect growth route → collect actual rule-driven growth → roster shows all three players at Level 2 and higher Power. Coins moved 5,000 → 5,110 on collection.
- Native browser: roster group filter and direct player training; roster ↔ Scouting; roster → Stadium; roster ↔ Rehab; roster ↔ Film Room; Film Room → actual Defense log; pause frame remained unchanged on a later read.
- Three additional Film/Recovery → roster cycles each ended with one dialog, 10 cards and 10 DOM canvases; the browser error log was empty. This checks mounted DOM cleanup, not a heap-memory benchmark.
- Native rendering: 390×844 phone, 1126×800 desktop and 1126×711 desktop. No horizontal overflow on the phone roster. At 390×844 the recovery and film primary actions and building upgrade buttons fit in the initial viewport. At 1126×711 the corrected room ratio measured 1.50002 and the screen remained inside its illustrated frame.
- The optional headless-Chrome/offline suite and live-account mutation suites were not invoked. Native CUA checks were used for the UI; no live currency was spent and no evidence account was created.

## Release

Production verification and merged PR are recorded in the owner handoff after deployment.
