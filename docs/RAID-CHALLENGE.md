# Road raid challenge completion — 2026-09-11

## Player behavior

Road teams now show **Open**, **Contested** and **Fortress** choices instead of a
five-football indicator that saturated at higher trophies. Cards name Coins and
Fans, formation, defense count and active power equipment. Preparation reads the
actual opponent layout and compares equipment covering the four approaches. This
is a scouting hint, not a win probability; walls, defenders and later orders matter.
The preview and equipment guide now use the same id-based equipment fallback as
the battle. A defense without an explicit flavor no longer always previews as JUGS.

Open and Contested target strengths are unchanged. Fortress health and pressure
use `1.12 + 0.4 * (1 - exp(-trophies / 450))` on top of the existing trophy curve.
The purse includes the same added difficulty multiplier. Fortress equipment level
is `min(10, 1 + floor(trophies / 200))`; at 1,800 trophies, level-10 power moves
become active. This uses the existing equipment signatures and readable warnings.
There is no scaling to the attacking roster: training still helps against a fixed
bracket. Players can select a gentler opponent instead of hitting a forced wall.

## Paired evidence

`FHQ_BALANCE_SAMPLES=120 npm run balance` covers 869 matches, including 200
fortress pairs, plus replaying every coached recording. Both policies use the
same individual players, heroes, deployment positions, seed, Balanced plan and
signature cadence. The only difference is a focus call: once per second the coach
checks visible surviving defenses, chooses the nearest to the living team's center,
and changes the target only when that choice changes. After defenses fall, it
calls the next surviving facility. This is a regression policy, not human win-rate data.

| Team / trophies | Auto-target fortress wins | Focus-call fortress wins | Average House Taken, auto → focus |
|---|---:|---:|---:|
| Fresh / 0 | 1/40 | 1/40 | 39% → 30% |
| Early / 150 | 15/40 | 8/40 | 49% → 44% |
| Mid / 450 | 19/40 | 36/40 | 46% → 67% |
| Strong / 1,000 | 13/40 | 40/40 | 45% → 73% |
| Highest modeled / 1,800 | 22/40 | 39/40 | 52% → 81% |

A blanket focus order is not a free buff. Weak teams can overcommit into concentrated
pressure. Advanced teams have the staying power to remove equipment together, and
benefit in every sampled advanced bracket. All 200 Open choices win. Contested
choices retain less complete clears at advanced tiers. The existing tutorial,
Week 2, training, rarity, progression, economy and Championship gates still pass.
The default 30-target run now adds 50 paired matches (269 total) and enforces:

- Every tier's Fortress resists at least one all-at-once auto-target rush.
- Coached advanced squads can win Fortress choices and improve aggregate damage.
- Every coached recording replays to its exact final hash.
- Existing balance acceptance gates continue to apply.

The extended sample was run after fixing the curve, including 150 fortress pairs
outside the default seed set. No thresholds were relaxed to make the report pass.

## Compatibility and verification

Combat rules remain `raid-tactics-5`. Only newly issued opponent snapshots change.
Campaign, live rival layouts, saved reservations and historical films retain their
existing inputs. The equipment fallback was extracted without changing its return
values, including the legacy undefined/JUGS representation. Golden v3/v4 films,
the unchanged deterministic corpus and a v7 Fortress recording all remain valid.
The v7 fixture was captured from the parent commit's generator and unchanged engine.
A coached top-tier film is also committed: 62% House Taken, one Game Ball, hash
`a0fe5c95`. Browser presentation is verified separately from Node replay checks.

The server reserves exactly the advertised daily target and verifies the saved
snapshot even after trophies or the daily offer change. No schema migration or
account data rewrite is involved.

Release status and native/live evidence are appended after deployment below.

### Release evidence

- Authority v8 deployed at 2026-09-11 18:07:26 UTC, JWT enabled. Exact management
  readback matches the 174392-character artifact pinned at
  `6f2e17713e3627ee5792caa94b4b09288b875b14`, SHA256
  `9456bd85a269bfca1804992a3b22d195bdfa5c8809f428a5c8f371e1ce0e6b6b`.
- Native isolated 390px/332px phone preview: three challenge cards, explicit
  currencies, correct formation/power-move briefing, legal three-lineman group
  deployment, hero deployment and a focus order accepted. No account transport.
- Native 844×390 landscape replay: the entire coached fortress film reaches 62%,
  one Game Ball and “Replay matches the recorded drive.” Debrief shows 40 supported
  catches and actual equipment effects. No console errors or document-width overflow.
- 693 tests across 90 files pass, including old v3/v4/v5 replay compatibility,
  snapshot issuance/settlement and preview/engine equipment parity.
- Extended 869-match report: `docs/evidence/raid-challenge-balance-2026-09-11.txt`.
