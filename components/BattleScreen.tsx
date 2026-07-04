import React, { useEffect, useRef, useState } from 'react';
import { UnitGroup } from '../types';
import {
  BattleBuildingDef, BBuilding, BTroop, TROOP_STATS, UNIT_ORDER,
  nearestBuilding, nearestTroop, blockingWall, dist, BATTLE_SECONDS,
  RaidHero, PLAYBOOK, PlayDef, ABILITY_CD, RAGE_SECONDS, HEAL_SECONDS, HEAL_PER_SEC,
  SpecialDef, SpecialKind,
} from '../battle';
import { battleBuildingSprite, unitSprite, unitPlayerSprite } from '../assets';
import { X, Clock, Flag, Shield } from 'lucide-react';

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
}

export interface BattleResult {
  mode: 'attack' | 'defense';
  title: string;
  stars: number;
  pct: number;
  coins: number;
  fans: number;
  won: boolean;
}

interface Props {
  config: BattleConfig;
  onFinish: (result: BattleResult) => void;
  onExit: () => void;
}

// A defense "shot" is now a football lobbed from a defender to a target — an arcing
// projectile (t: 0→1 over dur), never a bullet.
interface Shot { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; rot: number; }
interface Pulse { x: number; y: number; r: number; life: number; maxLife: number; color: string; }
// Ephemeral battle FX: dust puffs under runners, impact pops on contact, floating "SACKED!" text.
interface Fx { type: 'dust' | 'impact' | 'yards'; x: number; y: number; life: number; maxLife: number; text?: string; }

const TICK_MS = 50;
const DT = TICK_MS / 1000;
let troopUid = 0;

const emptyArmy = (): Record<UnitGroup, number> => ({
  [UnitGroup.OFFENSE_LINE]: 0, [UnitGroup.OFFENSE_SKILL]: 0,
  [UnitGroup.DEFENSE_LINE]: 0, [UnitGroup.DEFENSE_SECONDARY]: 0,
});

