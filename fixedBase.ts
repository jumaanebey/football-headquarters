// ─── FIXED BASE · FORMATIONS ──────────────────────────────────────────────────
// No free placement — but players CHOOSE one of three FORMATIONS (like calling a
// defensive scheme). Every formation is a fixed, shared geometry following the
// BULLSEYE rule: the Field in the middle → your club in rings moving out → the
// outermost ring is open ground where attackers land (walls NEVER touch the edge).
//
// Slot IDs and turret kinds are IDENTICAL across formations — only positions move —
// so upgrade levels carry over and switching formations is free.

import { BuildingType } from './types';
import { DEFENSE_TYPES, buildingTiles, wallCap } from './constants';

export type FormationKey = 'goalline' | 'cover3' | 'maxprotect';
export const FORMATION_ORDER: FormationKey[] = ['goalline', 'cover3', 'maxprotect'];

// ── Slot identities (shared): id + kind + unlock. Positions live per formation. ──
export interface DefenseSlotDef {
  id: string;
  kind: string;              // key into DEFENSE_TYPES
  gridX: number;
  gridY: number;
  stadiumReq?: number;       // Stadium level required (base slots) …
  crownIndex?: number;       // … or index into EXTRA_SLOT_COSTS (crown slots)
  covers: string;            // shown in the Front Office
}
const SLOT_IDS: { id: string; kind: string; stadiumReq?: number; crownIndex?: number }[] = [
  { id: 'D1', kind: 'jugs',   stadiumReq: 1 },
  { id: 'D2', kind: 'sled',   stadiumReq: 1 },
  { id: 'D3', kind: 'ref',    stadiumReq: 3 },
  { id: 'D4', kind: 'tshirt', stadiumReq: 6 },
  { id: 'D5', kind: 'jugs',   stadiumReq: 9 },
  { id: 'D6', kind: 'sled',   stadiumReq: 12 },
  { id: 'C1', kind: 'ref',    crownIndex: 0 },
  { id: 'C2', kind: 'tshirt', crownIndex: 1 },
  { id: 'C3', kind: 'jugs',   crownIndex: 2 },
];

export type GamePlanCounter = { strongVs: string[]; weakTo: string[] };
export interface FormationDef {
  key: FormationKey;
  name: string;
  motto: string;
  unlockStadium: number;                     // Stadium level that unlocks it
  counter: GamePlanCounter;                  // vs attacker Game Plans (see COUNTER_*)
  anchors: Record<BuildingType, { gridX: number; gridY: number }>;
  slotPos: Record<string, { gridX: number; gridY: number; covers: string }>;
  wallOrder: { gridX: number; gridY: number }[]; // priority order; sliced by wallCap
  busTile: { gridX: number; gridY: number };
}

// Attacker DPS multipliers when their Game Plan meets this formation.
export const COUNTER_WEAK_MULT = 1.10;   // formation is soft vs this plan
export const COUNTER_STRONG_MULT = 0.92; // formation eats this plan

const ring = (lo: number, hi: number, skip: Set<string>) => {
  const out: { gridX: number; gridY: number }[] = [];
  const push = (x: number, y: number) => { if (!skip.has(`${x},${y}`)) out.push({ gridX: x, gridY: y }); };
  for (let x = lo; x <= hi; x++) push(x, lo);
  for (let y = lo + 1; y <= hi; y++) push(hi, y);
  for (let x = hi - 1; x >= lo; x--) push(x, hi);
  for (let y = hi - 1; y >= lo + 1; y--) push(lo, y);
  return out;
};
const K = (...tiles: [number, number][]) => new Set(tiles.map(([x, y]) => `${x},${y}`));

