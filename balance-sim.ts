// Shared-engine balance harness. Combat goes through the same command validation,
// fixed-step simulation and outcome calculation as live play and v2 replays.
// This deterministic bot is a regression scenario, not a prediction of human win rate.
// See docs/BALANCE-SHARED-ENGINE.md for the policy and retired calibration bands.
import {
  HERO_DEFS, heroesForBattle, heroUpgradeCost, heroLevelMult, heroStarMult,
  BATTLE_SECONDS, generateRaidTargets, defenseAiTroops, raidAiMult, homeDefenders,
  effectiveStat, unitCombatStats, armyFromRoster, UNIT_ORDER, mulberry32,
  gauntletReward, gauntletWaves, GAUNTLET_MAX_TIER,
  type BattleBuildingDef, type RaidHero, type ReplayAction,
} from './battle';
import { CAMPAIGN_STAGES, campaignBase } from './campaign';
import { BuildingType, PlayerRarity, PlayerRole, type Player } from './types';
import { rollHero, ROLL_COST_GEMS, STAR_UP_COSTS } from './gacha';
import { UPGRADE_CONFIG, DRILLS, COLLECTOR_CONFIG, ROLE_UNIT, INITIAL_ROSTER, INITIAL_BUILDINGS, tendencyFromId } from './constants';
import { createBattleEngine, replayMatch, COMBAT_STEP_SECONDS, type BattleEngine } from './game/combat/engine';
import { COMBAT_RULES_VERSION } from './game/combat/actions';
import { rosterPreparation } from './game/combat/roster';
import { layoutFromFixedBase } from './game/defenseLayout';
import { anchorsFor, gatePostsFor, slotsFor, slotUnlocked, MAX_SLOT_LEVEL } from './fixedBase';
import type { BattleConfig, BattleResult } from './game/combat/contracts';

const RAID_SAMPLES = Number(process.env.FHQ_BALANCE_SAMPLES ?? 30);
if (!Number.isInteger(RAID_SAMPLES) || RAID_SAMPLES < 3 || RAID_SAMPLES > 400) throw new Error('FHQ_BALANCE_SAMPLES must be an integer from 3 to 400');
const LEGEND_PRICE = HERO_DEFS.find(h => h.key === 'legend')!.unlock!.gems!;
const SHARDS_TO_MAX = Object.values(STAR_UP_COSTS).reduce((sum, amount) => sum + amount, 0);
const MATCH_SEED = 0x1234abcd;
const MAX_TICKS = Math.ceil((BATTLE_SECONDS + 10) / COMBAT_STEP_SECONDS);
const failures: string[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!ok) failures.push(`${name}: ${detail}`);
};
const seeded = <T,>(seed: number, run: () => T): T => {
  const previous = Math.random;
  Math.random = mulberry32(seed);
  try { return run(); } finally { Math.random = previous; }
};

