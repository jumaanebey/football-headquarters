# Hero, defensive equipment and delivery completion

## Delivered implementation

**Hero identity.** Nine typed cosmetic profiles vary foot cadence, planting/settling, posture and contact recovery. Campus paths use nine distinct rhythms while retaining compact art. Battle footfalls consume displacement-derived phase; zero-displacement actors settle even with a stale moving flag. Transitions and canvas action playback now use simulation time, so paused replays do not advance on wall time. Reduced-motion users do not request motion/reaction/signature sheets; elite poses and signature cues remain available. Hero details explain each movement style. No simulation, balance, server or saved-state rule changed.

**Defensive machines.** New versioned sports-equipment atlas plus a separate elite five-pad tackling sled. All five machine families have visible L1/L4/L8 tiers. Two-wheel JUGS machines, spring-loaded padded sleds, referee flag towers, T-shirt cannons with shirt baskets, and pump/hose hydration stations replace the old presentation. Original source URLs remain valid in saved layouts and films. Rival facilities keep their existing art. New alpha files use content hashes and immutable caching. The atlas is about 291 KiB and the separate elite sled 108 KiB; loaded when needed. Existing originals are preserved.

**Update/offline recovery.** Precaching now includes the lazy campus editor (about 11 KiB). The current and two previous cache versions are retained for deployment overlap; current caches take priority over older art. Partial installation removes its incomplete cache. Cache read/write/quota failures do not discard successful network responses. Background cache refresh has an explicit worker lifetime. Registration and boot listeners are idempotent. Update application rechecks the current guard, catches post failures, prevents double activation and recovers from activation timeout. Only the requested worker causes an apply-triggered reload. Cleanup targets owned shell/art caches and the FHQ worker. No account data enters caches.

**Measurement.** Tutorial choices and upgrade requests no longer masquerade as completion. Reports exclude malformed/future rows, validate windows, exclude all rows for marked QA identities, identify mixed direct/legacy sources correctly and wait for complete UTC return days. REST pagination uses timestamp plus unique id order and a bounded end time. Available-history cohorts are labeled accurately; they are not lifetime acquisition cohorts.

## Verification

- Strict release verification: 581 tests / 74 files; typecheck, authority/deployed parity, hero atlas integrity, recovery rehearsal, derived alpha checks, build, fingerprint checks and balance passed. Final CI is recorded in the release handoff.
- Actual bundled-worker code executed in isolated runtime tests: private storage, quota, partial install, old lazy editor offline, cache precedence, network-only authority traffic, scoped kill-switch cleanup. This is runtime fixture evidence, not a physical browser claim.
- `dev/hero-motion.html`: all nine rendered at phone scale on the same path; movement, planted stops, reverse direction and action frames inspected. Pause/step and 0.5/1/2× controls. The fixture does not create a club and is not emitted into production.
- `dev/equipment.html`: every L1/L4/L8 machine rendered against dark and light turf. A neighboring sprite tip was excluded from the Ref Tower source region. Actual phone Defense workshop and Enforcer practice→debrief→Hero Film Room also checked using existing Campus QA FC. Balances remained 878 Coins / 92 Fans / 28 Crowns.
- Fixture weekly report is explicitly labeled under docs/evidence/takeover. No real-data funnel credentials used or recorded.

## Remaining external acceptance and limits

Native Chrome subprocess launch is denied in this sandbox. The full Chrome transfer/offline/two-tab browser corpus was not rerun; do not treat worker fixtures as those checks. Physical iOS/Android installation and observed-player acceptance still require actual devices/players. Use the manual script below. The worker keeps two prior versions, not arbitrarily old open tabs; old releases that never precached a lazy chunk cannot recover that absent chunk offline retroactively. Network reload remains the recovery path for those historical clients. New art and cosmetic motion do not claim new gameplay mechanics or newly drawn hero poses.

## Physical acceptance script

1. On iOS Safari and Android Chrome, open the live game, name a local club and finish the tutorial. Record OS/browser/build; do not use a desktop emulator as evidence.
2. Install from the offered browser action (or Safari Share → Add to Home Screen). Dismiss once, then try again when supported. Launch from the icon; verify standalone display and the same club.
3. Open campus editor, roster and heroes. Close the app, disconnect the network, reopen. Confirm saved club and cached editor are available; protected actions explain that they need a connection. Uncached art must fall back without losing navigation.
4. Reconnect and complete one server-confirmed action. Record revision/balances before and after, including a reload.
5. Keep a previous-version tab open during a test deployment. In the new tab request an update while idle, then revisit the old tab and open its editor. Repeat with the older tab offline. Restrict rollback/kill-switch experiments to a test origin.
6. During a reserved game/pending reward, verify Update is disabled/deferred. After confirmation, apply and verify the same club and receipt remain. Report failures with redacted diagnostics.

## Generation provenance

Built-in image generation was used, followed by the existing deterministic `art:cutouts` chroma-key/alpha pipeline. Source references and originals are preserved. Files: public/assets/battle/defense-workshop-v2.png and tackling-sled-elite-v2.png; shipped derivatives have `.alpha.webp` suffixes. The first generated atlas had a baked checkerboard and was rejected; a targeted flat-magenta background edit produced the source used here.

Atlas prompt: Edit the existing single 4×4 production equipment atlas, preserving cell order and isometric camera. Premium hand-painted sports art, bold readable silhouettes, navy metal and orange pads. In order: practice field, rival stadium, JUGS basic, JUGS upgraded; JUGS elite, single padded sled, three-pad sled, referee tower basic; referee tower upgraded, referee video tower elite, portable T-shirt cannon, dual T-shirt cannon; elite multi-tube T-shirt cannon, cooler/hose station, multiple-cooler pump station, elite hydration sprinkler station. All objects isolated inside equal cells, no labels, grid lines or ground slabs. The first two cells are not used by the replacement mapping.

Final background edit prompt: Preserve all 16 sprites, grid positions, sizes, colors and details. Replace only the checkerboard everywhere including holes between parts with perfectly flat RGB(255,0,255). No checkerboard, gradients, added shadows, text or borders. Preserve white details and square dimensions.

Elite sled prompt: Use the atlas only as a style reference. One isolated five-pad elite football tackling sled with orange pads, navy reinforced steel, visible springs, broad runners, angled braces and a white helmet mark on the center pad. Same isometric camera/palette; centered square with padding; flat RGB(255,0,255) background including holes. No ground slab, shadow, text, humans or extra objects.
