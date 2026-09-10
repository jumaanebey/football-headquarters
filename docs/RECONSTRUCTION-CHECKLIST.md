# Football Headquarters — full reconstruction checklist

Updated September 10, 2026. Published baseline at resumption: `cc1f598` (shared hero combat, replay, free practice, progression and online client integrity). This checklist preserves the approved scope; an unchecked gate is not complete. The earlier 30% figure was an estimate, not a measured completion score.

## Current continuation — five-area visual gameplay pass

PR #30 (`1fe9c47`) implements the five requested presentation areas; see [VISUAL-GAMEPLAY-ACCEPTANCE.md](VISUAL-GAMEPLAY-ACCEPTANCE.md). All nine heroes now have four authored signature poses. Franchise/Enforcer have four-direction starts, running, planted turns/stops, contact braces and substitution signals. The other seven retain six-frame locomotion with distinct ready poses and movement presentation. Projected grandstands/foundations and first-match deployment/signature/result-to-training guidance are integrated. Camera work shipped in PR #28.

Release evidence: 264 tests, 540 raster decodes, build, 219-match balance gates, fresh-club preview journey, mobile Film Room and production deployment. This closes the five-area implementation pass, not the full reconstruction: all-nine directional action coverage, physical-device/player acceptance and Claude's authority/defense work remain separate gates.

## Previous continuation — hero results and defense presentation

See [HERO-DEBRIEF-CHECKLIST.md](HERO-DEBRIEF-CHECKLIST.md) for the detailed implementation and release gates. Category standouts credit measured recovery and protection alongside yardage; result controls use a scrolling sheet with a persistent footer; replay messaging reflects the defending viewer; both sides share modern hero size and foot anchors. The deferred database cleanup and broader authored-art work remain open.

## Current implementation checkpoint

- [x] Extract fixed-step simulation into a framework-independent engine used by new live games, practice, defense, Gauntlet and v2 playback.
- [x] Match-local entity IDs, isolated inputs and separate presentation random stream.
- [x] Full individual roster Strength, Speed and IQ, with preparation separate from trained stats.
- [x] Continuous wall-aware Truck Stick, one physical contact burst, and continuous Jet Sweep.
- [x] Preserve v1 replay rules; record immutable v2 snapshots and commands with bounded validation.
- [x] Canonical object-key encoding for hash stability through JSON database storage.
- [x] Reject command inventory errors and duplicate hero deployment; no UI charge on rejected commands.
- [x] Exact full-match replay tests including all nine heroes, defense, Gauntlet, manual/natural ends and hostile film inputs.
- [x] Hero signature set/load/release/recovery presentation, QB four-pose throw, anchored movement, late-image protection and half-speed Film Room.
- [x] Permanent fan milestones; honest rally costs; shared elapsed return and rushed-upgrade timing.
- [x] Remove invented load-time AI raids; preserve and label historical simulations.
- [x] Phone touch targets, scrolling hero commands, safe areas, modal focus/keyboard handling and direct practice discovery.
- [x] Client cloud revision checks, explicit conflict recovery, owned report outbox and atomic defense inbox cursor.
- [ ] Complete shared-engine balance calibration.
- [ ] Full typecheck, regression suite, raster validation and production build on final payload.
- [ ] Browser player journey, visual motion, phone viewport and keyboard acceptance.
- [ ] Publish and verify the integrated release.

## Known launch gates requiring further evidence or access

- Backend, 2026-09-10: project `ruzkpbvgzvqrrnexrffz` is ACTIVE_HEALTHY; the authority migration and function sources are in version control (`docs/AUTHORITY-RECOVERY.md`). The deployed v2 function crashed at startup; v3 is deployed and the two-account live evidence passed 57/57 (`docs/AUTHORITY-RECOVERY.md`). Protected-club integration is on PR #29 (`docs/AUTHORITY-CONTRACTS.md`); the browser journey on a preview remains open.
- All nine authored signature sequences are integrated. Full directional action coverage across the remaining seven heroes, renderer benchmarking and physical-device acceptance remain open.
- Browser viewport checks do not replace actual iPhone/Android touch, sustained frame pacing, heat/battery and player-observation gates.

