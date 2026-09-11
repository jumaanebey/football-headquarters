# Building gallery and website sweep

## Delivered

Building roadmap previews are visible together when the building opens. There is no level selector, carousel, accordion, or extra preview tap. Each card shows its art, era name, effect, current/next/goal status and cumulative building upgrade cost. Rehab includes level six and its recovery cap. The purchase action still upgrades only the next level.

Two clarity fixes from the sweep: player tendency descriptions now identify themselves as traits with the trait name, rather than reading like position instructions; scouting purchase text explicitly says Coins.

Verified all five galleries at 319×811 and 667×375: five cards each, six for Rehab, zero sheet-body overflow. Existing gameplay rules and approved art unchanged.

## Scope and evidence

Live phone sweep covered campus, building pages, Roster, expanded player growth, Roster→Scout, Heroes, free hero practice, practice debrief/return, Game Day, Season preparation, Defense equipment/formation/gates, Ranks, Program and Settings. In free practice, deployed The Franchise, called Hail Mary, ended the session and returned through its result. The practice result explicitly preserved club resources; the club remained at 1,469 Coins and 100 Energy. No paid kickoff, scouting, upgrade, reset, account change, publication or share was performed.

This is a product/interface review of the existing club and free-practice path, not a new proof of paid settlement, onboarding, physical-device installation, or every account state. Findings below are observed remaining opportunities, not claims they were fixed in this release. The deferred QA cleanup is already documented; its public-facing impact was reconfirmed.

## Ranked opportunities

| Priority | Area | Observed issue | Recommended next change |
|---|---|---|---|
| 1 | Roster | First player starts around 490px down a 319×811 screen. Filters occupy several rows; OVR and battle power tell different stories. | Compact search/filter bar, position counts, visible player grid, clearly distinguish raw OVR from battle power. Keep growth comparison next to the training action. |
| 1 | Scouting | The selected prospect is hidden behind a dropdown; a long comparison pushes Scout below the first screen while the facility footer remains fixed. This club's +1 OVR prospect has lower battle power (37 vs 50). | Show the three prospects together; lead with position need and battle-power change, with an always-visible selected cost/action. Separate recruit selection from facility promotion. |
| 1 | Battle on phone | Free practice field occupies roughly a third of the narrow viewport. Hero strip clips the second hero; the command strip extends sideways to spells. | Compact top utility controls and expose deploy/signature/spells together; give the field more space. Preserve large touch targets and verify during active battle. |
| 1 | Pregame | Reservation is visible before the opening hero, squad and reward sections. First view shows only part of the game-plan choices. | A compact matchup/plan/hero summary and visible reward/cost above reservation. Show the three plan comparisons together. |
| 2 | Heroes | A dropdown hides the lineup and locked goals; the first viewport is mostly heading, tabs, explanation and a portrait. Training/star actions sit lower. | Visible hero gallery with locked silhouettes, clear unlock requirements and next growth gains. Selected hero actions remain close to the portrait. |
| 2 | Defense | Owned and distant locked equipment form one long list. Large text panels dwarf art; D27 in the fixed footer has little context. | Put active loadout and coverage first, show an illustrated unlock roadmap, and explain the defense rating. Keep counterplay details, which are now useful and differentiated. |
| 2 | Ranks | Campaign challenges precede the actual leaderboard. Campus Preview QA and duplicate Protected Preview FC clubs are publicly listed. | Put real standings first; move campaign challenges to their own section. Use the documented QA inventory for deliberate public exclusion/cleanup; do not delete accounts blindly. |
| 3 | Program | Club power breakdown occupies the first view, while reachable growth goals are farther down. | Lead with one achievable next milestone and its action; keep the detailed power breakdown secondary. |
| 3 | Settings | The long identity preview precedes connection, backup and update controls. | Group identity separately and prioritize account/connection/return controls near the top. |

What worked in this sweep: all reviewed main entry points opened; Roster→Scout reached scouting; free practice deployed, cast, produced a debrief and returned; prep showed explicit costs and no-cost exit; defense descriptions now distinguish pressure, knockback, slowing and terrain effects. The campus composition remains the strongest improvement from the recent releases.

Strict offline release verification passed: 634 tests, typecheck, authority parity, art verification, build and balance.
