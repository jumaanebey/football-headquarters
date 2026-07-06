// ─── FIXED BASE ───────────────────────────────────────────────────────────────
// The one true base geometry (FIXED-BASE-PLAN.md). No placement, no customization:
// every facility, defense emplacement, wall tile, and the team bus has a permanent
// home shared by every player. The player's expression is LEVELS, not layout.
//
// TWO VIEWS: the home board renders only facilities + decor (build view); walls,
// emplacements, bus, parking apron, and heroes render only when the base is being
// defended (battle view) — all derived from this module + the save's levels.

import { BuildingType } from './types';
import { DEFENSE_TYPES, buildingTiles, wallCap } from './constants';

// ── Facilities: canonical 2×2 anchors ──────────────────────────────────────────
export const FIXED_ANCHORS: Record<BuildingType, { gridX: number; gridY: number }> = {
  [BuildingType.TRAINING_PITCH]: { gridX: 2, gridY: 2 },
  [BuildingType.YOUTH_ACADEMY]:  { gridX: 6, gridY: 2 },
  [BuildingType.MEDICAL_CENTER]: { gridX: 3, gridY: 5 },
  [BuildingType.STADIUM]:        { gridX: 6, gridY: 6 },
  [BuildingType.TACTICS_ROOM]:   { gridX: 3, gridY: 8 },
};

// ── The Team Bus: permanent blocker at the south gate (defense view only) ──────
export const BUS_TILE = { gridX: 5, gridY: 9 };

// ── Defense emplacements: fixed spot, fixed kind, upgradable level ─────────────
// Turret ranges are short (1.4–3 tiles in world units), so every slot hugs the
// stadium approaches — point-blank sleds in the ring line, jugs/refs one ring out.
export interface DefenseSlotDef {
  id: string;
  kind: string;              // key into DEFENSE_TYPES
  gridX: number;
  gridY: number;
  /** Stadium level required (base slots) … */
  stadiumReq?: number;
  /** … or index into EXTRA_SLOT_COSTS (crown slots). */
  crownIndex?: number;
  covers: string;            // shown in the Front Office
}

export const DEFENSE_SLOTS: DefenseSlotDef[] = [
  { id: 'D1', kind: 'jugs',   gridX: 6, gridY: 4, stadiumReq: 1,  covers: 'North gate' },
  { id: 'D2', kind: 'sled',   gridX: 8, gridY: 6, stadiumReq: 1,  covers: 'East gate (point-blank)' },
  { id: 'D3', kind: 'ref',    gridX: 4, gridY: 4, stadiumReq: 3,  covers: 'Northwest long lane' },
  { id: 'D4', kind: 'tshirt', gridX: 7, gridY: 9, stadiumReq: 6,  covers: 'South gate splash' },
  { id: 'D5', kind: 'jugs',   gridX: 4, gridY: 7, stadiumReq: 9,  covers: 'West lane' },
  { id: 'D6', kind: 'sled',   gridX: 6, gridY: 5, stadiumReq: 12, covers: 'North wall (point-blank)' },
  { id: 'C1', kind: 'ref',    gridX: 9, gridY: 4, crownIndex: 0,  covers: 'East overwatch' },
  { id: 'C2', kind: 'tshirt', gridX: 4, gridY: 3, crownIndex: 1,  covers: 'Northwest splash' },
  { id: 'C3', kind: 'jugs',   gridX: 9, gridY: 8, crownIndex: 2,  covers: 'Southeast corner' },
];

export const slotById = (id: string) => DEFENSE_SLOTS.find(s => s.id === id);
export const kindDef = (kind: string) => DEFENSE_TYPES.find(d => d.kind === kind)!;

/** Is this slot available to a player (before buying/activating it)? */
export const slotUnlocked = (slot: DefenseSlotDef, stadiumLevel: number, bonusDefSlots: number) =>
  slot.crownIndex !== undefined ? bonusDefSlots > slot.crownIndex : stadiumLevel >= (slot.stadiumReq ?? 1);

// ── Emplacement levels ─────────────────────────────────────────────────────────
export const MAX_SLOT_LEVEL = 10;
/** Activating a slot (level 0 → 1) costs the kind's shop price. Upgrading to
 *  level N (≥2) costs 0.6 × shop price × 1.35^(N−2). Level ≤ Stadium level. */
