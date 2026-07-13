// Headless balance harness — runs the REAL game math (battle/campaign/gacha/economy)
// across player-progression tiers. Bundled with esbuild, run in node.
//
// Doubles as a CI GUARD: after printing the report it asserts the measured curves
// against the BALANCE.md targets and exits non-zero on regression, so a stray tweak to
// campaign/battle/gacha/economy constants can't silently break the game's math.
//
// RNG is SEEDED (mulberry32) so raid-target selection and the gacha Monte Carlo are
// reproducible run-to-run — assertions can be tight and CI never flakes.
const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(0x1234abcd);

import {
  TROOP_STATS, HERO_DEFS, heroForBattle, heroUpgradeCost, heroLevelMult, heroStarMult,
  nearestBuilding, nearestTroop, blockingWall, dist, BATTLE_SECONDS,
  BattleBuildingDef, BBuilding, BTroop, generateRaidTargets, defenseLayoutFromBase, defenseAiTroops, raidAiMult, simulateRaid,
} from './battle';
import { CAMPAIGN_STAGES, campaignBase } from './campaign';
import { UnitGroup, BuildingType } from './types';
import { rollHero } from './gacha';
import { UPGRADE_CONFIG, RECRUIT_CONFIG, DRILLS, COLLECTOR_CONFIG } from './constants';

// ---------- player progression tiers (the model under test) ----------
interface Tier { name: string; ovr: number; roster: number; heroLvl: number; stars: number; heroesOwned: number; walls: number; }
const TIERS: Tier[] = [
  { name: 'T0 fresh ', ovr: 10, roster: 10, heroLvl: 1,  stars: 1, heroesOwned: 5, walls: 8 },
  { name: 'T1 early ', ovr: 15, roster: 12, heroLvl: 3,  stars: 1, heroesOwned: 5, walls: 10 },
  { name: 'T2 mid   ', ovr: 22, roster: 14, heroLvl: 6,  stars: 2, heroesOwned: 6, walls: 12 },
  { name: 'T3 strong', ovr: 32, roster: 16, heroLvl: 10, stars: 3, heroesOwned: 8, walls: 16 },
  { name: 'T4 maxed ', ovr: 42, roster: 18, heroLvl: 15, stars: 5, heroesOwned: 9, walls: 20 },
];

// ---------- army builder (mirrors armyFromRoster + heroesForBattle) ----------
let uid = 0;
const ringPos = (i: number, n: number) => ({ x: 50 + Math.cos((i / n) * Math.PI * 2) * 44, y: 50 + Math.sin((i / n) * Math.PI * 2) * 44 });
const buildArmy = (t: Tier): BTroop[] => {
  const mult = Math.max(1, Math.min(4.5, (t.ovr / 10) * 1.05)); // incl. avg tendency bonus
  const troops: BTroop[] = [];
  const groups = [UnitGroup.OFFENSE_LINE, UnitGroup.OFFENSE_SKILL, UnitGroup.DEFENSE_LINE, UnitGroup.DEFENSE_SECONDARY];
  for (let i = 0; i < t.roster; i++) {
    const g = groups[i % 4];
    const st = TROOP_STATS[g];
    const p = ringPos(i, t.roster + t.heroesOwned);
    troops.push({ id: `t${++uid}`, unit: g, x: p.x, y: p.y, hp: Math.round(st.hp * mult), maxHp: 1, dps: st.dps * mult, speed: st.speed, range: st.range, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0 });
  }
  HERO_DEFS.slice(0, t.heroesOwned).forEach((def, k) => {
    const h = heroForBattle(def, t.heroLvl, t.stars);
    const p = ringPos(t.roster + k, t.roster + t.heroesOwned);
    troops.push({ id: `h${++uid}`, unit: h.unit, x: p.x, y: p.y, hp: h.hp, maxHp: 1, dps: h.dps, speed: h.speed, range: h.range, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0 });
  });
  return troops.map(tr => ({ ...tr, maxHp: tr.hp }));
};