// Historical training/roster/hero milestones retained as synthetic scenarios.
// Every individual keeps a real role, rarity and tendency. Level is held at one so
// trained stats do not accidentally count progression twice. T0 is INITIAL_ROSTER.
interface Tier { name: string; ovr: number; roster: number; heroLvl: number; stars: number; heroesOwned: number; stadium: number; }
const TIERS: Tier[] = [
  { name: 'T0 fresh ', ovr: 10, roster: 10, heroLvl: 1,  stars: 1, heroesOwned: 5, stadium: 1 },
  { name: 'T1 early ', ovr: 15, roster: 12, heroLvl: 3,  stars: 1, heroesOwned: 5, stadium: 3 },
  { name: 'T2 mid   ', ovr: 22, roster: 14, heroLvl: 6,  stars: 2, heroesOwned: 6, stadium: 5 },
  { name: 'T3 strong', ovr: 32, roster: 16, heroLvl: 10, stars: 3, heroesOwned: 8, stadium: 8 },
  { name: 'T4 maxed ', ovr: 42, roster: 18, heroLvl: 15, stars: 5, heroesOwned: 9, stadium: 11 },
];
const buildRoster = (tier: Tier): Player[] => Array.from({ length: tier.roster }, (_, index) => {
  const source = INITIAL_ROSTER[index % INITIAL_ROSTER.length];
  const id = index < INITIAL_ROSTER.length ? source.id : `recruit-${String(index).padStart(2, '0')}`;
  return { ...structuredClone(source), id, name: index < INITIAL_ROSTER.length ? source.name : `Balance recruit ${index + 1}`,
    tendency: index < INITIAL_ROSTER.length ? source.tendency : tendencyFromId(id),
    stats: { strength: tier.ovr, speed: tier.ovr, iq: tier.ovr } };
});
const buildHeroes = (tier: Tier): RaidHero[] => heroesForBattle(HERO_DEFS.map((hero, index) => ({
  key: hero.key, unlocked: index < tier.heroesOwned, level: tier.heroLvl, stars: tier.stars,
})));
const attackConfig = (buildings: BattleBuildingDef[], squad: Player[], heroes: RaidHero[] = []): BattleConfig => ({
  mode: 'attack', title: 'Shared-engine balance scenario', buildings, squad, heroes,
  playerArmy: armyFromRoster(squad), preparation: rosterPreparation(squad), specials: [],
  loot: { coins: 0, fans: 0 },
});
const tierConfig = (buildings: BattleBuildingDef[], tier: Tier) => attackConfig(buildings, buildRoster(tier), buildHeroes(tier));

// Fixed square-edge candidate positions, independent of total roster size. The
// engine still validates every deployment. Refused positions are tried clockwise;
// no state mutation or inside-building placement can bypass the live command gate.
const edgePoint = (index: number) => {
  const n = ((index % 32) + 32) % 32, along = 3 + (n % 8) * 94 / 8;
  if (n < 8) return { x: along, y: 3 };
  if (n < 16) return { x: 97, y: along };
  if (n < 24) return { x: 100 - along, y: 97 };
  return { x: 3, y: 100 - along };
};
const stableIndex = (id: string) => [...id].reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0, 0) % 32;
const deploy = (engine: BattleEngine, action: ReplayAction, id: string) => {
  for (let offset = 0; offset < 32; offset++) {
    if (engine.command({ ...action, tick: engine.state.ticks, ...edgePoint(stableIndex(id) + offset) })) return;
  }
  throw new Error(`No legal perimeter deployment for ${id}`);
};
interface Scenario { result: BattleResult; engine: BattleEngine; signatures: number; }
let matchesRun = 0;
const invalidOutcomes: string[] = [];
const simBattle = (config: BattleConfig, seed = MATCH_SEED): Scenario => {
  const engine = createBattleEngine(config, seed, 'balanced');
  if (config.mode === 'attack') {
    // Match the engine's stable within-group queue so player identity determines
    // its landing position even when more recruits join a later tier.
    for (const unit of UNIT_ORDER) for (const player of [...(config.squad ?? [])].filter(p => p.unit === unit).sort((a, b) => a.id.localeCompare(b.id))) {
      deploy(engine, { k: 't', u: unit, tick: 0 }, player.id);
    }
    for (const hero of config.heroes ?? []) deploy(engine, { k: 'h', key: hero.key, tick: 0 }, `hero:${hero.key}`);
  }
  let signatures = 0;
  for (let tick = 0; tick < MAX_TICKS && !engine.state.ended; tick++) {
    // Transparent bot policy: request each ready signature every 0.5 simulation
    // seconds, including kickoff. No targeting foresight, extra plays or reserves.
    if (engine.state.ticks % 10 === 0 && config.mode === 'attack') {
      for (const hero of config.heroes ?? []) {
        const actor = engine.state.troops.find(t => t.heroKey === hero.key);
        if (actor && !actor.dead && !actor.activeAction && (actor.abilityCd ?? 0) <= 0 && engine.command({ k: 'a', key: hero.key, tick: engine.state.ticks })) signatures++;
      }
    }
    engine.advance();
    engine.drainAudio(); // the headless presenter consumes its queue, just like live
  }
  if (!engine.result) throw new Error(`Battle did not terminate within ${MAX_TICKS} fixed steps: ${config.title}`);
  const result = engine.result;
  const valid = Number.isInteger(result.pct) && result.pct >= 0 && result.pct <= 100 &&
    Number.isInteger(result.stars) && result.stars >= 0 && result.stars <= 3 &&
    Number.isFinite(result.coins) && result.coins >= 0 && Number.isFinite(result.fans) && result.fans >= 0 &&
    [...engine.state.troops, ...engine.state.guards, ...engine.state.buildings].every(actor =>
      [actor.x, actor.y, actor.hp, actor.maxHp].every(Number.isFinite) && actor.hp >= 0 && actor.hp <= actor.maxHp + 1e-6);
  matchesRun++;
  if (!valid) invalidOutcomes.push(`${config.title}: seed ${seed}, hash ${engine.hash}`);
  return { result, engine, signatures };
};