export const slotUpgradeCost = (kind: string, toLevel: number): number => {
  const base = kindDef(kind).cost;
  if (toLevel <= 1) return base;
  return Math.round(0.6 * base * Math.pow(1.35, toLevel - 2));
};
/** Stat multipliers per level: +12% HP, +10% damage per level above 1. */
export const slotHpMult  = (level: number) => 1 + 0.12 * Math.max(0, level - 1);
export const slotDmgMult = (level: number) => 1 + 0.10 * Math.max(0, level - 1);

// ── Walls: automatic ring, count driven by wallCap(stadiumLevel) ───────────────
// Candidate order = inner ring hugging the Stadium, then the outer line (N row,
// E col, S row, W col), then reinforcement arcs. Tiles occupied by facilities,
// emplacements, or the bus are skipped automatically.
const WALL_CANDIDATES: { gridX: number; gridY: number }[] = [
  // inner ring around the 2×2 Stadium (6,6)
  { gridX: 5, gridY: 5 }, { gridX: 6, gridY: 5 }, { gridX: 7, gridY: 5 }, { gridX: 8, gridY: 5 },
  { gridX: 5, gridY: 6 }, { gridX: 8, gridY: 6 },
  { gridX: 5, gridY: 7 }, { gridX: 8, gridY: 7 },
  { gridX: 5, gridY: 8 }, { gridX: 6, gridY: 8 }, { gridX: 7, gridY: 8 }, { gridX: 8, gridY: 8 },
  // outer line — north row
  { gridX: 4, gridY: 4 }, { gridX: 5, gridY: 4 }, { gridX: 6, gridY: 4 }, { gridX: 7, gridY: 4 }, { gridX: 8, gridY: 4 }, { gridX: 9, gridY: 4 },
  // east col
  { gridX: 9, gridY: 5 }, { gridX: 9, gridY: 6 }, { gridX: 9, gridY: 7 }, { gridX: 9, gridY: 8 },
  // south row
  { gridX: 5, gridY: 9 }, { gridX: 6, gridY: 9 }, { gridX: 7, gridY: 9 }, { gridX: 8, gridY: 9 }, { gridX: 9, gridY: 9 },
  // west col
  { gridX: 4, gridY: 5 }, { gridX: 4, gridY: 6 }, { gridX: 4, gridY: 7 }, { gridX: 4, gridY: 8 },
  // reinforcements (high Stadium levels)
  { gridX: 5, gridY: 3 }, { gridX: 6, gridY: 3 }, { gridX: 7, gridY: 3 }, { gridX: 8, gridY: 3 },
  { gridX: 2, gridY: 4 }, { gridX: 2, gridY: 5 }, { gridX: 2, gridY: 6 }, { gridX: 2, gridY: 7 },
  { gridX: 3, gridY: 4 }, { gridX: 9, gridY: 3 }, { gridX: 1, gridY: 4 }, { gridX: 1, gridY: 5 },
];

const occupied = new Set<string>();
for (const type of Object.keys(FIXED_ANCHORS) as BuildingType[]) {
  const a = FIXED_ANCHORS[type];
  for (const [tx, ty] of buildingTiles(a.gridX, a.gridY)) occupied.add(`${tx},${ty}`);
}
for (const s of DEFENSE_SLOTS) occupied.add(`${s.gridX},${s.gridY}`);
occupied.add(`${BUS_TILE.gridX},${BUS_TILE.gridY}`);

/** The canonical wall order — collision-free against facilities, slots, and bus. */
export const FIXED_WALL_ORDER: { gridX: number; gridY: number }[] =
  WALL_CANDIDATES.filter(w => !occupied.has(`${w.gridX},${w.gridY}`)
    && w.gridX >= 0 && w.gridX <= 9 && w.gridY >= 0 && w.gridY <= 9);

/** Walls a base has at a given Stadium level (count from existing wallCap). */
export const wallsFor = (stadiumLevel: number) =>
  FIXED_WALL_ORDER.slice(0, Math.min(FIXED_WALL_ORDER.length, wallCap(stadiumLevel)));

/** Wall HP scales with the Stadium automatically — no wall UI anywhere. */
export const wallHpFor = (stadiumLevel: number) =>
  Math.round(220 * (1 + 0.08 * Math.max(0, stadiumLevel - 1)));

// Duplicate-tile assert: any collision in the geometry is a build-time authoring
// bug, so fail loudly in dev rather than shipping an overlapping base.
if (import.meta.env?.DEV) {
  const seen = new Set<string>();
  for (const t of [...DEFENSE_SLOTS, BUS_TILE, ...FIXED_WALL_ORDER]) {
    const k = `${t.gridX},${t.gridY}`;
    if (seen.has(k)) throw new Error(`fixedBase: duplicate tile ${k}`);
    seen.add(k);
  }
}