// ---------- battle sim (same loop as simulateRaid, but takes prebuilt troops incl. heroes) ----------
const simBattle = (defs: BattleBuildingDef[], troopsIn: BTroop[]) => {
  const buildings: BBuilding[] = defs.map(b => ({ ...b, maxHp: b.hp, dead: false, cooldown: 0 }));
  const troops = troopsIn.map(t => ({ ...t }));
  const total = buildings.filter(b => b.kind !== 'wall').length || 1;
  const DT = 0.1;
  for (let time = 0; time < BATTLE_SECONDS; time += DT) {
    for (const tr of troops) {
      if (tr.dead) continue;
      const goal = nearestBuilding(tr.x, tr.y, buildings);
      if (!goal) continue;
      const wall = blockingWall(tr.x, tr.y, tr.range, goal, buildings);
      const target = wall || goal;
      const d = dist(tr.x, tr.y, target.x, target.y);
      const stopAt = tr.range + target.size * 0.5;
      if (d > stopAt) { const step = Math.min(tr.speed * DT, d - stopAt); tr.x += ((target.x - tr.x) / d) * step; tr.y += ((target.y - tr.y) / d) * step; }
      else { target.hp -= tr.dps * DT; if (target.hp <= 0) { target.hp = 0; target.dead = true; } }
    }
    for (const b of buildings) {
      if (b.dead || b.kind !== 'defense' || !b.damage || !b.range) continue;
      b.cooldown -= DT;
      if (b.cooldown <= 0) {
        const prey = nearestTroop(b.x, b.y, troops, b.range);
        if (prey) { prey.hp -= b.damage; if (prey.hp <= 0) { prey.hp = 0; prey.dead = true; } b.cooldown = 0.7; } else b.cooldown = 0.1;
      }
    }
    if (buildings.filter(b => b.kind !== 'wall').every(b => b.dead) || !troops.some(tr => !tr.dead)) break;
  }
  const destroyed = buildings.filter(b => b.dead && b.kind !== 'wall').length;
  const pct = Math.round((destroyed / total) * 100);
  const hqDead = buildings.find(b => b.kind === 'hq')?.dead ?? false;
  return { pct, stars: (pct >= 50 ? 1 : 0) + (hqDead ? 1 : 0) + (pct >= 99 ? 1 : 0) };
};

// ---------- 1. CAMPAIGN LADDER ----------
console.log('\n===== 1. CAMPAIGN — % destroyed (stars) per tier per stage =====');
console.log('stage'.padEnd(22) + TIERS.map(t => t.name).join(' '));
for (const st of CAMPAIGN_STAGES) {
  const base = campaignBase(st.stage);
  const row = TIERS.map(t => { const r = simBattle(base.buildings, buildArmy(t)); return `${String(r.pct).padStart(3)}%(${r.stars})`.padEnd(9); }).join(' ');
  console.log(`${st.stage}. ${st.name}`.padEnd(22).slice(0, 22) + row);
}

// ---------- 2. RAID LADDER (matchmaking difficulty vs tier) ----------
console.log('\n===== 2. RAIDS — avg % destroyed / win rate over 400 random targets at tier-typical trophies =====');
const TIER_TROPHIES = [0, 150, 450, 1000, 1800];
// 400 samples/tier (not 40): the CI assertion needs the win rate to CONVERGE near its
// true mean so the band is a stable signal, not a coin-flip on the seed.
const RAID_SAMPLES = 400;
const raidWinPct: number[] = [];
TIERS.forEach((t, i) => {
  let wins = 0, pctSum = 0, starsSum = 0;
  for (let k = 0; k < RAID_SAMPLES; k++) {
    const target = generateRaidTargets(TIER_TROPHIES[i])[Math.floor(Math.random() * 3)];
    const r = simBattle(target.buildings, buildArmy(t));
    pctSum += r.pct; starsSum += r.stars; if (r.stars > 0) wins++;
  }
  raidWinPct[i] = Math.round(wins / RAID_SAMPLES * 100);
  console.log(`${t.name} @${String(TIER_TROPHIES[i]).padStart(4)}🏆: win ${raidWinPct[i]}%  avg ${Math.round(pctSum / RAID_SAMPLES)}%  avg⭐ ${(starsSum / RAID_SAMPLES).toFixed(1)}`);
});

