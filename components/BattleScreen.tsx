import React, { useEffect, useRef, useState } from 'react';
import { UnitGroup , Player } from '../types';
import {
  BattleBuildingDef, BBuilding, BTroop, TROOP_STATS, UNIT_ORDER, UNIT_PREF,
  nearestBuilding, nearestTroop, blockingWall, dist, BATTLE_SECONDS, planPath, losClear,
  RaidHero, PLAYBOOK, PlayDef, ABILITY_CD, RAGE_SECONDS, HEAL_SECONDS, HEAL_PER_SEC,
  SpecialDef, SpecialKind, GAME_PLANS, GamePlanDef, HomeGuardDef, mulberry32, ReplayAction, ReplayData, GauntletWave, gauntletReward,
  ROLE_COMBAT, POCKET_RADIUS, RECEIVER_BONUS, POCKET_FACTOR } from '../battle';
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
  squad?: Player[];       // the roster as INDIVIDUALS — deploys pull real named players
  aiMult?: number;
  loot: { coins: number; fans: number };
  campaignStage?: number; // set when this attack is a Season campaign stage
  pvpTarget?: string;     // set when raiding a LIVE rival's published base (their pid)
  rival?: RivalCoach;     // the coach across the field — trash talk pre-game, reaction post-game
  attackerName?: string;  // YOUR club name — shown on the pre-game matchup card
  homeGuards?: HomeGuardDef[]; // defense mode: YOUR roster's defenders start on the field
  fans?: number;          // defense mode: your fanbase — the crowd erupts and stalls drives
  parkingLot?: number;    // defense mode: apron level (visual; the layout is pre-compressed)
  masteryTier?: number;   // defense mode: formation mastery ★ tier (0-3) — the DEFENSE PLAYS LADDER
  gauntlet?: { tier: number; waves: GauntletWave[] }; // 🛡 THE GAUNTLET: escalating waves storm your house
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
  gauntletTier?: number; // set when this was a Gauntlet night
  wavesHeld?: number;    // waves survived before the whistle (or the breach)
  gauntletCleared?: boolean;
}

interface Props {
  config: BattleConfig;
  onFinish: (result: BattleResult) => void;
  /** `beforeKickoff` = they backed out during deploy, so no game was played and the
   *  energy charged at launch must be handed back. */
  onExit: (beforeKickoff?: boolean) => void;
}

// A defense "shot" is now a football lobbed from a defender to a target — an arcing
// projectile (t: 0→1 over dur), never a bullet.
interface Shot { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; rot: number; flavor?: string; }
interface Pulse { x: number; y: number; r: number; life: number; maxLife: number; color: string; }
// Ephemeral battle FX: dust puffs under runners, impact pops on contact, floating "SACKED!" text,
// Castle-Clash-style floating damage numbers ('dmg') and knocked-down player chips ('down').
interface Fx { type: 'dust' | 'impact' | 'yards' | 'coin' | 'dmg' | 'down' | 'debris' | 'confetti' | 'smoke' | 'boom' | 'land' | 'ballshot'; x: number; y: number; life: number; maxLife: number; text?: string; vx?: number; vy?: number; color?: string; }

const TICK_MS = 50;
const DT = TICK_MS / 1000;
let troopUid = 0;

// 🔷 ISO PROJECTION — the sim runs on a flat 0-100 square (pathing, ranges, replays all
// unchanged); the SCREEN renders that square as a Clash-style diamond. px/py map world →
// screen %, unproject maps taps back to world. ky 0.29 ≈ the Castle Clash camera pitch.
const ISO_KX = 0.5, ISO_KY = 0.29, ISO_OY = 21;
const px = (x: number, y: number) => 50 + (x - y) * ISO_KX;
const py = (x: number, y: number) => ISO_OY + (x + y) * ISO_KY;
const unproject = (sx: number, sy: number): { x: number; y: number } => {
  const sum = (sy - ISO_OY) / ISO_KY, diff = (sx - 50) / ISO_KX;
  return { x: Math.min(98, Math.max(2, (sum + diff) / 2)), y: Math.min(98, Math.max(2, (sum - diff) / 2)) };
};
/** SVG polygon points for a world-square outline (projected). */
const isoRect = (x1: number, y1: number, x2: number, y2: number) =>
  `${px(x1, y1)},${py(x1, y1)} ${px(x2, y1)},${py(x2, y1)} ${px(x2, y2)},${py(x2, y2)} ${px(x1, y2)},${py(x1, y2)}`;

const emptyArmy = (): Record<UnitGroup, number> => ({
  [UnitGroup.OFFENSE_LINE]: 0, [UnitGroup.OFFENSE_SKILL]: 0,
  [UnitGroup.DEFENSE_LINE]: 0, [UnitGroup.DEFENSE_SECONDARY]: 0,
});

