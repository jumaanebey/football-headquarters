# Balance Bible — targets, tuned curves, and how to re-verify

Every difficulty/economy curve in the game is tuned against a headless simulation of the
**real game code** (`balance-sim.ts`), not gut feel. If you touch a curve, re-run the sim
and hold it to the targets below.

**Re-run:**
```bash
npx esbuild balance-sim.ts --bundle --format=esm --platform=node --outfile=/tmp/balance.mjs && node /tmp/balance.mjs
```

## Player-tier model (what "progression" means)
| Tier | Roster OVR | Roster size | Hero level | Stars | Heroes | Walls |
|---|---|---|---|---|---|---|
| T0 fresh | 10 | 10 | 1 | 1★ | 5 | 8 |
| T1 early | 15 | 12 | 3 | 1★ | 5 | 10 |
| T2 mid | 22 | 14 | 6 | 2★ | 6 | 12 |
| T3 strong | 32 | 16 | 10 | 3★ | 8 | 16 |
| T4 maxed | 42 | 18 | 15 | 5★ | 9 | 20 |

**Key insight that drives everything:** attacker power **compounds** (roster × OVR ×
tendencies × hero level × star evolution ≈ 40× from T0→T4), so linear enemy scaling
collapses. Campaign/raid difficulty is therefore **exponential**, and turret **lethality**
scales superlinearly (`dmg × tier^1.25-1.3`) while loot-building HP stays linear — defenses
must *kill units*, not just soak longer.

## Targets → measured results (sim, no actives)
| System | Target | Result |
|---|---|---|
| Campaign walls | each tier walls ~2-3 stages after the last | T0→s5, T1→s6, T2→s9, T3→s10-11, T4→s12 |
| Championship (s12) | demands actives even at T4 | T4 sim = 46% (sim has NO plays/mascot/abilities ≈ +25-40% live headroom → beatable only with skilled active play — the intended final boss) |
| Raid win rate at own tier | 60-75% | T3 75%/2.1⭐, T4 73%/1.4⭐; T0-T2 ~95-100% (deliberate onboarding generosity — the ladder bites as you climb) |
| Defense | gradient, fresh bases protected by shields | T0-T1 farmed (shield triggers ≥50%), T2 concedes 1⭐, T3+ HOLD |
| Buildings all-L5 | 3-5 focused hours | ~2.8-3h ✓ |
| Hero coins sink | long-term | 1 hero L15 ≈ 503k; all 9 ≈ 4.5M — the endgame coin sink |
| Legend (premium) | direct-buy is the smart path | 120👑 direct vs ~775👑 median via rolls (rolls are for SHARDS) |
| First 5★ evolution | weeks-scale chase | ~90 rolls @14-22 shards/dupe ≈ 4-6 weeks F2P |
| Gems/day F2P | ~2-3 rolls/day | dailies 15-23👑 + raids ~20-40👑 → 40-60/day @20👑 rolls ✓ |

## The tuned constants (where they live)
- `campaign.ts` — stage mult `0.55 × 1.34^(stage-1)`; turret dmg `13 × mult^1.25`; extra turrets at s3/5/7/9/11.
- `battle.ts generateRaidTargets` — base `1.0 + t/300 + (t/750)^1.7`; turret dmg `14 × tier^1.3`; +1 turret per 1.4 tier (cap 5).
- `battle.ts raidAiMult` — `(0.55 + off/150) × (1 + 0.03×(L-1))` (offline/live defense attacker).
- `gacha.ts` — roll 20👑; duplicate shards 14-22; star-up 25/50/90/140 (1★→5★ = 305).
- `constants.ts` — upgrade `1400 × 1.7^lvl`; energy/collector/rally rates (see ECONOMY notes in git history).

## Known model limits (be honest when reading sim numbers)
- The sim auto-deploys in a ring and never uses plays, mascot/fan-mob, or hero abilities →
  real players run **+25-40% above sim**. Targets are set assuming that headroom.
- Live battles use WALL-AWARE PATHFINDING (battle.ts planPath — detour through gaps,
  smash only when boxed in or the detour costs >6 cells); the headless sim still moves
  straight-line + smash. Net: in live play, wall VALUE is placement-sensitive (sealed
  rings and funnels matter, scattered walls do little) — the sim can't see that.
- Live DEFENDERS (linebacker waves, goal-line stand — added post-sim) eat into that headroom:
  they kill attackers the sim never loses, roughly offsetting the human-skill bonus at
  equal tier. Game Plans + momentum/takeaway bonuses give some of it back to good players.
  Net: treat the sim's raid win rates as ~accurate again, not conservative.
- Live Rivals (PvP) bases are real player layouts — matchmaking fairness there comes from the
  trophy bracket, not these curves.