// ---------- 3. DEFENSE (offline raids) with tendency boost ----------
console.log('\n===== 3. DEFENSE — offline raid vs own-tier attacker (off=65), stars conceded =====');
const mkBase = (lvl: number, walls: number) => {
  const cells = [[5,5],[6,5],[7,5],[7,6],[7,7],[6,7],[5,7],[5,6],[4,4],[6,4],[8,4],[8,6],[8,8],[6,8],[4,8],[4,6],[5,4],[7,4],[8,5],[8,7]];
  const bs: any[] = [
    { id: 'stadium-1', type: BuildingType.STADIUM, level: lvl, gridX: 6, gridY: 6 },
    { id: 'pitch-1', type: BuildingType.TRAINING_PITCH, level: lvl, gridX: 2, gridY: 2 },
    { id: 'academy-1', type: BuildingType.YOUTH_ACADEMY, level: lvl, gridX: 6, gridY: 2 },
    { id: 'med-1', type: BuildingType.MEDICAL_CENTER, level: lvl, gridX: 3, gridY: 5 },
    { id: 'tactics-1', type: BuildingType.TACTICS_ROOM, level: lvl, gridX: 3, gridY: 8 },
  ];
  return defenseLayoutFromBase(bs, cells.slice(0, walls).map(([gridX, gridY]) => ({ gridX, gridY })), 1.15); // avg tendency defBoost
};
const TIER_LVL = [1, 3, 5, 8, 11];
TIERS.forEach((t, i) => {
  const layout = mkBase(TIER_LVL[i], t.walls);
  const r = simulateRaid(layout, defenseAiTroops(), raidAiMult(65, TIER_LVL[i]));
  console.log(`${t.name} (bldg L${TIER_LVL[i]}, ${t.walls} walls): attacker got ${r.pct}% / ${r.stars}⭐ ${r.stars === 0 ? '→ HELD' : ''}`);
});

// ---------- 4. GACHA ECONOMICS (Monte Carlo) ----------
console.log('\n===== 4. GACHA — Monte Carlo (2000 runs) =====');
let medRollsToAll = 0, medRollsToLegend = 0;
{
  let rollsToAll: number[] = [], rollsToLegend: number[] = [];
  for (let run = 0; run < 2000; run++) {
    const heroes = HERO_DEFS.map(d => ({ key: d.key, level: 1, unlocked: !!d.starter, stars: 1, shards: 0 }));
    let rolls = 0, gotLegend = 0, gotAll = 0;
    while (rolls < 400 && !(gotAll && gotLegend)) {
      rolls++;
      const res = rollHero(heroes as any);
      const h = heroes.find(x => x.key === res.key)!;
      if (res.isNew) h.unlocked = true; else h.shards += res.shards;
      if (!gotLegend && heroes.find(x => x.key === 'legend')!.unlocked) gotLegend = rolls;
      if (!gotAll && heroes.every(x => x.unlocked)) gotAll = rolls;
    }
    rollsToAll.push(gotAll || 400); rollsToLegend.push(gotLegend || 400);
  }
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  medRollsToAll = med(rollsToAll);
  medRollsToLegend = med(rollsToLegend);
  console.log(`median rolls to unlock ALL heroes: ${medRollsToAll}  (=${medRollsToAll * 25} gems)`);
  console.log(`median rolls to hit The Legend:    ${medRollsToLegend}  (=${medRollsToLegend * 25} gems; direct-buy = 120)`);
  // shard flow: avg shards per duplicate roll ≈ 13; cost 1→5★ = 25+50+90+140 = 305
  console.log(`shards needed 1★→5★ per hero: 305 (≈${Math.ceil(305 / 13)} duplicate pulls of THAT hero)`);
}

