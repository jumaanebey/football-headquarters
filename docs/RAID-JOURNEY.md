# Raid journey composition

One client presentation milestone: building progression, opponent scouting, battle controls and result guidance. Combat rules, server authority and settlement callbacks are unchanged.

- Building artwork shares a larger stage. Portrait art slots grow from 38 to 90 px; desktop from 85 to 155 px. Every roadmap level remains visible without preview clicks, including Rehab's sixth level. Current actions and the upgrade stay on the same sheet.
- Preparation draws the supplied opponent snapshot with defense coverage, blocking walls and Stadium. Rival previews explain that reservation loads the current defense. Plans and opening heroes are grouped alongside it on wide screens and compactly below on phones.
- Hero commands no longer require horizontal scrolling. Units and both plays are visible in a grid. Redundant generic hero guidance disappears once deployed. Labels, defense ranges, camera and field report remain available.
- Debrief moves actual result rewards above details and offers one next step, based on defensive mode, a known formation counter, substitutions on a loss, or victory. It avoids claiming these observations prove the cause of a loss. Existing settlement owns every destination transition.

## Evidence

- Strict offline release verification: 638 tests across 81 files, typecheck, authority parity, atlas/asset checks, rollback rehearsal, production build, fingerprint check and balance guard passed.
- Native browser fixture: selected Enforcer before kickoff and verified the deployment selection; separately deployed Franchise, called Hail Mary and ended at Practice complete (8% damage, 593 recorded yards). No account or live resources involved.
- Active phone battle at 319×811: stage 406.6 px; command panel client/scroll heights both 302 px. Previous sweep measured roughly 270 px of stage. This is about half of portrait screen height, not the aspirational 65–75% target.
- Building rendering checked at 1280 desktop, 390×844, 319×811 and 667×375 landscape. At 319×811 Stadium and six-card Rehab sheets had equal client/scroll heights (712 px). Landscape art is deliberately smaller to retain the actions.
- Synthetic loss debrief at 319×811 shows result, 75 Coins and the recommendation before scrolling; practice correctly has no collect/reward action.
- Isolated reproducible fixtures: `/dev/campus-review.html`, `/dev/raid-journey.html`, `/dev/raid-journey.html?result=1` (development only).

## Limits and next scope

Extended reports and long rosters still scroll. Five-hero/special-heavy squads may need more command space than the two-hero practice fixture. No physical-device acceptance or new authority evidence is claimed. Roster, scouting prospect comparison, hero growth presentation and defense editor remain separate follow-on work. This PR does not claim those screens are finished.
