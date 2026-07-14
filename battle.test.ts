// CI GUARDRAILS for the combat/integrity fixes (backlog cross-cutting section).
// These lock in the ALREADY-SHIPPED behavior in battle.ts/constants.ts so a future
// refactor can't silently revert rarity→combat, the role table, pathfinding, the
// >700-trophy crash fix, or "a raid that does nothing pays nothing".
// Pure functions only — no DOM, no RNG dependence except where noted.
import { describe, it, expect } from 'vitest';
import { PlayerRole, PlayerRarity, UnitGroup } from './types';
import { ROLE_BASE_STATS, RARITY_MULT } from './constants';
import {
  effectiveStat, combatStat, unitCombatStats, armyStrength,
  generateRaidTargets, simulateRaid, planPath,
  ENEMY_BASES, ROLE_COMBAT,
  type BBuilding, type SimAttacker,
} from './battle';

// Minimal roster-player fixture (only the fields the combat helpers read).
const mk = (
  role: PlayerRole, rarity: PlayerRarity, unit: UnitGroup,
  level = 1, stats = { strength: 10, speed: 10, iq: 10 },
) => ({ id: `${role}-${rarity}-${level}`, role, rarity, unit, level, stats } as any);

const bb = (o: Partial<BBuilding> & Pick<BBuilding, 'id' | 'kind' | 'x' | 'y' | 'hp' | 'size'>): BBuilding =>
  ({ maxHp: o.hp, dead: false, cooldown: 0, ...o } as BBuilding);

describe('P0-1 — rarity is a real combat multiplier', () => {
  it('rarer beats common at equal role/level/stat', () => {
    const common = effectiveStat({ role: PlayerRole.QB, rarity: PlayerRarity.COMMON, level: 1 }, 'strength');
    const rare = effectiveStat({ role: PlayerRole.QB, rarity: PlayerRarity.RARE, level: 1 }, 'strength');
    const epic = effectiveStat({ role: PlayerRole.QB, rarity: PlayerRarity.EPIC, level: 1 }, 'strength');
    const legend = effectiveStat({ role: PlayerRole.QB, rarity: PlayerRarity.LEGENDARY, level: 1 }, 'strength');
    expect(common).toBeLessThan(rare);
    expect(rare).toBeLessThan(epic);
    expect(epic).toBeLessThan(legend);
  });

  it('is exactly base × rarityMult at level 1 (no drift)', () => {
    const base = ROLE_BASE_STATS[PlayerRole.OL].strength;
    expect(effectiveStat({ role: PlayerRole.OL, rarity: PlayerRarity.EPIC, level: 1 }, 'strength'))
      .toBeCloseTo(base * RARITY_MULT[PlayerRarity.EPIC], 6);
  });

  it('scales up with level', () => {
    const l1 = effectiveStat({ role: PlayerRole.RB, rarity: PlayerRarity.RARE, level: 1 }, 'speed');
    const l10 = effectiveStat({ role: PlayerRole.RB, rarity: PlayerRarity.RARE, level: 10 }, 'speed');
    expect(l10).toBeGreaterThan(l1);
  });

  it('an EPIC lineman has more battle HP than a COMMON one', () => {
    const epic = unitCombatStats(mk(PlayerRole.OL, PlayerRarity.EPIC, UnitGroup.OFFENSE_LINE));
    const common = unitCombatStats(mk(PlayerRole.OL, PlayerRarity.COMMON, UnitGroup.OFFENSE_LINE));
    expect(epic.hp).toBeGreaterThan(common.hp);
  });

  it('training surplus stacks on top of the derived stat', () => {
    const trained = combatStat(mk(PlayerRole.DL, PlayerRarity.COMMON, UnitGroup.DEFENSE_LINE, 1, { strength: 30, speed: 10, iq: 10 }), 'strength');
    const raw = effectiveStat({ role: PlayerRole.DL, rarity: PlayerRarity.COMMON, level: 1 }, 'strength');
    expect(trained).toBeCloseTo(raw + 20, 6); // +20 trained surplus above the 10 baseline
  });
});

describe('P1-2 — the role table actually shapes the statline', () => {
  it('roles are distinct: OL tankier than WR, QB out-ranges OL', () => {
    const ol = unitCombatStats(mk(PlayerRole.OL, PlayerRarity.COMMON, UnitGroup.OFFENSE_LINE));
    const wr = unitCombatStats(mk(PlayerRole.WR, PlayerRarity.COMMON, UnitGroup.OFFENSE_SKILL));
    const qb = unitCombatStats(mk(PlayerRole.QB, PlayerRarity.COMMON, UnitGroup.OFFENSE_SKILL));
    expect(ol.hp).toBeGreaterThan(wr.hp);
    expect(qb.range).toBe(ROLE_COMBAT.QB.range);
    expect(qb.range).toBeGreaterThan(ol.range);
  });

  it('flag units exist in the table (thrower/receiver/protector)', () => {
    expect(ROLE_COMBAT.QB.thrower).toBe(true);
    expect(ROLE_COMBAT.WR.receiver).toBe(true);
    expect(ROLE_COMBAT.OL.protector).toBe(true);
  });
});