console.log(`\nShared combat rules: ${COMBAT_RULES_VERSION}. ${RAID_SAMPLES} reproducible raid targets per tier.`);
console.log('Policy: all roster/hero deployments at kickoff, legal square edge, Balanced plan, ready signatures every 0.5s. No specials, manual plays or full-readiness boost.');
console.log('Historical BALANCE.md combat percentages used a different loop and no hero signatures. They are not acceptance bands for this report.');

// ---------- 1. CAMPAIGN LADDER ----------
console.log('\n===== 1. CAMPAIGN — damage-weighted House Taken % (Game Balls) =====');
console.log('stage'.padEnd(22) + TIERS.map(t => t.name).join(' '));
const campaignResults: Scenario[][] = CAMPAIGN_STAGES.map(stage => {
  const row = TIERS.map(tier => simBattle(tierConfig(campaignBase(stage.stage).buildings, tier)));
  console.log(`${stage.stage}. ${stage.name}`.padEnd(22).slice(0, 22) + row.map(({ result }) => `${String(result.pct).padStart(3)}%(${result.stars})`.padEnd(9)).join(' '));
  return row;
});

// ---------- 2. RAID LADDER ----------
console.log(`\n===== 2. RAIDS — deterministic bot, ${RAID_SAMPLES} targets per tier =====`);
const TIER_TROPHIES = [0, 150, 450, 1000, 1800];
const raidWinPct: number[] = [];
const raidChoiceResults: { samples: number; wins: number; pct: number }[][] = [];
TIERS.forEach((tier, i) => {
  let wins = 0, pctSum = 0, ballsSum = 0, signatures = 0;
  const choices = Array.from({ length: 3 }, () => ({ samples: 0, wins: 0, pct: 0 }));
  for (let sample = 0; sample < RAID_SAMPLES; sample++) {
    // Target generation is isolated from combat FX, gacha and sample count.
    const seed = (MATCH_SEED + sample * 977) >>> 0;
    const target = seeded(seed, () => generateRaidTargets(TIER_TROPHIES[i])[sample % 3]);
    const match = simBattle(tierConfig(target.buildings, tier), seed);
    pctSum += match.result.pct; ballsSum += match.result.stars; signatures += match.signatures;
    choices[sample % 3].samples++;
    choices[sample % 3].pct += match.result.pct;
    if (match.result.won) choices[sample % 3].wins++;
    if (match.result.won) wins++;
  }
  raidWinPct[i] = wins / RAID_SAMPLES * 100;
  raidChoiceResults[i] = choices;
  console.log(`${tier.name} @${String(TIER_TROPHIES[i]).padStart(4)} trophies: ${wins}/${RAID_SAMPLES} wins (${raidWinPct[i].toFixed(1)}%), avg ${Math.round(pctSum / RAID_SAMPLES)}% House Taken, ${(ballsSum / RAID_SAMPLES).toFixed(1)} Game Balls, ${(signatures / RAID_SAMPLES).toFixed(1)} signatures`);
  console.log('  ' + choices.map((choice, index) => `${['easy', 'fair', 'hard'][index]}: ${choice.wins}/${choice.samples} wins, avg ${choice.samples ? Math.round(choice.pct / choice.samples) : 'n/a'}%`).join(' · '));
});

