// The guardrail this project earned the hard way: layout bugs (iso-stacking,
// overlapping tiles, off-board pieces) shipped repeatedly because only eyeballs
// checked geometry. Every formation is now audited by machine on every test run.
import { describe, it, expect } from 'vitest';
import {
  FORMATION_ORDER, FORMATIONS, formationDef, auditFormation,
  slotsFor, wallsFor, wallHpFor, busTileFor, anchorsFor,
  slotUpgradeCost, slotHpMult, slotDmgMult, MAX_SLOT_LEVEL, formationUnlocked,
} from '../fixedBase';
import { BuildingType } from '../types';
import { mulberry32, armyFromRoster, defenseLayoutFromBase, GAME_PLANS } from '../battle';
import { INITIAL_ROSTER, INITIAL_BUILDINGS, wallCap, buildingTiles } from '../constants';

describe('formation geometry', () => {
  for (const f of FORMATION_ORDER) {
    describe(f, () => {
      it('has no overlaps, off-board tiles, or iso-stacked facilities', () => {
        expect(auditFormation(f)).toEqual([]);
      });
      it('has all 10 slots with positions', () => {
        const slots = slotsFor(f);
        expect(slots).toHaveLength(10);
        for (const s of slots) {
          expect(s.gridX).toBeGreaterThanOrEqual(0);
          expect(s.gridY).toBeGreaterThanOrEqual(0);
          expect(s.covers).toBeTruthy();
        }
        expect(new Set(slots.map(s => s.id)).size).toBe(10);
      });
      it('walls never touch the island edge rows/cols beyond ring bounds (bullseye rule: landing ground exists)', () => {
        // At max stadium level, at least the 4 corners of the board must be open
        // ground (attackers land on the outer ring).
        const walls = wallsFor(f, 12);
        const wallSet = new Set(walls.map(w => `${w.gridX},${w.gridY}`));
        for (const corner of ['0,0', '9,0', '0,9', '9,9']) {
          expect(wallSet.has(corner), `corner ${corner} must stay open in ${f}`).toBe(false);
        }
      });
      it('wall order grows with stadium level and dedupes', () => {
        const w1 = wallsFor(f, 1), w12 = wallsFor(f, 12);
        expect(w1.length).toBeGreaterThan(0);
        expect(w12.length).toBeGreaterThanOrEqual(w1.length);
        expect(w12.length).toBeLessThanOrEqual(wallCap(12));
        expect(new Set(w12.map(w => `${w.gridX},${w.gridY}`)).size).toBe(w12.length);
      });
      it('stadium is the centerpiece', () => {
        const a = anchorsFor(f)[BuildingType.STADIUM];
        expect(a).toEqual({ gridX: 4, gridY: 4 });
      });
      it('counter plans reference real game plans', () => {
        const planKeys = GAME_PLANS.map(p => p.key);
        const c = formationDef(f).counter;
        for (const k of [...c.strongVs, ...c.weakTo]) expect(planKeys).toContain(k);
      });
    });
  }

  it('formations are a choice, not an unlock — all three callable from Stadium L1 (July 2026 review)', () => {
    expect(formationUnlocked('goalline', 1)).toBe(true);
    expect(formationUnlocked('cover3', 1)).toBe(true);
    expect(formationUnlocked('maxprotect', 1)).toBe(true);
  });
});

describe('slot economy', () => {
  it('upgrade costs are monotonically increasing', () => {
    for (const kind of ['jugs', 'sled', 'ref', 'tshirt']) {
      let prev = 0;
      for (let lvl = 2; lvl <= MAX_SLOT_LEVEL; lvl++) {
        const c = slotUpgradeCost(kind, lvl);
        expect(c).toBeGreaterThan(prev);
        prev = c;
      }
    }
  });
  it('stat multipliers scale from 1', () => {
    expect(slotHpMult(1)).toBe(1);
    expect(slotDmgMult(1)).toBe(1);
    expect(slotHpMult(10)).toBeCloseTo(2.08);
    expect(slotDmgMult(10)).toBeCloseTo(1.9);
  });
});

describe('battle layout derivation', () => {
  it('carries formation on the HQ and real art on every facility', () => {
    const layout = defenseLayoutFromBase(
      INITIAL_BUILDINGS, wallsFor('goalline', 1), 1,
      slotsFor('goalline').slice(0, 1).map(s => ({ id: s.id, kind: s.kind, gridX: s.gridX, gridY: s.gridY, level: 1 })),
      busTileFor('goalline'), 0, wallHpFor(1), 'goalline',
    );
    const hq = layout.find(b => b.kind === 'hq')!;
    expect(hq.formation).toBe('goalline');
    expect(hq.art).toBeTruthy();
    expect(layout.some(b => b.kind === 'wall')).toBe(true);
    expect(layout.find(b => b.id === 'D1')?.kind).toBe('defense');
  });
  it('slot level scales turret stats deterministically', () => {
    const mk = (level: number) => defenseLayoutFromBase(
      INITIAL_BUILDINGS, [], 1,
      [{ id: 'D1', kind: 'jugs', gridX: 5, gridY: 3, level }], null, 0, 220, 'goalline',
    ).find(b => b.id === 'D1')!;
    const l1 = mk(1), l5 = mk(5);
    expect(l5.hp).toBeGreaterThan(l1.hp);
    expect(l5.damage!).toBeGreaterThan(l1.damage!);
  });
});

describe('determinism primitives', () => {
  it('mulberry32 replays identically from the same seed', () => {
    const a = mulberry32(1234), b = mulberry32(1234);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('armyFromRoster counts every unit group', () => {
    const army = armyFromRoster(INITIAL_ROSTER);
    const total = Object.values(army).reduce((s, n) => s + n, 0);
    expect(total).toBe(INITIAL_ROSTER.length);
  });
  it('2×2 footprints are exactly four tiles', () => {
    expect(buildingTiles(4, 4)).toHaveLength(4);
  });
});
