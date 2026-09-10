# Visual gameplay pass — September 10, 2026

Scope: the five presentation and first-match improvements requested while backend recovery proceeds separately.

1. Franchise and Enforcer: four authored views, launch, four distance-driven run poses, planted turns/stops, contact braces and substitution signals. Film Room uses the new run art too.
2. Physical action: dedicated directional receiving-contact art, existing engine-timed throw/contact/recover poses, and an aiming arc sampled from the projectile's displayed trajectory. No combat result or timing changes.
3. Environment: projected grandstands replace boundary dots; facility foundations share the field projection, footprint scale and shadow direction. Hero silhouettes retain the previous release's readable camera scale.
4. Remaining seven heroes: authored set/load/release/recover sheets, distinct ready stances and individual foot-lift/breathing presentation. These reuse their existing six-frame locomotion art; new four-view locomotion is specific to Franchise and Enforcer.
5. First match: guidance advances on actual deployment and a successful signature command; an early substitution points to free practice. The result shows contributions and directs the player to Heroes/Train, with drills as the coin-earning route.

Local verification: 264 tests, 540 fully decoded raster assets, production build and 219-match balance run passed. Rendered all source registrations, the first campaign's deploy/signature/result/reward/upgrade route at 390×844, and Enforcer free practice with the follow camera. Reward screen displayed Franchise's contribution; returning to Heroes exposed the 600-Coin +25% training option.

Art sources and prompts are preserved under art/*production.md; encoding scripts perform lossless conversion only. Actual raster tests guard pose gutters and foot registration. Local art review: /art/hero-motion-review.html.

Browser viewport checks do not replace physical-phone playtesting. Backend authority recovery, save reliability, defense snapshots and deferred QA data cleanup remain separate work. This branch changes no App.tsx, battle.ts, types.ts, PvP or engine contract.

Preview and production evidence will be recorded in the pull request after deployment.