// ---------- 3. DEFENSE — current fixed-base fixture ----------
console.log('\n===== 3. DEFENSE — shared engine, Goal Line, purchased available base slots =====');
TIERS.forEach(tier => {
  const squad = buildRoster(tier), formation = 'goalline' as const;
  const buildings = INITIAL_BUILDINGS.map(b => ({ ...b, level: tier.stadium, ...anchorsFor(formation)[b.type] }));
  const slots = Object.fromEntries(slotsFor(formation).filter(slot => slotUnlocked(slot, tier.stadium, 0)).map(slot => [slot.id, Math.min(MAX_SLOT_LEVEL, tier.stadium)]));
  const layout = layoutFromFixedBase(buildings, squad, slots, 0, formation);
  const pool = buildHeroes(tier).sort((a, b) => b.hp * b.dps - a.hp * a.dps);
  const heroGuards = gatePostsFor(formation).map((post, i) => ({
    jersey: 0, hp: Math.round(pool[i].hp * .75), dps: Math.round(pool[i].dps * .75 * 10) / 10,
    name: pool[i].name, art: pool[i].art, unit: pool[i].unit, x: post.gridX * 10 + 5, y: post.gridY * 10 + 5,
  }));
  const { result } = simBattle({ mode: 'defense', title: `${tier.name} defense`, buildings: layout,
    preTroops: defenseAiTroops(), aiMult: raidAiMult(65, tier.stadium),
    homeGuards: [...homeDefenders(squad), ...heroGuards], fans: 0, parkingLot: 0, masteryTier: 0, loot: { coins: 0, fans: 0 },
  });
  console.log(`${tier.name} (facilities L${tier.stadium}, ${Object.keys(slots).length} emplacements, ${layout.filter(b => b.kind === 'wall').length} walls): ${result.pct}% House Taken, ${result.stars} Game Balls conceded — ${result.won ? 'HELD' : 'STORMED'}`);
});

// ---------- 4. GACHA ECONOMICS (Monte Carlo) ----------
console.log('\n===== 4. GACHA — Monte Carlo (2000 runs) =====');
let medRollsToAll = 0, medRollsToLegend = 0;
{
  const rollsToAll: number[] = [], rollsToLegend: number[] = [];
  const restoreRandom = Math.random;
  Math.random = mulberry32(0x40ca40ca);
  try {
  for (let run = 0; run < 2000; run++) {
    const heroes = HERO_DEFS.map(d => ({ key: d.key, level: 1, unlocked: !!d.starter, stars: 1, shards: 0 }));
    let rolls = 0, gotLegend = 0, gotAll = 0;
    while (rolls < 400 && !(gotAll && gotLegend)) {
      rolls++;
      const res = rollHero(heroes);
      const h = heroes.find(x => x.key === res.key)!;
      if (res.isNew) h.unlocked = true; else h.shards += res.shards;
      if (!gotLegend && heroes.find(x => x.key === 'legend')!.unlocked) gotLegend = rolls;
      if (!gotAll && heroes.every(x => x.unlocked)) gotAll = rolls;
    }
    rollsToAll.push(gotAll || 400); rollsToLegend.push(gotLegend || 400);
  }
  } finally { Math.random = restoreRandom; }
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  medRollsToAll = med(rollsToAll);
  medRollsToLegend = med(rollsToLegend);
  console.log(`median rolls to unlock ALL heroes: ${medRollsToAll}  (=${medRollsToAll * ROLL_COST_GEMS} gems)`);
  console.log(`median rolls to hit The Legend:    ${medRollsToLegend}  (=${medRollsToLegend * ROLL_COST_GEMS} gems; direct-buy = ${LEGEND_PRICE})`);
  // Closed-form shard flow uses the current 14–22 duplicate award range.
  console.log(`shards needed 1★→5★ per hero: ${SHARDS_TO_MAX} (≈${Math.ceil(SHARDS_TO_MAX / 18)} average duplicate pulls of THAT hero at 14–22 shards per duplicate)`);
}