describe('P1-3 — tendencies/rarity change army strength', () => {
  it('an EPIC-heavy line out-muscles a COMMON-heavy line', () => {
    const epicSquad = [mk(PlayerRole.OL, PlayerRarity.EPIC, UnitGroup.OFFENSE_LINE), mk(PlayerRole.OL, PlayerRarity.EPIC, UnitGroup.OFFENSE_LINE)];
    const commonSquad = [mk(PlayerRole.OL, PlayerRarity.COMMON, UnitGroup.OFFENSE_LINE), mk(PlayerRole.OL, PlayerRarity.COMMON, UnitGroup.OFFENSE_LINE)];
    expect(armyStrength(epicSquad)[UnitGroup.OFFENSE_LINE])
      .toBeGreaterThan(armyStrength(commonSquad)[UnitGroup.OFFENSE_LINE]);
  });
});

describe('P0-2 — raid generation is crash-free and scales with trophies', () => {
  it('does not throw at high trophy counts (the old >700 TypeError)', () => {
    for (const t of [0, 300, 750, 1200, 5000, 20000]) {
      expect(() => generateRaidTargets(t)).not.toThrow();
      const targets = generateRaidTargets(t);
      expect(targets).toHaveLength(3);
      targets.forEach(tg => {
        expect(tg.buildings.length).toBeGreaterThan(0);
        expect(typeof tg.name).toBe('string');
      });
    }
  });

  it('P2-2: ships ≥6 distinct base templates, each with a valid HQ', () => {
    expect(ENEMY_BASES.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(ENEMY_BASES.map(b => b.id));
    expect(ids.size).toBe(ENEMY_BASES.length); // no duplicate templates
    ENEMY_BASES.forEach(base => {
      const hqs = base.buildings.filter(b => b.kind === 'hq');
      expect(hqs).toHaveLength(1); // exactly one HQ or the sim has nothing to kill
      expect(base.buildings.some(b => b.kind === 'defense')).toBe(true);
    });
  });

  it('higher trophies field tougher targets (more total defense HP)', () => {
    const totalHp = (trophies: number) => {
      // average several draws to smooth the per-target RNG
      let sum = 0;
      for (let i = 0; i < 8; i++) sum += generateRaidTargets(trophies).reduce((s, tg) => s + tg.buildings.reduce((h, b) => h + b.hp, 0), 0);
      return sum / 8;
    };
    expect(totalHp(3000)).toBeGreaterThan(totalHp(0));
  });
});

describe('P0-5 — a raid outcome is honest (result respects the fight)', () => {
  it('zero attackers → zero damage, zero stars, HQ survives', () => {
    const res = simulateRaid(ENEMY_BASES[0].buildings, [], 1);
    expect(res.pct).toBe(0);
    expect(res.stars).toBe(0);
    expect(res.hqDead).toBe(false);
  });

  it('an overwhelming force flattens the base (deterministic sim)', () => {
    const attackers: SimAttacker[] = Array.from({ length: 24 }, (_, i) => ({
      unit: i % 2 ? UnitGroup.OFFENSE_LINE : UnitGroup.DEFENSE_LINE,
      role: i % 2 ? PlayerRole.OL : PlayerRole.RB,
      rarity: PlayerRarity.EPIC, level: 12,
      x: 50 + Math.cos(i) * 47, y: 50 + Math.sin(i) * 47,
    }));
    const res = simulateRaid(ENEMY_BASES[0].buildings, attackers, 2);
    expect(res.pct).toBeGreaterThan(50);
    expect(res.hqDead).toBe(true);
    expect(res.stars).toBeGreaterThanOrEqual(1);
  });
});

describe('P1-1 — wall-aware pathfinding routes to the goal', () => {
  const goal = bb({ id: 'hq', kind: 'hq', x: 50, y: 50, hp: 500, size: 8 });

  it('finds a clear path and smashes nothing when unobstructed', () => {
    const plan = planPath(0, 0, goal, [goal]);
    expect(plan.goalId).toBe('hq');
    expect(plan.path.length).toBeGreaterThan(0);
    expect(plan.targetWallId).toBeNull();
  });

  it('when the goal is boxed in, it commits to smashing a wall', () => {
    const walls = [
      bb({ id: 'w-w', kind: 'wall', x: 40, y: 50, hp: 200, size: 4 }),
      bb({ id: 'w-e', kind: 'wall', x: 60, y: 50, hp: 200, size: 4 }),
      bb({ id: 'w-n', kind: 'wall', x: 50, y: 40, hp: 200, size: 4 }),
      bb({ id: 'w-s', kind: 'wall', x: 50, y: 60, hp: 200, size: 4 }),
    ];
    const plan = planPath(0, 0, goal, [goal, ...walls]);
    expect(plan.targetWallId).not.toBeNull();
  });
});