## Milestone 0 — establish and protect the baseline

- [x] Inspect the current worktree; preserve existing work and the published baseline.
- [x] Create a separate reconstruction branch.
- [x] Record the complete workstreams and verification gates in this checklist.
- [x] Restore all three corrupt ground/campus atlases from intact originals.
- [x] Fully decode every shipped raster image during release validation.
- [ ] Reject truncated files and invalid atlas regions; record asset hashes for verification.
- [x] Add type checking and asset integrity checks to CI.
- [ ] Verify affected campus, battle, and upgraded-facility visuals in the browser.
- [ ] Verify the served assets match the intended release.

## Milestone 1 — shared combat and meaningful hero actions

- [ ] Extract framework-independent combat state, commands, events, and version contracts.
- [ ] Preserve individual roster identity and stats through live deployment.
- [ ] Make Strength, Speed, and IQ affect documented live mechanics.
- [ ] Use shared action resolution for normal hits and hero abilities.
- [ ] Credit effective ability yardage and prevent duplicate sack/touchdown resolution.
- [ ] Record effective support contributions (healing/protection/control) for accurate highlights.
- [ ] Separate gameplay randomness from presentation randomness.
- [ ] Give Hail Mary anticipation, release, ball travel, contact, and recovery.
- [ ] Give Truck Stick readable activation, physical forward movement, and contact.
- [ ] Replace the Burner's instantaneous relocation with continuous, validated movement.
- [ ] Share rules among live play, practice, defense tests, headless balance, and replay.
- [ ] Version immutable match snapshots and replay rules.
- [ ] Prove identical results/event hashes across browser, headless, replay, and server.

## Milestone 2 — hero-first visual gameplay

- [ ] Establish actual-play hero, ordinary-player, facility, shadow, and label scale.
- [ ] Keep heroes readable in groups; reduce persistent full nameplates and effect overlap.
- [x] Pin deployed heroes and ready abilities in a phone-friendly command area.
- [x] Establish direction, foot-contact anchors, stride-distance, turning, and stop transitions for the Franchise/Enforcer prototype. Remaining cast-wide coverage is tracked below.
- [x] Normalize source-frame scale and contact points; document remaining authored-art gaps.
- [x] Prototype an editable-source art/animation pipeline using Franchise and Enforcer.
- [ ] Complete directional idle, start, run, plant, action, reaction, recovery, substitution, celebration.
- [x] Define individual movement personalities and recognizable ready/signature silhouettes for all nine heroes.
- [ ] Tie animation/contact/effects/audio to simulation events.
- [x] Camera supports tactical overview and readable signature action without stealing control.
- [ ] Ground, projection, lighting, scale, contact shadows, and depth ordering are coherent.
- [ ] Match footprints, approach distances, visible contact points, and facility placement.
- [x] Replace ambiguous decorative field dots with intentional stadium boundary presentation.
- [ ] Benchmark current scene versus a dedicated sprite renderer before stack migration.
- [ ] Make reduced-motion and muted play complete, readable experiences.

## Milestone 3 — campus ownership and complete defenses

- [ ] Canonical CampusLayout shared by build, scout, defense, and replay.
- [ ] Editable formation templates with tap-to-place, clear preview, undo, cancel, and safe panning.
- [ ] Validate overlap, gate access, footprints, and reachability before publishing.
- [ ] Separate cosmetic grounds from the competitive layout explicitly.
- [ ] Complete DefenseSnapshot includes assigned heroes, roster, equipment, mastery, and crowd.
- [ ] Local defense tests and real rivals consume the same snapshot and defender rules.
- [ ] Match results credit the formation/layout that was attacked.
- [ ] Verify edited layout and upgrades using two accounts and a recorded replay.