// ---------- 5. ECONOMY THROUGHPUT (closed-form) ----------
console.log('\n===== 5. ECONOMY — legacy income scenario, current costs =====');
console.log('Income assumptions: continuous drills, L3 Stadium, 12 road games/hour at 550 Coins each. These are scenarios, not measured player earnings.');
let hoursToAllL5 = 0, heroTo15Coins = 0;
{
  const upCost = (l: number) => Math.floor(UPGRADE_CONFIG.baseCost * Math.pow(UPGRADE_CONFIG.costMultiplier, l - 1));
  const toL5 = (upCost(1) + upCost(2) + upCost(3) + upCost(4)) * 5;
  const drill = DRILLS['sled_push'];
  const drillsPerHr = Math.min(3600 / drill.durationSeconds, (100 + 7.5 * 60) / drill.costEnergy); // energy-bound at L1 regen
  const activeCoinsHr = drillsPerHr * drill.rewardCoins + (COLLECTOR_CONFIG[BuildingType.STADIUM]!.ratePerSecPerLevel * 3600) * 3; // drills + stadium L3-ish
  const raidCoinsHr = 12 * 550; // ~12 raids/hr at ~550 avg loot
  hoursToAllL5 = toL5 / (activeCoinsHr + raidCoinsHr);
  console.log(`all 5 buildings L1→L5 cost: ${toL5.toLocaleString()} coins`);
  console.log(`active income ≈ ${Math.round(activeCoinsHr).toLocaleString()}/hr (drills+stadium) + ${raidCoinsHr.toLocaleString()}/hr raiding → ~${hoursToAllL5.toFixed(1)}h to all-L5`);
  const heroTo10 = Array.from({ length: 9 }, (_, i) => heroUpgradeCost(i + 1)).reduce((a, b) => a + b, 0);
  const heroTo15 = Array.from({ length: 14 }, (_, i) => heroUpgradeCost(i + 1)).reduce((a, b) => a + b, 0);
  heroTo15Coins = heroTo15;
  console.log(`ONE hero L1→10: ${Math.round(heroTo10).toLocaleString()} coins · L1→15: ${Math.round(heroTo15).toLocaleString()} coins · ×9 heroes L15 = ${Math.round(heroTo15 * 9).toLocaleString()}`);
  console.log(`Historical income scenario: 40–60 Crowns/day → ${(40 / ROLL_COST_GEMS).toFixed(1)}–${(60 / ROLL_COST_GEMS).toFixed(1)} Scout Searches/day; actual play/collection cadence is not modeled.`);
  const starGain = (heroStarMult(5) / heroStarMult(1) - 1) * 100;
  const lvlGain = (heroLevelMult(15) / heroLevelMult(10) - 1) * 100;
  console.log(`power: 5★ vs 1★ = +${Math.round(starGain)}% · hero L10→15 = +${Math.round(lvlGain)}% for ${Math.round(heroTo15 - heroTo10).toLocaleString()} coins`);
  const gClearCoins = (t: number) => gauntletReward(t, 5, true).coins;
  console.log(`Gauntlet full-clear purse: night-1 ${gClearCoins(1).toLocaleString()} · night-5 ${gClearCoins(5).toLocaleString()} · night-10 ${gClearCoins(10).toLocaleString()} · night-${GAUNTLET_MAX_TIER} ${gClearCoins(GAUNTLET_MAX_TIER).toLocaleString()} coins`);
}
// ---------- 6. RARITY & ROLE SCENARIOS ----------
console.log('\n===== 6. RARITY & ROLES — production statlines and shared matches =====');
const rb = (rarity: PlayerRarity) => ({ role: PlayerRole.RB, rarity, level: 5 });
const rarityRatio = effectiveStat(rb(PlayerRarity.EPIC), 'strength') / effectiveStat(rb(PlayerRarity.COMMON), 'strength');
console.log(`effectiveStat EPIC/COMMON (RB L5, strength): ${rarityRatio.toFixed(2)}x`);
console.log('role'.padEnd(5) + 'grit'.padStart(6) + 'yd/s'.padStart(7) + 'speed'.padStart(7) + 'range'.padStart(6));
(Object.keys(ROLE_UNIT) as PlayerRole[]).forEach(role => {
  const stats = unitCombatStats({ role, rarity: PlayerRarity.COMMON, level: 1, unit: ROLE_UNIT[role] });
  console.log(role.padEnd(5) + String(stats.hp).padStart(6) + stats.dps.toFixed(1).padStart(7) + stats.speed.toFixed(1).padStart(7) + String(stats.range).padStart(6));
});
const roles = [PlayerRole.QB, PlayerRole.OL, PlayerRole.OL, PlayerRole.RB, PlayerRole.WR, PlayerRole.WR, PlayerRole.DL, PlayerRole.CB];
const roleSquad = (rarity: PlayerRarity, positions = roles): Player[] => positions.map((role, i) => ({
  ...structuredClone(INITIAL_ROSTER[0]), id: `role-${i}`, name: `Role ${role} ${i}`, role, unit: ROLE_UNIT[role], rarity, level: 5,
}));
// Week 8 has enough resistance to avoid a 100%/100% ceiling hiding rarity drift.
const roleBase = campaignBase(8).buildings;
const common = simBattle(attackConfig(roleBase, roleSquad(PlayerRarity.COMMON))).result;
const epic = simBattle(attackConfig(roleBase, roleSquad(PlayerRarity.EPIC))).result;
console.log(`Equal L5 eight-player squad: COMMON ${common.pct}% / ${common.stars} Game Balls; EPIC ${epic.pct}% / ${epic.stars} Game Balls.`);
const withQB = simBattle(attackConfig(roleBase, roleSquad(PlayerRarity.COMMON, [PlayerRole.QB, PlayerRole.OL, PlayerRole.WR, PlayerRole.WR, PlayerRole.WR, PlayerRole.WR]))).result;
const withoutQB = simBattle(attackConfig(roleBase, roleSquad(PlayerRarity.COMMON, [PlayerRole.LB, PlayerRole.OL, PlayerRole.WR, PlayerRole.WR, PlayerRole.WR, PlayerRole.WR]))).result;
console.log(`Receiver group: with QB ${withQB.pct}% vs LB ${withoutQB.pct}%. This fixture is informational; role interactions are covered by engine tests.`);