export const FORMATIONS: Record<FormationKey, FormationDef> = {
  // ── FORMATION 1: everything packed around the Field, one wall, a huge kill-zone.
  goalline: {
    key: 'goalline', name: 'Goal Line', motto: 'Tight core, one wall, nothing easy.',
    unlockStadium: 1,
    counter: { strongVs: ['ground'], weakTo: ['air'] },
    anchors: {
      [BuildingType.STADIUM]:        { gridX: 4, gridY: 4 },
      [BuildingType.TACTICS_ROOM]:   { gridX: 2, gridY: 2 }, // War Room NW
      [BuildingType.YOUTH_ACADEMY]:  { gridX: 6, gridY: 2 }, // Scouting NE
      [BuildingType.MEDICAL_CENTER]: { gridX: 2, gridY: 6 }, // Rehab SW
      [BuildingType.TRAINING_PITCH]: { gridX: 6, gridY: 6 }, // Training SE
    },
    slotPos: {
      D1: { gridX: 4, gridY: 2, covers: 'North pocket' },
      D2: { gridX: 6, gridY: 4, covers: 'East pocket (point-blank)' },
      D3: { gridX: 2, gridY: 4, covers: 'West pocket (long range)' },
      D4: { gridX: 4, gridY: 6, covers: 'South pocket splash' },
      D5: { gridX: 2, gridY: 5, covers: 'West pocket second' },
      D6: { gridX: 5, gridY: 3, covers: 'North pocket second' },
      C1: { gridX: 7, gridY: 4, covers: 'East pocket second' },
      C2: { gridX: 5, gridY: 7, covers: 'South pocket second' },
      C3: { gridX: 5, gridY: 8, covers: 'South gate overwatch' },
    },
    // One wall ring at 1..8 with 2-tile gates mid-side; high levels narrow them.
    wallOrder: [
      ...ring(1, 8, K([4, 1], [5, 1], [4, 8], [5, 8], [1, 4], [1, 5], [8, 4], [8, 5])),
      { gridX: 4, gridY: 1 }, { gridX: 1, gridY: 4 }, { gridX: 8, gridY: 4 }, // narrow N/W/E gates
    ],
    busTile: { gridX: 4, gridY: 8 }, // parks half the south gate
  },

  // ── FORMATION 2: field → turret ring → facility ring (facilities ARE the wall
  //    line, corners left open as gates). The purest bullseye.
  cover3: {
    key: 'cover3', name: 'Cover 3', motto: 'Rings on rings — every layer has one job.',
    unlockStadium: 3,
    counter: { strongVs: ['air'], weakTo: ['ground'] },
    // Facilities embed in the wall ring at DISTINCT grid diagonals (gx−gy all
    // different) — straight N/E/S/W axes share a screen column in iso and the
    // buildings stack on top of each other, scrambling the name tags.
    anchors: {
      [BuildingType.STADIUM]:        { gridX: 4, gridY: 4 },
      [BuildingType.TACTICS_ROOM]:   { gridX: 2, gridY: 1 }, // War Room — north wall, west end
      [BuildingType.YOUTH_ACADEMY]:  { gridX: 6, gridY: 1 }, // Scouting — north wall, east end
      [BuildingType.MEDICAL_CENTER]: { gridX: 1, gridY: 6 }, // Rehab — west wall, south end
      [BuildingType.TRAINING_PITCH]: { gridX: 6, gridY: 7 }, // Training — south wall, east end
    },
    slotPos: {
      D1: { gridX: 4, gridY: 3, covers: 'Field ring N' },
      D2: { gridX: 6, gridY: 4, covers: 'Field ring E (point-blank)' },
      D3: { gridX: 3, gridY: 4, covers: 'Field ring W (long range)' },
      D4: { gridX: 4, gridY: 6, covers: 'Field ring S splash' },
      D5: { gridX: 3, gridY: 5, covers: 'Field ring SW' },
      D6: { gridX: 5, gridY: 3, covers: 'Field ring NE' },
      C1: { gridX: 6, gridY: 5, covers: 'Field ring SE' },
      C2: { gridX: 5, gridY: 6, covers: 'Field ring S second' },
      C3: { gridX: 6, gridY: 6, covers: 'SE diagonal overwatch' },
    },
    // Wall ring at 1..8 WITHOUT corners (the four corner gaps are the gates);
    // the facility blocks punch their own sections out (occupied-filtered).
    wallOrder: ring(1, 8, K([1, 1], [8, 1], [1, 8], [8, 8])),
    busTile: { gridX: 8, gridY: 8 }, // parks the SE corner gate
  },

  // ── FORMATION 3: Cover 3's shell + an inner KEEP around the Field. Double wall.
  maxprotect: {
    key: 'maxprotect', name: 'Max Protect', motto: 'Breach the wall. Fight the courtyard. Crack the keep.',
    unlockStadium: 5,
    counter: { strongVs: ['ground', 'air'], weakTo: ['balanced'] },
    // Same distinct-diagonal shell as Cover 3 (see note there) + the inner keep.
    anchors: {
      [BuildingType.STADIUM]:        { gridX: 4, gridY: 4 },
      [BuildingType.TACTICS_ROOM]:   { gridX: 2, gridY: 1 },
      [BuildingType.YOUTH_ACADEMY]:  { gridX: 6, gridY: 1 },
      [BuildingType.MEDICAL_CENTER]: { gridX: 1, gridY: 6 },
      [BuildingType.TRAINING_PITCH]: { gridX: 6, gridY: 7 },
    },
    slotPos: {
      D1: { gridX: 4, gridY: 2, covers: 'North courtyard' },
      D2: { gridX: 7, gridY: 3, covers: 'NE courtyard (point-blank)' },
      D3: { gridX: 2, gridY: 4, covers: 'W courtyard (long range)' },
      D4: { gridX: 5, gridY: 7, covers: 'S courtyard splash' },
      D5: { gridX: 7, gridY: 5, covers: 'E courtyard' },
      D6: { gridX: 5, gridY: 3, covers: 'Keep north gate' },
      C1: { gridX: 2, gridY: 5, covers: 'SW courtyard' },
      C2: { gridX: 7, gridY: 4, covers: 'E corner overwatch' },
      C3: { gridX: 4, gridY: 6, covers: 'Keep south gate' },
    },
    wallOrder: [
      // inner KEEP first (walls hug the Field; one gap per side — D6/C3 turrets guard two of them)
      { gridX: 3, gridY: 3 }, { gridX: 4, gridY: 3 }, { gridX: 6, gridY: 3 },
      { gridX: 6, gridY: 4 }, { gridX: 6, gridY: 6 }, { gridX: 5, gridY: 6 },
      { gridX: 3, gridY: 6 }, { gridX: 3, gridY: 5 },
      // then the outer shell (same as Cover 3 — corners open)
      ...ring(1, 8, K([1, 1], [8, 1], [1, 8], [8, 8])),
    ],
    busTile: { gridX: 8, gridY: 8 },
  },
};

