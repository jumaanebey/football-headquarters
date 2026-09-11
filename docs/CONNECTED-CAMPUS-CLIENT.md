# Connected campus client milestone

Base: main `4f6357d` (PR #83). Branch: `codex/connected-campus-experience`.

## Delivered

- Campus next-step card reads confirmed club state: resume a Stadium game, follow the current schedule, read development results, collect a legacy workout, or continue scouting. A passed timer says Awaiting confirmation instead of manufacturing a reward.
- Building status labels expose active room sessions and confirmed development results. Campus geometry brings the facilities around a larger practice field without changing saved defense coordinates.
- Roster cards expose Strength, Speed and Football IQ as direct room actions. The selected player and position group survive navigation into Weight Room, Practice Field and Film Room. Search, group filters, sort and release confirmation remain available.
- Room primary actions precede the compact upgrade and advanced schedule controls. Scouting's first trip and upgrade are adjacent. All building-era previews remain available, with larger cards. No new art was generated.
- Room attendance distinguishes ambient previews from scheduled work. Weight Room labels show player names and its preview group follows the session selector.
- Program shows current readiness, its existing raid threshold, recent confirmed player gains, collected Stadium results and the next useful action. Investment and defense-history headings no longer imply team readiness or Stadium history.

## Verification

`npm run release:verify -- --strict`: passed, 698 tests across 91 files; typecheck, authority parity, atlas verification, restore rehearsal, derived-asset checks, production build, fingerprint checks and balance guard passed.

Browser inspection used 390×844 phone, 844×390 landscape and 1440×900 desktop. Cloud credentials were disabled on the local App, so no production account was created. Verified actual App naming → campus → roster → Ace QB Speed → Practice Field with Skill positions selected; direct Scouting and Weight Room entry; phone Scouting primary actions and upgrade; desktop room/action columns.

The isolated `dev/connected-club.html?resume=connected-review` fixture uses real club actions and settlement without network access. Verified roster → Ace QB IQ → Film Room → Study → campus timer → reload → confirmed three-player IQ 10→11 report → read report → Program history. Fixture controls are not part of the production app.

The release command's optional browser performance/offline suites and live two-account evidence were not rerun. This milestone changes client presentation, not authority rules. Browser fixture evidence is not production server evidence.

## Coordination and remaining work

The Claude handoff is `docs/CLAUDE-CONNECTED-CLUB-HANDOFF.md`. Claude owns lineup, Stadium decision/rule changes, development/scouting rules, authority and migrations. Codex owns the client files in this PR. Integrate against Claude's documented contracts before the coordinated release; do not merge his files into this branch while he is editing them.

Still open: active lineup UI awaiting its rule contract; Stadium decision improvements; meaningful group training tradeoffs and longer away schedules; differentiated prospect relationships; individual player art (position groups still share art); larger raid mechanics work. This PR does not replace or claim completion of those items.

Nothing from this branch has been deployed.

## Integration with PR #85

Claude's exact head `70f0973` is merged into this client branch; his branch is unchanged. Starting slots, reserves, swap preview and confirmed `lineup.set` now render in Roster. Existing Stadium games explicitly retain the kickoff lineup. Local player release now uses the authority reducer and reports repaired slots instead of bypassing lineup repair.

Native ESM inspection found a real startup crash in `stadiumFootballLegacy.ts`: a top-level `void STADIUM_OPPONENTS` accessed a cyclic import before initialization. Removed that evaluation, retaining all legacy arithmetic. Corrected redundant yard-line articles, malformed defensive-look grammar, and duplicate actor chips. Authority v9 was regenerated for these integration fixes.

Approved derived art is now used by the loader, with original-art fallback: 40.96 MB → 6.04 MB including the roster atlas. All image dimensions and alpha pixels are exact; RGB uses quality-90 WebP, no resizing or repainting. `npm run art:players -- --check` checks source/output hashes and dimensions. Authored originals remain untouched.

Integrated offline release: 740 tests and all eleven offline release stages pass. Native browser: reserve Tank replaces Fridge, Attack preview 38→36 equals confirmation and survives reload; Stadium preview is 36; both possessions played to a 3–0 final and explicit 100-Coin result. The automated Chrome suite cannot launch in this environment (SIGABRT/EPERM), including after network permission was granted. This is an execution limitation, not a passing browser budget result. Transfer budgets remain unchanged.