// ---------- 7. REGRESSION GATES ----------
console.log('\n===== 7. SHARED-ENGINE REGRESSION GATES =====');
console.log('Historical combat bands (reporting only): passive T4 Championship 30–62%; passive T3/T4 raids 40–85%. Different engine, roster math and scoring: do not compare directly.');
check('Every scenario terminates with valid outcomes and actor state', invalidOutcomes.length === 0, `${matchesRun} matches; ${invalidOutcomes.join('; ') || 'finite values, bounded grit, House Taken 0–100, Game Balls 0–3'}`);
const tutorial = campaignResults[0][0];
check('Actual fresh roster can win the Preseason Opener', tutorial.result.won && tutorial.result.stars >= 1, `${tutorial.result.pct}% / ${tutorial.result.stars} Game Balls; ${tutorial.signatures} signature calls`);
check('Week 2 remains approachable and Week 4 asks for training', campaignResults[1][0].result.won && !campaignResults[3][0].result.won && campaignResults[3][1].result.won, `fresh Week 2 ${campaignResults[1][0].result.pct}%, fresh Week 4 ${campaignResults[3][0].result.pct}%, trained Week 4 ${campaignResults[3][1].result.pct}%`);
check('Championship can be fully cleared by the top progression fixture', campaignResults.at(-1)!.at(-1)!.result.stars === 3, `${campaignResults.at(-1)!.at(-1)!.result.pct}% / ${campaignResults.at(-1)!.at(-1)!.result.stars} Game Balls`);
check('Bot exercises hero signatures', campaignResults.every(row => row.every(match => match.signatures > 0)), 'accepted signature commands in every hero campaign fixture');
const campaignTotals = TIERS.map((_, index) => campaignResults.reduce((sum, row) => sum + row[index].result.pct, 0));
check('Progression does not reduce aggregate performance on identical campaign layouts', campaignTotals.every((total, index) => index === 0 || total >= campaignTotals[index - 1]), campaignTotals.map((total, index) => `${TIERS[index].name.trim()}: ${total}`).join(', '));
check('Progression produces a measurable campaign advantage', campaignTotals.at(-1)! > campaignTotals[0], `T0 total ${campaignTotals[0]} vs T4 ${campaignTotals.at(-1)} across ${CAMPAIGN_STAGES.length} stages`);
const replay = replayMatch(tutorial.engine.getReplay());
check('Tutorial recording replays to the same result and final hash', replay.matches && replay.result?.pct === tutorial.result.pct && replay.result.stars === tutorial.result.stars, `${tutorial.engine.hash} live / ${replay.hash} replay`);
check('Rarity increases derived strength at the same level', rarityRatio > 1, `${rarityRatio.toFixed(2)}x EPIC/COMMON`);
check('Higher rarity does not weaken the equal-role fixture', epic.pct >= common.pct, `${common.pct}% COMMON → ${epic.pct}% EPIC`);
check('Every trophy bracket offers a winnable easy choice', raidChoiceResults.every(choices => choices[0].wins > 0), raidChoiceResults.map((choices, i) => `${TIERS[i].name.trim()}: ${choices[0].wins}/${choices[0].samples}`).join(', '));
check('Hard picks demand more than easy picks at every tier', raidChoiceResults.every(choices => choices[2].pct / choices[2].samples < choices[0].pct / choices[0].samples), 'lower average House Taken against fortress choices than easy choices');
if (raidWinPct.some(rate => rate === 100)) console.log(`  CALIBRATION REVIEW: ${raidWinPct.filter(rate => rate === 100).length}/${TIERS.length} tiers won every sampled raid. Passing integrity gates does not establish a challenging difficulty curve.`);

