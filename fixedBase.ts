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
// The campus reads like a real club: the STADIUM is the centerpiece, dead center,
// walled in. The four departments hold the four corners — Training NW, Scouting NE,
// Rehab SW, War Room SE — so the dirt paths radiate out symmetrically and the build
// view and defense view read as the SAME place at a glance.
export const FIXED_ANCHORS: Record<BuildingType, { gridX: number; gridY: number }> = {
  [BuildingType.STADIUM]:        { gridX: 4, gridY: 4 }, // centerpiece (tiles 4-5 × 4-5)
  [BuildingType.TACTICS_ROOM]:   { gridX: 1, gridY: 1 }, // NW — War Room up top, out of the way
  [BuildingType.YOUTH_ACADEMY]:  { gridX: 7, gridY: 1 }, // NE — Scouting Dept by the road in
  [BuildingType.MEDICAL_CENTER]: { gridX: 1, gridY: 7 }, // SW — Rehab next to the practice side
  [BuildingType.TRAINING_PITCH]: { gridX: 8, gridY: 8 }, // hard SE corner — the practice field
};

// ── The Team Bus: permanent blocker at the south gate (defense view only) ──────
export const BUS_TILE = { gridX: 4, gridY: 7 };

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
  { id: 'D1', kind: 'jugs',   gridX: 4, gridY: 2, stadiumReq: 1,  covers: 'North gate' },
  { id: 'D2', kind: 'sled',   gridX: 6, gridY: 4, stadiumReq: 1,  covers: 'East wall (point-blank)' },
  { id: 'D3', kind: 'ref',    gridX: 2, gridY: 5, stadiumReq: 3,  covers: 'West lane (long range)' },
  { id: 'D4', kind: 'tshirt', gridX: 5, gridY: 7, stadiumReq: 6,  covers: 'South gate splash' },
  { id: 'D5', kind: 'jugs',   gridX: 7, gridY: 5, stadiumReq: 9,  covers: 'East approach' },
  { id: 'D6', kind: 'sled',   gridX: 4, gridY: 3, stadiumReq: 12, covers: 'North wall (point-blank)' },
  { id: 'C1', kind: 'ref',    gridX: 5, gridY: 2, crownIndex: 0,  covers: 'North overwatch' },
  { id: 'C2', kind: 'tshirt', gridX: 2, gridY: 4, crownIndex: 1,  covers: 'West splash' },
  { id: 'C3', kind: 'jugs',   gridX: 7, gridY: 4, crownIndex: 2,  covers: 'East gate' },
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
const WALL_CANDIDATES: { gridX: number; gridY: number }[] = (() => {
  const out: { gridX: number; gridY: number }[] = [];
  const ringAround = (lo: number, hi: number) => {
    for (let x = lo; x <= hi; x++) out.push({ gridX: x, gridY: lo });           // top
    for (let y = lo + 1; y <= hi; y++) out.push({ gridX: hi, gridY: y });       // right
    for (let x = hi - 1; x >= lo; x--) out.push({ gridX: x, gridY: hi });       // bottom
    for (let y = hi - 1; y >= lo + 1; y--) out.push({ gridX: lo, gridY: y });   // left
  };
  ringAround(3, 6); // inner ring hugging the centered Stadium (12 tiles)
  ringAround(2, 7); // outer ring (20 tiles, minus corner/facility collisions)
  // reinforcement arcs (high Stadium levels): mid-edge segments of ring 1..8
  for (let x = 3; x <= 6; x++) out.push({ gridX: x, gridY: 1 });
  for (let x = 3; x <= 6; x++) out.push({ gridX: x, gridY: 8 });
  for (let y = 3; y <= 6; y++) out.push({ gridX: 1, gridY: y });
  for (let y = 3; y <= 6; y++) out.push({ gridX: 8, gridY: y });
  return out;
})();

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