export const formationDef = (f: FormationKey): FormationDef => FORMATIONS[f] ?? FORMATIONS.goalline;
export const formationUnlocked = (f: FormationKey, stadiumLevel: number) =>
  stadiumLevel >= formationDef(f).unlockStadium;

// ── Formation-aware geometry API ───────────────────────────────────────────────
export const anchorsFor = (f: FormationKey) => formationDef(f).anchors;
export const busTileFor = (f: FormationKey) => formationDef(f).busTile;

/** The 9 slots with this formation's positions merged in. */
export const slotsFor = (f: FormationKey): DefenseSlotDef[] => {
  const def = formationDef(f);
  return SLOT_IDS.map(s => ({ ...s, ...def.slotPos[s.id] }));
};
export const slotById = (f: FormationKey, id: string) => slotsFor(f).find(s => s.id === id);
export const kindDef = (kind: string) => DEFENSE_TYPES.find(d => d.kind === kind)!;

/** Is this slot available to a player (before buying/activating it)? */
export const slotUnlocked = (slot: { stadiumReq?: number; crownIndex?: number }, stadiumLevel: number, bonusDefSlots: number) =>
  slot.crownIndex !== undefined ? bonusDefSlots > slot.crownIndex : stadiumLevel >= (slot.stadiumReq ?? 1);