// Existing economy bands remain scenario checks; they are not user-income promises.
check('All-L5 income scenario remains in its historical range', hoursToAllL5 >= 1.5 && hoursToAllL5 <= 6, `${hoursToAllL5.toFixed(1)}h under the stated assumptions (band 1.5–6)`);
check('Hero L15 remains a substantial Coin sink', heroTo15Coins >= 350_000 && heroTo15Coins <= 700_000, `${Math.round(heroTo15Coins).toLocaleString()} Coins (historical band 350k–700k)`);
check('Legend direct-buy costs less than median rolling', medRollsToLegend * ROLL_COST_GEMS > LEGEND_PRICE, `median ${medRollsToLegend} rolls × ${ROLL_COST_GEMS} = ${medRollsToLegend * ROLL_COST_GEMS} Crowns vs ${LEGEND_PRICE} direct`);
const gClear = (tier: number) => gauntletReward(tier, 5, true).coins;
const gRewardMono = Array.from({ length: GAUNTLET_MAX_TIER - 1 }, (_, i) => gClear(i + 2) > gClear(i + 1)).every(Boolean);
const gMultMono = Array.from({ length: GAUNTLET_MAX_TIER - 1 }, (_, i) => gauntletWaves(i + 2)[4].mult > gauntletWaves(i + 1)[4].mult).every(Boolean);
const gMax = gClear(GAUNTLET_MAX_TIER);
check('Gauntlet purse and ramp scale with tier', gRewardMono && gMultMono && gMax >= 15_000 && gMax <= 21_000, `night-${GAUNTLET_MAX_TIER}: ${gMax.toLocaleString()} Coins; reward/difficulty monotonic = ${gRewardMono}/${gMultMono}`);
if (failures.length) {
  console.error(`\nBALANCE REGRESSION — ${failures.length} failing gate(s):\n  - ${failures.join('\n  - ')}\n`);
  process.exitCode = 1;
} else console.log('\nShared-engine integrity, progression and retained economy gates pass. Human difficulty/retention calibration still requires playtesting.\n');