const makeTroop = (unit: UnitGroup, x: number, y: number, mult = 1): BTroop => {
  const st = TROOP_STATS[unit];
  const hp = Math.round(st.hp * mult);
  return { id: `tr${++troopUid}`, unit, x, y, hp, maxHp: hp, dps: st.dps * mult, speed: st.speed, range: st.range, targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey: 1 + Math.floor(Math.random() * 98) };
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
  const heroes = config.heroes ?? [];
  const fieldRef = useRef<HTMLDivElement>(null);
  const sim = useRef<{ troops: BTroop[]; buildings: BBuilding[]; shots: Shot[]; pulses: Pulse[]; fx: Fx[]; shakeT: number; time: number; ended: boolean }>({
    troops: (config.preTroops || []).map(t => makeTroop(t.unit, t.x, t.y, config.aiMult ?? 1)),
    buildings: config.buildings.map(b => ({ ...b, maxHp: b.hp, dead: false, cooldown: 0 })),
    shots: [], pulses: [], fx: [], shakeT: 0, time: BATTLE_SECONDS, ended: false,
  });

  const [army, setArmy] = useState<Record<UnitGroup, number>>(config.playerArmy || emptyArmy());
  const [deployedHeroes, setDeployedHeroes] = useState<Set<string>>(new Set());
  const [plays, setPlays] = useState<Record<string, number>>(() => Object.fromEntries(PLAYBOOK.map(p => [p.key, p.charges])));
  const specials = config.specials ?? [];
  const [pendingSpecial, setPendingSpecial] = useState<SpecialDef | null>(null);
  const [specialCharges, setSpecialCharges] = useState<Record<string, number>>(() => Object.fromEntries(specials.map(sp => [sp.key, sp.charges])));
  const [selected, setSelected] = useState<UnitGroup>(() => UNIT_ORDER.find(u => (config.playerArmy?.[u] ?? 0) > 0) ?? UnitGroup.OFFENSE_LINE);
  const [pendingHero, setPendingHero] = useState<RaidHero | null>(null);
  const [castMode, setCastMode] = useState<PlayDef | null>(null);
  const [phase, setPhase] = useState<'deploy' | 'fighting' | 'result'>(isDefense ? 'fighting' : 'deploy');
  const [, forceTick] = useState(0);
  const [result, setResult] = useState<BattleResult | null>(null);

  const total = config.buildings.filter(b => b.kind !== 'wall').length; // walls don't count toward %

  const endBattle = () => {
    if (sim.current.ended) return;
    sim.current.ended = true;
    const s = sim.current;
    const destroyed = s.buildings.filter(b => b.dead && b.kind !== 'wall').length;
    const pct = Math.round((destroyed / total) * 100);
    const hqDead = s.buildings.find(b => b.kind === 'hq')?.dead ?? false;
    const stars = (pct >= 50 ? 1 : 0) + (hqDead ? 1 : 0) + (pct >= 99 ? 1 : 0);
    const frac = destroyed / total;
    setResult({ mode: config.mode, title: config.title, stars, pct, coins: Math.round(config.loot.coins * frac), fans: Math.round(config.loot.fans * frac), won: isDefense ? pct < 50 : stars > 0 });
    setPhase('result');
  };

  useEffect(() => {
    if (phase !== 'fighting') return;
    const iv = setInterval(() => {
      const s = sim.current;
      if (s.ended) return;

      for (const t of s.troops) {
        if (t.dead) continue;
        if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - DT);
        if (t.rageT > 0) t.rageT = Math.max(0, t.rageT - DT);
        if (t.healT > 0) { t.healT = Math.max(0, t.healT - DT); t.hp = Math.min(t.maxHp, t.hp + HEAL_PER_SEC * DT); }
        if (t.shieldT && t.shieldT > 0) t.shieldT = Math.max(0, t.shieldT - DT);
        if (t.abilityCd && t.abilityCd > 0) t.abilityCd = Math.max(0, t.abilityCd - DT);

        const raging = t.rageT > 0;
        const dps = t.dps * (raging ? 2 : 1);
        const speed = t.speed * (raging ? 1.5 : 1);

        const goal = nearestBuilding(t.x, t.y, s.buildings); // nearest real (non-wall) target
        if (!goal) continue;
        const wall = blockingWall(t.x, t.y, t.range, goal, s.buildings);
        const target = wall || goal; // smash through blocking walls first
        const d = dist(t.x, t.y, target.x, target.y);
        const stopAt = t.range + target.size * 0.5;
        if (d > stopAt) {
          t.attacking = false;
          const step = Math.min(speed * DT, d - stopAt);
          t.x += ((target.x - t.x) / d) * step;
          t.y += ((target.y - t.y) / d) * step;
          if (Math.random() < 0.05) s.fx.push({ type: 'dust', x: t.x, y: t.y + 1.6, life: 0.4, maxLife: 0.4 });
        } else {
          t.attacking = true;
          target.hp -= dps * DT;
          if (Math.random() < 0.12) s.fx.push({ type: 'impact', x: target.x, y: target.y - target.size * 0.3, life: 0.22, maxLife: 0.22 });
          if (target.hp <= 0) {
            target.hp = 0; target.dead = true; t.targetId = null;
            if (target.kind !== 'wall') {
              const scored = target.kind === 'hq'; // taking their stadium = the score
              s.fx.push({ type: 'yards', text: scored ? 'TOUCHDOWN!' : 'SACKED!', x: target.x, y: target.y, life: scored ? 1.5 : 1.0, maxLife: scored ? 1.5 : 1.0 });
              s.shakeT = scored ? 0.4 : 0.25;
            }
          }
        }
      }

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
        if (Math.random() < 0.08) s.pulses.push({ x: m.x, y: m.y, r: r, life: 0.4, maxLife: 0.4, color: '#f97316' });
      }

      for (const b of s.buildings) {
        if (b.dead || b.kind !== 'defense' || !b.damage || !b.range) continue;
        b.cooldown -= DT;
        if (b.cooldown <= 0) {
          const prey = nearestTroop(b.x, b.y, s.troops, b.range);
          if (prey) {
            prey.hp -= b.damage * (prey.shieldT && prey.shieldT > 0 ? 0.5 : 1); prey.hitFlash = 0.15;
            if (prey.hp <= 0) { prey.hp = 0; prey.dead = true; }
            s.shots.push({ sx: b.x, sy: b.y, tx: prey.x, ty: prey.y, t: 0, dur: 0.3, rot: Math.random() * 360 });
            b.cooldown = 0.7;
          } else b.cooldown = 0.1;
        }
      }

      if (s.shots.length) s.shots = s.shots.filter(sh => (sh.t += DT) < sh.dur);
      if (s.pulses.length) s.pulses = s.pulses.filter(p => (p.life -= DT) > 0);
      if (s.fx.length) s.fx = s.fx.filter(f => (f.life -= DT) > 0);
      if (s.shakeT > 0) s.shakeT = Math.max(0, s.shakeT - DT);

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
        s.troops.push(makeTroop(UnitGroup.OFFENSE_SKILL, h.x + Math.cos(a) * 3, h.y + Math.sin(a) * 3, config.power?.[UnitGroup.OFFENSE_SKILL] ?? 1));
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

  const handleFieldClick = (e: React.MouseEvent) => {
    if (isDefense || phase === 'result') return;
    const rect = fieldRef.current!.getBoundingClientRect();
    const wx = ((e.clientX - rect.left) / rect.width) * 100;
    const wy = ((e.clientY - rect.top) / rect.height) * 100;

    if (castMode) {
      if ((plays[castMode.key] ?? 0) <= 0) return;
      sim.current.troops.forEach(t => {
        if (t.dead) return;
        if (dist(t.x, t.y, wx, wy) <= castMode.radius) {
          if (castMode.key === 'blitz') t.rageT = RAGE_SECONDS;
          else if (castMode.key === 'medic') t.healT = HEAL_SECONDS;
        }
      });
      sim.current.pulses.push({ x: wx, y: wy, r: castMode.radius, life: 0.5, maxLife: 0.5, color: castMode.color });
      setPlays(p => ({ ...p, [castMode.key]: p[castMode.key] - 1 }));
      setCastMode(null);
      return;
    }

    if (pendingHero) {
      if (!perimeterOk(wx, wy)) return;
      sim.current.troops.push(makeHeroTroop(pendingHero, wx, wy));
      setDeployedHeroes(prev => new Set(prev).add(pendingHero.key));
      setPendingHero(null);
      if (phase === 'deploy') setPhase('fighting');
      return;
    }

    if (pendingSpecial) {
      if ((specialCharges[pendingSpecial.key] ?? 0) <= 0 || !perimeterOk(wx, wy)) return;
      // Fan Mob spawns a whole cluster; Mascot spawns one. Scatter multi-spawns a bit.
      for (let i = 0; i < pendingSpecial.count; i++) {
        const a = (i / pendingSpecial.count) * Math.PI * 2;
        const off = pendingSpecial.count > 1 ? 2.5 : 0;
        sim.current.troops.push(makeSpecialTroop(pendingSpecial, wx + Math.cos(a) * off, wy + Math.sin(a) * off));
      }
      setSpecialCharges(c => ({ ...c, [pendingSpecial.key]: c[pendingSpecial.key] - 1 }));
      setPendingSpecial(null);
      if (phase === 'deploy') setPhase('fighting');
      return;
    }

    if (army[selected] <= 0 || !perimeterOk(wx, wy)) return;
    sim.current.troops.push(makeTroop(selected, wx, wy, config.power?.[selected] ?? 1));
    setArmy(a => ({ ...a, [selected]: a[selected] - 1 }));
    if (phase === 'deploy') setPhase('fighting');
  };

  const s = sim.current;
  const destroyed = s.buildings.filter(b => b.dead && b.kind !== 'wall').length;
  const pct = Math.round((destroyed / total) * 100);
  const hqDead = s.buildings.find(b => b.kind === 'hq')?.dead ?? false;
  const liveStars = (pct >= 50 ? 1 : 0) + (hqDead ? 1 : 0) + (pct >= 99 ? 1 : 0);
  const timeLeft = Math.max(0, Math.ceil(s.time));

  const instruction = castMode ? `Tap the field to call ${castMode.name}`
    : pendingSpecial ? `Tap the sideline to send in the ${pendingSpecial.name}`
    : pendingHero ? `Tap the sideline to send in ${pendingHero.name}`
    : army[selected] > 0 ? `Tap the sideline to send in your ${TROOP_STATS[selected].label}`
    : 'Pick your offense — players, heroes, or plays';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white"><X size={18} /></button>
          <div>
            <div className="font-display font-bold text-white uppercase tracking-tight leading-none flex items-center gap-2">
              {isDefense && <Shield size={16} className="text-blue-400" />}{config.title}
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-base leading-none">
              {[0, 1, 2].map(i => <span key={i} style={{ opacity: i < liveStars ? 1 : 0.25, filter: i < liveStars ? 'none' : 'grayscale(1)' }}>🏈</span>)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-[10px] uppercase text-slate-500 font-bold leading-none">{isDefense ? 'Ground lost' : 'Destroyed'}</div>
            <div className={`font-mono font-bold text-lg leading-none ${isDefense && pct >= 50 ? 'text-red-400' : 'text-white'}`}>{pct}%</div>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold ${timeLeft <= 10 ? 'bg-red-900/50 text-red-300' : 'bg-slate-800 text-white'}`}>
            <Clock size={15} /> 0:{timeLeft.toString().padStart(2, '0')}
          </div>
        </div>
      </div>

      {/* Battlefield */}
      <div className="flex-1 flex items-center justify-center p-3 overflow-hidden bg-gradient-to-b from-emerald-900 to-emerald-950">
        <div ref={fieldRef} onClick={handleFieldClick}
          className={`relative rounded-2xl overflow-hidden shadow-2xl ${isDefense ? '' : castMode ? 'cursor-pointer ring-4 ring-offset-0' : 'cursor-crosshair'}`}
          style={{ width: 'min(96vw, 74vh)', height: 'min(96vw, 74vh)', background: 'repeating-conic-gradient(#2f9e44 0% 25%, #2b8a3e 0% 50%) 50% / 14% 14%', border: '3px solid #14532d', animation: s.shakeT > 0 ? 'fhq-shake 0.25s ease-in-out' : undefined, ...(castMode ? { boxShadow: `0 0 0 3px ${castMode.color}` } : {}) }}>

          {/* Stadium surround — a dark stands ring + crowd doing the wave on all four sides,
              with tailgaters in the corners. Makes every battle read as being INSIDE a stadium. */}
          <div className="absolute inset-0 pointer-events-none z-0">
            <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: 'inset 0 0 0 14px rgba(15,23,42,0.35)' }} />
            {(['top', 'bottom'] as const).map(side => (
              <div key={side} className="absolute left-0 right-0 flex justify-around px-1" style={{ [side]: 2 }}>
                {Array.from({ length: 26 }).map((_, i) => (
                  <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i % 3 === 0 ? '#f59e0b' : i % 3 === 1 ? '#3b82f6' : '#e2e8f0', animation: `fhq-wave 1.3s ease-in-out ${(i * 0.05).toFixed(2)}s infinite` }} />
                ))}
              </div>
            ))}
            {(['left', 'right'] as const).map(side => (
              <div key={side} className="absolute top-0 bottom-0 flex flex-col justify-around py-1" style={{ [side]: 2 }}>
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i % 3 === 0 ? '#e2e8f0' : i % 3 === 1 ? '#f59e0b' : '#3b82f6', animation: `fhq-wave 1.3s ease-in-out ${(i * 0.05).toFixed(2)}s infinite` }} />
                ))}
              </div>
            ))}
            {/* Tailgaters ringing the lot */}
            <span className="absolute text-[10px]" style={{ left: 6, top: '40%' }}>🚗</span>
            <span className="absolute text-[10px]" style={{ left: 6, top: '58%' }}>🎉</span>
            <span className="absolute text-[10px]" style={{ right: 6, top: '44%' }}>🍔</span>
            <span className="absolute text-[10px]" style={{ right: 6, top: '60%' }}>🚙</span>
          </div>

          {!isDefense && phase === 'deploy' && (
            <div className="absolute rounded-full border-2 border-white/20 border-dashed pointer-events-none" style={{ left: '14%', top: '14%', width: '72%', height: '72%' }} />
          )}

          {s.buildings.filter(b => b.kind === 'defense' && !b.dead && b.range).map(b => (
            <div key={`r-${b.id}`} className="absolute rounded-full border border-red-400/20 bg-red-500/5 pointer-events-none"
              style={{ left: `${b.x - b.range!}%`, top: `${b.y - b.range!}%`, width: `${b.range! * 2}%`, height: `${b.range! * 2}%` }} />
          ))}

          {/* Play/ability pulses */}
          {s.pulses.map((p, i) => (
            <div key={i} className="absolute rounded-full border-2 pointer-events-none" style={{ left: `${p.x - p.r}%`, top: `${p.y - p.r}%`, width: `${p.r * 2}%`, height: `${p.r * 2}%`, borderColor: p.color, backgroundColor: `${p.color}22`, opacity: p.life / p.maxLife }} />
          ))}

          {/* Defense "shots" are footballs lobbed on an arc — no bullets */}
          {s.shots.map((sh, i) => {
            const u = sh.t / sh.dur;
            const x = sh.sx + (sh.tx - sh.sx) * u;
            const y = sh.sy + (sh.ty - sh.sy) * u - Math.sin(Math.PI * u) * 9; // parabolic arc
            return (
              <div key={i} className="absolute pointer-events-none" style={{ left: `${x}%`, top: `${y}%`, fontSize: '2.6vmin', lineHeight: 1, zIndex: 95, transform: `translate(-50%,-50%) rotate(${sh.rot + u * 540}deg)`, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}>🏈</div>
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
            if (f.type === 'impact') return (
              <div key={i} className="absolute pointer-events-none rounded-full" style={{ left: `${f.x}%`, top: `${f.y}%`, width: '3.6vmin', height: '3.6vmin', background: 'radial-gradient(circle, #fff 0%, #fde047 45%, transparent 72%)', zIndex: 150, transform: `translate(-50%,-50%) scale(${0.6 + (1 - k) * 1.1})`, opacity: k }} />
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
                <div key={b.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none" style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.size * 1.4}%`, zIndex: Math.round(b.y) }}>
                  {!b.dead && <div className="h-0.5 rounded-full bg-black/50 overflow-hidden mb-0.5" style={{ width: '85%', minWidth: 18 }}><div className="h-full bg-lime-400" style={{ width: `${(b.hp / b.maxHp) * 100}%` }} /></div>}
                  <img src="/assets/battle/blocking-sled.png" alt="" draggable={false} className="w-full" style={{ height: 'auto', aspectRatio: '1', objectFit: 'contain', opacity: b.dead ? 0.25 : 1, filter: b.dead ? 'grayscale(1) brightness(0.55)' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }} />
                </div>
              );
            }
            // Buildings: width is a % of the field, so `size` (world radius) maps straight
            // to on-screen footprint. HQ size 8 → 17.6% ; buildings size 5–6 → 11–13%.
            const wpct = b.size * 2.2;
            const sprite = battleBuildingSprite(b.kind, b.id);
            return (
              <div key={b.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none" style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${wpct}%`, zIndex: Math.round(b.y) }}>
                {!b.dead && <div className="mb-0.5 h-1 rounded-full bg-black/50 overflow-hidden" style={{ width: '80%', minWidth: 26, maxWidth: 60 }}><div className="h-full bg-green-400" style={{ width: `${(b.hp / b.maxHp) * 100}%` }} /></div>}
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
            const w = heroDef ? '6%' : specialDef ? (isMascot ? '5.5%' : '3.4%') : '4.6%';
            const wmin = heroDef ? 32 : specialDef ? (isMascot ? 30 : 16) : 26;
            const wmax = heroDef ? 52 : specialDef ? (isMascot ? 48 : 26) : 42;
            const pGlow = shielded ? 'drop-shadow(0 0 6px #0ea5e9)' : raging ? 'drop-shadow(0 0 6px #ef4444)' : healing ? 'drop-shadow(0 0 6px #22c55e)' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
            return (
              <div key={t.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                style={{ left: `${t.x}%`, top: `${t.y}%`, width: w, minWidth: wmin, maxWidth: wmax, zIndex: Math.round(t.y) + 100, transition: `left ${TICK_MS}ms linear, top ${TICK_MS}ms linear` }}>
                <div className="h-0.5 rounded-full bg-black/50 overflow-hidden mb-0.5" style={{ width: '85%' }}><div className="h-full bg-lime-400" style={{ width: `${(t.hp / t.maxHp) * 100}%` }} /></div>
                {specialDef ? (
                  // Emoji placeholder shows until the real sprite loads; the <img> covers it when present.
                  <div className="relative w-full" style={{ aspectRatio: '1' }}>
                    <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: isMascot ? '3.2vmin' : '2.1vmin', filter: spGlow, animation: anim }}>{specialDef.emoji}</span>
                    <img src={specialDef.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-contain" style={{ filter: spGlow, opacity: t.hitFlash > 0 ? 0.5 : 1, animation: anim }} />
                  </div>
                ) : heroDef ? (
                  <div className="relative w-full" style={{ aspectRatio: '1' }}>
                    <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: '3vmin', filter: glow, animation: anim }}>{heroDef.emoji}</span>
                    <img src={heroDef.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-contain" style={{ filter: glow, opacity: t.hitFlash > 0 ? 0.6 : 1, animation: anim }} />
                  </div>
                ) : (
                  // ONE individual player — a jersey-number chip now, auto-upgrades to a single-player sprite when the art lands.
                  <div className="relative w-full" style={{ aspectRatio: '1', filter: pGlow, opacity: t.hitFlash > 0 ? 0.5 : 1, animation: anim }}>
                    <div className="absolute inset-0 flex items-center justify-center rounded-full font-black text-white leading-none"
                      style={{ background: st.color, border: '1.5px solid rgba(0,0,0,0.45)', fontSize: '1.7vmin', boxShadow: shielded ? '0 0 0 2px #0ea5e9' : '0 1px 3px rgba(0,0,0,0.5)' }}>{t.jersey}</div>
                    <img src={unitPlayerSprite(t.unit)} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-contain" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      {phase !== 'result' && (
        <div className="shrink-0 bg-slate-900 border-t border-slate-800 px-3 py-2">
          {isDefense ? (
            <div className="text-center text-sm text-orange-200 font-bold flex items-center justify-center gap-2 py-2">
              <Shield size={16} className="text-orange-400" /> Rival offense is driving on your stadium — your crowd & walls hold the line!
            </div>
          ) : (
            <>
              <div className="text-center text-xs text-orange-300 font-bold mb-2">{instruction}</div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {/* Troops */}
                {UNIT_ORDER.map(u => {
                  const st = TROOP_STATS[u]; const count = army[u]; const active = selected === u && !pendingHero && !castMode && !pendingSpecial;
                  return (
                    <button key={u} onClick={() => { setSelected(u); setPendingHero(null); setCastMode(null); setPendingSpecial(null); }} disabled={count <= 0}
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
                {isDefense ? (result.won ? 'Goal-Line Stand!' : 'They Scored!') : (result.won ? 'Crowd Silenced!' : 'Shut Out')}
              </div>
              <div className="flex justify-center gap-3 text-4xl">
                {[0, 1, 2].map(i => <span key={i} className={i < result.stars ? 'animate-bounce-sm' : ''} style={{ opacity: i < result.stars ? 1 : 0.25, filter: i < result.stars ? 'none' : 'grayscale(1)', animationDelay: `${i * 120}ms` }}>🏈</span>)}
              </div>
              <div className="text-[11px] uppercase tracking-widest text-white/60 font-bold mt-2">Game Balls</div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between text-sm"><span className="text-slate-400">{isDefense ? 'Ground given up' : 'Enemy destroyed'}</span><span className="font-mono font-bold text-white">{result.pct}%</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-400">{isDefense ? 'Coins lost' : 'Coins looted'}</span><span className={`font-mono font-bold ${isDefense ? 'text-red-400' : 'text-yellow-400'}`}>{isDefense ? '−' : '+'}{result.coins}</span></div>
              {!isDefense && <div className="flex justify-between text-sm"><span className="text-slate-400">Fans gained</span><span className="font-mono font-bold text-rose-400">+{result.fans}</span></div>}
              <button onClick={() => onFinish(result)} className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-lg transition-colors active:scale-95">
                {isDefense ? 'Back to Base' : 'Collect Rewards'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