## Milestone 4 — progression and return experience

- [x] Permanent supporter milestones cannot disappear when an energy refill is purchased (implemented and regression tested; visual acceptance remains above).
- [ ] Document and preview the cost/effect of every retained currency and support resource.
- [x] Remove invented rival losses from ordinary save loading; label optional AI defense practice (implemented and regression tested; visual acceptance remains above).
- [ ] Consistent closed-tab, hidden-tab, reload, offline, and cross-device time advancement.
- [x] Free repeatable interactive hero practice, isolated from ranked rewards and owned resources.
- [ ] Guided first hero signature, result explanation, meaningful upgrade, visible next match.
- [ ] Consistent navigation names and one main hero-management destination.
- [ ] Recruiting, comparison, lineup choice, duplicates, and release decisions are understandable.
- [ ] Rebalance actual shared-engine encounters and economy across casual/returning play.
- [ ] Retained facility/hero upgrades visibly deliver their advertised benefit.
- [ ] Rival appearance, defensive personality, crowd/mascot, and progression remain distinct.

## Milestone 5 — trustworthy online progress

- [x] Pending, failed, and confirmed saves/publications/attack reports are distinguishable (protected clubs: Settings › Online protection; results confirm only on the server answer).
- [x] Revisioned state, durable operation IDs, retry queue, and conflict/recovery rules (`game/online/authorityClient.ts`, `tests/authorityClient.test.ts`, `tests/authorityService.test.ts`). Live two-account evidence: open until the v3 function deploy.
- [ ] Account linking and existing-club sign-in preserve recoverable ownership.
- [ ] Server-issued match snapshot/seed/rules and Energy reservation.
- [ ] Server validates commands with shared engine; settles rewards exactly once.
- [ ] Server-enforced shield, match eligibility, beginner protection, expiry, and cancellation.
- [ ] Durable paginated attack history and idempotent consequence application.
- [ ] Replay storage separate from frequently synchronized club state; bounded workloads.
- [ ] Validate permitted asset IDs, command shapes, object counts, and authenticated ownership.
- [ ] Complete real two-account match, defense receipt, replay, and cross-device save verification.
- [ ] Poor network, expired session, duplicate submission, two tabs, and two devices tested.
- [ ] Offline/guest play remains available with explicit competitive eligibility boundaries.

## Milestone 6 — production and launch

- [ ] Asset/action coverage inventory for all nine heroes and all shipping environment variants.
- [ ] Internal atlas/animation viewer, footprint overlay, encounter definitions, event inspector.
- [ ] Versioned rules/configuration and updated design decision records.
- [ ] Verified analytics delivery, ordered player funnels, error and performance diagnostics.
- [ ] Versioned database migration, backup/restore test, and rollback plan.
- [ ] Legacy save fixtures preserve heroes, roster, currencies, facilities, equipment, and achievements.
- [ ] Explicit conversion/compensation policy for retired mechanics; idempotent migration.
- [ ] Older clients cannot overwrite migrated clubs; old replay compatibility handled honestly.
- [ ] Player-support recovery flow and privacy-conscious diagnostic information.
- [ ] Fictional-team/asset provenance and public-name moderation requirements resolved before expansion.
- [ ] Real-device tests: current iPhone, older/smaller iPhone, and midrange Android.
- [ ] Orientation, safe areas, actual gestures, text scaling, muted and reduced-motion tests.
- [ ] Sustained frame pacing, texture/memory budget, heat/battery, and interruption checks.
- [ ] Observe new and returning players; verify intentional hero use, learning, and retries.
- [ ] Small monitored migration cohort before broad release; only then assess expansion.

## Acceptance sequence

Place a facility → choose a favorite hero → run a timed signature → see the correct result → receive one confirmed reward → improve and save the club → watch the same layout defend under the same rules.

Two heroes establish the production method. They do not reduce the final scope of nine heroes and the complete shipping asset inventory.
