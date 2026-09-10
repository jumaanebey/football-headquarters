# Growth and equipment read models (Package C)

Pure presentation models for the Codex UI, under `game/progression/` and exported from
`game/progression/index.ts`. Every function is `(GameState, …, now) → plain object`. Nothing spends,
starts, completes or mutates; every number comes from the existing rule helpers and the authoritative
rules in `game/authority/clubActions.ts`. No balance, cost, gate, timing, schema or reward rule was
changed. Where shipped prose disagrees with the combat code, the data was left alone and the
corrected wording is recorded here (and, for equipment, on the model as `behaviour.correctedDescription`).

Tests: `tests/progressionHero.test.ts`, `tests/progressionPlayers.test.ts`,
`tests/progressionScouting.test.ts`, `tests/progressionEquipment.test.ts`; fixtures in
`tests/fixtures/progression.ts` (synthetic states, built by running the real authority actions).

## Exported surface

| Export | Purpose |
| --- | --- |
| `heroProgression(state, key, now)` | One hero card: status, current stats, next-level / next-star deltas, real cost and duration, stadium gate, live training job, blockers. |
| `heroProgressionRoster(state, now)` | All heroes in `HERO_DEFS` order. |
| `heroTrainingPreview(state, key, now, toLevel?)` | Before/after block labelled `kind: 'preview'`; `confirmed` is derived from state only. |
| `heroTrainingJob(state, key)` | The `kind: 'hero'` job for that key from `state.upgrades`, or null. |
| `heroStatsAt(def, level, stars)` / `heroBattleRange(def)` / `heroTrainingSeconds(toLevel)` | Building blocks (all wrap `heroForBattle`, the engine's range override and the `hero.train` duration rule). |
| `HERO_STAT_SCALING`, `HERO_ABILITY_FACTS` | Which stats scale; what each signature actually does in code. |
| `playerGrowth(state, playerId, now)` / `rosterGrowth(state, now)` / `drillEffects(state, unit)` | Roster player growth with the honest `progress: { kind: 'none' }`, exact next-collect changes, live training state, drill payouts and `training.start` blockers. |
| `prospectComparison(state, prospectId)` / `scoutingBoard(state, now)` | Scouting comparisons, depth, ties, stale-board flags, active job, `recruit.*` blockers. Prospect ids are the state's own. |
| `equipmentModel(state, slotId)` / `equipmentRoster(state)` / `equipmentStatsAt(slot, level, boost?)` / `crownSlotPurchase(state)` / `DEFENSE_BEHAVIOUR` | Defensive equipment per slot: status, gate, location, level-scaled durability/damage from the real layout builder, upgrade cost and blockers, combat behaviour. |
| `Blocker`, `JobView` | Shared shapes. Blocker codes and messages are the authority's own strings. |

## Hero progression (tasks 22–25)

Sources: `battle.ts:262-299` (`HERO_DEFS`, `heroLevelMult`, `heroStarMult`, `heroUpgradeCost`,
`heroForBattle`, `heroMaxLevel`), `battle.ts:301-304` (`ABILITY_CD`, `HEAL_PER_SEC`), `gacha.ts`
(`MAX_STARS`, `STAR_UP_COSTS`), `constants.ts:228` (`upgradeDurationSecs`),
`game/authority/clubActions.ts:288-325` (`hero.train`, `hero.unlock`, `hero.star`, `hero.scout`),
`game/economy.ts:60-63` (job completion raises the level on settle).

### States
`status` is resolved in the authority's own order from live state, never from a selected-hero cache:

| status | rule |
| --- | --- |
| `locked` | `hero.unlocked` false (or the hero is missing from `state.heroes` → `present: false`, blocker `not_found`) and the unlock price is not affordable |
| `recruitable` | not owned, `def.unlock` coins/gems affordable |
| `training` | a `kind: 'hero'` job for this key is in `state.upgrades` with `finishTime > now` |
| `completed` | that job's `finishTime <= now` but it is still listed (settlement pending; level not yet raised) |
| `maxed` | `level >= heroMaxLevel(stadiumLevel)`; `stadiumGate` says which Stadium level lifts the cap |
| `insufficient-resource` | owned, idle, below max, `COINS < heroUpgradeCost(level)` |
| `owned` | owned, idle, trainable now |

Blockers carry `action: 'train' | 'star' | 'unlock'` with the exact `code`/`message` the authority
returns (`locked`, `busy`, `insufficient_resources`, `limit_reached`, `not_found`, `already_claimed`).

### Costs and duration
- Level cost: `heroUpgradeCost(level)` coins (charged by `hero.train`).
- Duration: `hero.train` schedules `round(upgradeDurationSecs(level + 1) × 3)` seconds
  (`clubActions.ts:293`); exposed as `heroTrainingSeconds` and tested against the authority's job.
  Training is **not instant** and does **not** occupy a builder (the rule never checks `builders`).
- Star cost: `STAR_UP_COSTS[stars]` shards; `hero.star` is instant. Shards come from `hero.scout`
  duplicates (14–22) and campaign first-clears.
- Unlock: `def.unlock.coins` / `.gems`, instant.

### What scales (task 23)
Verified against `heroForBattle` (`battle.ts:283-290`) and the engine's hero troop
(`game/combat/engine.ts:63-66`):

| stat | scales? | rule |
| --- | --- | --- |
| Grit (hp) | level + star | `round(baseHp × heroLevelMult(level) × heroStarMult(stars))` — rounding happens in the helper; deltas are integer |
| Yardage (dps) | level + star | `baseDps × heroLevelMult × heroStarMult` (unrounded in the sim; round for display) |
| Speed | fixed | `def.speed` |
| Range | fixed | `def.range`, **except** the engine gives `qb` 13 and `kicker` 16 regardless of `HERO_DEFS` (`engine.ts:64`) — the model reports the engine value |
| Signature cooldown | fixed | `ABILITY_CD = 11 s` for every hero |
| Signature radii, durations, fixed yardage | fixed | see the audit below |

On defense, gate heroes field at 75% of hp and dps (`game/defenseSnapshot.ts`); the model reports
attack-side numbers.

### Ability prose audit (task 23) — data left unchanged
Rule code: `game/combat/actions.ts:93-109` (`stepHeroActions`), `:37-38` (targets), Blitz/rage
`engine.ts:299-304` (yardage ×2, speed ×1.5), truck contact burst `engine.ts:343`, reinforcements
`engine.ts:222-227`. `HERO_ABILITY_FACTS` carries the same facts for the UI.

| hero / text (`battle.ts` line) | verdict | corrected wording |
| --- | --- | --- |
| The Franchise — "Gain 300 + 4× your yardage stat against the closest facility" (264) | Accurate. The 300 is fixed; only the 4× part grows with level/stars; "yardage stat" is base yardage, not the Blitz-doubled value. | Same text; UI should not imply the 300 grows. |
| The Enforcer — "Plant, drive forward and burst on contact. Refill grit and gain 6 seconds of double yardage." (265) | Incomplete: Blitz also raises speed ×1.5, truck speed ×1.6 for 1.8 s, and the contact burst is 100 + 2× yardage on the first facility reached. | "Plant and drive: full grit refill, 6 s of Blitz (double yardage, faster), and the first facility he hits while trucking takes 100 + 2× yardage." |
| The General — "Give nearby teammates 4 seconds of Blitz" (266) | Accurate; "nearby" = 20 world units, timers refresh to ≥ 4 s (no stacking). | "Teammates within 20 yards get 4 s of Blitz (double yardage, faster)." |
| The Specialist — "Gain 500 yards against the closest facility and 250 against nearby facilities" (267) | Accurate, but **nothing in it scales with level or stars** (500 / 250 are constants); "nearby" = within 12 units of the struck facility. | Same text; the card must not show growth for this ability. |
| The Burner — "Dash to the closest facility with 2.5 seconds of Blitz" (268) | Misleading "dash": no teleport. He keeps wall-aware pathing at sprint speed ×1.7 for 2.5 s plus 2.5 s Blitz. Needs a facility to exist or the call is rejected. | "Sprints toward the closest facility for 2.5 s (×1.7 speed) with 2.5 s of Blitz." |
| `game/heroPlaybook.ts:7` — "Jet Sweep jumps him to the closest facility." | Wrong: there is no jump. | "Jet Sweep sprints him toward the closest facility along the open route." |
| Dr. Sloane — "Restore 35% of nearby teammates' maximum grit, plus 5 seconds of recovery" (270) | Accurate; radius 18, includes herself, recovery = 45 grit/s (`HEAL_PER_SEC`), capped at max grit. 35% is of each target's own max grit — the only "scaling" is the targets' grit. | "Teammates within 18 yards (herself included) recover 35% of their max grit now, then 45 grit/s for 5 s." |
| The Captain — "Nearby teammates take half pressure for 5 seconds" (271) | Accurate; radius 16, includes himself. | "Teammates within 16 yards take half pressure for 5 s." |
| The Playmaker — "Bring three extra skill players onto the field" (272) | Accurate; they are generic offensive-skill troops at the squad's preparation multiplier, not roster individuals. | "Three extra (generic) skill players take the field beside him." |
| The Legend — "Refill your whole squad's grit and give them 6 seconds of Blitz" (274) | Accurate; every living attacker anywhere on the field. | Same text. |

### Training preview (task 25)
`heroTrainingPreview` returns `{ kind: 'preview', before, after, delta, job, pendingSettlement, confirmed }`.
`confirmed` is true only when `state.heroes[key].level >= toLevel` **and** no hero job for that key
remains — i.e. after the authority (or `advanceEconomy`) has settled it. A due-but-listed job shows
`pendingSettlement: true` and `confirmed: false`; the UI should keep showing the old stats then.
A receipt alone never confirms; the next `sync`/action result state does.

### Legacy saves
Missing `unlocked` → `!!def.starter`; missing `stars`/`shards` → 1/0; missing `upgrades` → no job
(mirrors `game/persistence.ts:55-66`). A hero key absent from `state.heroes` reports
`present: false`, `status: 'locked'`, blocker `not_found` — the same refusal `hero.unlock` gives.

## Player growth (task 26)

Sources: `types.ts` `Player`/`Drill`, `constants.ts:363-384` (`RARITY_MULT`, `LEVEL_STAT_GAIN`,
`ROLE_BASE_STATS`), `battle.ts:199-231` (`effectiveStat`, `combatStat`, `unitPower`,
`unitCombatStats`), `clubActions.ts:250-287` (`training.start`, `training.collect`),
`game/combat/roster.ts` (`rosterPreparation`).

Audit findings — reported by the model, not papered over:
- **No per-player XP or progress exists.** `Drill.rewardXp` is declared on every drill and is never
  read by any rule (client or authority). `playerGrowth(...).progress` is
  `{ kind: 'none', reason }`; `drillEffects(...).rewardXp` is `{ declared, applied: false, reason }`.
- The only growth path is `training.collect`: every player in the trained unit (`'ALL'` for Full
  Scrimmage) gets `level + 1` and `+1` to strength, speed and iq. `nextStep` gives that exact
  result plus the combat consequences via the real helpers (`combatStat`, `unitPower`,
  `unitCombatStats`), tested against an actual collect.
- `Player.maxStat` is stored but **not enforced** by any rule (`maxStatEnforced: false`).
- No action changes rarity (`rarityPath.promotion.kind: 'none'`).
- Readiness is team-level: `+readinessGain × warRoomReadinessMult(filmRoom)` per collect, capped at
  100; at 100 `rosterPreparation` applies ×1.15 (`rosterGrowth().readiness`). The −20 fatigue after
  an attack lives only in `App.tsx:1025` (client), not in the authority rule set.
- Training state comes from the Training Field building (`activeDrillId`, `targetUnit`,
  `finishTime`, `state`), never from `Player.state`; `collectable` requires the field to be
  `COMPLETED`, which only a settle (`advanceEconomy`) sets.

## Roster / scouting comparisons (task 27)

Sources: `recruiting.ts` (`rosterCap`, `candidateOvr`, `recruitCost`, `recruitSeconds`),
`constants.ts` `RECRUIT_CONFIG`, `clubActions.ts:326-362` (`recruit.refresh/start/rush/sign/cut`).

- Prospect identity: `prospectId` / `candidateId` are copied from `state.recruitBoard.candidates`
  and `state.recruitSlot.candidate`; nothing is regenerated.
- `comparable` = strongest current player at the same role by `candidateOvr` (the number the
  Scouting and Squad screens show). Ties → `tie: true`, `tiedIds` (roster order), the first named.
  Empty role → `comparable: null`, `depth.firstAtRole: true`, `comparableInUnit` as a fallback.
- `statDiff` is prospect − comparable on raw stats, OVR and `unitPower`.
- Blockers mirror `recruit.start` order: `busy` (active job) → `not_found` (no Scouting Dept) →
  `limit_reached` (roster full, cap = `rosterCap(academy.level)`) → `not_found` (not on board /
  already signed) → `insufficient_resources`.
- Stale board flags: `empty`, `future-generated`, `invalid-generated-at`, `candidate-signed`,
  `candidate-in-slot`. No TTL exists in the rules; `recruit.sign` reissues the board. A club without
  `recruitBoard` is `board.kind: 'none'` (client-authoritative clubs roll locally in `ScoutingModal`).
- `job` view: ready exactly at `finishTime`; `rush` (5 Crowns, `not_ready` once due) and `sign`
  (`not_ready`, `limit_reached`, `already_claimed`) blockers.
- `roster.cutFloor` is 6 (`recruit.cut`).

## Defensive equipment (tasks 28–29)

Sources: `fixedBase.ts:226-237` (`slotUnlocked`, `MAX_SLOT_LEVEL`, `slotUpgradeCost`, `slotHpMult`,
`slotDmgMult`), `fixedBase.ts` `slotsFor`/`FORMATIONS.slotPos` (positions + `covers` text),
`constants.ts:269-275` (`DEFENSE_TYPES`), `battle.ts:583-593` (`defenseLayoutFromBase` — the model
calls it with the single slot so numbers are exactly the layout's), `game/defenseSnapshot.ts:53`
(fielded filter), `clubActions.ts:373-387` (`defense.buy-slot`, `defense.upgrade-slot`),
`game/combat/engine.ts:594-687` (turret loop, signatures, puddles).

- `status`: `installed` (level ≥ 1), `preview` (unlocked, level 0 — `next` shows level-1 numbers and
  the base price), `unavailable` (Stadium or Crown gate not met). `fielded` reproduces the snapshot
  filter: a levelled slot behind a locked gate is **not** fielded.
- `location` uses `campusLayoutForState` (custom layouts move slots); `covers` is the fixedBase text.
- `current`/`next` are base numbers (`defBoost = 1`); `boost` and `currentBoosted` apply the live
  multiplier `defenseTroopBoost(roster) × masteryDefMult(holds)` the published layout carries.
- Upgrade blockers mirror `defense.upgrade-slot`: `limit_reached` (10) → `locked` (gate not met **or**
  `toLevel > stadiumLevel`) → `insufficient_resources`. Cost = `slotUpgradeCost(kind, toLevel)`.
- Range is never scaled by level; the Parking Lot compresses positions, not ranges.

### Behaviour per kind (engine facts, tested by firing each turret once)

| kind | range | cooldown | hit | targeting / extra | L10 signature (`engine.ts:599-645`) |
| --- | --- | --- | --- | --- | --- |
| jugs | 24 | 0.55 s | ×1.0 | nearest single | JUGS Overdrive: ×2.2 every 9 s |
| sled | 14 | 1.1 s | ×1.35 | nearest single | Pancake Block: within 9 → knockback 11, slow 1.8 s, ×1.4, every 8 s |
| ref | 30 | 0.9 s | ×1.0 | nearest single; **sets** `slowT = 2.2` (overwrites) | Booth Review: everyone in range slow 2.2 s (extend) + ×0.6, every 11 s |
| tshirt | 20 | 1.15 s | ×0.7 | everyone within 7 of the nearest runner; slow 1.5 s (extend) | T-Shirt Storm: radius 12, ×0.9, slow 2 s, every 10 s |
| cooler | 22 | 2.6 s | ×1.0 | nearest single + puddle r 7 for 3.5 s; inside → `slowT ≥ 0.3` each tick | Flood Zone: puddle r 13 for 5 s, every 10 s |

Slow rule (`engine.ts:304`): one `slowT` timer per attacker, speed ×0.55 while it runs. Slows never
stack in magnitude; durations extend via `max` — except the Ref's basic flag, which assigns 2.2 and can
shorten a longer stall (crowd pulse, Timeout). Sprint (×1.7) and Blitz (×1.5) multiply with it.
Signatures search `range × 1.25`. Unrelated but worth knowing: the Rehab Center and Scouting Dept are
`kind: 'defense'` in the layout with a hash-picked flavor (`engine.ts:73-76, 93`).

### Equipment prose audit — `DEFENSE_TYPES.desc` left unchanged (`constants.ts:270-274`)

| kind / shipped text | verdict | corrected wording (also `behaviour.correctedDescription`) |
| --- | --- | --- |
| jugs — "Rapid-fire football launcher" | Accurate. | "Rapid-fire football launcher: hits the nearest runner every 0.55 s for full damage. Range 24." |
| sled — "Short range, hits like a truck (+35%)" | Accurate. | "Short range, hits like a truck: the nearest runner takes 135% damage every 1.1 s. Range 14." |
| ref — "Penalty flags SLOW runners, longest range" | Overstated: one runner per flag (only the L10 signature flags everyone); the flag resets the slow timer to 2.2 s. | "Penalty flags: the nearest runner takes full damage and runs at 55% speed for 2.2 s, every 0.9 s. One runner per flag; the flag resets the runner's slow timer to 2.2 s. Longest range (30)." |
| tshirt — "Splash — blasts the whole cluster" | Incomplete: splash is 70% damage (not full) and also slows 1.5 s; radius 7 around the nearest runner. | "Splash: every runner within 7 units of the nearest one takes 70% damage and is slowed to 55% speed for 1.5 s, every 1.15 s. Range 20." |
| cooler — "Soaks the turf — puddle zones SLOW everyone crossing" | Incomplete: also a full direct hit on the nearest runner; puddle r 7 for 3.5 s; slow lingers ~0.3 s after leaving; slowest cadence (2.6 s). | "Lobs a cooler every 2.6 s: the nearest runner takes full damage and a 7-unit puddle soaks the turf for 3.5 s — every attacker inside it runs at 55% speed (the slow ends about 0.3 s after they leave). Range 22." |

## Not changed / out of scope
- No edits to `App.tsx`, `components/*`, `battle.ts`, `constants.ts`, `fixedBase.ts`,
  `game/combat/*`, `server/*`, `supabase/*`, or any rule helper.
- `HERO_DEFS.abilityDesc`, `HERO_PLAYBOOK`, `DEFENSE_TYPES.desc` and the engine's qb/kicker range
  override are reported, not fixed — the corrected text above is for Codex to adopt in the UI layer.
