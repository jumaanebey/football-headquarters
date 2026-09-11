# Shared-engine balance calibration

Historical calibration below was verified on 2026-09-09 with `hero-actions-3`.

Current `raid-tactics-5` challenge calibration, paired tactical evidence and release
gates are in [RAID-CHALLENGE.md](RAID-CHALLENGE.md). The default harness now runs
269 matches, including 50 coached fortress comparisons; the 120-target extended
run covers 869 matches. The older measurements below are retained as history.

`balance-sim.ts` now executes `createBattleEngine` for campaign, generated road
opponents, defense, rarity and role scenarios. It no longer contains a second
movement/pressure loop or calls the legacy `simulateRaid` function. Live play,
this harness and v2 replay verification use the same validated commands,
pathfinding, timed hero signatures, defensive coverage, momentum and outcomes.

## Reproduce

```bash
npm run balance
```

The default run covers 219 matches: 60 campaign fixtures, 150 generated road
opponents, five defense fixtures and four role/rarity fixtures. It additionally
replays the tutorial recording and runs 2,000 Scout Search simulations. Set
`FHQ_BALANCE_SAMPLES=400` for a larger road-opponent sample; integers from 3 to
400 are accepted. The default is 30 targets per tier, ten per difficulty choice.
This is a deterministic regression sample, not a population win-rate estimate.

## The player model and bot policy

| Tier | Trained stats | Players | Hero level | Hero stars | Owned heroes | Stadium |
|---|---:|---:|---:|---:|---:|---:|
| T0 fresh | 10 | 10 | 1 | 1 | 5 | 1 |
| T1 early | 15 | 12 | 3 | 1 | 5 | 3 |
| T2 mid | 22 | 14 | 6 | 2 | 6 | 5 |
| T3 strong | 32 | 16 | 10 | 3 | 8 | 8 |
| T4 highest modeled | 42 | 18 | 15 | 5 | 9 | 11 |

T0 uses the actual `INITIAL_ROSTER` roles, rarities, tendencies and level-one
stats. Higher fixtures train each of the three saved stats to the listed value
and add named Player objects using the starter role/rarity mix. Ordinary player
level remains one to isolate trained-stat progression. These are synthetic
milestones; they do not assert how quickly a real account reaches them.
`armyFromRoster`, `rosterPreparation`, `rosterTroop`/`unitCombatStats` and
`heroesForBattle` derive the combat inputs. No average-OVR troop multiplier
stands in for individual stats.

The bot uses Balanced plan and sends every available player and owned hero at
kickoff. Stable player IDs select candidate square-edge coordinates. Every
deployment passes through the live engine command validator; rejected points
are retried clockwise. Existing player positions remain stable when later
tiers gain recruits. The bot requests ready signatures every 0.5 simulation
seconds, including kickoff. It does not optimize support timing or targets,
hold reserves, use manual plays/special units, or receive full-readiness boosts.

The engine owns its seeded gameplay and cosmetic randomness. Target generation
and Scout Search sampling use separate seeds, restored after each sampling
scope, so changing sample count or presentation effects cannot perturb the
other analyses. A natural result must arrive within the fixed-step time budget;
the harness does not force an early whistle to conceal a stalled simulation.

Defense uses current Goal Line geometry, each tier's purchased available base
slots, actual home defenders and auto-filled hero gates. No premium slots,
parking, crowd-resource advantage, mastery, or manual defense plays are added.
It uses the same engine as Test Defense. This replaces the old arbitrary wall
ring and missing-home-guards fixture.

## Measured changes

The first shared-engine run exposed saturation under the old target constants:
every tier won all 30 sampled road opponents. This was a concrete calibration
gap, so the target curves were retuned rather than labeling those results
balanced.

| Fixture | Before target tuning | After target tuning |
|---|---|---|
| Fresh, Preseason Opener | 100%, 3 Game Balls | 100%, 3 Game Balls |
| Fresh, Week 2 | 100%, 3 Game Balls | 100%, 3 Game Balls |
| Fresh, Week 3 | 100%, 3 Game Balls | 66%, 1 Game Ball |
| Fresh, Week 4 | 100%, 3 Game Balls | 40%, 0 Game Balls |
| Early trained, Week 4 | 100%, 3 Game Balls | 70%, 1 Game Ball |
| First fresh campaign loss | Week 8 | Week 4 |
| Highest modeled tier, Championship | 100%, 3 Game Balls | 100%, 3 Game Balls |
| Campaign total House Taken, T0→T4 | 752 / 840 / 956 / 1080 / 1200 | 446 / 584 / 832 / 1042 / 1200 |

