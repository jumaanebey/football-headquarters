import { DEFENSE_COUNTER_RULES, supportsCombatRules, counterSpeed, tickCounterEffects } from './defenseCounters';
import { stepCounterEquipment } from './defenseCounterStep';
import { canonicalJson } from './canonical';
import { UnitGroup } from '../../types';
import type { Player } from '../../types';
import { BattleBuildingDef, BBuilding, BTroop, TROOP_STATS, UNIT_ORDER, UNIT_PREF,
 nearestBuilding, nearestTroop, blockingWall, dist, BATTLE_SECONDS, planPath, losClear,
 RaidHero, PLAYBOOK, ABILITY_CD, RAGE_SECONDS, HEAL_SECONDS, HEAL_PER_SEC,
 SpecialDef, GAME_PLANS, GamePlanDef, mulberry32, ReplayAction, ReplayData,
 ROLE_COMBAT, POCKET_RADIUS, RECEIVER_BONUS, POCKET_FACTOR } from '../../battle';
import { CROWD_PULSE } from '../../constants';
import { FORMATIONS, COUNTER_WEAK_MULT, COUNTER_STRONG_MULT, FormationKey } from '../../fixedBase';
import { spriteMotion } from '../spriteMotion';
import { spriteFacing } from '../spriteFacing';
import { COMBAT_RULES_VERSION, applyBuildingYardage, applyTroopPressure, recover, beginHeroAction, stepHeroActions, actionFinished, type HeroAction, type CombatEvent } from './actions';
import { rosterTroop, routeRefreshSeconds } from './roster';
import type { BattleConfig, BattleResult } from './contracts';
export const COMBAT_STEP_SECONDS = 0.05;
const DT = COMBAT_STEP_SECONDS;
export interface Shot { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; rot: number; flavor?: string; }
export interface Pulse { x: number; y: number; r: number; life: number; maxLife: number; color: string; }
// Ephemeral battle FX: dust puffs under runners, impact pops on contact, floating "SACKED!" text,
// Castle-Clash-style floating damage numbers ('dmg') and knocked-down player chips ('down').
export interface Fx { type: 'dust' | 'impact' | 'yards' | 'coin' | 'dmg' | 'down' | 'debris' | 'confetti' | 'smoke' | 'boom' | 'land' | 'ballshot'; x: number; y: number; life: number; maxLife: number; text?: string; vx?: number; vy?: number; color?: string; }


/** Fixed-step match simulation shared by live rendering, replay and headless validation.
 * No React, timers, DOM, sound API or network. Presentation RNG has its own stream.
 */
