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
// THE FORT: stadium dead center, the four departments packed CORNER-ADJACENT
// (diagonal cross). In grid space a straight N/S/E/W cross looks tight, but the
// ISO camera renders grid-diagonal neighbors on the SAME screen column — buildings
// stacked and hiding each other. Diagonal adjacency renders as a clean diamond:
// one building above, below, left, and right of the stadium on screen.
export const FIXED_ANCHORS: Record<BuildingType, { gridX: number; gridY: number }> = {
  [BuildingType.STADIUM]:        { gridX: 5, gridY: 5 }, // centerpiece (tiles 5-6 × 5-6)
  [BuildingType.TACTICS_ROOM]:   { gridX: 3, gridY: 3 }, // screen-TOP of the stadium
  [BuildingType.YOUTH_ACADEMY]:  { gridX: 7, gridY: 3 }, // screen-RIGHT
  [BuildingType.MEDICAL_CENTER]: { gridX: 3, gridY: 7 }, // screen-LEFT
  [BuildingType.TRAINING_PITCH]: { gridX: 7, gridY: 7 }, // screen-BOTTOM
};

// ── The Team Bus: parked IN the south gate — raiders climb over it or go around ──
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

// Slots live in the four POCKETS between the corner blocks — every approach to the
// stadium walks past a turret.
export const DEFENSE_SLOTS: DefenseSlotDef[] = [
  { id: 'D1', kind: 'jugs',   gridX: 5, gridY: 4, stadiumReq: 1,  covers: 'North pocket' },
  { id: 'D2', kind: 'sled',   gridX: 7, gridY: 5, stadiumReq: 1,  covers: 'East pocket (point-blank)' },
  { id: 'D3', kind: 'ref',    gridX: 4, gridY: 6, stadiumReq: 3,  covers: 'West pocket (long range)' },
  { id: 'D4', kind: 'tshirt', gridX: 6, gridY: 7, stadiumReq: 6,  covers: 'South pocket splash' },
  { id: 'D5', kind: 'jugs',   gridX: 4, gridY: 5, stadiumReq: 9,  covers: 'West pocket second' },
  { id: 'D6', kind: 'sled',   gridX: 6, gridY: 4, stadiumReq: 12, covers: 'North pocket second' },
  { id: 'C1', kind: 'ref',    gridX: 7, gridY: 6, crownIndex: 0,  covers: 'East pocket second' },
  { id: 'C2', kind: 'tshirt', gridX: 5, gridY: 7, crownIndex: 1,  covers: 'South pocket second' },
  { id: 'C3', kind: 'jugs',   gridX: 6, gridY: 8, crownIndex: 2,  covers: 'South gate overwatch' },
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

  // FULL perimeter ring at the island's edge (0..9) with 2-tile GATES at each
  // side's center (tiles 4,5) — attackers funnel through gates or smash through.
  for (const x of [0, 1, 2, 3, 6, 7, 8, 9]) out.push({ gridX: x, gridY: 0 }); // north wall
  for (const x of [0, 1, 2, 3, 6, 7, 8, 9]) out.push({ gridX: x, gridY: 9 }); // south wall
  for (const y of [1, 2, 3, 6, 7, 8]) out.push({ gridX: 0, gridY: y });       // west wall
  for (const y of [1, 2, 3, 6, 7, 8]) out.push({ gridX: 9, gridY: y });       // east wall

  // High Stadium levels NARROW the gates to 1 tile (never fully closed — attackers
  // always have a funnel to fight through, walls just make going around expensive).
  out.push({ gridX: 4, gridY: 0 }); // north gate → 1-wide
  out.push({ gridX: 0, gridY: 4 }); // west gate → 1-wide
  out.push({ gridX: 9, gridY: 4 }); // east gate → 1-wide
  // (south gate stays 2-wide — the Team Bus parks in it)

  // Dedupe defensively — a duplicate here would trip the dev assert below.
  const seen = new Set<string>();
  return out.filter(t => { const k = `${t.gridX},${t.gridY}`; if (seen.has(k)) return false; seen.add(k); return true; });
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