The first two campaign strengths remain exactly `0.55` and `0.74`. The season
then uses `2.8, 4.2, 4.9, 5.7, 6.7, 7.8, 9, 10.5, 12, 13.8` to introduce an
early training decision and preserve an achievable Championship. Individual
stages retain their different layouts, so every adjacent stage is not strictly
harder for every lineup. Aggregate performance improves across player tiers.

Road-opponent results use 30 deterministic samples per tier, ten per choice.

| Tier | Before: wins | After: wins | Easy average House Taken | Fair average House Taken | Hard wins | Hard average House Taken |
|---|---:|---:|---:|---:|---:|---:|
| T0 | 30/30 | 21/30 | 100% | 100% | 1/10 | 39% |
| T1 | 30/30 | 21/30 | 100% | 93% | 1/10 | 46% |
| T2 | 30/30 | 21/30 | 100% | 63% | 1/10 | 42% |
| T3 | 30/30 | 22/30 | 100% | 56% | 2/10 | 45% |
| T4 | 30/30 | 22/30 | 100% | 71% | 2/10 | 47% |

Every easy and fair choice wins in this sample. Easy choices deliberately retain
a comfortable route forward; fair choices often award fewer Game Balls. Hard
fortress picks provide the stretch opponent. No tier wins every sampled choice.
These bot percentages do not establish human difficulty, retention or fairness.

The road bracket is `2.2 + trophies/120 + (trophies/700)^1.45`. Easy/fair
individual strength is `0.62`/`0.86` times that bracket. Fortress strength is
`0.75 + 0.3 × exp(-trophies/200)` times the bracket, accounting for its denser
coverage. Easy/fair variation is ±3%; hard variation is ±15%. Fortress picks
retain all five additional equipment positions. Their displayed risk and
reward rating includes a 1.6× geometry weight, so the harder choice offers the
higher purse even though each individual facility is normalized for density.

No player stats, hero abilities or ownership rules were changed. Campaign
stage rewards and generated road purses follow their existing formulas from
the revised difficulty/risk values. Existing campaign records are preserved;
unclaimed/repeat-game rewards use the current values.

## Required gates

- Every match terminates; scores and actor state remain finite and bounded.
- The actual fresh roster can win the tutorial and Week 2.
- Week 4 blocks the fresh fixture and is winnable by the early trained fixture.
- The highest modeled fixture can earn all three Championship Game Balls.
- Higher progression does not reduce total performance on identical campaign
  layouts, and the highest tier has a measurable advantage over fresh.
- Every hero campaign fixture issues accepted signature commands.
- The tutorial replay reproduces the outcome and final hash
  (`952e74e0` in the recorded run).
- Rarity improves the derived statline and does not weaken the equal-role
  Week 8 fixture: Common 7% versus Epic 14% House Taken in this run.
- Every road bracket has a winnable easy choice; hard picks yield lower average
  House Taken than easy picks.
- Existing economy/gacha/Gauntlet cost and monotonicity checks remain active.

## Historical bands and remaining limits

The passive Championship 30–62% and passive road-win 40–85% bands in
`BALANCE.md` belonged to the former straight-line, no-signature, collapsed-stat
loop. The harness prints them as historical references and does not apply them
to the new engine. In particular, no unmeasured “human players do 25–40% better”
adjustment is used.

The retained income calculation is explicitly a scenario: continuous drills,
a level-three Stadium and twelve road games per hour at 550 Coins each. Its
2.8-hour all-L5 estimate is not a verified real-player earning rate, and it does
not model the newly variable road purses. Current hero L15 cost is 502,911
Coins. Scout Search uses the current 20-Crown price and independent sampling:
39 median rolls to own every hero, 32 to find The Legend, versus 120 Crowns to
unlock The Legend directly. These are stochastic economy calculations, not
guaranteed outcomes for any player.

The favorable defense fixture holds at all five tiers (34%, 20%, 8%, 2%, 2%
House Taken). It demonstrates maintained base progression against this AI
party, not protection against arbitrary online opponents. Easy/fair road
choices and the highest campaign fixture still saturate on wins by design;
future balance review should examine player-chosen difficulty, signature
timing, reserve use and Game Ball completion. Player testing and competitive
server validation remain separate acceptance work.