// ---------- 5. ECONOMY THROUGHPUT (closed-form) ----------
console.log('\n===== 5. ECONOMY =====');
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
  console.log(`gems/day F2P ≈ dailies 15-23 + raids ~20-40 → ~40-60/day → rolls/day ≈ 1.6-2.4 · Legend direct (120) ≈ 2-3 days`);
  const starGain = (heroStarMult(5) / heroStarMult(1) - 1) * 100;
  const lvlGain = (heroLevelMult(15) / heroLevelMult(10) - 1) * 100;
  console.log(`power: 5★ vs 1★ = +${Math.round(starGain)}% · hero L10→15 = +${Math.round(lvlGain)}% for ${Math.round(heroTo15 - heroTo10).toLocaleString()} coins`);
}
console.log('');

// ---------- 6. ASSERTIONS (CI GUARD) ----------
// Bands are wider than the exact tuned values so ordinary tuning passes, but a curve
// that drifts out of its BALANCE.md target range fails the build. Ranges — not equality —
// because the intent ("raids are winnable but not trivial at your own tier") is a band,
// not a magic number. If you INTEND to move a target, update BALANCE.md and the band here.
console.log('===== 6. ASSERTIONS (vs BALANCE.md targets) =====');
const failures: string[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!ok) failures.push(`${name}: ${detail}`);
};

// Campaign is deterministic (no RNG): the final boss must demand active play at T4 but
// never be a walkover, and must wall a fresh (T0) roster well before the endgame.
const champ = CAMPAIGN_STAGES[CAMPAIGN_STAGES.length - 1];
const champBase = campaignBase(champ.stage);
const champT4 = simBattle(champBase.buildings, buildArmy(TIERS[4])).pct;
const champT0 = simBattle(champBase.buildings, buildArmy(TIERS[0])).pct;
check('Championship demands actives at T4', champT4 >= 30 && champT4 <= 62, `s${champ.stage} T4 sim = ${champT4}% (target ~46%, band 30–62)`);
check('Championship walls a fresh roster', champT0 <= 40, `s${champ.stage} T0 sim = ${champT0}% (must be far from a clear)`);

// Raid ladder: generous onboarding, biting-but-winnable at the top. NOTE the bands are
// on the CONSERVATIVE sim (no plays/mascot/hero abilities) — BALANCE.md notes real play
// runs +25–40% above sim, so a ~46% sim win rate at T3 ≈ ~60% live. The band's job is to
// catch DRIFT from today's baseline (T0 100, T3 46, T4 67), not to enforce the live target.
check('Onboarding raids are generous (T0)', raidWinPct[0] >= 80, `T0 win ${raidWinPct[0]}% (baseline 100)`);
check('Endgame raids winnable-not-trivial (T3)', raidWinPct[3] >= 40 && raidWinPct[3] <= 85, `T3 win ${raidWinPct[3]}% (sim baseline 46, band 40–85)`);
check('Endgame raids winnable-not-trivial (T4)', raidWinPct[4] >= 40 && raidWinPct[4] <= 85, `T4 win ${raidWinPct[4]}% (sim baseline 67, band 40–85)`);

// Economy: all buildings to L5 stays a focused-session goal, not a grind wall.
check('All-L5 is a focused session', hoursToAllL5 >= 1.5 && hoursToAllL5 <= 6, `${hoursToAllL5.toFixed(1)}h (target 3–5, band 1.5–6)`);
// One hero to L15 stays the long-term coin sink.
check('Hero L15 is a real coin sink', heroTo15Coins >= 350_000 && heroTo15Coins <= 700_000, `${Math.round(heroTo15Coins).toLocaleString()} coins (target ~503k)`);

// Gacha: direct-buying The Legend (120👑) must stay the smart path vs chasing it in rolls.
check('Legend direct-buy beats rolling for it', medRollsToLegend * 20 > 200, `median ${medRollsToLegend} rolls ≈ ${medRollsToLegend * 20}👑 vs 120 direct`);

if (failures.length) {
  console.error(`\n❌ BALANCE REGRESSION — ${failures.length} target(s) out of band:\n  - ${failures.join('\n  - ')}\n`);
  process.exit(1);
}
console.log('\n✅ All balance targets within band.\n');
