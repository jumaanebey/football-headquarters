# Campus and club navigation revision — 10 September 2026

Delivered in this revision:
- Campus fits its actual container rather than the browser window. Phones start at overview zoom; opening the desktop command center triggers a refit.
- Stadium, Scouting and Rehab use compact cosmetic home positions. Saved custom layouts and authority/combat/training coordinates remain unchanged.
- Building names stay readable at overview scale. Your program has a visible entry point. Command center opens and closes. Checklist defaults collapsed and occupies a separate control area.
- All building body taps open their facility. Collection has a separate map button and is available inside the facility panel. Facility panels use actual art, current state, current/next effects, construction, and relevant navigation.
- Roster starts with individual players, position filters, details, named release confirmation and a training route. Scouting is directly reachable.
- Scouting shows a compact prospect list and one selected report with individual player art, labeled stats and current-player comparison. Full rosters link to roster management; facility construction is reflected in the footer.
- Game Day features the next matchup and preparation first. Defense events and instructions are optional disclosures.
- Home defense equipment uses larger art, readable descriptions, location and explicit upgrade labels. This is a presentation revision, not newly authored machine art or combat mechanics.

Verification:
- Rendered 390 × 844 campus, all five facility routes, Roster, player details, Scouting and Game Day. Verified collection from the Stadium panel, position-training navigation, prospect selection updating its report, and Game Day opening preparation.
- Rendered 1440 × 900 desktop with command center open; stage refits to 1120 px and no document horizontal overflow.
- Full release verification passed: typecheck, 468 tests, deployed authority parity, hero atlas manifest, restore rehearsal, asset decode, production build, balance guard. Final follow-up UI changes also received check (typecheck/tests/build).
- Local QA used unconfigured dev service; no cloud QA accounts created in this revision. Physical-device acceptance remains unverified.

Not claimed complete:
- Distinct authored hero locomotion and a deeper hero growth experience.
- New defensive machine art/animation and a combat-identity redesign.
- Player testing proving the map solves retention, or every possible saved-layout arrangement. User-authored layouts retain their existing positions.