// ── Emplacement levels (identical across formations — levels carry over) ───────
export const MAX_SLOT_LEVEL = 10;
export const slotUpgradeCost = (kind: string, toLevel: number): number => {
  const base = kindDef(kind).cost;
  if (toLevel <= 1) return base;
  return Math.round(0.6 * base * Math.pow(1.35, toLevel - 2));
};
export const slotHpMult  = (level: number) => 1 + 0.12 * Math.max(0, level - 1);
export const slotDmgMult = (level: number) => 1 + 0.10 * Math.max(0, level - 1);

// ── Walls: automatic, formation-shaped, count driven by wallCap(stadiumLevel) ──
const wallOrderFor = (f: FormationKey): { gridX: number; gridY: number }[] => {
  const def = formationDef(f);
  const occupied = new Set<string>();
  for (const type of Object.keys(def.anchors) as BuildingType[]) {
    const a = def.anchors[type];
    for (const [tx, ty] of buildingTiles(a.gridX, a.gridY)) occupied.add(`${tx},${ty}`);
  }
  for (const s of slotsFor(f)) occupied.add(`${s.gridX},${s.gridY}`);
  occupied.add(`${def.busTile.gridX},${def.busTile.gridY}`);
  const seen = new Set<string>();
  return def.wallOrder.filter(w => {
    const k = `${w.gridX},${w.gridY}`;
    if (occupied.has(k) || seen.has(k)) return false;
    if (w.gridX < 0 || w.gridX > 9 || w.gridY < 0 || w.gridY > 9) return false;
    seen.add(k);
    return true;
  });
};

export const wallsFor = (f: FormationKey, stadiumLevel: number) => {
  const order = wallOrderFor(f);
  return order.slice(0, Math.min(order.length, wallCap(stadiumLevel)));
};

/** Wall HP scales with the Stadium automatically — no wall UI anywhere. */
export const wallHpFor = (stadiumLevel: number) =>
  Math.round(220 * (1 + 0.08 * Math.max(0, stadiumLevel - 1)));

// Geometry audit — overlaps between slots/bus/walls/facilities are authoring bugs.
// Exported so the vitest suite runs the EXACT same checks as the dev-mode guard.
export const auditFormation = (f: FormationKey): string[] => {
  const errors: string[] = [];
  const def = formationDef(f);
  const seen = new Set<string>();
  const claim = (x: number, y: number, what: string) => {
    const k = `${x},${y}`;
    if (seen.has(k)) errors.push(`overlap at ${k} (${what})`);
    if (x < 0 || x > 9 || y < 0 || y > 9) errors.push(`${what} off-board at ${k}`);
    seen.add(k);
  };
  for (const type of Object.keys(def.anchors) as BuildingType[]) {
    const a = def.anchors[type];
    for (const [tx, ty] of buildingTiles(a.gridX, a.gridY)) claim(tx, ty, type);
  }
  for (const s of slotsFor(f)) claim(s.gridX, s.gridY, s.id);
  claim(def.busTile.gridX, def.busTile.gridY, 'bus');
  for (const w of wallOrderFor(f)) claim(w.gridX, w.gridY, 'wall');
  // THE ISO RULE (this bug shipped 3× before it got a check): two 2×2 blocks on the
  // same screen diagonal (equal gx−gy) with nearly-equal depth (gx+gy) render fully
  // stacked in iso — one hides the other. A depth gap of ≥4 (2 tiles) is deliberate
  // fort layering (Goal Line's diamond) and reads fine; below that is a bug.
  const blocks = (Object.keys(def.anchors) as BuildingType[]).map(t => {
    const a = def.anchors[t];
    return { t, diag: a.gridX - a.gridY, depth: a.gridX + a.gridY };
  });
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    if (blocks[i].diag === blocks[j].diag && Math.abs(blocks[i].depth - blocks[j].depth) < 4) {
      errors.push(`iso-stack: ${blocks[i].t} and ${blocks[j].t} share screen diagonal ${blocks[i].diag} too closely`);
    }
  }
  return errors;
};

// Fail loudly in dev for EVERY formation, not just the selected one.
if (import.meta.env?.DEV) {
  for (const f of FORMATION_ORDER) {
    const errs = auditFormation(f);
    if (errs.length) throw new Error(`fixedBase[${f}]: ${errs.join('; ')}`);
  }
}
