import React, { useEffect, useRef, useState } from 'react';
import { UnitGroup } from '../types';
import {
  BattleBuildingDef, BBuilding, BTroop, TROOP_STATS, UNIT_ORDER, UNIT_PREF,
  nearestBuilding, nearestTroop, blockingWall, dist, BATTLE_SECONDS, planPath, losClear,
  RaidHero, PLAYBOOK, PlayDef, ABILITY_CD, RAGE_SECONDS, HEAL_SECONDS, HEAL_PER_SEC,
  SpecialDef, SpecialKind, GAME_PLANS, GamePlanDef, HomeGuardDef, mulberry32, ReplayAction, ReplayData,
} from '../battle';
import { RivalCoach } from '../campaign';
import { battleBuildingSprite, unitSprite, unitPlayerSprite } from '../assets';
import { sfx, crowdBedStart, crowdBedStop, crowdBedIntensity } from '../sound';
import { CROWD_PULSE } from '../constants';
import { X, Clock, Flag, Shield } from 'lucide-react';
import { FORMATIONS, COUNTER_WEAK_MULT, COUNTER_STRONG_MULT, FormationKey } from '../fixedBase';

export interface BattleConfig {
  mode: 'attack' | 'defense';
  title: string;
  buildings: BattleBuildingDef[];
  playerArmy?: Record<UnitGroup, number>;
  power?: Record<UnitGroup, number>;
  heroes?: RaidHero[];
  specials?: SpecialDef[];
  preTroops?: { unit: UnitGroup; x: number; y: number }[];
  aiMult?: number;
  loot: { coins: number; fans: number };
  campaignStage?: number; // set when this attack is a Season campaign stage
  pvpTarget?: string;     // set when raiding a LIVE rival's published base (their pid)
  rival?: RivalCoach;     // the coach across the field — trash talk pre-game, reaction post-game
  attackerName?: string;  // YOUR club name — shown on the pre-game matchup card
  homeGuards?: HomeGuardDef[]; // defense mode: YOUR roster's defenders start on the field
  fans?: number;          // defense mode: your fanbase — the crowd erupts and stalls drives
  parkingLot?: number;    // defense mode: apron level (visual; the layout is pre-compressed)
  replay?: { seed: number; script: ReplayAction[]; planKey: string }; // spectate a recorded attack
}

export interface BattleResult {
  mode: 'attack' | 'defense';
  title: string;
  stars: number;
  pct: number;
  coins: number;
  fans: number;
  won: boolean;
  campaignStage?: number;
  pvpTarget?: string;
  isReplay?: boolean;    // spectated replays award nothing
  replay?: ReplayData;   // recorded on live-rival attacks so the defender can watch
}

interface Props {
  config: BattleConfig;
  onFinish: (result: BattleResult) => void;
  onExit: () => void;
}

// A defense "shot" is now a football lobbed from a defender to a target — an arcing
// projectile (t: 0→1 over dur), never a bullet.
interface Shot { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; rot: number; flavor?: string; }
interface Pulse { x: number; y: number; r: number; life: number; maxLife: number; color: string; }
// Ephemeral battle FX: dust puffs under runners, impact pops on contact, floating "SACKED!" text,
// Castle-Clash-style floating damage numbers ('dmg') and knocked-down player chips ('down').
interface Fx { type: 'dust' | 'impact' | 'yards' | 'coin' | 'dmg' | 'down' | 'debris' | 'confetti' | 'smoke'; x: number; y: number; life: number; maxLife: number; text?: string; vx?: number; vy?: number; color?: string; }

const TICK_MS = 50;
const DT = TICK_MS / 1000;
let troopUid = 0;

const emptyArmy = (): Record<UnitGroup, number> => ({
  [UnitGroup.OFFENSE_LINE]: 0, [UnitGroup.OFFENSE_SKILL]: 0,
  [UnitGroup.DEFENSE_LINE]: 0, [UnitGroup.DEFENSE_SECONDARY]: 0,
});

const makeTroop = (unit: UnitGroup, x: number, y: number, mult = 1, rand: () => number = Math.random): BTroop => {
  const st = TROOP_STATS[unit];
  const hp = Math.round(st.hp * mult);
  return { id: `tr${++troopUid}`, unit, x, y, hp, maxHp: hp, dps: st.dps * mult, speed: st.speed, range: st.range, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 1 + Math.floor(rand() * 98) };
};

const makeHeroTroop = (h: RaidHero, x: number, y: number): BTroop => ({
  id: `hero_${h.key}_${++troopUid}`, unit: h.unit, x, y, hp: h.hp, maxHp: h.hp, dps: h.dps, speed: h.speed, range: h.range,
  targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, isHero: true, heroKey: h.key, ability: h.ability, abilityCd: 0,
});

// Mascot / Fan-Mob support units. `unit` is a filler group (never used for special rendering).
const makeSpecialTroop = (def: SpecialDef, x: number, y: number): BTroop => ({
  id: `sp_${def.key}_${++troopUid}`, unit: UnitGroup.OFFENSE_SKILL, x, y, hp: def.hp, maxHp: def.hp, dps: def.dps, speed: def.speed, range: def.range,
  targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, special: def.key,
});