const makeTroop = (unit: UnitGroup, x: number, y: number, mult = 1, rand: () => number = Math.random, player?: { name: string; role: string }): BTroop => {
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

// 🃏 DEPLOY CARD — the Castle-Clash-grade unit card for the battle bar: full-bleed
// character art in a chunky beveled frame, gold gradient + glow when selected/ready,
// count badge riding the corner. Pure presentation — every handler passes through.
const DeployCard: React.FC<{
  onClick: () => void; disabled?: boolean; selected?: boolean; ready?: boolean;
  art?: string; emoji: string; label: string; sub?: React.ReactNode; subSub?: React.ReactNode;
  count?: number | string; countBg?: string; overlay?: React.ReactNode; title?: string;
}> = ({ onClick, disabled, selected, ready, art, emoji, label, sub, subSub, count, countBg = '#f97316', overlay, title }) => (
  <button onClick={onClick} disabled={disabled} title={title}
    className={`relative shrink-0 rounded-2xl p-[2px] text-left transition-all active:scale-95 ${selected ? 'scale-105' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${ready && !disabled ? 'animate-pulse' : ''}`}
    style={{
      background: disabled ? '#1e293b'
        : selected || ready ? 'linear-gradient(155deg, #fde047 0%, #f97316 45%, #7c2d12 100%)'
        : 'linear-gradient(160deg, #64748b 0%, #1e293b 55%, #0f172a 100%)',
      boxShadow: (selected || ready) && !disabled ? '0 0 14px rgba(249,115,22,0.5), 0 4px 10px rgba(0,0,0,0.5)' : '0 3px 8px rgba(0,0,0,0.45)',
    }}>
    <span className="flex w-[60px] flex-col overflow-hidden rounded-[14px]" style={{ background: 'linear-gradient(180deg, #232f47 0%, #131b2b 55%, #0c1120 100%)' }}>
      {/* portrait zone — real art over a warm radial, emoji shows until it loads */}
      <span className="relative flex h-[46px] items-center justify-center" style={{ background: 'radial-gradient(ellipse at 50% 70%, rgba(249,115,22,0.16), transparent 75%)' }}>
        <span className="text-xl" aria-hidden>{emoji}</span>
        {art && <img src={art} alt="" draggable={false}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          onLoad={e => { const p = e.currentTarget.previousElementSibling as HTMLElement | null; if (p) p.style.display = 'none'; }}
          className="absolute inset-0 h-full w-full object-contain p-0.5" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }} />}
        {overlay}
      </span>
      {/* Wraps instead of truncating: the plain-English group names ("Pass Rushers",
          "Defensive Backs") are longer than the old jargon and were being cut to
          "PASS RUSH…" — which is just a new abbreviation. */}
      <span className="block bg-black/45 px-0.5 py-0.5 text-center text-[8px] font-black uppercase leading-[1.1] text-white">{label}</span>
      {sub !== undefined && <span className="block px-0.5 pb-0.5 text-center text-[8px] font-bold leading-tight text-orange-300 truncate">{sub}</span>}
      {subSub !== undefined && <span className="block px-0.5 pb-1 text-center text-[7px] font-bold leading-tight text-slate-400 truncate">{subSub}</span>}
    </span>
    {count !== undefined && (
      <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-slate-950 px-1 text-[11px] font-black text-white" style={{ background: countBg, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{count}</span>
    )}
  </button>
);

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
  // Broadcast-camera drift: eases toward the hottest fight each render (presentation
  // only — sim coords are untouched, and clicks read getBoundingClientRect anyway).
  const cam = useRef({ x: 0, y: 0 });
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
  const sim = useRef<{ troops: BTroop[]; guards: BTroop[]; buildings: BBuilding[]; shots: Shot[]; pulses: Pulse[]; fx: Fx[]; puddles: { x: number; y: number; r: number; life: number; maxLife: number }[]; shakeT: number; punchT: number; time: number; ended: boolean; guardT: number; warned: boolean; commentary: { text: string; t: number }; momentum: number; pancakes: number; lost: number; bonus: number; freezeT: number; goalLine: boolean; crowdT?: number; ticks: number; mascotOut: boolean; mascotT: number; nextWave: number; banner: { label: string; until: number; key: number } | null }>({
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
  useEffect(() => { deployedHeroesRef.current = new Set(deployedHeroes); }, [deployedHeroes]);
  const specialChargesRef = useRef(specialCharges); useEffect(() => { specialChargesRef.current = specialCharges; }, [specialCharges]);
  const [pendingHero, setPendingHero] = useState<RaidHero | null>(null);
  const [castMode, setCastMode] = useState<PlayDef | null>(null);
  const [phase, setPhase] = useState<'deploy' | 'fighting' | 'result'>(isDefense || isReplay ? 'fighting' : 'deploy');
  // DEFENSE AGENCY: when YOUR stadium is under attack you call plays, not just watch.
  // 🪜 THE DEFENSE PLAYS LADDER — formation mastery ★ tiers earn extra charges:
  //   📣 Crowd Noise 2 → +1 per ★ (max 5) · 🛡 Goal-Line +1 at ★★ and ★★★ · 🧊 TIMEOUT unlocks at ★★★
  const masteryTier = Math.min(3, Math.max(0, config.masteryTier ?? 0));
  const [defPlays, setDefPlays] = useState({ noise: 2 + masteryTier, pkg: 1 + (masteryTier >= 2 ? 1 : 0) + (masteryTier >= 3 ? 1 : 0), timeout: masteryTier >= 3 ? 1 : 0 });
  const callTimeout = () => {
    if (defPlays.timeout <= 0 || phase !== 'fighting') return;
    setDefPlays(p => ({ ...p, timeout: p.timeout - 1 }));
    const s = sim.current;
    s.troops.forEach(t => { if (!t.dead) t.slowT = Math.max(t.slowT ?? 0, 3.5); });
    say('🧊 TIMEOUT — you ICE their whole drive!');
    sfx.whistle();
    sfx.crowdRoar();
    s.shakeT = 0.25;
    s.pulses.push({ x: 50, y: 50, r: 46, life: 0.7, maxLife: 0.7, color: '#38bdf8' });
  };
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
  // INDIVIDUALS, not squads: each deploy pulls the next real roster player of that
  // position group (deterministic order → replays stay faithful).
  const squadQueues = useRef<Record<string, { name: string; role: string }[]>>({});
  useEffect(() => {
    const q: Record<string, { name: string; role: string }[]> = {};
    for (const p of [...(config.squad ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
      (q[p.unit] = q[p.unit] ?? []).push({ name: p.name, role: p.role });
    }
    squadQueues.current = q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (import.meta.env.DEV) (window as unknown as { __sim?: unknown }).__sim = sim; // dev-only sim inspection
  const doDeployTroop = (unit: UnitGroup, x: number, y: number) => {
    const player = squadQueues.current[unit]?.shift();
    sim.current.troops.push(coach(makeTroop(unit, x, y, config.power?.[unit] ?? 1, rand, player)));
    sim.current.fx.push({ type: 'land', x, y, life: 0.45, maxLife: 0.45 });
    sfx.thud();
    if (player) say(`${player.name.toUpperCase()} (${player.role}) — ${ROLE_COMBAT[player.role]?.power ?? 'in the game'}!`);
  };
  const doDeployHero = (key: string, x: number, y: number) => {
    const h = heroes.find(hh => hh.key === key);
    if (!h) return;
    sim.current.troops.push(coach(makeHeroTroop(h, x, y)));
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
        else if (p.key === 'medic') t.healT = HEAL_SECONDS;
      }
    });
    sim.current.pulses.push({ x, y, r: p.radius, life: 0.5, maxLife: 0.5, color: p.color });
  };
  const [, forceTick] = useState(0);
  const [result, setResult] = useState<BattleResult | null>(null);
  const collectedRef = useRef(false); // double-tap on Collect must never pay twice
  // 🎺 MARCHING BAND WIN MOMENT: on a road win the band parades across the silenced
  // field (fight song, confetti, CROWD SILENCED stamp) BEFORE the verdict card.
  // Timers live in a ref — cleared only on unmount or skip (the celebration-timer law).
  const [celeb, setCeleb] = useState(false);
  const celebRef = useRef(false);
  const celebTimers = useRef<number[]>([]);
  useEffect(() => () => celebTimers.current.forEach(clearTimeout), []);
  const endCeleb = () => {
    celebTimers.current.forEach(clearTimeout); celebTimers.current = [];
    celebRef.current = false; setCeleb(false);
    sfx.victory();
  };


  // Kickoff: referee whistle + crowd stir the moment play starts; the crowd BED hums
  // underneath the whole battle and dies with the final whistle.
  useEffect(() => {
    if (phase === 'fighting') { sfx.kickoff(); say(config.homeGuards?.length ? `KICKOFF! Your ${config.homeGuards.length} defenders take the field!` : `KICKOFF! ${config.title.toUpperCase()}!`); crowdBedStart(); crowdBedIntensity(1); /* the house opens DEAFENING — silencing it is the win */ }
    if (phase === 'result') {
      crowdBedStop(); // dead silence — their crowd is gone
      if (result) {
        if (celebRef.current) { sfx.airhorn(); sfx.fightSong(); } // the band takes the field; victory sting lands with the card
        else { if (result.won && !povDefense) sfx.airhorn(); (result.won ? sfx.victory : sfx.defeat)(); }
      }
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => crowdBedStop(), []); // never leak the loop on exit

  const endBattle = () => {
    if (sim.current.ended) return;
    sim.current.ended = true;
    const s = sim.current;
    record({ k: 'e' }); // the whistle is part of the recording — replays end where the attack ended
    // DAMAGE-WEIGHTED house-taken % — the SAME formula the live HUD shows (TASK-4).
    // The old destroyed-count % here meant the bar could read 62% and the verdict 38%.
    const nwB = s.buildings.filter(b => b.kind !== 'wall');
    const pct = nwB.length ? Math.round(nwB.reduce((sum, b) => sum + (1 - Math.max(0, b.hp) / (b.maxHp || 1)), 0) / nwB.length * 100) : 0;
    const hqDead = s.buildings.find(b => b.kind === 'hq')?.dead ?? false;
    const stars = (pct >= 50 ? 1 : 0) + (hqDead ? 1 : 0) + (pct >= 99 ? 1 : 0);
    const frac = pct / 100;
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
      // roster snapshot — the replay fields the same named players with the same ROLE stats
      squad: (config.squad ?? []).map(p => ({ id: p.id, name: p.name, role: p.role, unit: p.unit })),
    } : undefined;
    // Road win → the band takes their field first (skipped under reduced motion).
    const roadWin = !isDefense && !isReplay && stars > 0;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (roadWin && !reduced) {
      celebRef.current = true; setCeleb(true);
      celebTimers.current.push(window.setTimeout(() => sfx.crowdRoar(), 2950)); // your new fans find their voice
      celebTimers.current.push(window.setTimeout(endCeleb, 4600));
    }
    // Gauntlet bookkeeping. Full-night credit requires a NATURAL end — the final
    // whistle or the last wave beaten. An early manual whistle only counts waves
    // already fully down (killing the tap-X-when-wave-5-appears full-purse exploit).
    const held = pct < 50;
    const anyAttackerAlive = s.troops.some(t => !t.dead);
    const naturalEnd = s.time <= 0.05 || !anyAttackerAlive;
    const gauntletBits = config.gauntlet ? {
      gauntletTier: config.gauntlet.tier,
      wavesHeld: !held ? Math.max(0, s.nextWave - 1) : naturalEnd ? s.nextWave : Math.max(0, s.nextWave - 1),
      gauntletCleared: held && naturalEnd && s.nextWave >= config.gauntlet.waves.length,
    } : {};
    setResult({ mode: config.mode, title: config.title, stars, pct, coins: Math.round(config.loot.coins * frac) + s.bonus, fans: Math.round(config.loot.fans * frac), won: isDefense ? pct < 50 : stars > 0, campaignStage: config.campaignStage, pvpTarget: config.pvpTarget, isReplay: isReplay || undefined, replay, ...gauntletBits });
    setPhase('result');
  };

  useEffect(() => {
    if (phase !== 'fighting') return;
    // REAL-TIME SIM: the old loop assumed the interval fires every 50ms, but each
    // tick re-renders the whole scene — on phones/dense bases renders exceed 50ms,
    // ticks coalesce, and the 60s clock crawled (~1 game-sec per 10 real-sec).
    // Now: accumulate REAL elapsed time, run fixed DT sub-steps to catch up (max 8).
    const clock = { t: performance.now(), acc: 0 };
    const stepSim = () => {
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
          else if (a.k === 'e') { endBattle(); return; } // the attacker blew the whistle here
        }
      }
      s.ticks++;
      // Freeze-frame on a touchdown — let the moment land.
      if (s.freezeT > 0) { s.freezeT -= DT; forceTick(x => x + 1); return; }

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

      for (const t of s.troops) {
        if (t.dead) continue;
        if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - DT);
        if (t.rageT > 0) t.rageT = Math.max(0, t.rageT - DT);
        if (t.healT > 0) { t.healT = Math.max(0, t.healT - DT); t.hp = Math.min(t.maxHp, t.hp + HEAL_PER_SEC * DT); }
        if (t.shieldT && t.shieldT > 0) t.shieldT = Math.max(0, t.shieldT - DT);
        if (t.slowT && t.slowT > 0) t.slowT = Math.max(0, t.slowT - DT);
        if (t.abilityCd && t.abilityCd > 0) t.abilityCd = Math.max(0, t.abilityCd - DT);

        const raging = t.rageT > 0;
        // WR power: catching — big damage while any thrower (QB player or QB hero) is out
        const rc = t.role ? ROLE_COMBAT[t.role] : undefined;
        const catching = rc?.receiver && s.troops.some(o => !o.dead && (ROLE_COMBAT[o.role ?? '']?.thrower || o.heroKey === 'qb'));
        const dps = t.dps * (raging ? 2 : 1) * (catching ? RECEIVER_BONUS : 1);
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
            // Yards, not damage (Design Bible §9): your plays GAIN YARDS on their building.
            s.fx.push({ type: 'dmg', text: `+${Math.max(1, Math.round(t.dmgAcc))} YDS`, color: '#fde047', x: target.x + (rand() * 4 - 2), y: target.y - target.size * 0.4, life: 0.7, maxLife: 0.7 });
            // Structure FLINCHES on the damage pop — flash + jolt in the renderer
            (target as BBuilding & { hitFlash?: number }).hitFlash = 0.2;
            // QBs THROW and kickers KICK — a visible football flies with every hit cycle
            if (rc?.thrower || t.heroKey === 'qb' || t.heroKey === 'kicker') {
              s.fx.push({ type: 'ballshot', x: t.x, y: t.y - 2, vx: target.x, vy: target.y - 1, life: 0.4, maxLife: 0.4 });
              if (import.meta.env.DEV) (window as unknown as { __shots: number }).__shots = ((window as unknown as { __shots?: number }).__shots ?? 0) + 1;
            }
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
        const src = aliveDef[Math.floor(rand() * aliveDef.length)];
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
          if (Math.abs(prey.x - g.x) > 0.3) (g as BTroop & { face?: number }).face = prey.x > g.x ? 1 : -1;
          g.x += ((prey.x - g.x) / pd) * g.speed * DT;
          g.y += ((prey.y - g.y) / pd) * g.speed * DT;
          g.attacking = false;
        } else {
          // the tackle: mutual damage — your player fights through at reduced output
          g.attacking = true;
          const shieldFactor = (prey.shieldT && prey.shieldT > 0) ? 0.5 : 1;
          const preyOut = prey.dps * (prey.rageT > 0 ? 2 : 1) * 0.55 * DT;
          // OL power: the pocket — QB/RB near a live lineman take reduced damage
          const pocket = (prey.role === 'QB' || prey.role === 'RB') && s.troops.some(o => !o.dead && ROLE_COMBAT[o.role ?? '']?.protector && dist(o.x, o.y, prey.x, prey.y) < POCKET_RADIUS) ? POCKET_FACTOR : 1;
          const frenzy = g.rageT > 0 ? 1.35 : 1; // mascot-hyped defenders hit harder
          prey.hp -= g.dps * frenzy * shieldFactor * pocket * DT; prey.hitFlash = 0.12;
          g.hp -= preyOut; g.hitFlash = 0.12;
          prey.dmg = (prey.dmg ?? 0) + preyOut;
          // Red numbers when the defense is chewing on your player.
          g.dmgAcc = (g.dmgAcc ?? 0) + g.dps * frenzy * shieldFactor * DT;
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
          if (!t.dead && dist(t.x, t.y, p.x, p.y) <= p.r) t.slowT = Math.max(t.slowT ?? 0, 0.3);
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
      if (allDead || s.time <= 0 || (!wavesPending && s.troops.length > 0 && !anyTroopAlive && !anyToDeploy)) endBattle();
    };
    const iv = setInterval(() => {
      const now = performance.now();
      clock.acc += (now - clock.t) / 1000;
      clock.t = now;
      let n = 0;
      while (clock.acc >= DT && n < 8) { stepSim(); clock.acc -= DT; n++; }
      if (clock.acc > DT * 8) clock.acc = DT * 2; // fell far behind (tab bg) — don't spiral
      if (n > 0) forceTick(x => x + 1);
    }, TICK_MS);
    return () => clearInterval(iv);
    // deploy inventory is read via refs inside stepSim — state deps would churn the
    // interval on every deploy and eat accumulated sim time (see anyToDeploy note)
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⚡ ABILITY FLASH: the screen edges pulse in the caster's color when an ability fires.
  const [abilityFlash, setAbilityFlash] = useState<{ color: string; key: number } | null>(null);
  const useAbility = (heroKey: string) => {
    const s = sim.current;
    const h = s.troops.find(t => t.heroKey === heroKey && !t.dead);
    if (!h || (h.abilityCd ?? 0) > 0) return;
    record({ k: 'a', key: heroKey });
    const hDef = heroes.find(hh => hh.key === heroKey);
    if (hDef) { setAbilityFlash(f => ({ color: hDef.color, key: (f?.key ?? 0) + 1 })); sfx.whoosh(); }
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
    // touch pointers get implicit capture — a finger dragged OFF the field would keep
    // pouring at clamped edge coords; deploy only while actually over the field
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    const { x: wx, y: wy } = unproject(((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100);
    if (deployTroopAt(wx, wy)) { pourRef.current.lastT = now; pourRef.current.poured = true; }
  };

  const handleFieldClick = (e: React.MouseEvent) => {
    if (isDefense || isReplay || phase === 'result') return; // spectators can't inject troops into a replay
    if (pourRef.current.poured) { pourRef.current.poured = false; return; } // this click is a pour's tail
    const rect = fieldRef.current!.getBoundingClientRect();
    const { x: wx, y: wy } = unproject(((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100);

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
  // CAMERA DRIFT: focus on whoever is trading blows right now (fall back to the
  // advancing pack), ease a small translate toward them. Capped at ±4% of the field
  // so it reads as a broadcast operator leaning, never a chase-cam.
  {
    const fighters = [...s.troops, ...s.guards].filter(u => !u.dead && u.attacking);
    const pool = fighters.length ? fighters : s.troops.filter(u => !u.dead);
    if (pool.length) {
      // lean toward the hottest fight in SCREEN space (project first)
      const fx0 = pool.reduce((a, u) => a + px(u.x, u.y), 0) / pool.length;
      const fy0 = pool.reduce((a, u) => a + py(u.x, u.y), 0) / pool.length;
      const tx = Math.max(-4, Math.min(4, (50 - fx0) * 0.12));
      const ty = Math.max(-4, Math.min(4, (50 - fy0) * 0.12));
      cam.current.x += (tx - cam.current.x) * 0.06;
      cam.current.y += (ty - cam.current.y) * 0.06;
    } else { cam.current.x *= 0.94; cam.current.y *= 0.94; }
  }
  const destroyed = s.buildings.filter(b => b.dead && b.kind !== 'wall').length;
  // Drive = DAMAGE dealt, not just demolitions — the meter moves within seconds of
  // first contact instead of sitting at 0% until a whole building falls (TASK-4).
  const nonWall = s.buildings.filter(b => b.kind !== 'wall');
  const pct = nonWall.length ? Math.round(nonWall.reduce((sum, b) => sum + (1 - Math.max(0, b.hp) / b.maxHp), 0) / nonWall.length * 100) : 0;
  const hqDead = s.buildings.find(b => b.kind === 'hq')?.dead ?? false;
  const liveStars = (pct >= 50 ? 1 : 0) + (hqDead ? 1 : 0) + (pct >= 99 ? 1 : 0);
  const timeLeft = Math.max(0, Math.ceil(s.time));

  // 🎯 DRIVE MILESTONES: crossing 25/50/75/100 pops the readout and stirs the crowd.
  const [milestoneKey, setMilestoneKey] = useState(0);
  const lastMilestone = useRef(0);
  useEffect(() => {
    const m = Math.floor(pct / 25);
    if (m > lastMilestone.current && pct > 0 && phase === 'fighting') {
      lastMilestone.current = m;
      setMilestoneKey(k => k + 1);
      // Each quarter of the house taken, the HOME crowd deflates a little more —
      // the announcer tells the silencing story (the bed volume tracks it in-sim).
      sfx.aww();
      say(povDefense
        ? ['They\'ve taken a QUARTER of your house — hold the line!', 'HALF your house is gone — your crowd is stunned…', 'Your fans can\'t watch this…'][Math.min(2, m - 1)]
        : ['A quarter of their house is YOURS — the crowd is getting nervous!', 'HALF the house taken — listen to that silence spreading!', 'Their fans are heading for the EXITS!'][Math.min(2, m - 1)]);
    }
  }, [pct, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const instruction = castMode ? `Tap the field to call ${castMode.name}`
    : pendingSpecial ? `Tap the sideline to send in the ${pendingSpecial.name}`
    : pendingHero ? `Tap the sideline to send in ${pendingHero.name}`
    : army[selected] > 0 ? `${TROOP_STATS[selected].label}: ${TROOP_STATS[selected].hint} — tap, or HOLD & DRAG to pour them in`
    : 'Pick your offense — players, heroes, or plays';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col select-none">
      {/* ⚡ ability cast — edges flash in the caster's color */}
      {abilityFlash && (
        <div key={abilityFlash.key} className="absolute inset-0 pointer-events-none z-[250]"
          style={{ boxShadow: `inset 0 0 12vmin 2vmin ${abilityFlash.color}99`, animation: 'fhq-flashfade 0.7s ease-out forwards' }} />
      )}
      {/* 🆚 Pre-game matchup card (tap to skip) */}
      {matchup && (
        <div className="absolute inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in" onClick={() => setMatchup(false)}>
          <div className="w-full max-w-md px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 text-center min-w-0">
                <div className="w-16 h-16 mx-auto rounded-full border-4 border-orange-500 bg-[#111827] overflow-hidden relative flex items-center justify-center">
                  <span className="text-2xl">🏈</span>
                  <img src="/assets/brand/app-icon.webp" alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover" />
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
          <button onClick={() => { if (phase === 'fighting' && !sim.current.ended) { endBattle(); } else onExit(phase === 'deploy'); }} title="Blow the whistle — see the result" className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white shrink-0"><X size={18} /></button>
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
            <div className="text-[9px] sm:text-[10px] uppercase text-slate-500 font-bold leading-none whitespace-nowrap">{isDefense ? 'Ground lost' : 'House taken'}</div>
            <div key={milestoneKey} className={`font-mono font-bold text-base sm:text-lg leading-none ${isDefense && pct >= 50 ? 'text-red-400' : 'text-white'}`} style={{ animation: milestoneKey ? 'fhq-counter-pop 0.55s ease-out' : undefined, display: 'inline-block' }}>{pct}%</div>
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
          style={{ width: 'min(96vw, 74vh)', height: 'min(96vw, 74vh)', background: 'radial-gradient(ellipse at 50% 42%, #17402a 0%, #0d2617 55%, #071410 100%)', border: '3px solid #0a1f14', animation: s.shakeT > 0 ? 'fhq-shake 0.25s ease-in-out' : undefined, transform: `${(typeof window !== 'undefined' && window.innerWidth < 640) ? '' : `translate(${cam.current.x.toFixed(2)}%, ${cam.current.y.toFixed(2)}%) `}scale(${((typeof window !== 'undefined' && window.innerWidth < 640 ? 1.06 : isDefense || isReplay ? 1.22 : 1.16) * (1 + (s.punchT > 0 ? s.punchT * 0.16 : 0))).toFixed(3)})`, /* phones: field is already 96vw + no zoom crop to hide the pan behind — camera drift is desktop-only. Iso diamond spans full width, so zooms stay modest. */ transition: 'transform 90ms ease-out', touchAction: isDefense || isReplay ? undefined : 'none', ...(castMode ? { boxShadow: `0 0 0 3px ${castMode.color}` } : {}) }}>

          {/* 🔷 ISO GROUND — the Clash-style diamond. Mow stripes + chalk yard lines run
              between projected world bands, end zones tint both ends, midfield gets the
              ball mark. Everything is one SVG so the plane reads as ONE tilted surface. */}
          <svg className="absolute inset-0 pointer-events-none z-0" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* mowed apron just outside the field */}
            <polygon points={isoRect(-4, -4, 104, 104)} fill="#20522f" opacity="0.55" />
            {/* mow stripes: alternating bands of constant world-y */}
            {Array.from({ length: 10 }).map((_, i) => (
              <polygon key={i} points={isoRect(0, i * 10, 100, i * 10 + 10)} fill={i % 2 ? '#2b8a3e' : '#2f9e44'} />
            ))}
            {/* end zones */}
            <polygon points={isoRect(0, 0, 100, 9)} fill="#b45309" opacity="0.5" />
            <polygon points={isoRect(0, 91, 100, 100)} fill="#1e293b" opacity="0.6" />
            {/* chalk yard lines (constant world-y) */}
            {[9, 19, 29, 39, 50, 61, 71, 81, 91].map(yl => (
              <line key={yl} x1={px(0, yl)} y1={py(0, yl)} x2={px(100, yl)} y2={py(100, yl)} stroke="#fff" strokeOpacity={yl === 50 ? 0.6 : 0.35} strokeWidth={yl === 50 ? 0.5 : 0.32} />
            ))}
            {/* sidelines */}
            <polygon points={isoRect(0, 0, 100, 100)} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.55" />
            {/* midfield ellipse */}
            <ellipse cx={px(50, 50)} cy={py(50, 50)} rx="6.5" ry={6.5 * (ISO_KY / ISO_KX)} fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="0.4" />
            {/* 🏰 MOAT ring + drawbridges (home-base views) */}
            {(isDefense || isReplay) && (
              <>
                <polygon points={isoRect(7, 7, 93, 93)} fill="none" stroke="rgba(37,99,235,0.35)" strokeWidth="3.4" />
                <polygon points={isoRect(7, 7, 93, 93)} fill="none" stroke="rgba(147,197,253,0.3)" strokeWidth="1" />
                {([[50, 7, -30], [50, 93, -30], [7, 50, 30], [93, 50, 30]] as const).map(([bx, by, rot], i) => (
                  <g key={i} transform={`translate(${px(bx, by)},${py(bx, by)}) rotate(${rot})`}>
                    <rect x="-3.4" y="-1.6" width="6.8" height="3.2" fill="#935a2e" stroke="#4a2c14" strokeWidth="0.3" rx="0.4" />
                    <line x1="-1.2" y1="-1.6" x2="-1.2" y2="1.6" stroke="#7c4a24" strokeWidth="0.35" />
                    <line x1="1.2" y1="-1.6" x2="1.2" y2="1.6" stroke="#7c4a24" strokeWidth="0.35" />
                  </g>
                ))}
              </>
            )}
          </svg>
          {/* midfield ball mark */}
          <span className="absolute pointer-events-none" style={{ left: `${px(50, 50)}%`, top: `${py(50, 50)}%`, transform: 'translate(-50%,-50%)', fontSize: '2.6vmin', opacity: 0.4, zIndex: 0 }}>🏈</span>

          {/* 🔇 THE SILENCING — the stands ARE the scoreboard (Design Bible §2).
              Kickoff: a full, waving HOME crowd in the rival's colors. As you take the
              house, scattered sections flip to YOUR orange (their fans converted), the
              home dots dim and shrink, and the wave goes sluggish. On defense/replays
              it's YOUR orange crowd with the raider's red creeping in. */}
          {(() => {
            const takeover = Math.min(1, pct / 100);   // seats converted so far
            const health = 1 - takeover;               // the home crowd's remaining energy
            const rivalC = config.rival?.color ?? '#dc2626';
            const homeCols = povDefense ? ['#f97316', '#e2e8f0', '#fdba74'] : [rivalC, '#e2e8f0', rivalC];
            const takeC = povDefense ? '#dc2626' : '#f97316';
            const dotHome = 5 + health * 3.2;
            const waveDur = (0.72 + takeover * 0.9).toFixed(2); // lively → sluggish
            const seat = (i: number, n: number): React.CSSProperties => {
              const taken = ((i * 7919) % n) / n < takeover; // scattered sections flip, not a sweep
              return {
                width: taken ? 6.5 : dotHome, height: taken ? 6.5 : dotHome, borderRadius: '50%',
                background: taken ? takeC : homeCols[i % 3],
                opacity: taken ? 1 : 0.28 + 0.72 * health,
                filter: taken ? 'brightness(1.3)' : undefined,
                animation: `fhq-wave ${taken ? '0.75' : waveDur}s ease-in-out ${(i * 0.05).toFixed(2)}s infinite`,
              };
            };
            // Seats RING THE DIAMOND — four grandstand lines hugging the iso field's
            // edges (world lines just outside the sidelines), not the screen border.
            const edges: Array<{ n: number; at: (t: number) => { x: number; y: number } }> = [
              { n: 24, at: t => ({ x: t * 100, y: -7 }) },    // upper-right stand
              { n: 24, at: t => ({ x: -7, y: t * 100 }) },    // upper-left stand
              { n: 20, at: t => ({ x: t * 100, y: 107 }) },   // lower-left stand
              { n: 20, at: t => ({ x: 107, y: t * 100 }) },   // lower-right stand
            ];
            return (
          <div className="absolute inset-0 pointer-events-none z-0">
            {takeover > 0.15 && <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: `inset 0 0 ${Math.round(takeover * 28)}px ${takeC}55` }} />}
            {edges.map((e, ei) => (
              <React.Fragment key={ei}>
                {Array.from({ length: e.n }).map((_, i) => {
                  const w = e.at((i + 0.5) / e.n);
                  const st = seat(i + ei * 7, e.n);
                  return <div key={i} className="absolute" style={{ ...st, left: `${px(w.x, w.y)}%`, top: `${py(w.x, w.y)}%`, marginLeft: -(st.width as number) / 2, marginTop: -(st.height as number) / 2 }} />;
                })}
              </React.Fragment>
            ))}
            {/* 🅿️ THE APRON IS YOUR FAN ECONOMY — every Parking Lot level visibly packs
                the outer ring with real tailgate art. Raiders fight through your fans. */}
            {(() => {
              const pl = Math.min(3, Math.max(0, config.parkingLot ?? 0));
              // Off-diamond world spots — the tailgate scene rings the iso field.
              const img = (src: string, wx: number, wy: number, w: number, key: string) => (
                <img key={key} src={src} alt="" draggable={false}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  className="absolute pointer-events-none" style={{ left: `${px(wx, wy)}%`, top: `${py(wx, wy)}%`, width: `${w}%`, transform: 'translate(-50%,-60%)', opacity: 0.95, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }} />
              );
              const props: React.ReactNode[] = [
                img('/assets/decor/tailgate-tent.webp', 16, -14, 9, 'tt1'),
                img('/assets/decor/merch-stand.webp', 108, 70, 9, 'ms1'),
              ];
              if (pl >= 1) {
                props.push(img('/assets/decor/parking-lot.webp', 62, -16, 12, 'pk1'));
                props.push(img('/assets/decor/parking-lot.webp', 16, 112, 12, 'pk2'));
              }
              if (pl >= 2) {
                props.push(img('/assets/decor/tailgate-tent.webp', -14, 40, 8, 'tt2'));
                props.push(img('/assets/decor/parking-lot.webp', 112, 30, 11, 'pk3'));
              }
              if (pl >= 3) {
                props.push(img('/assets/decor/tailgate-tent.webp', 90, 112, 8, 'tt3'));
                props.push(img('/assets/decor/merch-stand.webp', -14, 78, 8, 'ms2'));
              }
              return (
                <>{props}</>
              );
            })()}
          </div>
          ); })()}

          {!isDefense && phase === 'deploy' && (
            <>
              {/* The SIDELINE is the tap target — the glowing band hugs the DIAMOND's rim
                  until the first deploy (first-time raiders tapped open field). */}
              <svg className="absolute inset-0 pointer-events-none animate-pulse" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ zIndex: 3 }}>
                <polygon points={isoRect(1, 1, 99, 99)} fill="none" stroke="rgba(253,224,71,0.45)" strokeWidth="3.4" />
                <polygon points={isoRect(-4, -4, 104, 104)} fill="none" stroke="rgba(253,224,71,0.25)" strokeWidth="1.4" />
                <polygon points={isoRect(16, 16, 84, 84)} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.5" strokeDasharray="2.4 1.6" />
              </svg>
              <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ bottom: '3%', zIndex: 220 }}>
                <span className="inline-block animate-bounce-sm text-[11px] font-black uppercase tracking-wide bg-yellow-400 text-black px-3 py-1 rounded-full shadow-xl whitespace-nowrap">👇 tap the glowing sideline to deploy</span>
              </div>
            </>
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

          {/* 🛡 GAUNTLET WAVE BANNER — a broadcast lower-third sweeps across the field
              on every whistle: slanted team-color plate, big italic display type. */}
          {s.banner && s.time > s.banner.until && (
            <div key={s.banner.key} className="absolute inset-x-0 pointer-events-none flex justify-center" style={{ top: '19%', zIndex: 240 }}>
              <div style={{ animation: 'fhq-wavebanner 2.7s cubic-bezier(0.22, 0.9, 0.3, 1) both' }}>
                <div className="relative px-7 py-2" style={{ transform: 'skewX(-11deg)', background: 'linear-gradient(100deg, #7c2d12 0%, #ea580c 30%, #f97316 70%, #7c2d12 100%)', border: '2px solid rgba(255,255,255,0.85)', borderLeftWidth: 6, borderLeftColor: '#fde047', boxShadow: '0 6px 22px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.35)' }}>
                  <div className="font-display font-black italic uppercase text-white whitespace-nowrap" style={{ transform: 'skewX(11deg)', fontSize: 'min(4.6vw, 26px)', letterSpacing: '0.04em', textShadow: '0 2px 0 rgba(0,0,0,0.45), 0 0 14px rgba(253,224,71,0.35)' }}>{s.banner.label}</div>
                </div>
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

          {/* 🥤 Gatorade puddles — glossy orange zones ON the turf (under everything) */}
          {s.puddles.map((p, i) => (
            <div key={`pud${i}`} className="absolute rounded-[50%] pointer-events-none"
              style={{ left: `${px(p.x, p.y) - p.r * ISO_KX * 1.414}%`, top: `${py(p.x, p.y) - p.r * ISO_KY * 1.414}%`, width: `${p.r * ISO_KX * 2.828}%`, height: `${p.r * ISO_KY * 2.828}%`, zIndex: 2,
                background: 'radial-gradient(ellipse at 45% 40%, rgba(255,166,77,0.7) 0%, rgba(249,115,22,0.5) 55%, rgba(194,65,12,0.35) 78%, transparent 92%)',
                boxShadow: 'inset 0 0 8px rgba(255,220,180,0.5)', opacity: Math.min(0.8, (p.life / p.maxLife) * 1.4) }} />
          ))}

          {/* Range rings — iso ellipses on the ground plane */}
          {s.buildings.filter(b => b.kind === 'defense' && !b.dead && b.range).map(b => (
            <div key={`r-${b.id}`} className="absolute rounded-[50%] border border-red-400/20 bg-red-500/5 pointer-events-none"
              style={{ left: `${px(b.x, b.y) - b.range! * ISO_KX * 1.414}%`, top: `${py(b.x, b.y) - b.range! * ISO_KY * 1.414}%`, width: `${b.range! * ISO_KX * 2.828}%`, height: `${b.range! * ISO_KY * 2.828}%` /* √2-correct projected extent — rings now show TRUE range */ }} />
          ))}

          {/* Play/ability pulses — flattened to the ground plane */}
          {s.pulses.map((p, i) => (
            <div key={i} className="absolute rounded-[50%] border-2 pointer-events-none" style={{ left: `${px(p.x, p.y) - p.r * ISO_KX * 1.414}%`, top: `${py(p.x, p.y) - p.r * ISO_KY * 1.414}%`, width: `${p.r * ISO_KX * 2.828}%`, height: `${p.r * ISO_KY * 2.828}%`, borderColor: p.color, backgroundColor: `${p.color}22`, opacity: p.life / p.maxLife }} />
          ))}

          {/* Defense "shots" arc through the air — footballs, penalty flags, or t-shirts. Never bullets. */}
          {s.shots.map((sh, i) => {
            const u = Math.max(0, sh.t / sh.dur); // volleys stagger via negative t — hold at the muzzle until their turn
            // travel in WORLD space, arc in SCREEN space (lob height is a screen illusion)
            const wx0 = sh.sx + (sh.tx - sh.sx) * u;
            const wy0 = sh.sy + (sh.ty - sh.sy) * u;
            const x = px(wx0, wy0);
            const y = py(wx0, wy0) - Math.sin(Math.PI * u) * 7;
            const proj = sh.flavor === 'ref' ? '🚩' : sh.flavor === 'tshirt' ? '👕' : sh.flavor === 'cooler' ? '🥤' : '🏈';
            const ang = Math.atan2(py(sh.tx, sh.ty) - py(sh.sx, sh.sy), px(sh.tx, sh.ty) - px(sh.sx, sh.sy)) * 180 / Math.PI;
            return (
              <React.Fragment key={i}>
                {/* motion streak behind the ball — reads as SPEED */}
                <div className="absolute pointer-events-none" style={{ left: `${x}%`, top: `${y}%`, width: '5vmin', height: 2, zIndex: 94, transformOrigin: '100% 50%', transform: `translate(-100%,-50%) rotate(${ang}deg)`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55))', opacity: 0.5 + u * 0.3 }} />
                <div className="absolute pointer-events-none" style={{ left: `${x}%`, top: `${y}%`, width: '3vmin', height: '3vmin', zIndex: 95, transform: `translate(-50%,-50%) rotate(${sh.rot + u * 540}deg)`, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}>
                  <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: '2.4vmin', lineHeight: 1 }}>{proj}</span>
                  {proj === '🏈' && <img src="/assets/battle/football-proj.webp" alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-contain" />}
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
                <div key={i} className="absolute pointer-events-none font-display font-black uppercase" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, color: td ? '#fde047' : '#fef08a', fontSize: td ? '5vmin' : '3.4vmin', letterSpacing: '0.02em', textShadow: td ? '0 0 8px #f59e0b, 0 3px 6px #000' : '0 2px 5px #000, 0 0 3px #000', zIndex: 210, transform: `translate(-50%, calc(-50% - ${(1 - k) * (td ? 46 : 34)}px)) scale(${td ? 1 + (1 - k) * 0.3 : 1})`, opacity: Math.min(1, k * 1.6) }}>{f.text}</div>
              );
            }
            if (f.type === 'dmg') return (
              // Damage number with LIFE: pops in oversized, arcs sideways as it rises
              // (deterministic drift from spawn coords), eases out. Gold = yours, red = theirs.
              (() => { const drift = (((f.x * 13 + f.y * 7) % 11) - 5) * 4; // -20..+20px, stable per number
                const rise = (1 - k * k) * 30;               // ease-out rise
                const pop = 1 + Math.max(0, (k - 0.72) / 0.28) * 0.6; // 1.6x at spawn → 1x
                return (
              <div key={i} className="absolute pointer-events-none font-black" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, color: f.color, fontSize: f.text?.includes('YDS') ? '1.8vmin' : '2.1vmin', textShadow: '0 1px 2px #000, 0 0 3px rgba(0,0,0,0.6)', zIndex: 208, transform: `translate(calc(-50% + ${(1 - k) * drift}px), calc(-50% - ${rise}px)) scale(${pop})`, opacity: Math.min(1, k * 1.8), whiteSpace: 'nowrap' }}>{f.text}</div>
                ); })()
            );
            if (f.type === 'down') return (
              // Knocked-down player — the jersey chip tips over and fades where they fell.
              <div key={i} className="absolute pointer-events-none flex items-center justify-center font-black text-white" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, width: '3vmin', height: '2.1vmin', background: f.color, border: '1px solid rgba(0,0,0,0.5)', borderRadius: 3, fontSize: '1.15vmin', zIndex: 90, transform: `translate(-50%,-30%) rotate(${90 - k * 20}deg)`, opacity: Math.min(0.85, k * 1.4), filter: 'brightness(0.8)' }}>{f.text}</div>
            );
            if (f.type === 'coin') return (
              <span key={i} className="absolute pointer-events-none" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, fontSize: '1.7vmin', lineHeight: 1, zIndex: 205, transform: 'translate(-50%,-50%)', opacity: Math.min(1, k * 2), filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))' }}>🪙</span>
            );
            if (f.type === 'impact') return (
              <div key={i} className="absolute pointer-events-none rounded-full" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, width: '3.6vmin', height: '3.6vmin', background: 'radial-gradient(circle, #fff 0%, #fde047 45%, transparent 72%)', zIndex: 150, transform: `translate(-50%,-50%) scale(${0.6 + (1 - k) * 1.1})`, opacity: k }} />
            );
            if (f.type === 'ballshot') return (
              // A thrown/kicked football spiraling to its target (lerp + arc + spin),
              // dragging two ghost afterimages along its flight path as a motion trail.
              (() => { const p = 1 - k;
                const pos = (pp: number) => { const wx = f.x + (f.vx! - f.x) * pp, wy = f.y + (f.vy! - f.y) * pp; return { bx: px(wx, wy), by: py(wx, wy) - Math.sin(pp * Math.PI) * 4 }; };
                return (
                  <React.Fragment key={i}>
                    {[0.26, 0.13, 0].map(d => { const pp = Math.max(0, p - d); const { bx, by } = pos(pp); const main = d === 0; return (
                      <img key={d} src="/assets/heroes/franchise-rig/ball.webp" alt="" draggable={false} className="absolute pointer-events-none select-none"
                        style={{ left: `${bx}%`, top: `${by}%`, width: main ? '2.6vmin' : d === 0.13 ? '2.1vmin' : '1.7vmin', zIndex: main ? 202 : 201, transform: `translate(-50%,-50%) rotate(${pp * 720}deg)`, opacity: Math.min(1, k * 3) * (main ? 1 : d === 0.13 ? 0.38 : 0.18), filter: main ? undefined : 'brightness(1.5) blur(0.5px)' }} />
                    ); })}
                  </React.Fragment>
                );
              })()
            );
            if (f.type === 'land') return (
              // Deploy landing puff — small dust burst under fresh boots
              <img key={i} src="/assets/fx/dust-impact.webp" alt="" draggable={false} className="absolute pointer-events-none select-none" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, width: '4.6vmin', zIndex: 96, transform: `translate(-50%,-60%) scale(${0.45 + (1 - k) * 0.75})`, opacity: k * 0.85 }} />
            );
            if (f.type === 'boom') return (
              // Teardown dust burst — the art sprite blooms out and fades over the wreck
              <img key={i} src="/assets/fx/dust-impact.webp" alt="" draggable={false} className="absolute pointer-events-none select-none" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, width: '9vmin', zIndex: 158, transform: `translate(-50%,-55%) scale(${0.5 + (1 - k) * 0.9}) rotate(${(1 - k) * 20}deg)`, opacity: Math.min(1, k * 1.6) }} />
            );
            if (f.type === 'debris') return (
              // Chunks of the sacked facility tumbling out of the wreck
              <div key={i} className="absolute pointer-events-none" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, width: '1.3vmin', height: '1.3vmin', background: f.color, border: '1px solid rgba(0,0,0,0.4)', borderRadius: 2, zIndex: 160, transform: `translate(-50%,-50%) rotate(${(1 - k) * 560}deg)`, opacity: Math.min(1, k * 1.6) }} />
            );
            if (f.type === 'confetti') return (
              <div key={i} className="absolute pointer-events-none" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, width: '1vmin', height: '1.6vmin', background: f.color, zIndex: 215, transform: `translate(-50%,-50%) rotate(${(1 - k) * 720}deg) scaleY(${0.4 + Math.abs(Math.sin((1 - k) * 9))})`, opacity: Math.min(1, k * 1.8) }} />
            );
            if (f.type === 'smoke') return (
              <div key={i} className="absolute pointer-events-none rounded-full" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, width: `${2 + (1 - k) * 3.4}vmin`, height: `${2 + (1 - k) * 3.4}vmin`, background: 'radial-gradient(circle, rgba(148,163,184,0.5) 0%, rgba(100,116,139,0.25) 55%, transparent 75%)', zIndex: 155, transform: 'translate(-50%,-50%)', opacity: k * 0.8 }} />
            );
            return (
              <div key={i} className="absolute pointer-events-none rounded-full" style={{ left: `${px(f.x, f.y)}%`, top: `${py(f.x, f.y)}%`, width: '2.4vmin', height: '2.4vmin', background: 'rgba(212,190,150,0.55)', zIndex: 80, transform: `translate(-50%,-50%) scale(${0.4 + (1 - k)})`, opacity: k * 0.55 }} />
            );
          })}

          {s.buildings.map(b => {
            if (b.kind === 'wall') {
              // Blocking Sled — hazard-striped barrier. Sized as a % of the field so it
              // tracks its world footprint at any viewport size.
              return (
                <div key={b.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none" style={{ left: `${px(b.x, b.y)}%`, top: `${py(b.x, b.y)}%`, width: `${b.size * 1.7}%`, zIndex: Math.round((b.x + b.y) / 2) }}>
                  {/* HP bar only once it's TAKEN damage — 30 full green bars was pure noise */}
                  {!b.dead && b.hp < b.maxHp && <div className="h-0.5 rounded-full bg-black/50 overflow-hidden mb-0.5" style={{ width: '85%', minWidth: 18 }}><div className="h-full bg-lime-400" style={{ width: `${(b.hp / b.maxHp) * 100}%` }} /></div>}
                  <img src={b.art ?? '/assets/battle/blocking-sled.webp'} alt="" draggable={false} className="w-full" style={{ height: 'auto', aspectRatio: '1', objectFit: 'contain', opacity: b.dead ? 0.25 : 1, transformOrigin: '50% 90%', animation: !b.dead && ((b as BBuilding & { hitFlash?: number }).hitFlash ?? 0) > 0 ? 'fhq-hitjolt 0.2s ease-out' : undefined, filter: b.dead ? 'grayscale(1) brightness(0.55)' : ((b as BBuilding & { hitFlash?: number }).hitFlash ?? 0) > 0 ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.4)) brightness(1.9)' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }} />
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
              <div key={b.id} className="absolute -translate-x-1/2 flex flex-col items-center pointer-events-none" style={{ left: `${px(b.x, b.y)}%`, top: `${py(b.x, b.y)}%`, transform: 'translate(-50%, -62%)', width: `${wpct}%`, zIndex: Math.round((b.x + b.y) / 2) }}>
                {!b.dead && b.hp < b.maxHp && <div className="mb-0.5 h-1 rounded-full bg-black/50 overflow-hidden" style={{ width: '80%', minWidth: 26, maxWidth: 60 }}><div className="h-full bg-green-400" style={{ width: `${(b.hp / b.maxHp) * 100}%` }} /></div>}
                {b.dead ? (
                  <div className="relative w-full" style={{ aspectRatio: '1' }}>
                    <img src={sprite} alt="" draggable={false} className="w-full h-full object-contain" style={{ filter: 'grayscale(1) brightness(0.55)', opacity: 0.5 }} />
                    <span className="absolute inset-0 flex items-center justify-center text-2xl">💥</span>
                  </div>
                ) : (() => {
                  // Structures REACT: flash + jolt on each damage pop, rock on the
                  // foundation once they're close to coming down.
                  const bhf = ((b as BBuilding & { hitFlash?: number }).hitFlash ?? 0) > 0;
                  const critical = b.hp < b.maxHp * 0.3;
                  return (
                  <div className="relative w-full" style={{ transformOrigin: '50% 92%', animation: bhf ? 'fhq-hitjolt 0.2s ease-out' : critical ? 'fhq-wobble 0.55s ease-in-out infinite' : undefined }}>
                    <img src={sprite} alt="" draggable={false} className="w-full" style={{ height: 'auto', filter: bhf ? 'drop-shadow(0 5px 5px rgba(0,0,0,0.45)) brightness(1.9) saturate(0.7)' : 'drop-shadow(0 5px 5px rgba(0,0,0,0.45))' }} />
                    {/* Live crowd in the stadium bowl — breathes normally, does THE WAVE
                        when the drive crosses a 25% milestone (key remount retriggers). */}
                    {b.kind === 'hq' && (
                      <img key={milestoneKey} src="/assets/fx/crowd-strip.webp" alt="" draggable={false} className="absolute select-none"
                        style={{ left: '14%', top: '26%', width: '72%', opacity: 0.2 + 0.65 * Math.max(0, 1 - pct / 100) /* the bowl empties as the house is taken */, animation: milestoneKey ? 'fhq-crowdwave 1.2s ease-in-out, fhq-breathe 3s ease-in-out 1.2s infinite' : 'fhq-breathe 3s ease-in-out infinite', transformOrigin: '50% 100%' }} />
                    )}
                  </div>
                  ); })()}
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
            const isMascotG = !!(g as BTroop & { isMascot?: boolean }).isMascot;
            // Mascot-hyped defenders play FRENZIED — red glow while the pulse lasts.
            const frenzied = g.rageT > 0;
            const gBaseFilter = isDefense ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.5)) hue-rotate(140deg) saturate(1.3)';
            return (
              <div key={g.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                style={{ left: `${px(g.x, g.y)}%`, top: `${py(g.x, g.y)}%`, width: isMascotG ? '7%' : isHeroGuard ? '5.6%' : '4.4%', minWidth: 24, maxWidth: isMascotG ? 56 : isHeroGuard ? 48 : 38, zIndex: Math.round((g.x + g.y) / 2) + 1 /* unified iso depth: units occlude BEHIND buildings, not float over them */, transition: `left ${TICK_MS}ms linear, top ${TICK_MS}ms linear` }}>
                {g.hp < g.maxHp && <div className="h-0.5 rounded-full bg-black/50 overflow-hidden mb-0.5" style={{ width: '85%' }}><div className={`h-full ${isDefense ? 'bg-lime-400' : 'bg-red-400'}`} style={{ width: `${(g.hp / g.maxHp) * 100}%` }} /></div>}
                <div className="fhq-unit relative w-full" style={{ aspectRatio: '1', filter: g.hitFlash > 0 ? 'brightness(2.1)' : undefined, animation: g.hitFlash > 0 ? 'fhq-hitjolt 0.18s ease-out' : g.attacking ? `fhq-lunge-${((g as BTroop & { face?: number }).face ?? 1) > 0 ? 'r' : 'l'} 0.65s ease-in-out infinite` : 'fhq-stepbob 0.21s ease-in-out infinite', rotate: g.attacking ? undefined : ((g as BTroop & { face?: number }).face ?? 1) > 0 ? '2.5deg' : '-2.5deg' }}>
                  <div className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/30 pointer-events-none" style={{ bottom: '-5%', width: '58%', height: '13%' }} />
                  {/* Chip fallback hides the moment the sprite loads — no floating bubble. */}
                  {isMascotG ? (
                    <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: '3.2vmin' }}>🐯</span>
                  ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="relative" style={{ width: '46%', height: '40%', borderRadius: '50% 50% 42% 42%', background: helm, border: '1px solid rgba(255,255,255,0.3)', marginBottom: '-9%', zIndex: 2 }}>
                      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '18%', width: '70%', height: '14%', background: stripe, borderRadius: 2 }} />
                    </div>
                    <div className="flex items-center justify-center font-black text-white leading-none" style={{ width: '80%', height: '56%', borderRadius: '6px 6px 9px 9px', background: jersey, border: '1.5px solid rgba(0,0,0,0.5)', fontSize: '1.35vmin', boxShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{g.jersey}</div>
                  </div>
                  )}
                  <img src={art ?? unitPlayerSprite(g.unit)} alt="" draggable={false}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    onLoad={e => { const p = e.currentTarget.previousElementSibling as HTMLElement | null; if (p) p.style.display = 'none'; }}
                    className="fhq-flat absolute inset-0 w-full h-full object-contain"
                    style={{ transform: `translateZ(0)${((g as BTroop & { face?: number }).face ?? 1) < 0 ? ' scaleX(-1)' : ''}`, filter: frenzied ? `${gBaseFilter} drop-shadow(0 0 6px #ef4444)` : gBaseFilter }} />
                  {/* Hero gate guards WALK too — same two-frame stride, derived from the portrait path */}
                  {isHeroGuard && !g.attacking && (() => {
                    const hk = (art!.match(/heroes\/(\w+)\.png/) || [])[1];
                    if (!hk) return null;
                    const gFlip = ((g as BTroop & { face?: number }).face ?? 1) > 0 ? ' scaleX(-1)' : '';
                    const rigOn = (e: React.SyntheticEvent<HTMLImageElement>) => { const p = e.currentTarget.closest('.fhq-unit') as HTMLElement | null; if (p) p.dataset.rig = '1'; };
                    const rigOff = (e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; const p = e.currentTarget.closest('.fhq-unit') as HTMLElement | null; if (p) p.removeAttribute('data-rig'); };
                    return (
                      <>
                        {(['walkA', 'walkC', 'walkB', 'walkD'] as const).map((fr, qi) => (
                          <img key={fr} src={`/assets/heroes/rig/${hk}-${fr}.webp`} alt="" draggable={false} onLoad={rigOn} onError={rigOff} className="fhq-rigframe absolute inset-0 w-full h-full object-contain" style={{ animation: `fhq-q${qi + 1} 0.42s linear infinite`, transform: `translateZ(0)${gFlip}`, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }} />
                        ))}
                      </>
                    ); })()}
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
            // Alive = animate: crunch-jolt when TAKING a hit, lunge INTO the target on
            // the damage-pop cycle when attacking, else a stride-synced step bob.
            const hf = t.hitFlash > 0;
            const faceEarly = (t as BTroop & { face?: number }).face ?? 1;
            const anim = hf ? 'fhq-hitjolt 0.18s ease-out' : t.attacking ? `fhq-lunge-${faceEarly > 0 ? 'r' : 'l'} 0.65s ease-in-out infinite` : 'fhq-stepbob 0.21s ease-in-out infinite';
            // Individual players are a touch bigger + clearer than the old clumpy trios.
            const w = heroDef ? '7%' : specialDef ? (isMascot ? '5.5%' : '3.4%') : '4.6%';
            const wmin = heroDef ? 36 : specialDef ? (isMascot ? 30 : 16) : 26;
            const wmax = heroDef ? 58 : specialDef ? (isMascot ? 48 : 26) : 42;
            const pGlow = shielded ? 'drop-shadow(0 0 6px #0ea5e9)' : raging ? 'drop-shadow(0 0 6px #ef4444)' : healing ? 'drop-shadow(0 0 6px #22c55e)' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
            const face = faceEarly;
            const flip = face < 0 ? ' scaleX(-1)' : '';
            // Runners LEAN into their line of travel (standalone `rotate` property so it
            // composes with the transform-based bob/jolt animations instead of fighting them).
            const lean = t.attacking ? undefined : face > 0 ? '2.5deg' : '-2.5deg';
            // Fallback chip hides the moment the real sprite loads — units stand on the
            // turf with a shadow, not on a floating bubble.
            const hidePrev = (e: React.SyntheticEvent<HTMLImageElement>) => { const p = e.currentTarget.previousElementSibling as HTMLElement | null; if (p) p.style.display = 'none'; };
            const shadow = <div className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/30 pointer-events-none" style={{ bottom: '-5%', width: '58%', height: '13%' }} />;
            return (
              <div key={t.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                style={{ left: `${px(t.x, t.y)}%`, top: `${py(t.x, t.y)}%`, width: w, minWidth: wmin, maxWidth: wmax, zIndex: Math.round((t.x + t.y) / 2) + 1, transition: `left ${TICK_MS}ms linear, top ${TICK_MS}ms linear` }}>
                {(t.slowT ?? 0) > 0 && <span className="absolute pointer-events-none" style={{ top: '-14%', right: '-8%', fontSize: '1.5vmin', lineHeight: 1, zIndex: 2 }}>🚩</span>}
                {t.hp < t.maxHp && <div className="h-0.5 rounded-full bg-black/50 overflow-hidden mb-0.5" style={{ width: '85%' }}><div className="h-full bg-lime-400" style={{ width: `${(t.hp / t.maxHp) * 100}%` }} /></div>}
                {specialDef ? (
                  // Emoji placeholder shows until the real sprite loads, then hides.
                  <div className="relative w-full" style={{ aspectRatio: '1' }}>
                    {shadow}
                    <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: isMascot ? '3.2vmin' : '2.1vmin', filter: spGlow, animation: anim }}>{specialDef.emoji}</span>
                    <img src={specialDef.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} onLoad={hidePrev} className="absolute inset-0 w-full h-full object-contain" style={{ filter: hf ? `${spGlow} brightness(2.1)` : spGlow, animation: anim, transform: `translateZ(0)${flip}`, rotate: lean }} />
                  </div>
                ) : heroDef ? (
                  <div className="fhq-unit relative w-full" style={{ aspectRatio: '1', animation: anim, rotate: lean }}>
                    {shadow}
                    {/* fallback badge hides once the portrait loads */}
                    <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: `radial-gradient(circle at 50% 38%, ${heroDef.color}e0, #0f172a 88%)`, border: '2px solid #fde047', filter: hf ? `${glow} brightness(1.8)` : glow }}>
                      <span style={{ fontSize: '2.3vmin', lineHeight: 1 }}>{heroDef.emoji}</span>
                    </div>
                    <img src={heroDef.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} onLoad={hidePrev} className="fhq-flat absolute inset-0 w-full h-full object-contain" style={{ filter: hf ? `${glow} brightness(1.8)` : glow, transform: `translateZ(0)${flip}` }} />
                    {/* HEROES WALK: two-frame stride while moving, action pose while attacking.
                        Walk frames face viewer-LEFT natively → flip when running right. Missing
                        frames self-hide, leaving the flat art underneath. */}
                    {(() => { const rp = { action: t.heroKey === 'qb' ? '/assets/heroes/franchise-rig/body-followthrough.webp' : `/assets/heroes/rig/${t.heroKey}-action.webp`, base: `/assets/heroes/rig/${t.heroKey}` };
                      const rigFlip = face > 0 ? ' scaleX(-1)' : '';
                      const rigOn = (e: React.SyntheticEvent<HTMLImageElement>) => { const p = e.currentTarget.closest('.fhq-unit') as HTMLElement | null; if (p) p.dataset.rig = '1'; };
                      const rigOff = (e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; const p = e.currentTarget.closest('.fhq-unit') as HTMLElement | null; if (p) p.removeAttribute('data-rig'); };
                      return t.attacking ? (
                        // container carries the pop/jolt — the pose frame just renders
                        <img src={rp.action} alt="" draggable={false} onLoad={rigOn} onError={rigOff} className="absolute inset-0 w-full h-full object-contain" style={{ filter: hf ? `${glow} brightness(1.8)` : glow, transform: `translateZ(0)${rigFlip}` }} />
                      ) : (
                        <>
                          {(['walkA', 'walkC', 'walkB', 'walkD'] as const).map((fr, qi) => (
                            <img key={fr} src={`${rp.base}-${fr}.webp`} alt="" draggable={false} onLoad={rigOn} onError={rigOff} className="absolute inset-0 w-full h-full object-contain" style={{ filter: hf ? `${glow} brightness(1.8)` : glow, animation: `fhq-q${qi + 1} 0.42s linear infinite`, transform: `translateZ(0)${rigFlip}` }} />
                          ))}
                        </>
                      ); })()}
                    {/* Nameplate: full strength for the deploy moment, then fades way down —
                        review flagged clustered pills occluding sprites and hit VFX. */}
                    <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-black uppercase text-yellow-200 px-1 rounded pointer-events-none" style={{ bottom: '-14%', fontSize: '0.95vmin', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(253,224,71,0.35)', animation: 'fhq-tagfade 6s ease-out forwards' }}>{heroDef.name}</span>
                  </div>
                ) : (
                  // ONE individual player — chip fallback until the sprite loads, then pure sprite.
                  <div className="fhq-unit relative w-full" style={{ aspectRatio: '1', filter: hf ? `${pGlow} brightness(2.1)` : pGlow, animation: anim, rotate: lean }}>
                    {shadow}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      {/* helmet (team black w/ orange stripe) */}
                      <div className="relative" style={{ width: '46%', height: '40%', borderRadius: '50% 50% 42% 42%', background: '#111827', border: '1px solid rgba(255,255,255,0.3)', marginBottom: '-9%', zIndex: 2, boxShadow: shielded ? '0 0 0 2px #0ea5e9' : 'none' }}>
                        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '18%', width: '70%', height: '14%', background: '#f97316', borderRadius: 2 }} />
                      </div>
                      {/* numbered jersey (position color) */}
                      <div className="flex items-center justify-center font-black text-white leading-none" style={{ width: '80%', height: '56%', borderRadius: '6px 6px 9px 9px', background: st.color, border: '1.5px solid rgba(0,0,0,0.5)', fontSize: '1.35vmin', boxShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{t.jersey}</div>
                    </div>
                    <img src={unitPlayerSprite(t.unit)} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} onLoad={hidePrev} className="fhq-flat absolute inset-0 w-full h-full object-contain" style={{ transform: `translateZ(0)${flip}` }} />
                    {!t.attacking && (() => {
                      const base = unitPlayerSprite(t.unit).replace('-player.webp', '');
                      const uFlip = face > 0 ? ' scaleX(-1)' : '';
                      const rigOn2 = (e: React.SyntheticEvent<HTMLImageElement>) => { const p = e.currentTarget.closest('.fhq-unit') as HTMLElement | null; if (p) p.dataset.rig = '1'; };
                      const rigOff2 = (e: React.SyntheticEvent<HTMLImageElement>) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; const p = e.currentTarget.closest('.fhq-unit') as HTMLElement | null; if (p) p.removeAttribute('data-rig'); };
                      return (['walkA', 'walkC', 'walkB', 'walkD'] as const).map((fr, qi) => (
                        <img key={fr} src={`${base}-${fr}.webp`} alt="" draggable={false} onLoad={rigOn2} onError={rigOff2} className="fhq-rigframe absolute inset-0 w-full h-full object-contain" style={{ animation: `fhq-q${qi + 1} 0.42s linear infinite`, transform: `translateZ(0)${uFlip}` }} />
                      )); })()}
                    {/* jersey number rides the real sprite — the announcer talks about #23, so show #23 */}
                    <span className="absolute flex items-center justify-center font-black text-white" style={{ right: '-4%', bottom: '-2%', minWidth: '38%', height: '32%', borderRadius: 4, background: st.color, border: '1px solid rgba(0,0,0,0.55)', fontSize: '1.15vmin', boxShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{t.jersey}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* 🎺 THE BAND TAKES THEIR FIELD — road-win parade: drum major leads the line
              across the silenced stadium, two-frame march, proud bounce. Marches inside
              the field so it scales with the broadcast camera. */}
          {celeb && (['major', 'brass', 'drum', 'brass', 'drum', 'brass'] as const).map((m, i) => (
            <div key={`band${i}`} className="absolute pointer-events-none" style={{ left: '-16%', top: m === 'major' ? '44%' : '46.5%', width: m === 'major' ? '9.5%' : '7.5%', zIndex: 230, animation: `fhq-bandmarch 3.2s linear ${(i * 0.24).toFixed(2)}s both`, ['--fhq-march' as string]: m === 'major' ? '1350%' : '1710%' }}>
              <div className="relative w-full" style={{ aspectRatio: '1', animation: 'fhq-bandbob 0.44s ease-in-out infinite' }}>
                <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: '3vmin', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}>{m === 'drum' ? '🥁' : m === 'major' ? '✨' : '🎺'}</span>
                {(['A', 'B'] as const).map(fr => (
                  <img key={fr} src={`/assets/battle/band/band-${m}-${fr}.webp`} alt="" draggable={false}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    onLoad={e => { const sp = e.currentTarget.parentElement?.querySelector('span'); if (sp) (sp as HTMLElement).style.display = 'none'; }}
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ animation: `fhq-step${fr} 0.44s linear infinite`, filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.5))' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      {phase !== 'result' && isReplay && (
        <div className="shrink-0 bg-slate-900 border-t border-slate-800 px-3 py-3 text-center text-xs text-slate-400 font-bold">
          ● You're watching the actual attack on your stadium — every move is theirs.
        </div>
      )}
      {phase !== 'result' && !isReplay && (
        <div className="shrink-0 px-3 py-2" style={{ background: 'linear-gradient(180deg, #131c2e 0%, #0b111f 100%)', borderTop: '1px solid rgba(249,115,22,0.28)', boxShadow: '0 -6px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
          {isDefense ? (
            <div className="py-1">
              <div className="text-center text-xs text-orange-200 font-bold flex items-center justify-center gap-2 mb-2">
                <Shield size={14} className="text-orange-400" /> Rival offense is driving on your stadium — call your defense!
                {masteryTier > 0 && <span className="text-[9px] font-black bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 px-1.5 py-0.5 rounded" title="Formation mastery adds defense-play charges">{'★'.repeat(masteryTier)} MASTERY</span>}
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
                {/* 🧊 TIMEOUT — the ★★★ mastery reward: ice the entire drive once */}
                {masteryTier >= 3 && (
                  <button onClick={callTimeout} disabled={defPlays.timeout <= 0}
                    className={`relative flex flex-col items-center px-4 py-1.5 rounded-xl border-2 transition-all active:scale-95 ${defPlays.timeout <= 0 ? 'opacity-30 border-slate-800 cursor-not-allowed' : 'border-sky-300 bg-sky-900/30 hover:bg-sky-900/50'}`}>
                    <span className="text-lg leading-none">🧊</span>
                    <span className="text-[9px] font-bold text-white uppercase mt-0.5">Timeout</span>
                    <span className="text-[8px] font-bold text-slate-300">ICE THE DRIVE</span>
                    <span className="absolute -top-2 -right-1 min-w-5 h-5 px-1 rounded-full bg-sky-500 border-2 border-slate-900 text-[11px] font-bold text-white flex items-center justify-center">{defPlays.timeout}</span>
                  </button>
                )}
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
                          ${active ? 'border-yellow-400 bg-orange-900/50' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}
                        style={active ? { boxShadow: '0 0 10px rgba(249,115,22,0.4)' } : undefined}>
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
              {/* Phones: ONE scrollable card tray (CC-style) — wrapping 18 cards into
                  4 rows would swallow the field. Desktop: wrap and center. */}
              <div className="flex items-start gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                {/* Troops — real player art on the cards */}
                {UNIT_ORDER.map(u => {
                  const st = TROOP_STATS[u]; const count = army[u]; const active = selected === u && !pendingHero && !castMode && !pendingSpecial;
                  const next = squadQueues.current[u]?.[0];
                  return (
                    <DeployCard key={u}
                      onClick={() => { setSelected(u); setPendingHero(null); setCastMode(null); setPendingSpecial(null); }}
                      disabled={count <= 0} selected={active && count > 0}
                      art={unitPlayerSprite(u)} emoji={st.emoji} label={st.label}
                      sub={`⚡×${(config.power?.[u] ?? 1).toFixed(1)}`}
                      subSub={next ? `${next.name.split(' ').pop()} · ${next.role}` : undefined}
                      count={count} title={`${st.label} — ${st.hint}`} />
                  );
                })}

                {/* Heroes — portrait cards; on the field the card becomes the ability button */}
                {heroes.map(h => {
                  const onField = deployedHeroes.has(h.key);
                  const troop = onField ? s.troops.find(t => t.heroKey === h.key) : null;
                  const alive = troop && !troop.dead;
                  const cd = troop?.abilityCd ?? 0;
                  const pendingThis = pendingHero?.key === h.key;
                  if (!onField) {
                    return (
                      <DeployCard key={h.key}
                        onClick={() => { setPendingHero(h); setCastMode(null); setPendingSpecial(null); }}
                        selected={pendingThis}
                        art={h.art} emoji={h.emoji} label={h.name.split(' ')[1] || h.name}
                        sub={`HERO LV${h.level ?? 1}`} count="★" countBg="#eab308"
                        title={`${h.name} — tap, then tap the sideline`} />
                    );
                  }
                  return (
                    <DeployCard key={h.key}
                      onClick={() => useAbility(h.key)}
                      disabled={!alive || cd > 0} ready={!!alive && cd <= 0}
                      art={h.art} emoji={h.emoji} label={h.abilityName}
                      sub={!alive ? 'K.O.' : cd > 0 ? 'CHARGING' : 'READY!'}
                      overlay={alive && cd > 0 ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/60 font-display text-lg font-black text-white">{Math.ceil(cd)}</span>
                      ) : undefined}
                      title={`${h.name} — ${h.abilityName}`} />
                  );
                })}

                {/* Specials: Mascot (hype aura) + Fan Mob (swarm) */}
                {specials.map(sp => {
                  const left = specialCharges[sp.key] ?? 0; const pendingThis = pendingSpecial?.key === sp.key;
                  return (
                    <DeployCard key={sp.key}
                      onClick={() => { setPendingSpecial(pendingThis ? null : sp); setPendingHero(null); setCastMode(null); }}
                      disabled={left <= 0} selected={pendingThis}
                      art={sp.art} emoji={sp.emoji} label={sp.name}
                      sub={sp.key === 'mascot' ? 'HYPE AURA' : 'SWARM'}
                      count={left} title={sp.desc} />
                  );
                })}

                {/* Plays */}
                {PLAYBOOK.map(p => {
                  const left = plays[p.key] ?? 0; const active = castMode?.key === p.key;
                  return (
                    <DeployCard key={p.key}
                      onClick={() => { setCastMode(active ? null : p); setPendingHero(null); setPendingSpecial(null); }}
                      disabled={left <= 0} selected={active}
                      emoji={p.emoji} label={p.name} sub="PLAY"
                      count={left} countBg={p.color} title={`${p.name} — tap the field to call it`} />
                  );
                })}

                <button onClick={endBattle} title="Blow the whistle — see the result"
                  className="relative shrink-0 self-stretch rounded-2xl p-[2px] transition-all active:scale-95"
                  style={{ background: 'linear-gradient(160deg, #b91c1c, #450a0a)', boxShadow: '0 3px 8px rgba(0,0,0,0.45)' }}>
                  <span className="flex h-full w-[46px] flex-col items-center justify-center gap-1 rounded-[14px] bg-[#1a0b0b] text-red-300">
                    <Flag size={17} /><span className="text-[8px] font-black uppercase">End</span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 🎺 Road-win celebration — CROWD SILENCED stamp + confetti rain over the live
          field while the band marches. No dark backdrop: the point is SEEING the stands
          you just turned orange, in silence. Tap anywhere to skip to the card. */}
      {phase === 'result' && result && celeb && (
        <div className="absolute inset-0 z-10 overflow-hidden cursor-pointer" onClick={endCeleb}>
          {Array.from({ length: 50 }).map((_, i) => (
            <div key={i} className="absolute top-0 pointer-events-none" style={{ left: `${(i * 137) % 100}%`, width: 7, height: 12, background: ['#f97316', '#fde047', '#f8fafc', '#38bdf8', '#22c55e'][i % 5], borderRadius: 2, animation: `fhq-confetti ${1.7 + (i % 5) * 0.3}s linear ${(i % 9) * 0.12}s infinite` }} />
          ))}
          {/* positioning wrapper is animation-free — the reveal-in transform would
              otherwise REPLACE a centering translate (the recurring CSS law) */}
          <div className="absolute inset-x-0 text-center px-4" style={{ top: '13%' }}>
            <div style={{ animation: 'fhq-reveal-in 0.55s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              <div className="font-display font-black italic uppercase text-yellow-300 leading-none" style={{ fontSize: 'min(9vw, 46px)', textShadow: '0 0 18px rgba(250,204,21,0.6), 0 4px 8px #000' }}>🏆 Crowd Silenced!</div>
              <div className="mt-2 text-[12px] font-bold uppercase tracking-widest text-white/90" style={{ textShadow: '0 2px 4px #000' }}>The band takes THEIR field</div>
            </div>
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest text-white/60 font-bold animate-pulse">tap to skip</div>
        </div>
      )}

      {/* Result overlay */}
      {phase === 'result' && result && !celeb && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-10 animate-fade-in overflow-hidden">
          {/* Confetti on a win */}
          {result.won && Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="absolute top-0 pointer-events-none" style={{ left: `${(i * 137) % 100}%`, width: 8, height: 12, background: ['#f59e0b', '#3b82f6', '#ef4444', '#22c55e', '#e2e8f0'][i % 5], borderRadius: 2, animation: `fhq-confetti ${1.8 + (i % 5) * 0.25}s linear ${(i % 7) * 0.13}s infinite` }} />
          ))}
          <div className="relative bg-slate-900 w-full max-w-sm rounded-3xl border border-slate-700 shadow-2xl overflow-hidden" style={{ animation: 'fhq-reveal-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div className={`py-6 text-center ${result.won ? 'bg-gradient-to-b from-green-700 to-green-900' : 'bg-gradient-to-b from-red-800 to-red-950'}`}>
              {/* Say WON or LOST first. Every headline here was pure flavour — a first-timer
                  read "Shut Out" or "Goal-Line Stand!" and could not tell what had happened
                  to them. Flavour is kept, but the verdict leads. */}
              {!(result.campaignStage === 12 && result.won) && (
                <div className={`text-sm font-display font-black uppercase tracking-widest mb-1 ${result.won ? 'text-green-300' : 'text-red-300'}`}>
                  {result.won ? 'You won' : 'You lost'}
                </div>
              )}
              <div className="text-3xl font-display font-black text-white uppercase mb-3">
                {result.campaignStage === 12 && result.won ? '💍 League Champions!'
                  : result.gauntletTier !== undefined ? (result.gauntletCleared ? `🛡 Night ${result.gauntletTier} Survived!` : 'The House Fell')
                  : isReplay ? (result.won ? 'They Scored On You' : 'Your Defense Held!')
                  : isDefense ? (result.won ? 'Goal-Line Stand!' : 'They Scored!') : (result.won ? 'Crowd Silenced!' : 'Shut Out')}
              </div>
              {result.gauntletTier !== undefined && (
                <div className="flex justify-center gap-1.5 mb-1">
                  {[0, 1, 2, 3, 4].map(i => (
                    <span key={i} className="text-xl" style={{ opacity: i < (result.wavesHeld ?? 0) ? 1 : 0.25, filter: i < (result.wavesHeld ?? 0) ? 'none' : 'grayscale(1)', display: 'inline-block', animation: i < (result.wavesHeld ?? 0) ? `fhq-reveal-in 0.4s cubic-bezier(0.34,1.56,0.64,1) ${0.3 + i * 0.16}s both` : undefined }}>🛡</span>
                  ))}
                </div>
              )}
              {result.gauntletTier === undefined && (
                <>
                  <div className="flex justify-center gap-3 text-4xl">
                    {[0, 1, 2].map(i => <span key={i} style={{ opacity: i < result.stars ? 1 : 0.25, filter: i < result.stars ? 'none' : 'grayscale(1)', display: 'inline-block', animation: i < result.stars ? `fhq-reveal-in 0.45s cubic-bezier(0.34,1.56,0.64,1) ${0.35 + i * 0.28}s both` : undefined }}>🏈</span>)}
                  </div>
                  <div className="text-[11px] uppercase tracking-widest text-white/60 font-bold mt-2">Game Balls</div>
                </>
              )}
              {result.gauntletTier !== undefined && <div className="text-[11px] uppercase tracking-widest text-white/60 font-bold mt-1">Waves held — {result.wavesHeld}/5</div>}
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
              <div className="flex justify-between text-sm"><span className="text-slate-400">{isDefense ? 'Your base sacked' : 'Rival base sacked'}</span><span className="font-mono font-bold text-white">{result.pct}%</span></div>
              {!isDefense && driveStats && (
                <>
                  <div className="flex justify-between text-sm"><span className="text-slate-400">⭐ Drive MVP</span><span className="font-bold text-amber-300">{driveStats.mvp} <span className="text-[10px] font-mono text-slate-500">({driveStats.mvpDmg} yds)</span></span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-400">💥 Defenders flattened</span><span className="font-mono font-bold text-white">{driveStats.pancakes}{driveStats.bonus > 0 && <span className="text-yellow-400 text-xs"> (+{driveStats.bonus} loot)</span>}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-400">🩹 Your players knocked out</span><span className="font-mono font-bold text-white">{driveStats.lost}</span></div>
                </>
              )}
              {result.gauntletTier !== undefined ? (() => { const pay = gauntletReward(result.gauntletTier, result.wavesHeld ?? 0, !!result.gauntletCleared); return (
                <>
                  <div className="flex justify-between text-sm"><span className="text-slate-400">💰 Night purse</span><span className="font-mono font-bold text-yellow-400">+{pay.coins.toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-400">New fans won over</span><span className="font-mono font-bold text-rose-400">+{pay.fans}</span></div>
                </>
              ); })() : (
              <div className="flex justify-between text-sm"><span className="text-slate-400">{isDefense ? 'Coins lost' : 'Coins won'}</span><span className={`font-mono font-bold ${isDefense ? 'text-red-400' : 'text-yellow-400'}`}>{isDefense ? '−' : '+'}{result.coins}</span></div>
              )}
              {!isDefense && <div className="flex justify-between text-sm"><span className="text-slate-400">New fans won over</span><span className="font-mono font-bold text-rose-400">+{result.fans}</span></div>}
              <button onClick={() => { if (collectedRef.current) return; collectedRef.current = true; onFinish(result); }} className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-lg transition-colors active:scale-95">
                {isReplay ? 'Close Replay' : isDefense ? 'Back to Base' : 'Collect Rewards'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
