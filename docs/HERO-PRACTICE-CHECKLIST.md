# Free hero practice — September 9, 2026

Baseline: `303c6d8`, following the live ground and distance-driven movement fixes. This is a bounded release from the prepared reconstruction, using the existing hero artwork. The broader reconstruction remains unfinished; approximately 30% complete is a planning estimate, not a measured score.

## Implemented

- [x] Free practice entry in the Hero Film Room for all nine heroes, including locked heroes.
- [x] Independent practice hero, partner, squad, and target objects; no roster unlock or energy charge.
- [x] Pinned hero deployment/signature buttons and accessible one-tap deployment.
- [x] Timed release, ball flight, and impact for Hail Mary and Onside Bomb.
- [x] One facility-damage accounting boundary; clamp yardage and prevent duplicate sacks.
- [x] Keep the hero planted during windup/release; preserve released projectiles after knockout.
- [x] Continuous Burner sprint through normal wall-aware pathfinding in practice.
- [x] Practice-only individual stats, effective healing, and protection contribution accounting.
- [x] Resource/progression guard before result handling, analytics, or online reporting.
- [x] Fresh retries and return-to-Film-Room navigation; no uncharged energy refunds.
- [x] Practice result labels, contribution summary, and no reward/bonus-loot claims.
- [x] Preserve the published ground assets and distance-driven stride in all battle modes.
- [x] Keep campaign, defense, ranked and v1 replay rules on their existing path.
- [x] 120 tests pass, including all-nine-hero fixtures and action timing; all 527 raster images decode.

## Release verification

- [x] TypeScript, production build, and remote CI pass on this release.
- [x] Browser: Film Room → practice → deploy → signature → result → retry → return.
- [x] Browser: locked hero can practice without joining the owned roster.
- [x] Browser: visible resources remain unaffected by practice entry, completion, retry, and exit (ordinary background accrual remains active).
- [x] Deploy and verify the live practice entry.

## Remaining limitations

Existing artwork is used. The prepared four-pose prototypes are not included. Truck Stick's physical forward contact, richer direction-specific animation, real-phone acceptance, server authority, and full engine/replay parity remain open. This release is not the full reconstruction. The existing bundle-size warning remains.

Verified on PR #24 (`1decca5`), merged as `8d94193`. Remote CI and Vercel succeeded. Desktop browser exercised locked Dr. Sloane, signature, results, fresh retry, early exit, and return; the Unlock 8000 button remained and balances stayed 100 energy / 500 coins / 0 fans / 10 crowns. QB sampling showed planted windup, delayed projectile appearance, flight completion, and resumed movement. Retry reset to 1:00 and 0% with undeployed heroes. Production practice entry was confirmed with the existing club at 100 energy / 979 coins / 12 fans / 18 crowns. All-nine configuration coverage is automated; browser acceptance covered Medic and QB, not all nine heroes or real phones.