export function createBattleEngine(input: BattleConfig, seed: number, planKey = 'balanced') {
  const config: BattleConfig = JSON.parse(JSON.stringify(input));
  const rules = config.authority?.rules ?? config.replay?.rules ?? COMBAT_RULES_VERSION;
  if(!supportsCombatRules(rules)) throw new Error('Unsupported match rules');
  const counterCombat = rules === DEFENSE_COUNTER_RULES;
  const isDefense = config.mode === 'defense';
  const isReplay = !!config.replay;
  const povDefense = isDefense || isReplay;
  const modernCombat = true; // legacy replays remain in their preserved renderer
  let rejectedCommands = 0;
  const heroes = config.heroes ?? [];
  const specials = config.specials ?? [];
  let troopUid = 0;
  const gameRand = mulberry32(seed);
  const rand = mulberry32(seed ^ 0x5f3759df);
  const audio: { name: string; amount?: number }[] = [];
  const sfx = new Proxy({} as Record<string, () => void>, { get: (_, name) => () => audio.push({ name: String(name) }) });
  const crowdBedIntensity = (amount: number) => audio.push({ name: 'intensity', amount });
  const actions = { current: [] as HeroAction[] };
  const planRef = { current: GAME_PLANS.find(p => p.key === planKey) ?? GAME_PLANS[1] };
  const guardMult = config.aiMult ?? (() => { const d = config.buildings.find(b => b.kind === 'defense'); return d?.damage ? Math.max(0.8, Math.min(3, d.damage / 16)) : 1; })();
const emptyArmy = (): Record<UnitGroup, number> => ({
  [UnitGroup.OFFENSE_LINE]: 0, [UnitGroup.OFFENSE_SKILL]: 0,
  [UnitGroup.DEFENSE_LINE]: 0, [UnitGroup.DEFENSE_SECONDARY]: 0,
});

const makeTroop = (unit: UnitGroup, x: number, y: number, mult = 1, rand: () => number = gameRand, player?: { name: string; role: string }): BTroop => {
  const st = TROOP_STATS[unit];
  const rc = player ? ROLE_COMBAT[player.role] : undefined;
  const hp = Math.round(st.hp * mult * (rc?.hpMult ?? 1));
  return { id: `tr${++troopUid}`, unit, x, y, hp, maxHp: hp,
    dps: st.dps * mult * (rc?.dmgMult ?? 1),
    speed: st.speed * (rc?.speedMult ?? 1),
    range: rc?.range ?? st.range,
    targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0,
    jersey: 1 + Math.floor(rand() * 98), role: player?.role, nameTag: player?.name };
};

const makeHeroTroop = (h: RaidHero, x: number, y: number): BTroop => ({
  id: `hero_${h.key}_${++troopUid}`, unit: h.unit, x, y, hp: h.hp, maxHp: h.hp, dps: h.dps, speed: h.speed, range: h.key === 'qb' ? 13 : h.key === 'kicker' ? 16 : h.range,
  targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, isHero: true, heroKey: h.key, ability: h.ability, abilityCd: 0,
});

const makeSpecialTroop = (def: SpecialDef, x: number, y: number): BTroop => ({
  id: `sp_${def.key}_${++troopUid}`, unit: UnitGroup.OFFENSE_SKILL, x, y, hp: def.hp, maxHp: def.hp, dps: def.dps, speed: def.speed, range: def.range,
  targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, special: def.key,
});

  const hashFlavor = (id: string): BattleBuildingDef['flavor'] => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return ([undefined, 'sled', 'ref', 'tshirt'] as const)[h % 4];
  };
  const sim: { current: { troops: BTroop[]; guards: BTroop[]; buildings: BBuilding[]; shots: Shot[]; pulses: Pulse[]; fx: Fx[]; puddles: { x: number; y: number; r: number; life: number; maxLife: number }[]; shakeT: number; punchT: number; time: number; ended: boolean; guardT: number; warned: boolean; commentary: { text: string; t: number }; momentum: number; pancakes: number; lost: number; bonus: number; freezeT: number; goalLine: boolean; crowdT?: number; ticks: number; mascotOut: boolean; mascotT: number; nextWave: number; banner: { label: string; until: number; key: number } | null } } = { current: {
    troops: (config.preTroops || []).map(t => makeTroop(t.unit, t.x, t.y, config.aiMult ?? 1)),
    // Defense mode: YOUR recruited defenders start the game ringed around the stadium.
    guards: (() => {
      const gs = config.homeGuards ?? [];
      if (!gs.length) return [] as BTroop[];
      const hq = config.buildings.find(b => b.kind === 'hq') ?? config.buildings[0];
      return gs.map((g, i) => {
        const a = (i / gs.length) * Math.PI * 2 + 0.6;
        // Gate-posted heroes hold THEIR gate; everyone else rings the stadium.
        const gx = g.x ?? hq.x + Math.cos(a) * 10;
        const gy = g.y ?? hq.y + Math.sin(a) * 10;
        return { id: `hg${++troopUid}`, unit: g.unit ?? UnitGroup.DEFENSE_LINE, x: gx, y: gy, hp: g.hp, maxHp: g.hp, dps: g.dps, speed: 12, range: 3, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: g.jersey, guardArt: g.art } as BTroop & { guardArt?: string };
      });
    })(),
    buildings: config.buildings.map(b => ({ ...b, flavor: b.flavor ?? (b.kind === 'defense' ? hashFlavor(b.id) : undefined), maxHp: b.hp, dead: false, cooldown: 0 })),
    shots: [], pulses: [], fx: [], puddles: [], shakeT: 0, punchT: 0, time: BATTLE_SECONDS, ended: false, guardT: 0, warned: false, commentary: { text: '', t: 0 },
    momentum: 0, pancakes: 0, lost: 0, bonus: 0, freezeT: 0, goalLine: false, crowdT: 0, ticks: 0, mascotOut: false, mascotT: 0, nextWave: 0, banner: null,
  } };

  const armyRef = { current: { ...(config.playerArmy ?? emptyArmy()) } };
  const deployedHeroesRef = { current: new Set<string>() };
  const specialChargesRef = { current: Object.fromEntries(specials.map(sp => [sp.key, sp.charges])) };
  const plays = Object.fromEntries(PLAYBOOK.map(p => [p.key, p.charges]));
  const masteryTier = Math.min(3, Math.max(0, config.masteryTier ?? 0));
  const defensePlays = { noise: 2 + masteryTier, pkg: 1 + (masteryTier >= 2 ? 1 : 0) + (masteryTier >= 3 ? 1 : 0), timeout: masteryTier >= 3 ? 1 : 0 };
  const squadQueues = { current: {} as Record<string, Player[]> };
  for (const player of [...(config.squad ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) (squadQueues.current[player.unit] ??= []).push(player);
  const say = (text: string) => { sim.current.commentary = { text, t: sim.current.time }; };
  const script: ReplayAction[] = [];
  let result: BattleResult | null = null;
  let started = isDefense || isReplay;
  let digest = 2166136261;
  const hash = (value: unknown) => { for (const c of canonicalJson(value)) { digest ^= c.charCodeAt(0); digest = Math.imul(digest, 16777619) >>> 0; } };
  hash([rules, {...config,replay:undefined}]);
  let planHashed = false;
  const hashPlan = () => { if(!planHashed){hash(['plan',planRef.current.key]);planHashed=true;} };
  const endBattle = () => {
    if (sim.current.ended) return;
    const s = sim.current;
    const nw = s.buildings.filter(b => b.kind !== 'wall');
    const pct = nw.length ? Math.round(nw.reduce((sum,b) => sum + (1 - Math.max(0,b.hp) / b.maxHp),0) / nw.length * 100) : 0;
    const hqDead = s.buildings.find(b => b.kind === 'hq')?.dead ?? false;
    const stars = (pct >= 50 ? 1 : 0) + (hqDead ? 1 : 0) + (pct >= 99 ? 1 : 0);
    const naturalEnd = s.time <= 0.05 || !s.troops.some(t => !t.dead);
    const held = pct < 50;
    s.ended = true;
    result = { mode:config.mode,title:config.title,stars,pct,coins:config.practice ? 0 : Math.round(config.loot.coins*pct/100)+s.bonus,
      fans:config.practice ? 0 : Math.round(config.loot.fans*pct/100),won:isDefense ? held : stars>0,
      campaignStage:config.campaignStage,pvpTarget:config.pvpTarget,isReplay:isReplay||undefined,isPractice:config.practice,
      defenseFormation:config.defenseFormation,defenseLayoutId:config.defenseLayoutId,defenseSnapshotId:config.defenseSnapshotId,
      ...(config.gauntlet ? {gauntletTier:config.gauntlet.tier,wavesHeld:!held ? Math.max(0,s.nextWave-1) : naturalEnd ? s.nextWave : Math.max(0,s.nextWave-1),gauntletCleared:held&&naturalEnd&&s.nextWave>=config.gauntlet.waves.length} : {}) };
  };
  const defFormation = (config.buildings.find(b => b.kind === 'hq')?.formation ?? null) as FormationKey | null;
  const counterMultFor = (planKey: string): number => {
    if (!defFormation || isDefense) return 1;
    const fdef = FORMATIONS[defFormation];
    if (!fdef) return 1;
    if (fdef.counter.weakTo.includes(planKey)) return COUNTER_WEAK_MULT;     // their scheme is soft vs this call
    if (fdef.counter.strongVs.includes(planKey)) return COUNTER_STRONG_MULT; // their scheme eats this call
    return 1;
  };
  // Every unit sent in plays to the scheme.
  const coach = (t: BTroop): BTroop => {
    if (isDefense) return t;
    const p = planRef.current;
    t.hp = Math.round(t.hp * p.hp); t.maxHp = t.hp;
    t.dps *= p.dps * counterMultFor(p.key); t.speed *= p.speed;
    return t;
  };

  const doDeployTroop = (unit: UnitGroup, x: number, y: number) => {
    const player = squadQueues.current[unit]?.shift();
    const troop = modernCombat && player?.stats
      ? rosterTroop(player, `tr${++troopUid}`, x, y, config.preparation?.[unit] ?? 1, 1 + Math.floor(gameRand() * 98))
      : makeTroop(unit, x, y, config.power?.[unit] ?? 1, gameRand, player);
    sim.current.troops.push(coach(troop));
    sim.current.fx.push({ type: 'land', x, y, life: 0.45, maxLife: 0.45 });
    sfx.thud();
    if (player) say(`${player.name.toUpperCase()} (${player.role}) — ${ROLE_COMBAT[player.role]?.power ?? 'in the game'}!`);
  };
  const doDeployHero = (key: string, x: number, y: number) => {
    const h = heroes.find(hh => hh.key === key);
    if (!h) return;
    sim.current.troops.push(coach({ ...makeHeroTroop(h, x, y), deployedAt: sim.current.ticks }));
    sim.current.fx.push({ type: 'land', x, y, life: 0.55, maxLife: 0.55 });
    sfx.thud();
    say(`${h.name.toUpperCase()} TAKES THE FIELD!`);
  };
  const doDeploySpecial = (key: string, x: number, y: number) => {
    const sp = specials.find(s2 => s2.key === key);
    if (!sp) return;
    for (let i = 0; i < sp.count; i++) {
      const a = (i / sp.count) * Math.PI * 2;
      const off = sp.count > 1 ? 2.5 : 0;
      sim.current.troops.push(coach(makeSpecialTroop(sp, x + Math.cos(a) * off, y + Math.sin(a) * off)));
    }
    sim.current.fx.push({ type: 'land', x, y, life: 0.45, maxLife: 0.45 });
  };
  const doCastPlay = (key: string, x: number, y: number) => {
    const p = PLAYBOOK.find(pp => pp.key === key);
    if (!p) return;
    sim.current.troops.forEach(t => {
      if (t.dead) return;
      if (dist(t.x, t.y, x, y) <= p.radius) {
        if (p.key === 'blitz') t.rageT = RAGE_SECONDS;
        else if (p.key === 'medic') { t.healT = HEAL_SECONDS; t.healingSource = undefined; }
      }
    });
    sim.current.pulses.push({ x, y, r: p.radius, life: 0.5, maxLife: 0.5, color: p.color });
  };
  // The new rules use one result consumer for normal hits AND signatures. The
  // legacy branch remains frozen until replay/server parity is proven.
  const consumeCombatEvents = (events: CombatEvent[]) => {
    const s = sim.current;
    for (const event of events) {
      if (event.type === 'yardage') {
        const target = s.buildings.find(b => b.id === event.targetId);
        if (!target) continue;
        (target as BBuilding & { hitFlash?: number }).hitFlash = 0.16;
        if (!s.goalLine && target.kind === 'hq' && target.hp < target.maxHp * 0.5 && !target.dead) {
          s.goalLine = true;
          for (let i = 0; i < 2; i++) s.guards.push(makeTroop(UnitGroup.DEFENSE_LINE, target.x + (i ? 3 : -3), target.y + 2, guardMult, gameRand));
          say('GOAL-LINE STAND — the defense digs in!');
        }
      } else if (event.type === 'sacked' && event.kind !== 'wall') {
        const scored = event.kind === 'hq';
        s.fx.push({ type: 'yards', text: scored ? 'TOUCHDOWN!' : 'SACKED!', x: event.x, y: event.y, life: 1.2, maxLife: 1.2 });
        s.fx.push({ type: 'boom', x: event.x, y: event.y, life: 0.55, maxLife: 0.55 });
        s.pulses.push({ x: event.x, y: event.y, r: scored ? 15 : 10, life: 0.45, maxLife: 0.45, color: '#fde047' });
        s.momentum = Math.min(100, s.momentum + (scored ? 25 : 12) * planRef.current.momentum);
        s.shakeT = scored ? 0.35 : 0.15;
        s.punchT = scored ? 0.3 : 0.12;
        say(scored ? 'TOUCHDOWN! Signature or contact — every yard counts.' : 'Another facility SACKED!');
        sfx.boom();
        if (scored) { s.freezeT = 0.45; sfx.airhorn(); }
      } else if (event.type === 'signature-impact') {
        const def = heroes.find(h => h.key === event.heroKey);
        const radius = event.ability === 'field_medic' ? 18 : event.ability === 'shield_wall' ? 16 : event.ability === 'motivation' ? 20 : 10;
        s.pulses.push({ x: event.x, y: event.y, r: radius, life: 0.45, maxLife: 0.45, color: def?.color ?? '#fde047' });
        say(`${def?.abilityName.toUpperCase() ?? 'SIGNATURE'} — ${event.ability === 'hailmary' || event.ability === 'onside_bomb' ? 'CONTACT!' : 'IN PLAY!'}`);
        sfx.thud();
      } else if (event.type === 'recovery') {
        s.fx.push({ type: 'dmg', text: `+${Math.round(event.amount)} GRIT`, color: '#86efac', x: event.x, y: event.y - 2, life: 0.8, maxLife: 0.8 });
      } else if (event.type === 'reinforcements') {
        for (let i = 0; i < 3; i++) {
          const angle = i / 3 * Math.PI * 2;
          s.troops.push(coach(makeTroop(UnitGroup.OFFENSE_SKILL, event.x + Math.cos(angle) * 3, event.y + Math.sin(angle) * 3, config.preparation?.[UnitGroup.OFFENSE_SKILL] ?? 1, gameRand)));
        }
      }
    }
  };
  const useAbility = (heroKey: string): boolean => {
    const s = sim.current;
    const h = s.troops.find(t => t.heroKey === heroKey && !t.dead);
    if (!h || (h.abilityCd ?? 0) > 0) return false;

      const action = beginHeroAction(h, s.buildings, s.ticks);
      if (!action) return false;
      h.face = spriteFacing(h.x, h.y, action.tx, action.ty, h.face);
      actions.current.push(action);
      const def = heroes.find(hero => hero.key === heroKey);
      if (def) { say(`${def.name.toUpperCase()} — ${def.abilityName.toUpperCase()}!`); sfx.whoosh(); }

      return true;
  };
    const stepSim = () => {
      const s = sim.current;
      if (s.ended) return;
      if (config.replay) {
        for (const input of config.replay.script) if (input.tick === s.ticks && !command(input, true)) rejectedCommands++;
        if (s.ended) return;
      }
      s.ticks++;
      // Freeze-frame on a touchdown — let the moment land.
      if (s.freezeT > 0) { s.freezeT -= DT; return; }

      // Building flinch decays like troop hit-flash (renderer flashes while > 0)
      for (const b of s.buildings) {
        const bf = b as BBuilding & { hitFlash?: number };
        if (bf.hitFlash && bf.hitFlash > 0) bf.hitFlash = Math.max(0, bf.hitFlash - DT);
      }

      // 🛡 GAUNTLET WAVES: challengers arrive on the clock — whistle, banner, storm.
      if (config.gauntlet && s.nextWave < config.gauntlet.waves.length) {
        const w = config.gauntlet.waves[s.nextWave];
        if (BATTLE_SECONDS - s.time >= w.at) {
          for (const t of w.troops) s.troops.push(makeTroop(t.unit, t.x, t.y, w.mult, rand));
          s.nextWave++;
          s.banner = { label: `WAVE ${s.nextWave} — ${w.label}`, until: s.time - 2.8, key: s.nextWave };
          say(`🛡 WAVE ${s.nextWave}: ${w.label} storm the gates!`);
          sfx.kickoff();
          s.shakeT = 0.2;
        }
      }

      const motionSamples = [...s.troops, ...s.guards].map(actor => ({ actor, x: actor.x, y: actor.y }));
      for (const { actor } of motionSamples) { actor.moving = false; actor.attacking = false; actor.actionPoseT = Math.max(0, (actor.actionPoseT ?? 0) - DT); }
      if (modernCombat) {
        consumeCombatEvents(stepHeroActions(actions.current, s.troops, s.buildings, DT));
        actions.current = actions.current.filter(action => !actionFinished(action));
      }

      for (const t of s.troops) {
        if (t.dead) continue;
        if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - DT);
        if (t.rageT > 0) t.rageT = Math.max(0, t.rageT - DT);
        if (t.healT > 0) {
          t.healT = Math.max(0, t.healT - DT);
          const source = modernCombat && t.healingSource ? s.troops.find(actor => actor.id === t.healingSource) : undefined;
          if (source) recover(source, t, HEAL_PER_SEC * DT);
          else t.hp = Math.min(t.maxHp, t.hp + HEAL_PER_SEC * DT);
        }
        if (t.shieldT && t.shieldT > 0) t.shieldT = Math.max(0, t.shieldT - DT);
        if (t.slowT && t.slowT > 0) t.slowT = Math.max(0, t.slowT - DT);
        if (t.abilityPoseT) t.abilityPoseT = Math.max(0, t.abilityPoseT - DT);
        if (t.abilityCd && t.abilityCd > 0) t.abilityCd = Math.max(0, t.abilityCd - DT);
        if (t.sprintT) t.sprintT = Math.max(0, t.sprintT - DT);
        if (t.truckT && !t.activeAction) t.truckT = Math.max(0, t.truckT - DT);
        if(counterCombat) tickCounterEffects(t,DT);
        if (modernCombat && t.activeAction) { t.attacking = true; continue; } // plant through release

        const raging = t.rageT > 0;
        // WR power: catching — big damage while any thrower (QB player or QB hero) is out
        const rc = t.role ? ROLE_COMBAT[t.role] : undefined;
        const catching = rc?.receiver && s.troops.some(o => !o.dead && (ROLE_COMBAT[o.role ?? '']?.thrower || o.heroKey === 'qb'));
        const dps = ((counterCombat && (t.flagT??0)>0) ? .8 : 1) * t.dps * (raging ? 2 : 1) * (catching ? RECEIVER_BONUS : 1);
        const speed = (counterCombat ? counterSpeed(t) : 1) * t.speed * (raging ? 1.5 : 1) * ((t.sprintT ?? 0) > 0 ? 1.7 : (t.truckT ?? 0) > 0 ? 1.6 : 1) * ((t.slowT ?? 0) > 0 ? 0.55 : 1);

        const goal = nearestBuilding(t.x, t.y, s.buildings, t.special ? undefined : UNIT_PREF[t.unit]); // position-group targeting roles
        if (!goal) continue;
        // Wall-aware routing: replan when the goal changes, the route's wall falls, or it goes stale.
        if (!t.plan || t.plan.goalId !== goal.id || (t.plan.age += DT) > (modernCombat ? routeRefreshSeconds(t) : 1.1)) t.plan = planPath(t.x, t.y, goal, s.buildings);
        const plan = t.plan;
        // Consume reached waypoints and cut any corner we can already see past.
        while (plan.path.length && (dist(t.x, t.y, plan.path[0].x, plan.path[0].y) < 3
          || (plan.path.length > 1 && losClear(t.x, t.y, plan.path[1].x, plan.path[1].y, plan.blocked)))) plan.path.shift();
        let target: BBuilding = goal;
        if (plan.targetWallId) {
          const wb = s.buildings.find(b => b.id === plan.targetWallId);
          if (!wb || wb.dead) { plan.targetWallId = null; plan.age = 99; } // breach opened — replan next tick
          else if (dist(t.x, t.y, wb.x, wb.y) <= t.range + wb.size * 0.5 + 2.5) target = wb; // at the wall — smash it
        }
        // Never shoot THROUGH a wall at the goal from range.
        if (target === goal) {
          const between = blockingWall(t.x, t.y, t.range, goal, s.buildings);
          if (between) target = between;
        }
        const d = dist(t.x, t.y, target.x, target.y);
        const stopAt = t.range + target.size * 0.5;
        if (d > stopAt) {
          t.attacking = false;
          // Head for the next waypoint (full speed) or straight at the target when the lane is open.
          const wp = target !== goal ? { x: target.x, y: target.y } : (plan.path[0] ?? { x: goal.x, y: goal.y });
          const direct = wp.x === target.x && wp.y === target.y;
          const md = Math.max(0.001, dist(t.x, t.y, wp.x, wp.y));
          const step = direct ? Math.min(speed * DT, d - stopAt) : Math.min(speed * DT, md);
          (t as BTroop & { face?: number }).face = spriteFacing(t.x, t.y, wp.x, wp.y, (t as BTroop & { face?: number }).face);
          t.x += ((wp.x - t.x) / md) * step;
          t.y += ((wp.y - t.y) / md) * step;
          if (rand() < 0.05) s.fx.push({ type: 'dust', x: t.x, y: t.y + 1.6, life: 0.4, maxLife: 0.4 });
        } else {
          t.attacking = true;
          (t as BTroop & { face?: number }).face = spriteFacing(t.x, t.y, target.x, target.y, (t as BTroop & { face?: number }).face);
          if ((t.truckT ?? 0) > 0) {
            t.truckT = 0; t.actionPoseT = 0.32;
            consumeCombatEvents(applyBuildingYardage(t,target,100 + t.dps * 2));
            s.pulses.push({x:target.x,y:target.y,r:8,life:0.35,maxLife:0.35,color:'#fde047'});
            say('TRUCK STICK — shoulder down, contact!');
          }
          if (modernCombat) consumeCombatEvents(applyBuildingYardage(t, target, dps * DT));
          else { target.hp -= dps * DT; t.dmg = (t.dmg ?? 0) + dps * DT; }
          // Contact sparkle — the block/tackle work on the building is VISIBLE
          if (rand() < 0.06) s.fx.push({ type: 'impact', x: (t.x + target.x) / 2, y: (t.y + target.y) / 2 - 1, life: 0.3, maxLife: 0.3 });
          // Floating damage numbers — throttled per player so hits read without spamming.
          t.dmgAcc = (t.dmgAcc ?? 0) + dps * DT;
          t.dmgTimer = (t.dmgTimer ?? 0) + DT;
          if (t.dmgTimer >= 0.65) {
            t.actionPoseT = 0.28;
            // Yards, not damage (Design Bible §9): your plays GAIN YARDS on their building.
            s.fx.push({ type: 'dmg', text: `+${Math.max(1, Math.round(t.dmgAcc))} YDS`, color: '#fde047', x: target.x + (rand() * 4 - 2), y: target.y - target.size * 0.4, life: 0.7, maxLife: 0.7 });
            // Structure FLINCHES on the damage pop — flash + jolt in the renderer
            (target as BBuilding & { hitFlash?: number }).hitFlash = 0.2;
            // QBs THROW and kickers KICK — a visible football flies with every hit cycle
            if (rc?.thrower || t.heroKey === 'qb' || t.heroKey === 'kicker') {
              s.fx.push({ type: 'ballshot', x: t.x, y: t.y - 2, vx: target.x, vy: target.y - 1, life: 0.4, maxLife: 0.4 });
            }
            t.dmgAcc = 0; t.dmgTimer = 0;
          }
          // GOAL-LINE STAND: crack their stadium below half and the defense throws everything at you.
          if (!modernCombat && !s.goalLine && target.kind === 'hq' && target.hp < target.maxHp * 0.5) {
            s.goalLine = true;
            for (let gi = 0; gi < 2; gi++) s.guards.push({ id: `g${++troopUid}`, unit: UnitGroup.DEFENSE_LINE, x: target.x + (gi ? 3 : -3), y: target.y + 2, hp: Math.round(150 * guardMult), maxHp: Math.round(150 * guardMult), dps: 12 * guardMult, speed: 13, range: 3, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 50 + Math.floor(rand() * 49) });
            say(povDefense ? '🚨 GOAL-LINE STAND — your boys dig in at the goal line!' : '🚨 GOAL-LINE STAND — they\'re throwing EVERYBODY at you!');
            s.shakeT = 0.25;
          }
          if (rand() < 0.12) s.fx.push({ type: 'impact', x: target.x, y: target.y - target.size * 0.3, life: 0.22, maxLife: 0.22 });
          if (!modernCombat && target.hp <= 0) {
            target.hp = 0; target.dead = true; t.targetId = null;
            if (target.kind !== 'wall') {
              const scored = target.kind === 'hq'; // taking their stadium = the score
              s.fx.push({ type: 'yards', text: scored ? 'TOUCHDOWN!' : 'SACKED!', x: target.x, y: target.y, life: scored ? 1.5 : 1.0, maxLife: scored ? 1.5 : 1.0 });
              say(scored ? (povDefense ? '🏈 They score on YOUR house — the crowd goes dead silent…' : '🏈 TOUCHDOWN!! The home crowd goes DEAD silent!') : ['Another facility SACKED!', 'They tear through the complex!', 'That building is DONE for the day!'][Math.floor(rand() * 3)]);
              s.momentum = Math.min(100, s.momentum + (scored ? 25 : 12) * planRef.current.momentum);
              // freeze-frame + the sound tells the story: YOUR away section blasts the
              // air horn — or, watching your own house fall, the home crowd deflates.
              if (scored) { s.freezeT = 0.45; if (povDefense) sfx.aww(); else { sfx.airhorn(); sfx.crowdRoar(); } }
              // 💥 The teardown MOMENT: shockwave ring + dust burst + tumbling debris + smoke + loot.
              s.pulses.push({ x: target.x, y: target.y, r: scored ? 15 : 10, life: 0.45, maxLife: 0.45, color: scored ? '#fde047' : '#f8fafc' });
              s.fx.push({ type: 'boom', x: target.x, y: target.y - 1, life: 0.55, maxLife: 0.55 });
              sfx.boom();
              for (let di = 0; di < (scored ? 8 : 6); di++) {
                const da = rand() * Math.PI * 2;
                s.fx.push({ type: 'debris', x: target.x, y: target.y - 1, vx: Math.cos(da) * (8 + rand() * 8), vy: -6 - rand() * 10, life: 0.8, maxLife: 0.8, color: ['#64748b', '#94a3b8', '#f97316'][di % 3] });
              }
              for (let si = 0; si < 3; si++) s.fx.push({ type: 'smoke', x: target.x + (rand() * 6 - 3), y: target.y - 1, vx: rand() * 2 - 1, life: 1.3, maxLife: 1.3 });
              // TOUCHDOWN = the stands EXPLODE in team-color confetti
              if (scored) for (let ci2 = 0; ci2 < 18; ci2++) {
                const ca2 = rand() * Math.PI * 2;
                s.fx.push({ type: 'confetti', x: target.x, y: target.y - 3, vx: Math.cos(ca2) * (6 + rand() * 14), vy: -10 - rand() * 16, life: 1.4, maxLife: 1.4, color: ['#f97316', '#fde047', '#f8fafc', '#38bdf8'][ci2 % 4] });
              }
              // Loot burst — coins pop out of the wreckage
              for (let ci = 0; ci < (scored ? 7 : 4); ci++) {
                const ca = rand() * Math.PI * 2;
                s.fx.push({ type: 'coin', x: target.x, y: target.y, vx: Math.cos(ca) * 9, vy: Math.sin(ca) * 5 - 9, life: 0.7, maxLife: 0.7 });
              }
              s.shakeT = scored ? 0.55 : 0.35;
              s.punchT = scored ? 0.4 : 0.18; // camera ZOOM-PUNCH — the moment lands physically
            }
          }
        }
      }

      // RIVAL DEFENDERS: alive defense buildings send out linebackers who chase and
      // tackle your players — real unit-on-unit fights, not just turret pot-shots.
      s.guardT += DT;
      const aliveDef = s.buildings.filter(b => b.kind === 'defense' && !b.dead);
      const aliveGuards = s.guards.filter(g => !g.dead);
      // Waves escalate: the deeper into the drive, the faster the defense rotates fresh legs in.
      const spawnEvery = Math.max(4.5, 8 - (BATTLE_SECONDS - s.time) / 15);
      if (s.guardT >= spawnEvery && aliveDef.length > 0 && aliveGuards.length < 3 && s.troops.some(t => !t.dead)) {
        s.guardT = 0;
        const src = aliveDef[Math.floor(gameRand() * aliveDef.length)];
        s.guards.push({ id: `g${++troopUid}`, unit: UnitGroup.DEFENSE_LINE, x: src.x, y: src.y, hp: Math.round(140 * guardMult), maxHp: Math.round(140 * guardMult), dps: 11 * guardMult, speed: 12, range: 3, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 40 + Math.floor(rand() * 59) });
        say(povDefense ? 'YOUR defense sends out a linebacker!' : 'The defense sends out a LINEBACKER!');
      }
      // 🐯 ENEMY MASCOT MINI-BOSS (Design Bible §6): crack their stadium below 70% and the
      // home mascot storms out of the tunnel — tanky, slow, body-checks your squad, and its
      // hype pulses put nearby defenders in a frenzy. On defense it's YOUR mascot answering.
      if (!s.mascotOut) {
        const hq2 = s.buildings.find(b => b.kind === 'hq');
        if (hq2 && !hq2.dead && hq2.hp < hq2.maxHp * 0.7) {
          s.mascotOut = true;
          s.guards.push({ id: `mas${++troopUid}`, unit: UnitGroup.DEFENSE_LINE, x: hq2.x, y: hq2.y + 3, hp: Math.round(560 * guardMult), maxHp: Math.round(560 * guardMult), dps: 10 * guardMult, speed: 8.5, range: 3.4, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 0, guardArt: '/assets/units/mascot.webp', isMascot: true } as BTroop);
          say(povDefense ? '🐯 YOUR MASCOT charges out of the tunnel — the crowd comes ALIVE!' : '🐯 THEIR MASCOT storms out to defend the house!');
          sfx.crowdRoar();
          s.shakeT = 0.25;
        }
      }
      // Mascot hype pulses — every 3s, home defenders near it catch fire (frenzy).
      const mas = s.guards.find(g => !g.dead && (g as BTroop & { isMascot?: boolean }).isMascot);
      if (mas) {
        s.mascotT += DT;
        if (s.mascotT >= 3) {
          s.mascotT = 0;
          for (const g of s.guards) { if (!g.dead && g !== mas && dist(mas.x, mas.y, g.x, g.y) <= 14) g.rageT = 2; }
          s.pulses.push({ x: mas.x, y: mas.y, r: 14, life: 0.45, maxLife: 0.45, color: povDefense ? '#f97316' : '#ef4444' });
        }
      }
      for (const g of s.guards) {
        if (g.dead) continue;
        if (g.hitFlash > 0) g.hitFlash = Math.max(0, g.hitFlash - DT);
        if (g.rageT > 0) g.rageT = Math.max(0, g.rageT - DT);
        // chase the nearest living attacker
        let prey: BTroop | null = null, pd = 1e9;
        for (const t of s.troops) { if (t.dead) continue; const dd = dist(g.x, g.y, t.x, t.y); if (dd < pd) { pd = dd; prey = t; } }
        if (!prey) continue;
        if (pd > 3.2) {
          (g as BTroop & { face?: number }).face = spriteFacing(g.x, g.y, prey.x, prey.y, (g as BTroop & { face?: number }).face);
          g.x += ((prey.x - g.x) / pd) * g.speed * DT;
          g.y += ((prey.y - g.y) / pd) * g.speed * DT;
          g.attacking = false;
        } else {
          // the tackle: mutual damage — your player fights through at reduced output
          g.attacking = true;
          (g as BTroop & { face?: number }).face = spriteFacing(g.x, g.y, prey.x, prey.y, (g as BTroop & { face?: number }).face);
          const shieldFactor = (prey.shieldT && prey.shieldT > 0) ? 0.5 : 1;
          const preyOut = modernCombat && prey.activeAction ? 0 : prey.dps * (prey.rageT > 0 ? 2 : 1) * 0.55 * DT;
          // OL power: the pocket — QB/RB near a live lineman take reduced damage
          const pocket = (prey.role === 'QB' || prey.role === 'RB') && s.troops.some(o => !o.dead && ROLE_COMBAT[o.role ?? '']?.protector && dist(o.x, o.y, prey.x, prey.y) < POCKET_RADIUS) ? POCKET_FACTOR : 1;
          const frenzy = g.rageT > 0 ? 1.35 : 1; // mascot-hyped defenders hit harder
          if (modernCombat) applyTroopPressure(prey, g.dps * frenzy * pocket * DT, s.troops);
          else prey.hp -= g.dps * frenzy * shieldFactor * pocket * DT;
          prey.hitFlash = 0.12;
          const effectiveCounter = modernCombat ? Math.min(Math.max(0, g.hp), preyOut) : preyOut;
          g.hp -= effectiveCounter; g.hitFlash = 0.12;
          prey.dmg = (prey.dmg ?? 0) + effectiveCounter;
          // Red numbers when the defense is chewing on your player.
          g.dmgAcc = (g.dmgAcc ?? 0) + g.dps * frenzy * shieldFactor * DT;
          g.dmgTimer = (g.dmgTimer ?? 0) + DT;
          if (g.dmgTimer >= 0.65) {
            g.actionPoseT = 0.28;
            s.fx.push({ type: 'dmg', text: `${Math.max(1, Math.round(g.dmgAcc))}`, color: '#f87171', x: prey.x + (rand() * 3 - 1.5), y: prey.y - 2.5, life: 0.7, maxLife: 0.7 });
            g.dmgAcc = 0; g.dmgTimer = 0;
          }
          if (prey.hp <= 0) {
            prey.hp = 0; prey.dead = true;
            s.lost++; s.momentum = Math.max(0, s.momentum - 10);
            say(povDefense ? `Your defense STUFFS #${prey.jersey ?? '??'} at the line!`
              : prey.isHero ? `${(heroes.find(h => h.key === prey.heroKey)?.name || 'Your hero').toUpperCase()} IS DOWN!` : `#${prey.jersey ?? '??'} gets STUFFED at the line!`);
            s.fx.push({ type: 'impact', x: prey.x, y: prey.y, life: 0.3, maxLife: 0.3 });
            s.fx.push({ type: 'down', text: `${prey.jersey ?? ''}`, color: isDefense ? '#b91c1c' : '#111827', x: prey.x, y: prey.y, life: 1.1, maxLife: 1.1 });
          }
          if (g.hp <= 0) {
            g.hp = 0; g.dead = true;
            prey.kills = (prey.kills ?? 0) + 1;
            if ((g as BTroop & { isMascot?: boolean }).isMascot) {
              // The mascot goes down — a comedy pratfall, and the whole building feels it.
              s.fx.push({ type: 'boom', x: g.x, y: g.y - 1, life: 0.5, maxLife: 0.5 });
              sfx.aww();
              if (!isDefense) {
                s.bonus += 50; s.momentum = Math.min(100, s.momentum + 15);
                say(isReplay ? '💥 They flatten your mascot — the stands go quiet…' : '💥 Their MASCOT hits the TURF — the stands go QUIET! (+50 loot)');
                for (let ci = 0; ci < 4; ci++) { const ca = rand() * Math.PI * 2; s.fx.push({ type: 'coin', x: g.x, y: g.y, vx: Math.cos(ca) * 8, vy: Math.sin(ca) * 4 - 8, life: 0.6, maxLife: 0.6 }); }
              } else {
                say('Your mascot gets flattened — the crowd GASPS!');
              }
            } else {
              s.fx.push({ type: 'down', text: `${g.jersey ?? ''}`, color: isDefense ? '#111827' : '#b91c1c', x: g.x, y: g.y, life: 1.1, maxLife: 1.1 });
              if (!isDefense) {
                // Takeaway pays the ATTACKER only — never inflate your own defense losses.
                s.pancakes++; s.bonus += 25; s.momentum = Math.min(100, s.momentum + 10 * planRef.current.momentum);
                say(isReplay ? `💥 They PANCAKE your linebacker!` : `💥 TAKEAWAY! Linebacker PANCAKED — bonus loot! (+25)`);
                for (let ci = 0; ci < 3; ci++) { const ca = rand() * Math.PI * 2; s.fx.push({ type: 'coin', x: g.x, y: g.y, vx: Math.cos(ca) * 8, vy: Math.sin(ca) * 4 - 8, life: 0.6, maxLife: 0.6 }); }
              } else {
                say(`Your #${g.jersey ?? '??'} gets flattened — they keep coming!`);
              }
            }
            s.fx.push({ type: 'impact', x: g.x, y: g.y, life: 0.3, maxLife: 0.3 });
          }
        }
      }

      for (const { actor, x, y } of motionSamples) {
        const motion = spriteMotion({ x, y }, actor, DT, actor.face, actor.stridePhase);
        actor.moving = !actor.dead && motion.moving;
        actor.strideSeconds = motion.strideSeconds;
        actor.stridePhase = motion.stridePhase;
        if (motion.moving) actor.face = motion.face;
      }

      // MOMENTUM: builds on sacks/pancakes, drains on losses, decays over time.
      // Fill the meter and the whole squad catches fire. The crowd breathes with it.
      // 🔇 THE SILENCING (Design Bible §2): the crowd bed tracks the HOME crowd's
      // remaining energy — deafening at kickoff, a murmur once the house is taken.
      // The stadium's volume IS the scoreboard.
      if (Math.round(s.time * 20) % 20 === 0) { // ~1x/sec
        const nw2 = s.buildings.filter(b => b.kind !== 'wall');
        const gone = nw2.length ? nw2.reduce((sum, b) => sum + (1 - Math.max(0, b.hp) / b.maxHp), 0) / nw2.length : 0;
        crowdBedIntensity(Math.max(0.08, 1 - gone));
      }
      if (!isDefense) {
        s.momentum = Math.max(0, s.momentum - 1.5 * DT);
        if (s.momentum >= 100) {
          s.momentum = 30;
          s.troops.forEach(t => { if (!t.dead) t.rageT = Math.max(t.rageT, 4); });
          say('🔥 MOMENTUM SHIFT — the whole squad is ROLLING!');
          sfx.crowdRoar();
          s.shakeT = 0.2;
        }
      }

      // 🔊 HOME CROWD: on defense, a big fanbase periodically ERUPTS and stalls the
      // enemy drive — the fans you earned are a real part of the stadium's defense.
      // A real rival attack carries the defender's snapshot (defenseSnapshotId), so the
      // same crowd stalls the attacker there too; bot bases have no snapshot and no crowd.
      if ((isDefense || !!config.defenseSnapshotId) && (config.fans ?? 0) >= CROWD_PULSE.minFans) {
        s.crowdT = (s.crowdT ?? 0) + DT;
        if (s.crowdT >= CROWD_PULSE.intervalSecs) {
          s.crowdT = 0;
          const stall = CROWD_PULSE.slowSecs(config.fans!);
          s.troops.forEach(t => { if (!t.dead) t.slowT = Math.max(t.slowT ?? 0, stall); });
          say(`🔊 ${(config.fans!).toLocaleString()} fans ERUPT — the drive stalls!`);
          sfx.crowdRoar();
          crowdBedIntensity(1);
          s.shakeT = 0.2;
        }
      }

      // Two-minute-warning drama
      if (!s.warned && s.time <= 15) { s.warned = true; say('⏱ FINAL SECONDS — finish the drive!'); }

      // Mascot hype aura — keeps nearby friendly players Raging ("crowd goes wild").
      for (const m of s.troops) {
        if (m.dead || m.special !== 'mascot') continue;
        const def = specials.find(sp => sp.key === 'mascot');
        const r = def?.aura?.radius ?? 16;
        const keep = def?.aura?.keepRageT ?? 1.1;
        for (const t of s.troops) {
          if (t.dead || t === m || t.special === 'mascot') continue;
          if (dist(m.x, m.y, t.x, t.y) <= r) t.rageT = Math.max(t.rageT, keep);
        }
        if (rand() < 0.08) s.pulses.push({ x: m.x, y: m.y, r: r, life: 0.4, maxLife: 0.4, color: '#f97316' });
      }

      // Turrets — each equipment kind FIGHTS differently (the Design-shop choice matters).
      const hitTroop = (t: BTroop, raw: number) => {
        const hit = modernCombat ? applyTroopPressure(t, raw, s.troops) : Math.round(raw * ((t.shieldT && t.shieldT > 0) ? 0.5 : 1));
        if (!modernCombat) t.hp -= hit;
        t.hitFlash = 0.15;
        s.fx.push({ type: 'dmg', text: `${Math.round(hit)}`, color: '#f87171', x: t.x + (rand() * 3 - 1.5), y: t.y - 2.5, life: 0.7, maxLife: 0.7 });
        if (rand() < 0.3) s.fx.push({ type: 'impact', x: t.x, y: t.y - 0.5, life: 0.28, maxLife: 0.28 });
        if (t.hp <= 0) {
          t.hp = 0; t.dead = true; s.lost++; s.momentum = Math.max(0, s.momentum - 6);
          s.fx.push({ type: 'down', text: `${t.jersey ?? ''}`, color: isDefense ? '#b91c1c' : '#111827', x: t.x, y: t.y, life: 1.1, maxLife: 1.1 });
        }
      };
      for (const b of s.buildings) {
        if (b.dead || b.kind !== 'defense' || !b.damage || !b.range) continue;
        if(counterCombat) { stepCounterEquipment(b,s,DT,hitTroop); continue; }
        // ⭐ L10 SIGNATURE PLAYS — maxed gear runs a special on its own clock. The
        // slot's level rides the layout, so raiders face signatures on real L10 bases
        // (and replays re-fire them identically — all state lives in the sim).
        if ((b.level ?? 0) >= 10) {
          const bb = b as BBuilding & { sigT?: number };
          if (bb.sigT === undefined) { let hh = 0; for (let i = 0; i < b.id.length; i++) hh = (hh * 31 + b.id.charCodeAt(i)) >>> 0; bb.sigT = 2.5 + (hh % 40) / 10; }
          bb.sigT -= DT;
          if (bb.sigT <= 0) {
            const sp = nearestTroop(b.x, b.y, s.troops, b.range * 1.25);
            if (!sp) bb.sigT = 0.6; // nobody in the neighborhood — re-check soon
            else if (b.flavor === 'sled') {
              // PANCAKE BLOCK: launches the nearest runner backward, flat on the turf.
              const dd = Math.max(0.01, dist(b.x, b.y, sp.x, sp.y));
              if (dd <= 9) {
                sp.x = Math.min(98, Math.max(2, sp.x + ((sp.x - b.x) / dd) * 11));
                sp.y = Math.min(98, Math.max(2, sp.y + ((sp.y - b.y) / dd) * 11));
                sp.slowT = Math.max(sp.slowT ?? 0, 1.8);
                hitTroop(sp, b.damage * 1.4);
                s.fx.push({ type: 'boom', x: sp.x, y: sp.y, life: 0.5, maxLife: 0.5 });
                if (rand() < 0.5) say('💥 PANCAKE BLOCK — he gets sent FLYING!');
                bb.sigT = 8;
              } else bb.sigT = 0.6; // wait for someone to get close
            } else if (b.flavor === 'ref') {
              // BOOTH REVIEW: flags EVERY attacker in range — the whole drive holds.
              for (const t of s.troops) { if (!t.dead && dist(b.x, b.y, t.x, t.y) <= b.range) { t.slowT = Math.max(t.slowT ?? 0, 2.2); hitTroop(t, b.damage * 0.6); } }
              s.pulses.push({ x: b.x, y: b.y, r: Math.min(18, b.range * 0.6), life: 0.5, maxLife: 0.5, color: '#fde047' });
              if (rand() < 0.5) say('🚩 BOOTH REVIEW — everybody HOLDS!');
              bb.sigT = 11;
            } else if (b.flavor === 'tshirt') {
              // T-SHIRT STORM: a double-wide volley buries the whole cluster.
              for (const t of s.troops) { if (!t.dead && dist(t.x, t.y, sp.x, sp.y) <= 12) { hitTroop(t, b.damage * 0.9); t.slowT = Math.max(t.slowT ?? 0, 2); } }
              s.pulses.push({ x: sp.x, y: sp.y, r: 12, life: 0.5, maxLife: 0.5, color: '#f472b6' });
              for (let si = 0; si < 3; si++) s.shots.push({ sx: b.x, sy: b.y, tx: sp.x + (rand() * 8 - 4), ty: sp.y + (rand() * 8 - 4), t: -si * 0.08, dur: 0.34, rot: rand() * 360, flavor: 'tshirt' });
              if (rand() < 0.5) say('👕 T-SHIRT STORM!');
              bb.sigT = 10;
            } else if (b.flavor === 'cooler') {
              // FLOOD ZONE: one giant puddle — the whole lane turns to orange soup.
              s.puddles.push({ x: sp.x, y: sp.y, r: 13, life: 5, maxLife: 5 });
              s.pulses.push({ x: sp.x, y: sp.y, r: 13, life: 0.5, maxLife: 0.5, color: '#f97316' });
              s.shots.push({ sx: b.x, sy: b.y, tx: sp.x, ty: sp.y, t: 0, dur: 0.4, rot: rand() * 360, flavor: 'cooler' });
              if (rand() < 0.5) say('🌊 FLOOD ZONE — the turf turns to orange soup!');
              bb.sigT = 10;
            } else {
              // JUGS OVERDRIVE: the hopper unloads — a full volley on one runner.
              hitTroop(sp, b.damage * 2.2);
              for (let si = 0; si < 3; si++) s.shots.push({ sx: b.x, sy: b.y, tx: sp.x, ty: sp.y, t: -si * 0.09, dur: 0.3, rot: rand() * 360 });
              if (rand() < 0.5) say('🔥 JUGS OVERDRIVE — the whole hopper unloads!');
              bb.sigT = 9;
            }
          }
        }
        b.cooldown -= DT;
        if (b.cooldown > 0) continue;
        const prey = nearestTroop(b.x, b.y, s.troops, b.range);
        if (!prey) { b.cooldown = 0.1; continue; }
        const fl = b.flavor;
        if (fl === 'cooler') {
          // Gatorade Station: lobs a cooler — light hit, but leaves a PUDDLE ZONE
          // that slows every attacker wading through it (area denial).
          hitTroop(prey, b.damage);
          s.puddles.push({ x: prey.x, y: prey.y, r: 7, life: 3.5, maxLife: 3.5 });
          b.cooldown = 2.6;
        } else if (fl === 'tshirt') {
          // T-Shirt Cannon: splash — everyone bunched near the target eats it AND gets
          // tangled up in free t-shirts (comedic slow, Design Bible §6)
          for (const t of s.troops) { if (!t.dead && dist(t.x, t.y, prey.x, prey.y) <= 7) { hitTroop(t, b.damage * 0.7); t.slowT = Math.max(t.slowT ?? 0, 1.5); } }
          s.pulses.push({ x: prey.x, y: prey.y, r: 7, life: 0.35, maxLife: 0.35, color: '#f472b6' });
          b.cooldown = 1.15;
        } else if (fl === 'ref') {
          // Ref Tower: penalty flag — a light hit that SLOWS the runner
          hitTroop(prey, b.damage);
          prey.slowT = 2.2;
          b.cooldown = 0.9;
        } else if (fl === 'sled') {
          // Tackling Sled: short range, hits like a truck
          hitTroop(prey, b.damage * 1.35);
          b.cooldown = 1.1;
        } else {
          // JUGS / generic: steady football launcher (explicit JUGS fires faster)
          hitTroop(prey, b.damage);
          b.cooldown = fl === 'jugs' ? 0.55 : 0.7;
        }
        s.shots.push({ sx: b.x, sy: b.y, tx: prey.x, ty: prey.y, t: 0, dur: 0.3, rot: rand() * 360, flavor: fl });
      }

      if (s.shots.length) s.shots = s.shots.filter(sh => (sh.t += DT) < sh.dur);
      // 🥤 Gatorade puddles: drain over time; anyone standing in one runs in mud.
      if (s.puddles.length) {
        s.puddles = s.puddles.filter(p => (p.life -= DT) > 0);
        for (const p of s.puddles) for (const t of s.troops) {
          if (!t.dead && dist(t.x, t.y, p.x, p.y) <= p.r) {
            if(counterCombat){t.wetT=Math.max(t.wetT??0,.15);t.lastDefenseEffect='Wet turf';}
            else t.slowT = Math.max(t.slowT ?? 0, 0.3);
          }
        }
      }
      if (s.pulses.length) s.pulses = s.pulses.filter(p => (p.life -= DT) > 0);
      if (s.fx.length) {
        for (const f of s.fx) {
          if (f.type === 'coin' || f.type === 'debris' || f.type === 'confetti') { // lofted arcs with gravity
            f.x += (f.vx ?? 0) * DT; f.y += (f.vy ?? 0) * DT; f.vy = (f.vy ?? 0) + 42 * DT;
          } else if (f.type === 'smoke') { // smoke drifts up and away
            f.y -= 5 * DT; f.x += (f.vx ?? 0) * DT;
          }
        }
        s.fx = s.fx.filter(f => (f.life -= DT) > 0);
      }
      // Damaged facilities SMOLDER — the field tells the story at a glance.
      for (const b of s.buildings) {
        if (!b.dead && b.kind !== 'wall' && b.hp < b.maxHp * 0.45 && rand() < 0.035) {
          s.fx.push({ type: 'smoke', x: b.x + (rand() * 4 - 2), y: b.y - 2, vx: rand() * 2 - 1, life: 1.1, maxLife: 1.1 });
        }
      }
      if (s.shakeT > 0) s.shakeT = Math.max(0, s.shakeT - DT);
      if (s.punchT > 0) s.punchT = Math.max(0, s.punchT - DT);

      s.time -= DT;
      const allDead = s.buildings.filter(b => b.kind !== 'wall').every(b => b.dead);
      const anyTroopAlive = s.troops.some(t => !t.dead);
      // Read deploy inventory via REFS: state deps here would tear down and rebuild the
      // interval on every deploy, discarding accumulated sub-step time (clock stalls
      // during hold-drag pours — up to ~2 game-seconds eaten across a 20-troop pour).
      const anyToDeploy = UNIT_ORDER.some(u => armyRef.current[u] > 0) || heroes.some(h => !deployedHeroesRef.current.has(h.key)) || specials.some(sp => (specialChargesRef.current[sp.key] ?? 0) > 0);
      // Gauntlet: a quiet field between waves is suspense, not the end — and a
      // breach (half the house taken) ends the night on the spot.
      const wavesPending = !!config.gauntlet && s.nextWave < config.gauntlet.waves.length;
      if (config.gauntlet) {
        // breach = damage-weighted 50%, the SAME measure as `held` in endBattle
        const nonWallB = s.buildings.filter(b => b.kind !== 'wall');
        const dmgFrac = nonWallB.length ? nonWallB.reduce((sum, b) => sum + (1 - Math.max(0, b.hp) / (b.maxHp || 1)), 0) / nonWallB.length : 0;
        if (dmgFrac >= 0.5) { endBattle(); return; }
      }
      const ballInPlay = modernCombat && actions.current.some(action => action.released && !action.resolved);
      if (allDead || s.time <= 0 || (!wavesPending && !ballInPlay && s.troops.length > 0 && !anyTroopAlive && !anyToDeploy)) endBattle();
    };

  const coordinate = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 2 && n <= 98;
  const perimeterOk = (x: number, y: number) => !sim.current.buildings.some(b => !b.dead && dist(x,y,b.x,b.y) < 14);
  const command = (a: ReplayAction, playback = false): boolean => {
    if (sim.current.ended || (!playback && isReplay) || a.tick !== sim.current.ticks) return false;
    if (a.k === 'e') { hashPlan(); endBattle(); }
    else if (a.k === 'd') {
      if (!isDefense || !started || !['noise','pkg','timeout'].includes(a.key ?? '')) return false;
      const key = a.key as keyof typeof defensePlays;
      if (defensePlays[key] <= 0) return false;
      if (key === 'pkg') {
        const hq = sim.current.buildings.find(b => b.kind === 'hq' && !b.dead);
        if (!hq) return false;
        for (let i=0;i<2;i++) sim.current.guards.push(makeTroop(UnitGroup.DEFENSE_LINE,hq.x+(i?3.5:-3.5),hq.y+2,guardMult,gameRand));
        say('GOAL-LINE PACKAGE — fresh legs take the field!');
      } else { for(const t of sim.current.troops) if(!t.dead) t.slowT = Math.max(t.slowT ?? 0,key==='timeout'?3.5:2.5); say(key==='timeout'?'TIMEOUT — stall their drive!':'The home crowd ERUPTS!'); }
      defensePlays[key]--;
    } else if (isDefense) return false;
    else if (a.k === 'a') { if (!started || !useAbility(a.key ?? '')) return false; }
    else {
      if (!coordinate(a.x) || !coordinate(a.y)) return false;
      if (a.k !== 'p' && !perimeterOk(a.x,a.y)) return false;
      if (a.k === 't') {
        if (!a.u || !(armyRef.current[a.u] > 0)) return false;
        armyRef.current[a.u]--; doDeployTroop(a.u,a.x,a.y);
      } else if (a.k === 'h') {
        if (!heroes.some(h=>h.key===a.key) || deployedHeroesRef.current.has(a.key!)) return false;
        deployedHeroesRef.current.add(a.key!); doDeployHero(a.key!,a.x,a.y);
      } else if (a.k === 's') {
        if (!a.key || !(specialChargesRef.current[a.key] > 0)) return false;
        specialChargesRef.current[a.key]--; doDeploySpecial(a.key,a.x,a.y);
      } else if (a.k === 'p') {
        if (!started || !a.key || !(plays[a.key] > 0)) return false;
        plays[a.key]--; doCastPlay(a.key,a.x,a.y);
      } else return false;
      started = true;
    }
    hashPlan();
    script.push({...a});
    hash(['command',a]);
    return true;
  };
  const advance = () => {
    if (!started || sim.current.ended) return;
    hashPlan();
    const previousTick = sim.current.ticks;
    stepSim();
    if (sim.current.ticks === previousTick) return;
    const s = sim.current;
    // Hash gameplay only: cosmetic quality, FPS, sound and camera cannot alter verification.
    if(counterCombat) hash([s.buildings.map(b=>[b.id,b.counterAttack,b.counterSignatureT]),s.troops.map(t=>[t.id,t.wetT,t.flagT,t.braceT]),s.puddles]);
    hash([s.ticks,s.time,s.momentum,s.bonus,s.nextWave,s.buildings.map(b=>[b.id,b.hp,b.cooldown]),
      [...s.troops,...s.guards].map(t=>[t.id,t.x,t.y,t.hp,t.rageT,t.healT,t.shieldT,t.slowT,t.abilityCd,t.dmg,t.healingDone,t.protectionDone])]);
  };
  const getReplay = (): ReplayData => ({
    v:2, rules,seed,plan:planRef.current.key,power:config.power,heroes:JSON.parse(JSON.stringify(heroes)),specials:JSON.parse(JSON.stringify(specials)),
    layout:JSON.parse(JSON.stringify(config.buildings)),script:script.map(a=>({...a})),squad:JSON.parse(JSON.stringify(config.squad??[])),
    snapshot:JSON.parse(JSON.stringify({...config,replay:undefined})),finalHash:digest.toString(16).padStart(8,'0'),ticks:sim.current.ticks,
  });
  return {
    state:sim.current,actions,army:armyRef.current,deployedHeroes:deployedHeroesRef.current,specialCharges:specialChargesRef.current,plays,defensePlays,
    command,advance,finish:()=>command({k:'e',tick:sim.current.ticks}),
    setPlan:(key:string)=>{ if(started) return false; const plan=GAME_PLANS.find(p=>p.key===key); if(!plan)return false;planRef.current=plan;return true; },
    get rejectedCommands(){return rejectedCommands;},get result(){return result;},get started(){return started;},get hash(){return digest.toString(16).padStart(8,'0');},
    getReplay,drainAudio:()=>audio.splice(0),
  };
}
export type BattleEngine = ReturnType<typeof createBattleEngine>;

export function replayMatch(replay: ReplayData) {
  if(replay.v!==2 || !replay.snapshot || !supportsCombatRules(replay.rules)) throw new Error('Unsupported match rules');
  const engine=createBattleEngine({...replay.snapshot,replay:{seed:replay.seed,planKey:replay.plan,script:replay.script,version:2,rules:replay.rules}},replay.seed,replay.plan);
  for(let i=0;i<1400&&!engine.state.ended;i++) engine.advance();
  return {result:engine.result,hash:engine.hash,matches:engine.state.ended&&engine.rejectedCommands===0&&engine.hash===replay.finalHash&&engine.state.ticks===replay.ticks&&engine.getReplay().script.length===replay.script.length,engine};
}