export const BattleScreen: React.FC<Props> = ({ config, onFinish, onExit }) => {
  const isDefense = config.mode === 'defense';
  const isReplay = !!config.replay;
  const povDefense = isDefense || isReplay; // whose broadcast is this? replays are watched by the DEFENDER
  const heroes = config.heroes ?? [];
  const fieldRef = useRef<HTMLDivElement>(null);
  // Deterministic battle RNG — a replay re-seeds with the recorded seed and every random
  // decision (jerseys, wave picks, FX jitter) replays identically.
  const seedRef = useRef(config.replay?.seed ?? Math.floor(Math.random() * 2 ** 31));
  const rngRef = useRef(mulberry32(seedRef.current));
  const rand = () => rngRef.current();
  // Attack recorder: every deploy/play/ability lands here with its tick (live attacks only).
  const recRef = useRef<ReplayAction[]>([]);
  const record = (a: Omit<ReplayAction, 'tick'>) => { if (!isReplay) recRef.current.push({ ...a, tick: sim.current.ticks }); };
  // Rival DEFENDERS scale with the base's turret strength (or aiMult when defending).
  const guardMult = config.aiMult ?? (() => {
    const d = config.buildings.find(b => b.kind === 'defense');
    return d?.damage ? Math.max(0.8, Math.min(3, d.damage / 16)) : 1;
  })();

  // Turrets without an explicit flavor take one from the same id-hash that picks their
  // sprite — so every turret BEHAVES like it LOOKS. h%4===0 stays generic (football lobs,
  // 0.7s cadence — matches the jugs-machine art it renders).
  const hashFlavor = (id: string): BattleBuildingDef['flavor'] => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return ([undefined, 'sled', 'ref', 'tshirt'] as const)[h % 4];
  };
  const sim = useRef<{ troops: BTroop[]; guards: BTroop[]; buildings: BBuilding[]; shots: Shot[]; pulses: Pulse[]; fx: Fx[]; shakeT: number; punchT: number; time: number; ended: boolean; guardT: number; warned: boolean; commentary: { text: string; t: number }; momentum: number; pancakes: number; lost: number; bonus: number; freezeT: number; goalLine: boolean; crowdT?: number; ticks: number }>({
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
    shots: [], pulses: [], fx: [], shakeT: 0, punchT: 0, time: BATTLE_SECONDS, ended: false, guardT: 0, warned: false, commentary: { text: '', t: 0 },
    momentum: 0, pancakes: 0, lost: 0, bonus: 0, freezeT: 0, goalLine: false, crowdT: 0, ticks: 0,
  });
  const [driveStats, setDriveStats] = useState<{ mvp: string; mvpDmg: number; pancakes: number; lost: number; bonus: number } | null>(null);

  // Play-by-play announcer — every big moment gets a line.
  const say = (text: string) => { sim.current.commentary = { text, t: sim.current.time }; };

  const [army, setArmy] = useState<Record<UnitGroup, number>>(config.playerArmy || emptyArmy());
  const [deployedHeroes, setDeployedHeroes] = useState<Set<string>>(new Set());
  const [plays, setPlays] = useState<Record<string, number>>(() => Object.fromEntries(PLAYBOOK.map(p => [p.key, p.charges])));
  const specials = config.specials ?? [];
  const [pendingSpecial, setPendingSpecial] = useState<SpecialDef | null>(null);
  const [specialCharges, setSpecialCharges] = useState<Record<string, number>>(() => Object.fromEntries(specials.map(sp => [sp.key, sp.charges])));
  const [selected, setSelected] = useState<UnitGroup>(() => UNIT_ORDER.find(u => (config.playerArmy?.[u] ?? 0) > 0) ?? UnitGroup.OFFENSE_LINE);
  // Refs mirror deploy state so rapid pours (hold-drag) never read stale closures.
  const armyRef = useRef(army); useEffect(() => { armyRef.current = army; }, [army]);
  const selectedRef = useRef(selected); useEffect(() => { selectedRef.current = selected; }, [selected]);
  const deployedHeroesRef = useRef<Set<string>>(new Set());
  const [pendingHero, setPendingHero] = useState<RaidHero | null>(null);
  const [castMode, setCastMode] = useState<PlayDef | null>(null);
  const [phase, setPhase] = useState<'deploy' | 'fighting' | 'result'>(isDefense || isReplay ? 'fighting' : 'deploy');
  // DEFENSE AGENCY: when YOUR stadium is under attack you call plays, not just watch.
  const [defPlays, setDefPlays] = useState({ noise: 2, pkg: 1 });
  const callCrowdNoise = () => {
    if (defPlays.noise <= 0 || phase !== 'fighting') return;
    setDefPlays(p => ({ ...p, noise: p.noise - 1 }));
    const s = sim.current;
    s.troops.forEach(t => { if (!t.dead) t.slowT = Math.max(t.slowT ?? 0, 2.5); });
    say('📣 The home crowd ERUPTS — their drive stalls!');
    sfx.crowdRoar();
    s.shakeT = 0.2;
  };
  const callGoalLinePkg = () => {
    if (defPlays.pkg <= 0 || phase !== 'fighting') return;
    const s = sim.current;
    const hq = s.buildings.find(b => b.kind === 'hq' && !b.dead) ?? s.buildings.find(b => !b.dead && b.kind !== 'wall');
    if (!hq) return;
    setDefPlays(p => ({ ...p, pkg: p.pkg - 1 }));
    for (let gi = 0; gi < 2; gi++) s.guards.push({ id: `g${++troopUid}`, unit: UnitGroup.DEFENSE_LINE, x: hq.x + (gi ? 3.5 : -3.5), y: hq.y + 2, hp: Math.round(170 * guardMult), maxHp: Math.round(170 * guardMult), dps: 13 * guardMult, speed: 13, range: 3, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 50 + Math.floor(rand() * 49) });
    say('🛡 GOAL-LINE PACKAGE — fresh legs fly onto the field!');
    s.shakeT = 0.2;
  };
  // Pre-snap coaching call — locks once the first player is on the field.
  // Replays restore the exact plan the attacker locked in.
  const [plan, setPlan] = useState<GamePlanDef>(() => GAME_PLANS.find(g => g.key === config.replay?.planKey) ?? GAME_PLANS[1]);
  const planRef = useRef(plan); planRef.current = plan;
  // 🆚 MATCHUP CARD — a 3-second broadcast open before you take the field.
  const [matchup, setMatchup] = useState(!isDefense && !isReplay);
  useEffect(() => {
    if (!matchup) return;
    const t = setTimeout(() => setMatchup(false), 3000);
    return () => clearTimeout(t);
  }, [matchup]);

  // 📋 FORMATION COUNTERPLAY: the defender's scheme vs your play call. Pure function
  // of (plan, published layout) — replays recompute the exact same modifier.
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

  // Shared deploy primitives — live input and the replay script run the SAME code path,
  // so a recorded attack re-creates itself exactly (including RNG consumption order).
  const doDeployTroop = (unit: UnitGroup, x: number, y: number) => {
    sim.current.troops.push(coach(makeTroop(unit, x, y, config.power?.[unit] ?? 1, rand)));
  };
  const doDeployHero = (key: string, x: number, y: number) => {
    const h = heroes.find(hh => hh.key === key);
    if (!h) return;
    sim.current.troops.push(coach(makeHeroTroop(h, x, y)));
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
  };
  const doCastPlay = (key: string, x: number, y: number) => {
    const p = PLAYBOOK.find(pp => pp.key === key);
    if (!p) return;
    sim.current.troops.forEach(t => {
      if (t.dead) return;
      if (dist(t.x, t.y, x, y) <= p.radius) {
        if (p.key === 'blitz') t.rageT = RAGE_SECONDS;
        else if (p.key === 'medic') t.healT = HEAL_SECONDS;
      }
    });
    sim.current.pulses.push({ x, y, r: p.radius, life: 0.5, maxLife: 0.5, color: p.color });
  };
  const [, forceTick] = useState(0);
  const [result, setResult] = useState<BattleResult | null>(null);

  const total = config.buildings.filter(b => b.kind !== 'wall').length; // walls don't count toward %

  // Kickoff: referee whistle + crowd stir the moment play starts; the crowd BED hums
  // underneath the whole battle and dies with the final whistle.
  useEffect(() => {
    if (phase === 'fighting') { sfx.kickoff(); say(config.homeGuards?.length ? `KICKOFF! Your ${config.homeGuards.length} defenders take the field!` : `KICKOFF! ${config.title.toUpperCase()}!`); crowdBedStart(); }
    if (phase === 'result') crowdBedStop();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => crowdBedStop(), []); // never leak the loop on exit

  const endBattle = () => {
    if (sim.current.ended) return;
    sim.current.ended = true;
    const s = sim.current;
    const destroyed = s.buildings.filter(b => b.dead && b.kind !== 'wall').length;
    const pct = Math.round((destroyed / total) * 100);
    const hqDead = s.buildings.find(b => b.kind === 'hq')?.dead ?? false;
    const stars = (pct >= 50 ? 1 : 0) + (hqDead ? 1 : 0) + (pct >= 99 ? 1 : 0);
    const frac = destroyed / total;
    // Drive summary: who was your MVP, what did the defense cost you, what did you take.
    if (!isDefense) {
      const best = [...s.troops].sort((a, b) => (b.dmg ?? 0) - (a.dmg ?? 0))[0];
      const mvpName = !best ? '—'
        : best.isHero ? (heroes.find(h => h.key === best.heroKey)?.name ?? 'Hero')
        : best.special ? (best.special === 'mascot' ? 'The Mascot' : 'The Fan Mob')
        : `#${best.jersey} ${TROOP_STATS[best.unit].label}`;
      setDriveStats({ mvp: mvpName, mvpDmg: Math.round(best?.dmg ?? 0), pancakes: s.pancakes, lost: s.lost, bonus: s.bonus });
    }
    // Live-rival attack? Package the full recording so the defender can WATCH this drive.
    const replay: ReplayData | undefined = (!isReplay && config.pvpTarget) ? {
      v: 1, seed: seedRef.current, plan: planRef.current.key,
      power: config.power, heroes, specials, layout: config.buildings,
      script: recRef.current,
    } : undefined;
    setResult({ mode: config.mode, title: config.title, stars, pct, coins: Math.round(config.loot.coins * frac) + s.bonus, fans: Math.round(config.loot.fans * frac), won: isDefense ? pct < 50 : stars > 0, campaignStage: config.campaignStage, pvpTarget: config.pvpTarget, isReplay: isReplay || undefined, replay });
    setPhase('result');
  };

  useEffect(() => {
    if (phase !== 'fighting') return;
    const iv = setInterval(() => {
      const s = sim.current;
      if (s.ended) return;
      // REPLAY: fire the attacker's recorded actions scheduled for this tick boundary —
      // same code path, same RNG order, so the drive unfolds exactly as it happened.
      if (config.replay) {
        for (const a of config.replay.script) {
          if (a.tick !== s.ticks) continue;
          if (a.k === 't') doDeployTroop(a.u!, a.x!, a.y!);
          else if (a.k === 'h') { doDeployHero(a.key!, a.x!, a.y!); setDeployedHeroes(prev => new Set(prev).add(a.key!)); }
          else if (a.k === 's') doDeploySpecial(a.key!, a.x!, a.y!);
          else if (a.k === 'p') doCastPlay(a.key!, a.x!, a.y!);
          else if (a.k === 'a') useAbility(a.key!);
        }
      }
      s.ticks++;
      // Freeze-frame on a touchdown — let the moment land.
      if (s.freezeT > 0) { s.freezeT -= DT; forceTick(x => x + 1); return; }

      for (const t of s.troops) {
        if (t.dead) continue;
        if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - DT);
        if (t.rageT > 0) t.rageT = Math.max(0, t.rageT - DT);
        if (t.healT > 0) { t.healT = Math.max(0, t.healT - DT); t.hp = Math.min(t.maxHp, t.hp + HEAL_PER_SEC * DT); }
        if (t.shieldT && t.shieldT > 0) t.shieldT = Math.max(0, t.shieldT - DT);
        if (t.slowT && t.slowT > 0) t.slowT = Math.max(0, t.slowT - DT);
        if (t.abilityCd && t.abilityCd > 0) t.abilityCd = Math.max(0, t.abilityCd - DT);

        const raging = t.rageT > 0;
        const dps = t.dps * (raging ? 2 : 1);
        const speed = t.speed * (raging ? 1.5 : 1) * ((t.slowT ?? 0) > 0 ? 0.55 : 1); // penalty flag = mud in your cleats

        const goal = nearestBuilding(t.x, t.y, s.buildings, t.special ? undefined : UNIT_PREF[t.unit]); // position-group targeting roles
        if (!goal) continue;
        // Wall-aware routing: replan when the goal changes, the route's wall falls, or it goes stale.
        if (!t.plan || t.plan.goalId !== goal.id || (t.plan.age += DT) > 1.1) t.plan = planPath(t.x, t.y, goal, s.buildings);
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
          const step = direct ? Math.min(speed * DT, d - stopAt) : speed * DT;
          if (Math.abs(wp.x - t.x) > 0.3) (t as BTroop & { face?: number }).face = wp.x > t.x ? 1 : -1; // sprites face where they run
          t.x += ((wp.x - t.x) / md) * step;
          t.y += ((wp.y - t.y) / md) * step;
          if (rand() < 0.05) s.fx.push({ type: 'dust', x: t.x, y: t.y + 1.6, life: 0.4, maxLife: 0.4 });
        } else {
          t.attacking = true;
          target.hp -= dps * DT;
          t.dmg = (t.dmg ?? 0) + dps * DT;
          // Contact sparkle — the block/tackle work on the building is VISIBLE
          if (rand() < 0.06) s.fx.push({ type: 'impact', x: (t.x + target.x) / 2, y: (t.y + target.y) / 2 - 1, life: 0.3, maxLife: 0.3 });
          // Floating damage numbers — throttled per player so hits read without spamming.
          t.dmgAcc = (t.dmgAcc ?? 0) + dps * DT;
          t.dmgTimer = (t.dmgTimer ?? 0) + DT;
          if (t.dmgTimer >= 0.65) {
            s.fx.push({ type: 'dmg', text: `${Math.max(1, Math.round(t.dmgAcc))}`, color: '#fde047', x: target.x + (rand() * 4 - 2), y: target.y - target.size * 0.4, life: 0.7, maxLife: 0.7 });
            t.dmgAcc = 0; t.dmgTimer = 0;
          }
          // GOAL-LINE STAND: crack their stadium below half and the defense throws everything at you.
          if (!s.goalLine && target.kind === 'hq' && target.hp < target.maxHp * 0.5) {
            s.goalLine = true;
            for (let gi = 0; gi < 2; gi++) s.guards.push({ id: `g${++troopUid}`, unit: UnitGroup.DEFENSE_LINE, x: target.x + (gi ? 3 : -3), y: target.y + 2, hp: Math.round(150 * guardMult), maxHp: Math.round(150 * guardMult), dps: 12 * guardMult, speed: 13, range: 3, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 50 + Math.floor(rand() * 49) });
            say(povDefense ? '🚨 GOAL-LINE STAND — your boys dig in at the goal line!' : '🚨 GOAL-LINE STAND — they\'re throwing EVERYBODY at you!');
            s.shakeT = 0.25;
          }
          if (rand() < 0.12) s.fx.push({ type: 'impact', x: target.x, y: target.y - target.size * 0.3, life: 0.22, maxLife: 0.22 });
          if (target.hp <= 0) {
            target.hp = 0; target.dead = true; t.targetId = null;
            if (target.kind !== 'wall') {
              const scored = target.kind === 'hq'; // taking their stadium = the score
              s.fx.push({ type: 'yards', text: scored ? 'TOUCHDOWN!' : 'SACKED!', x: target.x, y: target.y, life: scored ? 1.5 : 1.0, maxLife: scored ? 1.5 : 1.0 });
              say(scored ? '🏈 TOUCHDOWN!! The home crowd goes DEAD silent!' : ['Another facility SACKED!', 'They tear through the complex!', 'That building is DONE for the day!'][Math.floor(rand() * 3)]);
              s.momentum = Math.min(100, s.momentum + (scored ? 25 : 12) * planRef.current.momentum);
              if (scored) { s.freezeT = 0.45; sfx.crowdRoar(); } // freeze-frame + the stadium erupts
              // 💥 The teardown MOMENT: shockwave ring + tumbling debris + smoke + loot.
              s.pulses.push({ x: target.x, y: target.y, r: scored ? 15 : 10, life: 0.45, maxLife: 0.45, color: scored ? '#fde047' : '#f8fafc' });
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
        const src = aliveDef[Math.floor(rand() * aliveDef.length)];
        s.guards.push({ id: `g${++troopUid}`, unit: UnitGroup.DEFENSE_LINE, x: src.x, y: src.y, hp: Math.round(140 * guardMult), maxHp: Math.round(140 * guardMult), dps: 11 * guardMult, speed: 12, range: 3, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 40 + Math.floor(rand() * 59) });
        say(povDefense ? 'YOUR defense sends out a linebacker!' : 'The defense sends out a LINEBACKER!');
      }
      for (const g of s.guards) {
        if (g.dead) continue;
        if (g.hitFlash > 0) g.hitFlash = Math.max(0, g.hitFlash - DT);
        // chase the nearest living attacker
        let prey: BTroop | null = null, pd = 1e9;
        for (const t of s.troops) { if (t.dead) continue; const dd = dist(g.x, g.y, t.x, t.y); if (dd < pd) { pd = dd; prey = t; } }
        if (!prey) continue;
        if (pd > 3.2) {
          if (Math.abs(prey.x - g.x) > 0.3) (g as BTroop & { face?: number }).face = prey.x > g.x ? 1 : -1;
          g.x += ((prey.x - g.x) / pd) * g.speed * DT;
          g.y += ((prey.y - g.y) / pd) * g.speed * DT;
          g.attacking = false;
        } else {
          // the tackle: mutual damage — your player fights through at reduced output
          g.attacking = true;
          const shieldFactor = (prey.shieldT && prey.shieldT > 0) ? 0.5 : 1;
          const preyOut = prey.dps * (prey.rageT > 0 ? 2 : 1) * 0.55 * DT;
          prey.hp -= g.dps * shieldFactor * DT; prey.hitFlash = 0.12;
          g.hp -= preyOut; g.hitFlash = 0.12;
          prey.dmg = (prey.dmg ?? 0) + preyOut;
          // Red numbers when the defense is chewing on your player.
          g.dmgAcc = (g.dmgAcc ?? 0) + g.dps * shieldFactor * DT;
          g.dmgTimer = (g.dmgTimer ?? 0) + DT;
          if (g.dmgTimer >= 0.65) {
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
            s.fx.push({ type: 'down', text: `${g.jersey ?? ''}`, color: isDefense ? '#111827' : '#b91c1c', x: g.x, y: g.y, life: 1.1, maxLife: 1.1 });
            prey.kills = (prey.kills ?? 0) + 1;
            if (!isDefense) {
              // Takeaway pays the ATTACKER only — never inflate your own defense losses.
              s.pancakes++; s.bonus += 25; s.momentum = Math.min(100, s.momentum + 10 * planRef.current.momentum);
              say(isReplay ? `💥 They PANCAKE your linebacker!` : `💥 TAKEAWAY! Linebacker PANCAKED — bonus loot! (+25)`);
              for (let ci = 0; ci < 3; ci++) { const ca = rand() * Math.PI * 2; s.fx.push({ type: 'coin', x: g.x, y: g.y, vx: Math.cos(ca) * 8, vy: Math.sin(ca) * 4 - 8, life: 0.6, maxLife: 0.6 }); }
            } else {
              say(`Your #${g.jersey ?? '??'} gets flattened — they keep coming!`);
            }
            s.fx.push({ type: 'impact', x: g.x, y: g.y, life: 0.3, maxLife: 0.3 });
          }
        }
      }

      // MOMENTUM: builds on sacks/pancakes, drains on losses, decays over time.
      // Fill the meter and the whole squad catches fire. The crowd breathes with it.
      if (!isDefense) {
        s.momentum = Math.max(0, s.momentum - 1.5 * DT);
        if (Math.round(s.time * 20) % 20 === 0) crowdBedIntensity(s.momentum / 100); // ~1x/sec
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
      if (isDefense && (config.fans ?? 0) >= CROWD_PULSE.minFans) {
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
        const hit = Math.round(raw * ((t.shieldT && t.shieldT > 0) ? 0.5 : 1));
        t.hp -= hit; t.hitFlash = 0.15;
        s.fx.push({ type: 'dmg', text: `${hit}`, color: '#f87171', x: t.x + (rand() * 3 - 1.5), y: t.y - 2.5, life: 0.7, maxLife: 0.7 });
        if (rand() < 0.3) s.fx.push({ type: 'impact', x: t.x, y: t.y - 0.5, life: 0.28, maxLife: 0.28 });
        if (t.hp <= 0) {
          t.hp = 0; t.dead = true; s.lost++; s.momentum = Math.max(0, s.momentum - 6);
          s.fx.push({ type: 'down', text: `${t.jersey ?? ''}`, color: isDefense ? '#b91c1c' : '#111827', x: t.x, y: t.y, life: 1.1, maxLife: 1.1 });
        }
      };
      for (const b of s.buildings) {
        if (b.dead || b.kind !== 'defense' || !b.damage || !b.range) continue;
        b.cooldown -= DT;
        if (b.cooldown > 0) continue;
        const prey = nearestTroop(b.x, b.y, s.troops, b.range);
        if (!prey) { b.cooldown = 0.1; continue; }
        const fl = b.flavor;
        if (fl === 'tshirt') {
          // T-Shirt Cannon: splash — everyone bunched near the target eats it
          for (const t of s.troops) { if (!t.dead && dist(t.x, t.y, prey.x, prey.y) <= 7) hitTroop(t, b.damage * 0.7); }
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
      const anyToDeploy = UNIT_ORDER.some(u => army[u] > 0) || heroes.some(h => !deployedHeroes.has(h.key)) || specials.some(sp => (specialCharges[sp.key] ?? 0) > 0);
      if (allDead || s.time <= 0 || (s.troops.length > 0 && !anyTroopAlive && !anyToDeploy)) endBattle();
      forceTick(x => x + 1);
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [phase, army, deployedHeroes, specialCharges]);

  const useAbility = (heroKey: string) => {
    const s = sim.current;
    const h = s.troops.find(t => t.heroKey === heroKey && !t.dead);
    if (!h || (h.abilityCd ?? 0) > 0) return;
    record({ k: 'a', key: heroKey });
    if (h.ability === 'hailmary') {
      const tgt = nearestBuilding(h.x, h.y, s.buildings);
      if (tgt) {
        tgt.hp -= 300 + h.dps * 4;
        if (tgt.hp <= 0) { tgt.hp = 0; tgt.dead = true; }
        s.pulses.push({ x: tgt.x, y: tgt.y, r: 11, life: 0.4, maxLife: 0.4, color: '#f59e0b' });
        s.shakeT = 0.2;
      }
    } else if (h.ability === 'truckstick') {
      h.rageT = 6; h.hp = h.maxHp;
      s.pulses.push({ x: h.x, y: h.y, r: 9, life: 0.4, maxLife: 0.4, color: '#7c3aed' });
    } else if (h.ability === 'motivation') {
      s.troops.forEach(t => {
        if (!t.dead && dist(h.x, h.y, t.x, t.y) <= 20) {
          t.rageT = 4;
        }
      });
      s.pulses.push({ x: h.x, y: h.y, r: 20, life: 0.45, maxLife: 0.45, color: '#10b981' });
    } else if (h.ability === 'onside_bomb') {
      const tgt = nearestBuilding(h.x, h.y, s.buildings);
      if (tgt) {
        tgt.hp -= 500;
        if (tgt.hp <= 0) { tgt.hp = 0; tgt.dead = true; }
        s.buildings.forEach(b => {
          if (!b.dead && b.id !== tgt.id && dist(tgt.x, tgt.y, b.x, b.y) <= 12) {
            b.hp -= 250;
            if (b.hp <= 0) { b.hp = 0; b.dead = true; }
          }
        });
        s.pulses.push({ x: tgt.x, y: tgt.y, r: 12, life: 0.5, maxLife: 0.5, color: '#3b82f6' });
        s.shakeT = 0.35;
      }
    } else if (h.ability === 'burner_dash') {
      const goal = nearestBuilding(h.x, h.y, s.buildings);
      if (goal) {
        h.x = goal.x;
        h.y = goal.y;
        h.rageT = 2.5;
        s.pulses.push({ x: goal.x, y: goal.y, r: 8, life: 0.4, maxLife: 0.4, color: '#ef4444' });
      }
    } else if (h.ability === 'field_medic') {
      // Heal all nearby troops for a big chunk + a regen window.
      s.troops.forEach(t => {
        if (!t.dead && dist(h.x, h.y, t.x, t.y) <= 18) { t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.35); t.healT = 5; }
      });
      s.pulses.push({ x: h.x, y: h.y, r: 18, life: 0.5, maxLife: 0.5, color: '#22c55e' });
    } else if (h.ability === 'shield_wall') {
      // Nearby troops take half damage for 5s.
      s.troops.forEach(t => { if (!t.dead && dist(h.x, h.y, t.x, t.y) <= 16) t.shieldT = 5; });
      s.pulses.push({ x: h.x, y: h.y, r: 16, life: 0.5, maxLife: 0.5, color: '#0ea5e9' });
    } else if (h.ability === 'trick_play') {
      // Summon a burst of skill players around the hero.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        s.troops.push(coach(makeTroop(UnitGroup.OFFENSE_SKILL, h.x + Math.cos(a) * 3, h.y + Math.sin(a) * 3, config.power?.[UnitGroup.OFFENSE_SKILL] ?? 1, rand)));
      }
      s.pulses.push({ x: h.x, y: h.y, r: 10, life: 0.5, maxLife: 0.5, color: '#ec4899' });
    } else if (h.ability === 'hall_of_fame') {
      // Rage + full heal for the ENTIRE squad.
      s.troops.forEach(t => { if (!t.dead) { t.rageT = 6; t.hp = t.maxHp; } });
      s.pulses.push({ x: h.x, y: h.y, r: 26, life: 0.6, maxLife: 0.6, color: '#a855f7' });
      s.shakeT = 0.3;
    }
    h.abilityCd = ABILITY_CD;
    forceTick(x => x + 1);
  };

  const perimeterOk = (wx: number, wy: number) => !sim.current.buildings.some(b => !b.dead && dist(wx, wy, b.x, b.y) < 14);

  // 🔁 ROLLING DEPLOY: when a position group runs dry, selection rolls to the next group
  // with players — and when the whole roster is on the field, the next tap sends a HERO.
  // One finger, the entire team. (Phase C finding: "it should roll from group to group.")
  const rollSelection = () => {
    const rem = armyRef.current;
    const next = UNIT_ORDER.find(u => rem[u] > 0);
    if (next) { setSelected(next); selectedRef.current = next; setPendingHero(null); return; }
    const nextHero = heroes.find(h => !deployedHeroesRef.current.has(h.key));
    if (nextHero) setPendingHero(nextHero);
  };

  /** Deploy one troop of the current group at (wx,wy). Ref-based so pours can't go stale. */
  const deployTroopAt = (wx: number, wy: number): boolean => {
    const u = selectedRef.current;
    if ((armyRef.current[u] ?? 0) <= 0 || !perimeterOk(wx, wy)) return false;
    doDeployTroop(u, wx, wy);
    record({ k: 't', u, x: wx, y: wy });
    armyRef.current = { ...armyRef.current, [u]: armyRef.current[u] - 1 };
    setArmy(a => ({ ...a, [u]: a[u] - 1 }));
    if (phase === 'deploy') setPhase('fighting');
    if (armyRef.current[u] <= 0) rollSelection(); // group empty → roll on
    return true;
  };

  // 🫗 HOLD & DRAG on the field = pour the group out continuously (throttled).
  const pourRef = useRef<{ down: boolean; lastT: number; poured: boolean }>({ down: false, lastT: 0, poured: false });
  const tryPour = (e: React.PointerEvent) => {
    if (isDefense || isReplay || phase === 'result' || castMode || pendingSpecial || pendingHero) return;
    const now = performance.now();
    if (now - pourRef.current.lastT < 170) return;
    const rect = fieldRef.current!.getBoundingClientRect();
    const wx = ((e.clientX - rect.left) / rect.width) * 100;
    const wy = ((e.clientY - rect.top) / rect.height) * 100;
    if (deployTroopAt(wx, wy)) { pourRef.current.lastT = now; pourRef.current.poured = true; }
  };

  const handleFieldClick = (e: React.MouseEvent) => {
    if (isDefense || phase === 'result') return;
    if (pourRef.current.poured) { pourRef.current.poured = false; return; } // this click is a pour's tail
    const rect = fieldRef.current!.getBoundingClientRect();
    const wx = ((e.clientX - rect.left) / rect.width) * 100;
    const wy = ((e.clientY - rect.top) / rect.height) * 100;

    if (castMode) {
      if ((plays[castMode.key] ?? 0) <= 0) return;
      doCastPlay(castMode.key, wx, wy);
      record({ k: 'p', key: castMode.key, x: wx, y: wy });
      setPlays(p => ({ ...p, [castMode.key]: p[castMode.key] - 1 }));
      setCastMode(null);
      return;
    }

    if (pendingHero) {
      if (!perimeterOk(wx, wy)) return;
      doDeployHero(pendingHero.key, wx, wy);
      record({ k: 'h', key: pendingHero.key, x: wx, y: wy });
      deployedHeroesRef.current.add(pendingHero.key);
      setDeployedHeroes(prev => new Set(prev).add(pendingHero.key));
      setPendingHero(null);
      if (phase === 'deploy') setPhase('fighting');
      rollSelection(); // keep the flow: back to remaining players, or arm the next hero
      return;
    }

    if (pendingSpecial) {
      if ((specialCharges[pendingSpecial.key] ?? 0) <= 0 || !perimeterOk(wx, wy)) return;
      doDeploySpecial(pendingSpecial.key, wx, wy);
      record({ k: 's', key: pendingSpecial.key, x: wx, y: wy });
      setSpecialCharges(c => ({ ...c, [pendingSpecial.key]: c[pendingSpecial.key] - 1 }));
      setPendingSpecial(null);
      if (phase === 'deploy') setPhase('fighting');
      return;
    }

    deployTroopAt(wx, wy);
  };

  const s = sim.current;
  const destroyed = s.buildings.filter(b => b.dead && b.kind !== 'wall').length;
  // Drive = DAMAGE dealt, not just demolitions — the meter moves within seconds of
  // first contact instead of sitting at 0% until a whole building falls (TASK-4).
  const nonWall = s.buildings.filter(b => b.kind !== 'wall');
  const pct = nonWall.length ? Math.round(nonWall.reduce((sum, b) => sum + (1 - Math.max(0, b.hp) / b.maxHp), 0) / nonWall.length * 100) : 0;
  const hqDead = s.buildings.find(b => b.kind === 'hq')?.dead ?? false;
  const liveStars = (pct >= 50 ? 1 : 0) + (hqDead ? 1 : 0) + (pct >= 99 ? 1 : 0);
  const timeLeft = Math.max(0, Math.ceil(s.time));

  const instruction = castMode ? `Tap the field to call ${castMode.name}`
    : pendingSpecial ? `Tap the sideline to send in the ${pendingSpecial.name}`
    : pendingHero ? `Tap the sideline to send in ${pendingHero.name}`
    : army[selected] > 0 ? `${TROOP_STATS[selected].label}: ${TROOP_STATS[selected].hint} — tap, or HOLD & DRAG to pour them in`
    : 'Pick your offense — players, heroes, or plays';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col select-none">
      {/* 🆚 Pre-game matchup card (tap to skip) */}
      {matchup && (
        <div className="absolute inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in" onClick={() => setMatchup(false)}>
          <div className="w-full max-w-md px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 text-center min-w-0">
                <div className="w-16 h-16 mx-auto rounded-full border-4 border-orange-500 bg-[#111827] overflow-hidden relative flex items-center justify-center">
                  <span className="text-2xl">🏈</span>
                  <img src="/assets/brand/app-icon.png" alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover" />
                </div>
                <div className="mt-2 font-display font-black text-white uppercase text-sm leading-tight truncate">{config.attackerName ?? 'Your Squad'}</div>
                <div className="text-[10px] text-orange-300 font-bold uppercase mt-0.5">{plan.emoji} {plan.name}</div>
              </div>
              <div className="shrink-0 font-display font-black text-4xl italic text-yellow-400" style={{ textShadow: '0 0 14px rgba(250,204,21,0.5), 0 3px 6px #000' }}>VS</div>
              <div className="flex-1 text-center min-w-0">
                <div className="w-16 h-16 mx-auto rounded-full border-4 border-red-600 bg-[#111827] overflow-hidden relative flex items-center justify-center" style={config.rival ? { background: `radial-gradient(circle at 35% 30%, ${config.rival.color}bb, #0f172a 90%)` } : undefined}>
                  <span className="text-2xl">{config.rival?.emoji ?? '🛡'}</span>
                  {config.rival && <img src={config.rival.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover" />}
                </div>
                <div className="mt-2 font-display font-black text-white uppercase text-sm leading-tight truncate">{config.rival?.name ?? config.title.replace(/^(Raiding|Attacking)\s+/i, '')}</div>
                {defFormation && FORMATIONS[defFormation] && <div className="text-[10px] text-sky-300 font-bold uppercase mt-0.5">📋 {FORMATIONS[defFormation].name}</div>}
              </div>
            </div>
            {config.rival?.intro && <p className="mt-5 text-center text-[12px] italic text-slate-300 leading-snug">“{config.rival.intro}”</p>}
            <div className="mt-5 text-center text-[10px] uppercase tracking-widest text-slate-500 font-bold animate-pulse">Kickoff — tap to skip</div>
          </div>
        </div>
      )}
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-2.5 sm:px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={onExit} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white shrink-0"><X size={18} /></button>
          <div className="min-w-0">
            {/* Phone: ONE line, truncated — the two-line wrap crushed the whole bar */}
            <div className="font-display font-bold text-white uppercase tracking-tight leading-none flex items-center gap-1.5 sm:gap-2 text-[13px] sm:text-base min-w-0">
              {isDefense && <Shield size={14} className="text-blue-400 shrink-0" />}<span className="truncate">{config.title}</span>
              {isReplay && <span className="text-[9px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded animate-pulse shrink-0">● REPLAY</span>}
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-sm sm:text-base leading-none">
              {[0, 1, 2].map(i => <span key={i} style={{ opacity: i < liveStars ? 1 : 0.25, filter: i < liveStars ? 'none' : 'grayscale(1)' }}>🏈</span>)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="text-center">
            <div className="text-[9px] sm:text-[10px] uppercase text-slate-500 font-bold leading-none whitespace-nowrap">{isDefense ? 'Ground lost' : 'Drive'}</div>
            <div className={`font-mono font-bold text-base sm:text-lg leading-none ${isDefense && pct >= 50 ? 'text-red-400' : 'text-white'}`}>{pct}%</div>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold ${timeLeft <= 10 ? 'bg-red-900/50 text-red-300' : 'bg-slate-800 text-white'}`}>
            <Clock size={15} /> 0:{timeLeft.toString().padStart(2, '0')}
          </div>
        </div>
      </div>

      {/* Battlefield */}
      <div className="flex-1 flex items-center justify-center p-3 overflow-hidden bg-gradient-to-b from-emerald-900 to-emerald-950">
        <div ref={fieldRef} onClick={handleFieldClick}
          onPointerDown={() => { pourRef.current.down = true; }}
          onPointerMove={e => { if (pourRef.current.down) tryPour(e); }}
          onPointerUp={() => { pourRef.current.down = false; }}
          onPointerLeave={() => { pourRef.current.down = false; }}
          className={`relative rounded-2xl overflow-hidden shadow-2xl ${isDefense ? '' : castMode ? 'cursor-pointer ring-4 ring-offset-0' : 'cursor-crosshair'}`}
          style={{ width: 'min(96vw, 74vh)', height: 'min(96vw, 74vh)', background: 'repeating-linear-gradient(180deg, #2f9e44 0% 10%, #2b8a3e 10% 20%)', border: '3px solid #14532d', animation: s.shakeT > 0 ? 'fhq-shake 0.25s ease-in-out' : undefined, transform: `scale(${((typeof window !== 'undefined' && window.innerWidth < 640 ? 1.0 : isDefense || isReplay ? 1.24 : 1.18) * (1 + (s.punchT > 0 ? s.punchT * 0.16 : 0))).toFixed(3)})`, /* phones: field is already 96vw — zooming cropped both edges */ transition: 'transform 90ms ease-out', touchAction: isDefense || isReplay ? undefined : 'none', ...(castMode ? { boxShadow: `0 0 0 3px ${castMode.color}` } : {}) }}>

          {/* 🏟 FIELD PAINT — yard lines, hash marks, end zones, midfield mark. The fight
              happens ON A FOOTBALL FIELD, not a green checkerboard. */}
          <div className="absolute inset-0 pointer-events-none z-0">
            {/* end zones */}
            <div className="absolute left-0 right-0" style={{ top: 0, height: '9%', background: 'repeating-linear-gradient(45deg, rgba(249,115,22,0.24) 0 10px, rgba(249,115,22,0.10) 10px 20px)', borderBottom: '2px solid rgba(255,255,255,0.65)' }} />
            <div className="absolute left-0 right-0" style={{ bottom: 0, height: '9%', background: 'repeating-linear-gradient(45deg, rgba(30,41,59,0.35) 0 10px, rgba(30,41,59,0.18) 10px 20px)', borderTop: '2px solid rgba(255,255,255,0.65)' }} />
            {/* yard lines + numbers */}
            {[19, 29, 39, 49.25, 59, 69, 79].map((p, i) => (
              <div key={p} className="absolute left-0 right-0" style={{ top: `${p}%` }}>
                <div style={{ height: i === 3 ? 2.5 : 1.5, background: `rgba(255,255,255,${i === 3 ? 0.7 : 0.42})` }} />
                <span className="absolute font-black text-white/35" style={{ left: '2.5%', top: -14, fontSize: '2vmin' }}>{[10, 20, 30, 50, 30, 20, 10][i]}</span>
              </div>
            ))}
            {/* hash marks */}
            {(['31%', '67%'] as const).map(x => (
              <div key={x} className="absolute top-[10%] bottom-[10%]" style={{ left: x, width: 4, backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.35) 0 4px, transparent 4px 22px)' }} />
            ))}
            {/* midfield mark */}
            <div className="absolute rounded-full border-2 border-white/30 flex items-center justify-center" style={{ left: '50%', top: '49.25%', width: '13%', height: '13%', transform: 'translate(-50%,-50%)' }}>
              <span style={{ fontSize: '3.4vmin', opacity: 0.5 }}>🏈</span>
            </div>
          </div>

          {/* 🏰 MOAT + DRAWBRIDGES (home base views): a water ring outside the walls and
              plank bridges at the gates — attackers cross the moat, storm the gate. */}
          {(isDefense || isReplay) && (
            <div className="absolute inset-0 pointer-events-none z-0">
              <div className="absolute rounded-[10%]" style={{ left: '6%', top: '6%', right: '6%', bottom: '6%', boxShadow: '0 0 0 3.2vmin rgba(37,99,235,0.28), 0 0 0 3.6vmin rgba(147,197,253,0.25)' }} />
              {[{ l: '47%', t: '2.2%', w: '7%', h: '5%' }, { l: '47%', t: '92.8%', w: '7%', h: '5%' }, { l: '2.2%', t: '47%', w: '5%', h: '7%' }, { l: '92.8%', t: '47%', w: '5%', h: '7%' }].map((b, i) => (
                <div key={i} className="absolute" style={{ left: b.l, top: b.t, width: b.w, height: b.h, background: 'repeating-linear-gradient(90deg, #7c4a24 0 6px, #935a2e 6px 12px)', border: '1.5px solid #4a2c14', borderRadius: 3, boxShadow: '0 2px 4px rgba(0,0,0,0.45)' }} />
              ))}
            </div>
          )}

          {/* Stadium surround — a dark stands ring + crowd doing the wave on all four sides.
              The crowd SWELLS with momentum: dots grow, the wave speeds up, the stands
              glow warmer — a hot drive FEELS hot before you read a single number. */}
          {(() => { const crowdE = Math.min(1, Math.max(0, s.momentum) / 100); const dot = 5 + crowdE * 3.5; const waveDur = (1.3 - crowdE * 0.65).toFixed(2); return (
          <div className="absolute inset-0 pointer-events-none z-0">
            <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: `inset 0 0 0 14px rgba(15,23,42,0.35)${crowdE > 0.4 ? `, inset 0 0 ${Math.round(crowdE * 26)}px rgba(249,115,22,${(crowdE * 0.35).toFixed(2)})` : ''}` }} />
            {(['top', 'bottom'] as const).map(side => (
              <div key={side} className="absolute left-0 right-0 flex justify-around px-1" style={{ [side]: 2 }}>
                {Array.from({ length: 26 }).map((_, i) => (
                  <div key={i} style={{ width: dot, height: dot, borderRadius: '50%', background: i % 3 === 0 ? '#f59e0b' : i % 3 === 1 ? '#3b82f6' : '#e2e8f0', filter: crowdE > 0.5 ? 'brightness(1.35)' : undefined, animation: `fhq-wave ${waveDur}s ease-in-out ${(i * 0.05).toFixed(2)}s infinite` }} />
                ))}
              </div>
            ))}
            {(['left', 'right'] as const).map(side => (
              <div key={side} className="absolute top-0 bottom-0 flex flex-col justify-around py-1" style={{ [side]: 2 }}>
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} style={{ width: dot, height: dot, borderRadius: '50%', background: i % 3 === 0 ? '#e2e8f0' : i % 3 === 1 ? '#f59e0b' : '#3b82f6', filter: crowdE > 0.5 ? 'brightness(1.35)' : undefined, animation: `fhq-wave ${waveDur}s ease-in-out ${(i * 0.05).toFixed(2)}s infinite` }} />
                ))}
              </div>
            ))}
            {/* 🅿️ THE APRON IS YOUR FAN ECONOMY — every Parking Lot level visibly packs
                the outer ring with real tailgate art. Raiders fight through your fans. */}
            {(() => {
              const pl = Math.min(3, Math.max(0, config.parkingLot ?? 0));
              const img = (src: string, style: React.CSSProperties, key: string) => (
                <img key={key} src={src} alt="" draggable={false}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  className="absolute pointer-events-none" style={{ opacity: 0.95, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))', ...style }} />
              );
              const props: React.ReactNode[] = [
                // every base has SOME tailgaters (corners)
                img('/assets/decor/tailgate-tent.png', { left: '1%', top: '1%', width: '9%' }, 'tt1'),
                img('/assets/decor/merch-stand.png', { right: '1%', bottom: '1%', width: '9%' }, 'ms1'),
              ];
              if (pl >= 1) {
                props.push(img('/assets/decor/parking-lot.png', { right: '1%', top: '1%', width: '11%' }, 'pk1'));
                props.push(img('/assets/decor/parking-lot.png', { left: '1%', bottom: '1%', width: '11%' }, 'pk2'));
              }
              if (pl >= 2) {
                props.push(img('/assets/decor/tailgate-tent.png', { left: '45%', top: '0.5%', width: '8%' }, 'tt2'));
                props.push(img('/assets/decor/parking-lot.png', { left: '45%', bottom: '0.5%', width: '10%' }, 'pk3'));
              }
              if (pl >= 3) {
                props.push(img('/assets/decor/tailgate-tent.png', { left: '0.5%', top: '44%', width: '8%' }, 'tt3'));
                props.push(img('/assets/decor/merch-stand.png', { right: '0.5%', top: '44%', width: '8%' }, 'ms2'));
              }
              return (
                <>
                  {pl > 0 && <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: `inset 0 0 0 ${5 + pl * 2.2}vmin rgba(52,58,70,0.30)` }} />}
                  {props}
                  {pl > 0 && <span className="absolute font-black text-white/25" style={{ left: '4%', bottom: '12%', fontSize: '2.2vmin' }}>🅿️ L{pl}</span>}
                </>
              );
            })()}
          </div>
          ); })()}

          {!isDefense && phase === 'deploy' && (
            <div className="absolute rounded-full border-2 border-white/20 border-dashed pointer-events-none" style={{ left: '14%', top: '14%', width: '72%', height: '72%' }} />
          )}

          {/* 🎙️ Rival coach trash talk — the pre-game presser, gone at the snap */}
          {!isDefense && phase === 'deploy' && config.rival && (
            <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none animate-fade-in" style={{ top: '6%', zIndex: 225, width: '86%', maxWidth: 380 }}>
              <div className="flex items-start gap-2.5">
                <div className="relative shrink-0 w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-2xl shadow-lg" style={{ background: `radial-gradient(circle at 35% 30%, ${config.rival.color}cc, #0f172a 90%)`, border: `2px solid ${config.rival.color}` }}>
                  <span className="absolute inset-0 flex items-center justify-center">{config.rival.emoji}</span>
                  <img src={config.rival.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="relative w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wide leading-none mb-1 drop-shadow" style={{ color: config.rival.color }}>{config.rival.name}</div>
                  <div className="relative bg-black/80 border border-white/15 rounded-xl rounded-tl-sm px-3 py-2 text-[11px] sm:text-xs text-slate-100 italic leading-snug shadow-xl">
                    “{config.rival.intro}”
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 📣 Play-by-play announcer */}
          {s.commentary.text && phase === 'fighting' && (
            <div key={s.commentary.text + s.commentary.t} className="absolute left-1/2 -translate-x-1/2 pointer-events-none animate-fade-in" style={{ top: 8, zIndex: 220, maxWidth: '92%' }}>
              <div className="bg-black/75 border border-white/10 rounded-full px-4 py-1.5 text-[11px] sm:text-xs font-bold italic text-amber-100 whitespace-nowrap overflow-hidden text-ellipsis shadow-lg">
                📣 {s.commentary.text}
              </div>
            </div>
          )}

          {/* 🔥 Momentum meter — a labeled pill in the corner, only when it's YOUR live
              drive (in replays/defense it floated mid-field like a rendering glitch). */}
          {!isDefense && !isReplay && phase === 'fighting' && (
            <div className="absolute pointer-events-none flex items-center gap-1.5 rounded-full bg-slate-900/75 border border-white/10 px-2 py-1 shadow-lg" style={{ right: 8, top: 36, zIndex: 218, width: '32%', maxWidth: 170 }}>
              <span className={`text-[10px] font-black ${s.momentum > 75 ? 'text-orange-300 animate-pulse' : 'text-white/50'}`}>🔥</span>
              <div className="flex-1 h-1.5 rounded-full bg-black/60 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${s.momentum}%`, background: s.momentum > 75 ? 'linear-gradient(90deg,#f97316,#fde047)' : '#f97316' }} />
              </div>
            </div>
          )}

          {s.buildings.filter(b => b.kind === 'defense' && !b.dead && b.range).map(b => (
            <div key={`r-${b.id}`} className="absolute rounded-full border border-red-400/20 bg-red-500/5 pointer-events-none"
              style={{ left: `${b.x - b.range!}%`, top: `${b.y - b.range!}%`, width: `${b.range! * 2}%`, height: `${b.range! * 2}%` }} />
          ))}

          {/* Play/ability pulses */}
          {s.pulses.map((p, i) => (
            <div key={i} className="absolute rounded-full border-2 pointer-events-none" style={{ left: `${p.x - p.r}%`, top: `${p.y - p.r}%`, width: `${p.r * 2}%`, height: `${p.r * 2}%`, borderColor: p.color, backgroundColor: `${p.color}22`, opacity: p.life / p.maxLife }} />
          ))}

          {/* Defense "shots" arc through the air — footballs, penalty flags, or t-shirts. Never bullets. */}
          {s.shots.map((sh, i) => {
            const u = sh.t / sh.dur;
            const x = sh.sx + (sh.tx - sh.sx) * u;
            const y = sh.sy + (sh.ty - sh.sy) * u - Math.sin(Math.PI * u) * 9; // parabolic arc
            const proj = sh.flavor === 'ref' ? '🚩' : sh.flavor === 'tshirt' ? '👕' : '🏈';
            const ang = Math.atan2(sh.ty - sh.sy, sh.tx - sh.sx) * 180 / Math.PI;
            return (
              <React.Fragment key={i}>
                {/* motion streak behind the ball — reads as SPEED */}
                <div className="absolute pointer-events-none" style={{ left: `${x}%`, top: `${y}%`, width: '5vmin', height: 2, zIndex: 94, transformOrigin: '100% 50%', transform: `translate(-100%,-50%) rotate(${ang}deg)`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55))', opacity: 0.5 + u * 0.3 }} />
                <div className="absolute pointer-events-none" style={{ left: `${x}%`, top: `${y}%`, width: '3vmin', height: '3vmin', zIndex: 95, transform: `translate(-50%,-50%) rotate(${sh.rot + u * 540}deg)`, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}>
                  <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: '2.4vmin', lineHeight: 1 }}>{proj}</span>
                  {proj === '🏈' && <img src="/assets/battle/football-proj.png" alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-contain" />}
                </div>
              </React.Fragment>
            );
          })}

          {/* Ephemeral FX: dust, impact pops, floating SACKED! */}
          {s.fx.map((f, i) => {
            const k = f.life / f.maxLife; // 1 → 0
            if (f.type === 'yards') {
              const td = f.text === 'TOUCHDOWN!';
              return (
                <div key={i} className="absolute pointer-events-none font-display font-black uppercase" style={{ left: `${f.x}%`, top: `${f.y}%`, color: td ? '#fde047' : '#fef08a', fontSize: td ? '5vmin' : '3.4vmin', letterSpacing: '0.02em', textShadow: td ? '0 0 8px #f59e0b, 0 3px 6px #000' : '0 2px 5px #000, 0 0 3px #000', zIndex: 210, transform: `translate(-50%, calc(-50% - ${(1 - k) * (td ? 46 : 34)}px)) scale(${td ? 1 + (1 - k) * 0.3 : 1})`, opacity: Math.min(1, k * 1.6) }}>{f.text}</div>
              );
            }
            if (f.type === 'dmg') return (
              // Floating damage number — rises and fades, gold for your hits, red for theirs.
              <div key={i} className="absolute pointer-events-none font-black" style={{ left: `${f.x}%`, top: `${f.y}%`, color: f.color, fontSize: '2.1vmin', textShadow: '0 1px 2px #000, 0 0 3px rgba(0,0,0,0.6)', zIndex: 208, transform: `translate(-50%, calc(-50% - ${(1 - k) * 26}px))`, opacity: Math.min(1, k * 1.8) }}>{f.text}</div>
            );
            if (f.type === 'down') return (
              // Knocked-down player — the jersey chip tips over and fades where they fell.
              <div key={i} className="absolute pointer-events-none flex items-center justify-center font-black text-white" style={{ left: `${f.x}%`, top: `${f.y}%`, width: '3vmin', height: '2.1vmin', background: f.color, border: '1px solid rgba(0,0,0,0.5)', borderRadius: 3, fontSize: '1.15vmin', zIndex: 90, transform: `translate(-50%,-30%) rotate(${90 - k * 20}deg)`, opacity: Math.min(0.85, k * 1.4), filter: 'brightness(0.8)' }}>{f.text}</div>
            );
            if (f.type === 'coin') return (
              <span key={i} className="absolute pointer-events-none" style={{ left: `${f.x}%`, top: `${f.y}%`, fontSize: '1.7vmin', lineHeight: 1, zIndex: 205, transform: 'translate(-50%,-50%)', opacity: Math.min(1, k * 2), filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))' }}>🪙</span>
            );
            if (f.type === 'impact') return (
              <div key={i} className="absolute pointer-events-none rounded-full" style={{ left: `${f.x}%`, top: `${f.y}%`, width: '3.6vmin', height: '3.6vmin', background: 'radial-gradient(circle, #fff 0%, #fde047 45%, transparent 72%)', zIndex: 150, transform: `translate(-50%,-50%) scale(${0.6 + (1 - k) * 1.1})`, opacity: k }} />
            );
            if (f.type === 'debris') return (
              // Chunks of the sacked facility tumbling out of the wreck
              <div key={i} className="absolute pointer-events-none" style={{ left: `${f.x}%`, top: `${f.y}%`, width: '1.3vmin', height: '1.3vmin', background: f.color, border: '1px solid rgba(0,0,0,0.4)', borderRadius: 2, zIndex: 160, transform: `translate(-50%,-50%) rotate(${(1 - k) * 560}deg)`, opacity: Math.min(1, k * 1.6) }} />
            );
            if (f.type === 'confetti') return (
              <div key={i} className="absolute pointer-events-none" style={{ left: `${f.x}%`, top: `${f.y}%`, width: '1vmin', height: '1.6vmin', background: f.color, zIndex: 215, transform: `translate(-50%,-50%) rotate(${(1 - k) * 720}deg) scaleY(${0.4 + Math.abs(Math.sin((1 - k) * 9))})`, opacity: Math.min(1, k * 1.8) }} />
            );
            if (f.type === 'smoke') return (
              <div key={i} className="absolute pointer-events-none rounded-full" style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${2 + (1 - k) * 3.4}vmin`, height: `${2 + (1 - k) * 3.4}vmin`, background: 'radial-gradient(circle, rgba(148,163,184,0.5) 0%, rgba(100,116,139,0.25) 55%, transparent 75%)', zIndex: 155, transform: 'translate(-50%,-50%)', opacity: k * 0.8 }} />
            );
            return (
              <div key={i} className="absolute pointer-events-none rounded-full" style={{ left: `${f.x}%`, top: `${f.y}%`, width: '2.4vmin', height: '2.4vmin', background: 'rgba(212,190,150,0.55)', zIndex: 80, transform: `translate(-50%,-50%) scale(${0.4 + (1 - k)})`, opacity: k * 0.55 }} />
            );
          })}

          {s.buildings.map(b => {
            if (b.kind === 'wall') {
              // Blocking Sled — hazard-striped barrier. Sized as a % of the field so it
              // tracks its world footprint at any viewport size.
              return (
                <div key={b.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none" style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.size * 1.7}%`, zIndex: Math.round(b.y) }}>
                  {/* HP bar only once it's TAKEN damage — 30 full green bars was pure noise */}
                  {!b.dead && b.hp < b.maxHp && <div className="h-0.5 rounded-full bg-black/50 overflow-hidden mb-0.5" style={{ width: '85%', minWidth: 18 }}><div className="h-full bg-lime-400" style={{ width: `${(b.hp / b.maxHp) * 100}%` }} /></div>}
                  <img src="/assets/battle/blocking-sled.png" alt="" draggable={false} className="w-full" style={{ height: 'auto', aspectRatio: '1', objectFit: 'contain', opacity: b.dead ? 0.25 : 1, filter: b.dead ? 'grayscale(1) brightness(0.55)' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }} />
                </div>
              );
            }
            // Buildings: width is a % of the field, so `size` (world radius) maps straight
            // to on-screen footprint. HQ size 8 → 17.6% ; buildings size 5–6 → 11–13%.
            const wpct = b.size * 2.8; // buildings OWN their ground — toy-scale was killing the drama
            // Fixed base: layouts carry the REAL building art (type + level) so the field
            // is the same base you built. Old published bases / bot bases lack it → pool art.
            const sprite = b.art ?? battleBuildingSprite(b.kind, b.id, !isDefense && !isReplay, b.flavor);
            return (
              <div key={b.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none" style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${wpct}%`, zIndex: Math.round(b.y) }}>
                {!b.dead && b.hp < b.maxHp && <div className="mb-0.5 h-1 rounded-full bg-black/50 overflow-hidden" style={{ width: '80%', minWidth: 26, maxWidth: 60 }}><div className="h-full bg-green-400" style={{ width: `${(b.hp / b.maxHp) * 100}%` }} /></div>}
                {b.dead ? (
                  <div className="relative w-full" style={{ aspectRatio: '1' }}>
                    <img src={sprite} alt="" draggable={false} className="w-full h-full object-contain" style={{ filter: 'grayscale(1) brightness(0.55)', opacity: 0.5 }} />
                    <span className="absolute inset-0 flex items-center justify-center text-2xl">💥</span>
                  </div>
                ) : (
                  <img src={sprite} alt="" draggable={false} className="w-full" style={{ height: 'auto', filter: 'drop-shadow(0 5px 5px rgba(0,0,0,0.45))' }} />
                )}
              </div>
            );
          })}

          {/* DEFENDERS chasing the attackers — crimson rivals when you raid, YOUR black/orange
              linebackers when it's your stadium being defended */}
          {s.guards.filter(g => !g.dead).map(g => {
            const helm = isDefense ? '#111827' : '#1f2937';
            const stripe = isDefense ? '#f97316' : '#b91c1c';
            const jersey = isDefense ? '#1f2937' : '#b91c1c';
            const art = (g as BTroop & { guardArt?: string }).guardArt; // hero defenders carry their portrait
            const isHeroGuard = !!art;
            return (
              <div key={g.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                style={{ left: `${g.x}%`, top: `${g.y}%`, width: isHeroGuard ? '5.6%' : '4.4%', minWidth: 24, maxWidth: isHeroGuard ? 48 : 38, zIndex: Math.round(g.y) + 99, transition: `left ${TICK_MS}ms linear, top ${TICK_MS}ms linear` }}>
                {g.hp < g.maxHp && <div className="h-0.5 rounded-full bg-black/50 overflow-hidden mb-0.5" style={{ width: '85%' }}><div className={`h-full ${isDefense ? 'bg-lime-400' : 'bg-red-400'}`} style={{ width: `${(g.hp / g.maxHp) * 100}%` }} /></div>}
                <div className="relative w-full" style={{ aspectRatio: '1', opacity: g.hitFlash > 0 ? 0.5 : 1, animation: g.attacking ? 'fhq-pop 0.35s ease-in-out infinite' : 'fhq-bob 0.5s ease-in-out infinite' }}>
                  <div className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/30 pointer-events-none" style={{ bottom: '-5%', width: '58%', height: '13%' }} />
                  {/* Chip fallback hides the moment the sprite loads — no floating bubble. */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="relative" style={{ width: '46%', height: '40%', borderRadius: '50% 50% 42% 42%', background: helm, border: '1px solid rgba(255,255,255,0.3)', marginBottom: '-9%', zIndex: 2 }}>
                      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '18%', width: '70%', height: '14%', background: stripe, borderRadius: 2 }} />
                    </div>
                    <div className="flex items-center justify-center font-black text-white leading-none" style={{ width: '80%', height: '56%', borderRadius: '6px 6px 9px 9px', background: jersey, border: '1.5px solid rgba(0,0,0,0.5)', fontSize: '1.35vmin', boxShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{g.jersey}</div>
                  </div>
                  <img src={art ?? unitPlayerSprite(g.unit)} alt="" draggable={false}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    onLoad={e => { const p = e.currentTarget.previousElementSibling as HTMLElement | null; if (p) p.style.display = 'none'; }}
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ transform: `translateZ(0)${((g as BTroop & { face?: number }).face ?? 1) < 0 ? ' scaleX(-1)' : ''}`, filter: isDefense ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.5)) hue-rotate(140deg) saturate(1.3)' }} />
                  {!isHeroGuard && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-white font-black leading-none px-1 rounded" style={{ fontSize: '1.2vmin', background: 'rgba(0,0,0,0.55)' }}>{g.jersey}</span>}
                </div>
              </div>
            );
          })}

          {s.troops.filter(t => !t.dead).map(t => {
            const st = TROOP_STATS[t.unit];
            const raging = t.rageT > 0; const healing = t.healT > 0; const shielded = (t.shieldT ?? 0) > 0;
            const heroDef = t.isHero ? heroes.find(h => h.key === t.heroKey) : null;
            const specialDef = t.special ? specials.find(sp => sp.key === t.special) : null;
            const isMascot = t.special === 'mascot';
            const glow = raging ? 'drop-shadow(0 0 7px #ef4444)' : healing ? 'drop-shadow(0 0 7px #22c55e)' : 'drop-shadow(0 0 5px #eab308)';
            const spGlow = raging ? 'drop-shadow(0 0 6px #f97316)' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
            // Alive = animate: lunge when hitting a target, otherwise a jog bob.
            const anim = t.attacking ? 'fhq-pop 0.35s ease-in-out infinite' : 'fhq-bob 0.5s ease-in-out infinite';
            // Individual players are a touch bigger + clearer than the old clumpy trios.
            const w = heroDef ? '7%' : specialDef ? (isMascot ? '5.5%' : '3.4%') : '4.6%';
            const wmin = heroDef ? 36 : specialDef ? (isMascot ? 30 : 16) : 26;
            const wmax = heroDef ? 58 : specialDef ? (isMascot ? 48 : 26) : 42;
            const pGlow = shielded ? 'drop-shadow(0 0 6px #0ea5e9)' : raging ? 'drop-shadow(0 0 6px #ef4444)' : healing ? 'drop-shadow(0 0 6px #22c55e)' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
            const face = (t as BTroop & { face?: number }).face ?? 1;
            const flip = face < 0 ? ' scaleX(-1)' : '';
            // Fallback chip hides the moment the real sprite loads — units stand on the
            // turf with a shadow, not on a floating bubble.
            const hidePrev = (e: React.SyntheticEvent<HTMLImageElement>) => { const p = e.currentTarget.previousElementSibling as HTMLElement | null; if (p) p.style.display = 'none'; };
            const shadow = <div className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/30 pointer-events-none" style={{ bottom: '-5%', width: '58%', height: '13%' }} />;
            return (
              <div key={t.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                style={{ left: `${t.x}%`, top: `${t.y}%`, width: w, minWidth: wmin, maxWidth: wmax, zIndex: Math.round(t.y) + 100, transition: `left ${TICK_MS}ms linear, top ${TICK_MS}ms linear` }}>
                {(t.slowT ?? 0) > 0 && <span className="absolute pointer-events-none" style={{ top: '-14%', right: '-8%', fontSize: '1.5vmin', lineHeight: 1, zIndex: 2 }}>🚩</span>}
                {t.hp < t.maxHp && <div className="h-0.5 rounded-full bg-black/50 overflow-hidden mb-0.5" style={{ width: '85%' }}><div className="h-full bg-lime-400" style={{ width: `${(t.hp / t.maxHp) * 100}%` }} /></div>}
                {specialDef ? (
                  // Emoji placeholder shows until the real sprite loads, then hides.
                  <div className="relative w-full" style={{ aspectRatio: '1' }}>
                    {shadow}
                    <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: isMascot ? '3.2vmin' : '2.1vmin', filter: spGlow, animation: anim }}>{specialDef.emoji}</span>
                    <img src={specialDef.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} onLoad={hidePrev} className="absolute inset-0 w-full h-full object-contain" style={{ filter: spGlow, opacity: t.hitFlash > 0 ? 0.5 : 1, animation: anim, transform: `translateZ(0)${flip}` }} />
                  </div>
                ) : heroDef ? (
                  <div className="relative w-full" style={{ aspectRatio: '1' }}>
                    {shadow}
                    {/* fallback badge hides once the portrait loads */}
                    <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: `radial-gradient(circle at 50% 38%, ${heroDef.color}e0, #0f172a 88%)`, border: '2px solid #fde047', filter: glow, opacity: t.hitFlash > 0 ? 0.6 : 1, animation: anim }}>
                      <span style={{ fontSize: '2.3vmin', lineHeight: 1 }}>{heroDef.emoji}</span>
                    </div>
                    <img src={heroDef.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} onLoad={hidePrev} className="absolute inset-0 w-full h-full object-contain" style={{ filter: glow, opacity: t.hitFlash > 0 ? 0.6 : 1, animation: anim, transform: `translateZ(0)${flip}` }} />
                    <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-black uppercase text-yellow-200 px-1 rounded pointer-events-none" style={{ bottom: '-16%', fontSize: '1.1vmin', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(253,224,71,0.4)' }}>{heroDef.name}</span>
                  </div>
                ) : (
                  // ONE individual player — chip fallback until the sprite loads, then pure sprite.
                  <div className="relative w-full" style={{ aspectRatio: '1', filter: pGlow, opacity: t.hitFlash > 0 ? 0.5 : 1, animation: anim }}>
                    {shadow}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      {/* helmet (team black w/ orange stripe) */}
                      <div className="relative" style={{ width: '46%', height: '40%', borderRadius: '50% 50% 42% 42%', background: '#111827', border: '1px solid rgba(255,255,255,0.3)', marginBottom: '-9%', zIndex: 2, boxShadow: shielded ? '0 0 0 2px #0ea5e9' : 'none' }}>
                        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '18%', width: '70%', height: '14%', background: '#f97316', borderRadius: 2 }} />
                      </div>
                      {/* numbered jersey (position color) */}
                      <div className="flex items-center justify-center font-black text-white leading-none" style={{ width: '80%', height: '56%', borderRadius: '6px 6px 9px 9px', background: st.color, border: '1.5px solid rgba(0,0,0,0.5)', fontSize: '1.35vmin', boxShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{t.jersey}</div>
                    </div>
                    <img src={unitPlayerSprite(t.unit)} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} onLoad={hidePrev} className="absolute inset-0 w-full h-full object-contain" style={{ transform: `translateZ(0)${flip}` }} />
                    {/* jersey number rides the real sprite — the announcer talks about #23, so show #23 */}
                    <span className="absolute flex items-center justify-center font-black text-white" style={{ right: '-4%', bottom: '-2%', minWidth: '38%', height: '32%', borderRadius: 4, background: st.color, border: '1px solid rgba(0,0,0,0.55)', fontSize: '1.15vmin', boxShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{t.jersey}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      {phase !== 'result' && isReplay && (
        <div className="shrink-0 bg-slate-900 border-t border-slate-800 px-3 py-3 text-center text-xs text-slate-400 font-bold">
          ● You're watching the actual attack on your stadium — every move is theirs.
        </div>
      )}
      {phase !== 'result' && !isReplay && (
        <div className="shrink-0 bg-slate-900 border-t border-slate-800 px-3 py-2">
          {isDefense ? (
            <div className="py-1">
              <div className="text-center text-xs text-orange-200 font-bold flex items-center justify-center gap-2 mb-2">
                <Shield size={14} className="text-orange-400" /> Rival offense is driving on your stadium — call your defense!
              </div>
              <div className="flex items-center justify-center gap-2">
                <button onClick={callCrowdNoise} disabled={defPlays.noise <= 0}
                  className={`relative flex flex-col items-center px-4 py-1.5 rounded-xl border-2 transition-all active:scale-95 ${defPlays.noise <= 0 ? 'opacity-30 border-slate-800 cursor-not-allowed' : 'border-orange-400 bg-orange-900/30 hover:bg-orange-900/50'}`}>
                  <span className="text-lg leading-none">📣</span>
                  <span className="text-[9px] font-bold text-white uppercase mt-0.5">Crowd Noise</span>
                  <span className="text-[8px] font-bold text-slate-300">SLOWS THE DRIVE</span>
                  <span className="absolute -top-2 -right-1 min-w-5 h-5 px-1 rounded-full bg-orange-500 border-2 border-slate-900 text-[11px] font-bold text-white flex items-center justify-center">{defPlays.noise}</span>
                </button>
                <button onClick={callGoalLinePkg} disabled={defPlays.pkg <= 0}
                  className={`relative flex flex-col items-center px-4 py-1.5 rounded-xl border-2 transition-all active:scale-95 ${defPlays.pkg <= 0 ? 'opacity-30 border-slate-800 cursor-not-allowed' : 'border-blue-400 bg-blue-900/30 hover:bg-blue-900/50'}`}>
                  <span className="text-lg leading-none">🛡</span>
                  <span className="text-[9px] font-bold text-white uppercase mt-0.5">Goal-Line Pkg</span>
                  <span className="text-[8px] font-bold text-slate-300">+2 DEFENDERS</span>
                  <span className="absolute -top-2 -right-1 min-w-5 h-5 px-1 rounded-full bg-blue-500 border-2 border-slate-900 text-[11px] font-bold text-white flex items-center justify-center">{defPlays.pkg}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {phase === 'deploy' && (
                <div className="flex items-center justify-center gap-1.5 mb-2 flex-wrap">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mr-1">🧠 Game Plan</span>
                  {GAME_PLANS.map(gp => {
                    const active = plan.key === gp.key;
                    // Scouting read: how does this call fare against THEIR formation?
                    const cm = counterMultFor(gp.key);
                    return (
                      <button key={gp.key} onClick={() => setPlan(gp)}
                        className={`relative flex flex-col items-start px-2.5 py-1 rounded-lg border-2 transition-all active:scale-95 text-left
                          ${active ? 'border-orange-400 bg-orange-900/40' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                        <span className={`text-[10px] font-bold uppercase leading-tight ${active ? 'text-orange-200' : 'text-white'}`}>{gp.emoji} {gp.name}</span>
                        <span className="text-[8px] text-slate-400 leading-tight">{gp.blurb}</span>
                        {cm > 1 && <span className="absolute -top-2 -right-1 text-[8px] font-black uppercase bg-green-500 text-black px-1 rounded">they're soft vs this</span>}
                        {cm < 1 && <span className="absolute -top-2 -right-1 text-[8px] font-black uppercase bg-red-600 text-white px-1 rounded">countered</span>}
                      </button>
                    );
                  })}
                  {defFormation && FORMATIONS[defFormation] && (
                    <span className="w-full text-center text-[9px] text-sky-300 font-bold">📋 They're running {FORMATIONS[defFormation].name}</span>
                  )}
                </div>
              )}
              <div className="text-center text-xs text-orange-300 font-bold mb-2">
                {phase === 'fighting' && <span className="inline-block mr-2 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] text-slate-300 uppercase font-black align-middle">{plan.emoji} {plan.name}</span>}
                {instruction}
              </div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {/* Troops */}
                {UNIT_ORDER.map(u => {
                  const st = TROOP_STATS[u]; const count = army[u]; const active = selected === u && !pendingHero && !castMode && !pendingSpecial;
                  return (
                    <button key={u} onClick={() => { setSelected(u); setPendingHero(null); setCastMode(null); setPendingSpecial(null); }} disabled={count <= 0} title={`${st.label} — ${st.hint}`}
                      className={`relative flex flex-col items-center px-2.5 py-1.5 rounded-xl border-2 transition-all active:scale-95
                        ${count <= 0 ? 'opacity-30 border-slate-800 cursor-not-allowed' : active ? 'border-orange-400 bg-slate-800 scale-105' : 'border-slate-700 bg-slate-800/50'}`}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: st.color }}>{st.emoji}</div>
                      <span className="text-[9px] font-bold text-white uppercase">{st.label}</span>
                      <span className="text-[8px] font-bold text-orange-300">⚡×{(config.power?.[u] ?? 1).toFixed(1)}</span>
                      <span className="absolute -top-2 -right-1 min-w-5 h-5 px-1 rounded-full bg-orange-500 border-2 border-slate-900 text-[11px] font-bold text-white flex items-center justify-center">{count}</span>
                    </button>
                  );
                })}

                {/* Heroes */}
                {heroes.map(h => {
                  const onField = deployedHeroes.has(h.key);
                  const troop = onField ? s.troops.find(t => t.heroKey === h.key) : null;
                  const alive = troop && !troop.dead;
                  const cd = troop?.abilityCd ?? 0;
                  const pendingThis = pendingHero?.key === h.key;
                  if (!onField) {
                    return (
                      <button key={h.key} onClick={() => { setPendingHero(h); setCastMode(null); setPendingSpecial(null); }}
                        className={`relative flex flex-col items-center px-2.5 py-1.5 rounded-xl border-2 transition-all active:scale-95 ${pendingThis ? 'border-orange-300 bg-orange-900/40 scale-105' : 'border-orange-600/70 bg-orange-900/20'}`}>
                        <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center" style={{ background: `radial-gradient(circle,${h.color}99,#0f172a)`, border: '2px solid #fdba74' }}><span className="absolute inset-0 flex items-center justify-center text-lg">{h.emoji}</span><img src={h.art} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="relative w-full h-full object-contain scale-125" /></div>
                        <span className="text-[9px] font-bold text-orange-200 uppercase">{h.name.split(' ')[1] || h.name}</span>
                        <span className="text-[8px] font-bold text-orange-400">HERO Lv{h.level ?? 1}</span>
                      </button>
                    );
                  }
                  return (
                    <button key={h.key} onClick={() => useAbility(h.key)} disabled={!alive || cd > 0}
                      className={`relative flex flex-col items-center px-2.5 py-1.5 rounded-xl border-2 transition-all active:scale-95 overflow-hidden
                        ${!alive ? 'opacity-30 border-slate-800' : cd > 0 ? 'border-slate-700 bg-slate-800' : 'border-yellow-300 bg-yellow-600/30 animate-pulse'}`}>
                      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center" style={{ background: `radial-gradient(circle,${h.color}99,#0f172a)` }}><span className="absolute inset-0 flex items-center justify-center text-lg">{h.emoji}</span><img src={h.art} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="relative w-full h-full object-contain scale-125" /></div>
                      <span className="text-[9px] font-bold text-yellow-100 uppercase leading-none mt-0.5">{h.abilityName}</span>
                      <span className="text-[8px] font-bold text-slate-300">{!alive ? 'K.O.' : cd > 0 ? `${Math.ceil(cd)}s` : 'READY'}</span>
                    </button>
                  );
                })}

                {/* Specials: Mascot (hype aura) + Fan Mob (swarm) */}
                {specials.map(sp => {
                  const left = specialCharges[sp.key] ?? 0; const pendingThis = pendingSpecial?.key === sp.key;
                  return (
                    <button key={sp.key} onClick={() => { setPendingSpecial(pendingThis ? null : sp); setPendingHero(null); setCastMode(null); }} disabled={left <= 0}
                      className={`relative flex flex-col items-center px-2.5 py-1.5 rounded-xl border-2 transition-all active:scale-95
                        ${left <= 0 ? 'opacity-30 border-slate-800 cursor-not-allowed' : pendingThis ? 'border-orange-300 scale-105' : 'border-slate-700 bg-slate-800/50'}`}
                      style={pendingThis ? { backgroundColor: `${sp.color}44` } : {}}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: sp.color }}>{sp.emoji}</div>
                      <span className="text-[9px] font-bold text-white uppercase leading-none mt-0.5">{sp.name}</span>
                      <span className="text-[8px] font-bold text-slate-300">{sp.key === 'mascot' ? 'HYPE' : 'SWARM'}</span>
                      <span className="absolute -top-2 -right-1 min-w-5 h-5 px-1 rounded-full bg-orange-500 border-2 border-slate-900 text-[11px] font-bold text-white flex items-center justify-center">{left}</span>
                    </button>
                  );
                })}

                {/* Plays */}
                {PLAYBOOK.map(p => {
                  const left = plays[p.key] ?? 0; const active = castMode?.key === p.key;
                  return (
                    <button key={p.key} onClick={() => { setCastMode(active ? null : p); setPendingHero(null); setPendingSpecial(null); }} disabled={left <= 0}
                      className={`relative flex flex-col items-center px-2.5 py-1.5 rounded-xl border-2 transition-all active:scale-95
                        ${left <= 0 ? 'opacity-30 border-slate-800 cursor-not-allowed' : active ? 'border-white scale-105' : 'border-slate-700 bg-slate-800/50'}`}
                      style={active ? { backgroundColor: `${p.color}44` } : {}}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: p.color }}>{p.emoji}</div>
                      <span className="text-[9px] font-bold text-white uppercase">{p.name}</span>
                      <span className="text-[8px] font-bold text-slate-300">PLAY</span>
                      <span className="absolute -top-2 -right-1 min-w-5 h-5 px-1 rounded-full bg-slate-700 border-2 border-slate-900 text-[11px] font-bold text-white flex items-center justify-center">{left}</span>
                    </button>
                  );
                })}

                <button onClick={endBattle} className="flex flex-col items-center px-2.5 py-1.5 rounded-xl border-2 border-red-800 bg-red-900/40 hover:bg-red-900/70 text-red-200 transition-colors active:scale-95">
                  <Flag size={18} /><span className="text-[9px] font-bold uppercase">End</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Result overlay */}
      {phase === 'result' && result && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-10 animate-fade-in overflow-hidden">
          {/* Confetti on a win */}
          {result.won && Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="absolute top-0 pointer-events-none" style={{ left: `${(i * 137) % 100}%`, width: 8, height: 12, background: ['#f59e0b', '#3b82f6', '#ef4444', '#22c55e', '#e2e8f0'][i % 5], borderRadius: 2, animation: `fhq-confetti ${1.8 + (i % 5) * 0.25}s linear ${(i % 7) * 0.13}s infinite` }} />
          ))}
          <div className="relative bg-slate-900 w-full max-w-sm rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
            <div className={`py-6 text-center ${result.won ? 'bg-gradient-to-b from-green-700 to-green-900' : 'bg-gradient-to-b from-red-800 to-red-950'}`}>
              <div className="text-3xl font-display font-black text-white uppercase mb-3">
                {result.campaignStage === 12 && result.won ? '💍 League Champions!'
                  : isReplay ? (result.won ? 'They Scored On You' : 'Your Defense Held!')
                  : isDefense ? (result.won ? 'Goal-Line Stand!' : 'They Scored!') : (result.won ? 'Crowd Silenced!' : 'Shut Out')}
              </div>
              <div className="flex justify-center gap-3 text-4xl">
                {[0, 1, 2].map(i => <span key={i} className={i < result.stars ? 'animate-bounce-sm' : ''} style={{ opacity: i < result.stars ? 1 : 0.25, filter: i < result.stars ? 'none' : 'grayscale(1)', animationDelay: `${i * 120}ms` }}>🏈</span>)}
              </div>
              <div className="text-[11px] uppercase tracking-widest text-white/60 font-bold mt-2">Game Balls</div>
              {!isDefense && config.rival && (
                <div className="mx-6 mt-3 flex items-center justify-center gap-2 text-left">
                  <span className="relative shrink-0 w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-lg" style={{ background: `radial-gradient(circle at 35% 30%, ${config.rival.color}cc, #0f172a 90%)`, border: `2px solid ${config.rival.color}` }}>
                    <span className="absolute inset-0 flex items-center justify-center">{config.rival.emoji}</span>
                    <img src={config.rival.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="relative w-full h-full object-cover" />
                  </span>
                  <span className="text-[11px] italic text-white/85 leading-snug">“{result.won ? config.rival.win : config.rival.loss}”</span>
                </div>
              )}
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between text-sm"><span className="text-slate-400">{isDefense ? 'Ground given up' : 'Field taken'}</span><span className="font-mono font-bold text-white">{result.pct}%</span></div>
              {!isDefense && driveStats && (
                <>
                  <div className="flex justify-between text-sm"><span className="text-slate-400">⭐ Drive MVP</span><span className="font-bold text-amber-300">{driveStats.mvp} <span className="text-[10px] font-mono text-slate-500">({driveStats.mvpDmg} dmg)</span></span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-400">💥 Takeaways</span><span className="font-mono font-bold text-white">{driveStats.pancakes}{driveStats.bonus > 0 && <span className="text-yellow-400 text-xs"> (+{driveStats.bonus} loot)</span>}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-400">🩹 Players stuffed</span><span className="font-mono font-bold text-white">{driveStats.lost}</span></div>
                </>
              )}
              <div className="flex justify-between text-sm"><span className="text-slate-400">{isDefense ? 'Gate revenue lost' : 'Gate haul'}</span><span className={`font-mono font-bold ${isDefense ? 'text-red-400' : 'text-yellow-400'}`}>{isDefense ? '−' : '+'}{result.coins}</span></div>
              {!isDefense && <div className="flex justify-between text-sm"><span className="text-slate-400">Fans poached</span><span className="font-mono font-bold text-rose-400">+{result.fans}</span></div>}
              <button onClick={() => onFinish(result)} className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-lg transition-colors active:scale-95">
                {isReplay ? 'Close Replay' : isDefense ? 'Back to Base' : 'Collect Rewards'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
