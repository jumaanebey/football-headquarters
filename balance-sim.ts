// Headless balance harness — runs the REAL game math (battle/campaign/gacha/economy)
// across player-progression tiers. Throwaway: bundled with esbuild, run in node.
import {
  TROOP_STATS, HERO_DEFS, heroForBattle, heroUpgradeCost, heroLevelMult, heroStarMult,
  nearestBuilding, nearestTroop, blockingWall, dist, BATTLE_SECONDS,
  BattleBuildingDef, BBuilding, BTroop, generateRaidTargets, defenseLayoutFromBase, defenseAiTroops, raidAiMult, simulateRaid,
  effectiveStat, unitCombatStats, ENEMY_BASES, SimAttacker,
} from './battle';
import { CAMPAIGN_STAGES, campaignBase } from './campaign';
import { UnitGroup, BuildingType, PlayerRarity, PlayerRole } from './types';
import { rollHero } from './gacha';
import { UPGRADE_CONFIG, RECRUIT_CONFIG, DRILLS, COLLECTOR_CONFIG, ROLE_UNIT } from './constants';

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
console.log('\n===== 2. RAIDS — avg % destroyed / win rate over 40 random targets at tier-typical trophies =====');
const TIER_TROPHIES = [0, 150, 450, 1000, 1800];
TIERS.forEach((t, i) => {
  let wins = 0, pctSum = 0, starsSum = 0;
  for (let k = 0; k < 40; k++) {
    const target = generateRaidTargets(TIER_TROPHIES[i])[Math.floor(Math.random() * 3)];
    const r = simBattle(target.buildings, buildArmy(t));
    pctSum += r.pct; starsSum += r.stars; if (r.stars > 0) wins++;
  }
  console.log(`${t.name} @${String(TIER_TROPHIES[i]).padStart(4)}🏆: win ${Math.round(wins / 40 * 100)}%  avg ${Math.round(pctSum / 40)}%  avg⭐ ${(starsSum / 40).toFixed(1)}`);
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
  console.log(`median rolls to unlock ALL heroes: ${med(rollsToAll)}  (=${med(rollsToAll) * 25} gems)`);
  console.log(`median rolls to hit The Legend:    ${med(rollsToLegend)}  (=${med(rollsToLegend) * 25} gems; direct-buy = 120)`);
  // shard flow: avg shards per duplicate roll ≈ 13; cost 1→5★ = 25+50+90+140 = 305
  console.log(`shards needed 1★→5★ per hero: 305 (≈${Math.ceil(305 / 13)} duplicate pulls of THAT hero)`);
}

// ---------- 5. ECONOMY THROUGHPUT (closed-form) ----------
console.log('\n===== 5. ECONOMY =====');
{
  const upCost = (l: number) => Math.floor(UPGRADE_CONFIG.baseCost * Math.pow(UPGRADE_CONFIG.costMultiplier, l - 1));
  const toL5 = (upCost(1) + upCost(2) + upCost(3) + upCost(4)) * 5;
  const drill = DRILLS['sled_push'];
  const drillsPerHr = Math.min(3600 / drill.durationSeconds, (100 + 7.5 * 60) / drill.costEnergy); // energy-bound at L1 regen
  const activeCoinsHr = drillsPerHr * drill.rewardCoins + (COLLECTOR_CONFIG[BuildingType.STADIUM]!.ratePerSecPerLevel * 3600) * 3; // drills + stadium L3-ish
  const raidCoinsHr = 12 * 550; // ~12 raids/hr at ~550 avg loot
  console.log(`all 5 buildings L1→L5 cost: ${toL5.toLocaleString()} coins`);
  console.log(`active income ≈ ${Math.round(activeCoinsHr).toLocaleString()}/hr (drills+stadium) + ${raidCoinsHr.toLocaleString()}/hr raiding → ~${((toL5) / (activeCoinsHr + raidCoinsHr)).toFixed(1)}h to all-L5`);
  const heroTo10 = Array.from({ length: 9 }, (_, i) => heroUpgradeCost(i + 1)).reduce((a, b) => a + b, 0);
  const heroTo15 = Array.from({ length: 14 }, (_, i) => heroUpgradeCost(i + 1)).reduce((a, b) => a + b, 0);
  console.log(`ONE hero L1→10: ${Math.round(heroTo10).toLocaleString()} coins · L1→15: ${Math.round(heroTo15).toLocaleString()} coins · ×9 heroes L15 = ${Math.round(heroTo15 * 9).toLocaleString()}`);
  console.log(`gems/day F2P ≈ dailies 15-23 + raids ~20-40 → ~40-60/day → rolls/day ≈ 1.6-2.4 · Legend direct (120) ≈ 2-3 days`);
  const starGain = (heroStarMult(5) / heroStarMult(1) - 1) * 100;
  const lvlGain = (heroLevelMult(15) / heroLevelMult(10) - 1) * 100;
  console.log(`power: 5★ vs 1★ = +${Math.round(starGain)}% · hero L10→15 = +${Math.round(lvlGain)}% for ${Math.round(heroTo15 - heroTo10).toLocaleString()} coins`);
}
// ---------- 6. RARITY & ROLE COMBAT (P0-1 / P1-2 acceptance) ----------
console.log('\n===== 6. RARITY & ROLES — effectiveStat / unitCombatStats / scripted sims =====');
{
  // 6a. Rarity is a real multiplier at equal level (P0-1 accept).
  const rb = (rarity: PlayerRarity) => ({ role: PlayerRole.RB, rarity, level: 5 });
  const ratio = effectiveStat(rb(PlayerRarity.EPIC), 'strength') / effectiveStat(rb(PlayerRarity.COMMON), 'strength');
  console.log(`effectiveStat EPIC/COMMON (RB L5, strength): ${ratio.toFixed(2)}x (expect 1.60)`);

  // 6b. Role statlines are DISTINCT (P1-2 accept) — COMMON L1, group × role × stats.
  console.log('role'.padEnd(5) + 'hp'.padStart(5) + 'dps'.padStart(7) + 'spd'.padStart(7) + 'rng'.padStart(5));
  (Object.keys(ROLE_UNIT) as PlayerRole[]).forEach(role => {
    const cs = unitCombatStats({ role, rarity: PlayerRarity.COMMON, level: 1, unit: ROLE_UNIT[role] });
    console.log(role.padEnd(5) + String(cs.hp).padStart(5) + cs.dps.toFixed(1).padStart(7) + cs.speed.toFixed(1).padStart(7) + String(cs.range).padStart(5));
  });

  // 6c. Scripted raid: identical squads, COMMON vs EPIC — EPIC must take more of the base.
  const ROLES: PlayerRole[] = [PlayerRole.QB, PlayerRole.OL, PlayerRole.OL, PlayerRole.RB, PlayerRole.WR, PlayerRole.WR, PlayerRole.DL, PlayerRole.CB];
  const squad = (rarity: PlayerRarity, roles: PlayerRole[] = ROLES): SimAttacker[] => roles.map((role, i) => {
    const p = ringPos(i, roles.length);
    return { unit: ROLE_UNIT[role], x: p.x, y: p.y, role, rarity, level: 5 };
  });
  const base = ENEMY_BASES[1].buildings; // Tech University — turrets + wall ring
  const rCommon = simulateRaid(base, squad(PlayerRarity.COMMON));
  const rEpic = simulateRaid(base, squad(PlayerRarity.EPIC));
  console.log(`scripted raid (same squad, L5): COMMON ${rCommon.pct}%/${rCommon.stars}⭐ vs EPIC ${rEpic.pct}%/${rEpic.stars}⭐ ${rEpic.pct > rCommon.pct ? '→ RARITY MATTERS' : '⚠️ EPIC did not outperform!'}`);

  // 6d. Role flags in the headless sim: WRs with a QB out (receiver bonus + pocket) vs without.
  const wrWithQB = simulateRaid(base, squad(PlayerRarity.COMMON, [PlayerRole.QB, PlayerRole.OL, PlayerRole.WR, PlayerRole.WR, PlayerRole.WR, PlayerRole.WR]));
  const wrNoQB = simulateRaid(base, squad(PlayerRarity.COMMON, [PlayerRole.LB, PlayerRole.OL, PlayerRole.WR, PlayerRole.WR, PlayerRole.WR, PlayerRole.WR]));
  console.log(`WR corps w/ QB on the field: ${wrWithQB.pct}% vs w/o QB: ${wrNoQB.pct}% ${wrWithQB.pct > wrNoQB.pct ? '→ RECEIVER FLAG LIVE' : '(no edge this layout)'}`);
}
console.log('');
