# Club workflows and performance integration — 2026-09-10

## Release contents

This release includes PR #45 at 89856e279573ed4db6458242564676074969b261, merged into the PR #46 product base, plus the product integration below. No authority service, schema, combat rules, or economy values changed. Claude's later PR #47 and subsequent motion work are separate.

| Area | Implemented and integrated | Observed verification |
| --- | --- | --- |
| Campus | Camera fits actionable facility bounds rather than decorative canvas, bounded travel and recenter; Facilities directory; saved geometry retained | Existing custom Campus QA FC at 320×740, 390×844, 768×1024, 844×390, 1440×900; command center open/close reallocates campus space |
| Facility interiors | Live storage, readiness, recovery, drill/job status, collection, pending-state controls and next-level effects | Training Field 1→2 stayed open through server completion; Stadium collection; Rehab and direct directory entry |
| Roster | One player/training workflow; filters retained across panel close; facility-adjusted drill payouts/readiness; live job and collection without leaving Roster | Blocking Sleds survived reload; 120 Coins, +5.5 readiness, all four OL players advanced one level |
| Scouting | Authoritative board, pending controls, one empty-board refresh per attempt, roster routes | Cole Reyes: scout→close→ready→sign; roster 11→12 and full-roster recovery shown |
| Heroes | Selected hero growth or practice tab; true level/star gains, costs, locks and live training | Enforcer 1→2, Grit 460→575, Yardage 24→30; then deployed in protected Season game |
| Defense | Equipment/formation/gates sections; shared field equipment renderer; next-level effects; named gate roles/levels | Enforcer North Gate survived reload; test defense, Crowd Noise, Goal-Line Package, result→Review defense |
| Game Day | Next matchup prominent, full schedule/replays collapsed; chosen plan and opening hero; result destinations after confirmation | Week 2: Ground & Pound, Enforcer opener, all five heroes deployed; 100%, 3 balls; Collect & train heroes returned to growth |
| Install/update | PR45 install support consumed once; Settings connection and update controls; update activation denied during matches or pending actions | Unit-tested default-deny/waiting-worker guard; Settings rendered with server reachability |
| Measurement | Ten funnel hooks, owner-scoped dedup, confirmed match ledger recovery, persistent observed growth, attributed result URL | Funnel tests cover account switches, next-day return, storage failure and growth across reload |
| Art loading | PR45 compact campus art, per-kind battle requests, hash caching; warming at prepared battle entry and explicit practice | Build asset checks pass; workshop now uses the field equipment atlas, not legacy raw images |

## Final local checks

`npm run release:verify -- --strict` passed: typecheck, 507 tests across 68 files, strict authority source/bundle/deployed-record parity, hero atlases, isolated restore/rollback rehearsal, derived campus sheets, install icons, production raster/build checks, fingerprinted-asset checks and balance regression.

In-app browser verification used the existing protected **Campus QA FC** on the built preview at port 4173. No new cloud QA account was created. Workflow Local QA on port 4192 is local-only. After the Season reward, Settings showed revision 41 and “everything confirmed”; later drill and recruitment actions were also exercised. The reward moved Coins 480→1,058, Fans 75→92, Crowns 18→28. Subsequent drill paid 120 Coins and scouting spent 300 Coins.

## Evidence boundaries / remaining work

- Native Chrome aborts in this Codex sandbox. The alternate installed headless shell also fails with MachPortRendezvous permission denied. Thus the integrated Chrome determinism, cold/warm waterfall, and full offline/update browser scripts were **not** rerun successfully here. PR45's measured performance/PWA evidence remains that branch's evidence, not a fresh measurement of this merged tree. Manual in-app browser journeys and update-guard unit tests do not replace those checks.
- Physical iOS/Android installation and observed-player acceptance remain unverified.
- Equipment now shares existing approved field art. This is not a claim of newly authored defensive-machine animation or new hero movement. Claude owns the active art/motion workstream.
- Arbitrary endgame/crowded custom layouts were not exhaustively visually inspected. The framing tests include extreme moved bounds; normal saved custom geometry was rendered.
- The 45-task Claude package and PR47 are not included in this release. Keep their implementation/deployment claims separate.

## Coordination contract for Claude

Preserve `setUpdateGuard()` in `pwa/register.ts`: activation defaults to denied; App supplies a current-state predicate including active/prepared/reserved/started games, hydration, imports, pending authority operations. Existing `applyUpdate()` callers must obey it.

Product hooks live in `game/productFunnel.ts` and App. Do not add a second set of UI funnel calls. Confirmed rewards are observed from the durable confirmed match-finish ledger, not optimistic result rendering. Meaningful upgrades compare persisted observed actual levels. Art warm calls are nonblocking. A future warming-handle API should retain cancellation and preference semantics when replacing those call sites.

Test discovery intentionally excludes `.claude/worktrees`; it includes both `tests/` and root `battle.test.ts`.
