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
// Unlock order thickens the defense RING BY RING (perimeter → mid → perimeter →
// flex → mid): every Stadium upgrade reads as "my defense grew another layer".
const SLOT_IDS: { id: string; kind: string; stadiumReq?: number; crownIndex?: number }[] = [
  { id: 'D1', kind: 'jugs',   stadiumReq: 1 }, // flex — first gun up
  { id: 'D3', kind: 'ref',    stadiumReq: 2 }, // first PERIMETER piece
  { id: 'D2', kind: 'sled',   stadiumReq: 3 }, // first MID piece
  { id: 'D4', kind: 'tshirt', stadiumReq: 4 }, // second perimeter
  { id: 'D5', kind: 'jugs',   stadiumReq: 6 }, // flex second
  { id: 'D7', kind: 'cooler', stadiumReq: 5 }, // area denial — the Gatorade Station
  { id: 'D6', kind: 'sled',   stadiumReq: 8 }, // second mid
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
    // Radius-3 quincunx (was radius-2, which bunched the campus in the top third
    // and left the south half empty). Corners embed in the wall ring — the
    // facilities ARE the fort's corner towers. Board is 0..9; 2×2 max anchor is 8.
    anchors: {
      [BuildingType.STADIUM]:        { gridX: 4, gridY: 4 },
      // CORNER squares, pulled in one tile from the extremes: at (0,0)-style anchors
      // the ART (wider than its 2×2 footprint) overhung the campus edge onto the
      // rough (external audit, July 2026). (1,1)/(7,7) share the stadium's screen
      // column but sit 3+ tiles of depth away — inside the allowed layering gap.
      [BuildingType.TACTICS_ROOM]:   { gridX: 1, gridY: 1 }, // War Room — top corner
      [BuildingType.YOUTH_ACADEMY]:  { gridX: 7, gridY: 1 }, // Scouting — right corner
      [BuildingType.MEDICAL_CENTER]: { gridX: 1, gridY: 7 }, // Rehab — left corner
      [BuildingType.TRAINING_PITCH]: { gridX: 7, gridY: 7 }, // Training — bottom corner
    },
    slotPos: {
      D1: { gridX: 4, gridY: 2, covers: 'North pocket' },
      D2: { gridX: 7, gridY: 4, covers: 'East flank (point-blank)' },
      D3: { gridX: 2, gridY: 4, covers: 'West pocket (long range)' },
      D4: { gridX: 4, gridY: 7, covers: 'South approach splash' },
      D5: { gridX: 2, gridY: 5, covers: 'West pocket second' },
      D7: { gridX: 6, gridY: 2, covers: 'NE approach — soak the lane' },
      D6: { gridX: 5, gridY: 2, covers: 'North gate second' },
      C1: { gridX: 7, gridY: 5, covers: 'East flank second' },
      C2: { gridX: 6, gridY: 7, covers: 'South flank splash' },
      C3: { gridX: 3, gridY: 2, covers: 'NW overwatch' },
    },
    // One wall ring at 1..8 with 2-tile gates mid-side; high levels narrow them.
    // TIGHT wall hugging the Stadium only (ring 3..6) — facilities stand OUTSIDE as
    // sacrificial buildings; open ground surrounds the wall (never touches the edge).
    wallOrder: [
      ...ring(3, 6, K([4, 3], [5, 6])), // north + south 1-tile gates
      { gridX: 4, gridY: 3 }, // high levels seal the north gate
    ],
    busTile: { gridX: 5, gridY: 7 }, // parked on the south-gate approach
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
      // True corner squares (see goalline note) — the wall ring 2..7 stands between
      // the stadium and the sacrificial corner facilities.
      [BuildingType.TACTICS_ROOM]:   { gridX: 1, gridY: 1 }, // War Room — top corner
      [BuildingType.YOUTH_ACADEMY]:  { gridX: 7, gridY: 1 }, // Scouting — right corner
      [BuildingType.MEDICAL_CENTER]: { gridX: 1, gridY: 7 }, // Rehab — left corner
      [BuildingType.TRAINING_PITCH]: { gridX: 7, gridY: 7 }, // Training — bottom corner
    },
    slotPos: {
      D1: { gridX: 4, gridY: 3, covers: 'Field ring N' },
      D2: { gridX: 6, gridY: 4, covers: 'Field ring E (point-blank)' },
      D3: { gridX: 1, gridY: 4, covers: 'West perimeter (long range)' },
      D4: { gridX: 4, gridY: 8, covers: 'South perimeter splash' },
      D5: { gridX: 3, gridY: 5, covers: 'Field ring SW' },
      D7: { gridX: 3, gridY: 6, covers: 'SW lane — soak the approach' },
      D6: { gridX: 5, gridY: 3, covers: 'Field ring NE' },
      C1: { gridX: 8, gridY: 4, covers: 'East perimeter (long range)' },
      C2: { gridX: 5, gridY: 1, covers: 'North perimeter splash' },
      C3: { gridX: 6, gridY: 6, covers: 'SE diagonal overwatch' },
    },
    // Wall ring at 1..8 WITHOUT corners (the four corner gaps are the gates);
    // the facility blocks punch their own sections out (occupied-filtered).
    wallOrder: ring(2, 7, K([4, 2], [7, 5])), // ring 2..7 — open apron all around; N + E gates
    busTile: { gridX: 8, gridY: 5 }, // parked across the EAST gate approach
  },

  // ── FORMATION 3: Cover 3's shell + an inner KEEP around the Field. Double wall.
  maxprotect: {
    key: 'maxprotect', name: 'Max Protect', motto: 'Breach the wall. Fight the courtyard. Crack the keep.',
    unlockStadium: 5,
    counter: { strongVs: ['ground', 'air'], weakTo: ['balanced'] },
    // Same distinct-diagonal shell as Cover 3 (see note there) + the inner keep.
    anchors: {
      [BuildingType.STADIUM]:        { gridX: 4, gridY: 4 },
      // Corner squares (matches Cover 3)
      [BuildingType.TACTICS_ROOM]:   { gridX: 1, gridY: 1 },
      [BuildingType.YOUTH_ACADEMY]:  { gridX: 7, gridY: 1 },
      [BuildingType.MEDICAL_CENTER]: { gridX: 1, gridY: 7 },
      [BuildingType.TRAINING_PITCH]: { gridX: 7, gridY: 7 },
    },
    slotPos: {
      D1: { gridX: 4, gridY: 2, covers: 'North courtyard' },
      D2: { gridX: 7, gridY: 3, covers: 'NE courtyard (point-blank)' },
      D3: { gridX: 2, gridY: 4, covers: 'W courtyard (long range)' },
      D4: { gridX: 5, gridY: 7, covers: 'S courtyard splash' },
      D5: { gridX: 7, gridY: 5, covers: 'E courtyard' },
      D7: { gridX: 3, gridY: 4, covers: 'Keep west gate — soak the breach' },
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
      // then the outer shell (ring 2..7 — perimeter never touches the map edge)
      ...ring(2, 7, K([4, 2], [7, 5])),
    ],
    busTile: { gridX: 8, gridY: 5 }, // parked across the EAST gate approach
  },
};

// ── Hero gate posts: the two stations your heroes hold on defense ─────────────
export interface GatePost { id: string; label: string; gridX: number; gridY: number; }
const GATE_POSTS: Record<FormationKey, GatePost[]> = {
  goalline:   [{ id: 'north', label: 'North Gate', gridX: 4, gridY: 1 }, { id: 'south', label: 'South Gate', gridX: 5, gridY: 8 }],
  // Posts must sit on OPEN tiles — (7,7) was inside Training's footprint, and
  // maxprotect's old posts sat on the D1 turret tile / a live wall tile, so gate
  // heroes spawned inside buildings. Now audited (auditFormation checks posts).
  cover3:     [{ id: 'north', label: 'North Wall', gridX: 4, gridY: 2 }, { id: 'south', label: 'SE Corner Gate', gridX: 6, gridY: 8 }],
  maxprotect: [{ id: 'north', label: 'Courtyard North', gridX: 4, gridY: 1 }, { id: 'south', label: 'South Approach', gridX: 5, gridY: 8 }],
};
export const gatePostsFor = (f: FormationKey): GatePost[] => GATE_POSTS[f] ?? GATE_POSTS.goalline;

// ── FORMATION MASTERY: holding your stadium while running a scheme builds tiers ──
// ★ at 3 holds, ★★ at 8, ★★★ at 15. Each tier: your ENTIRE defense fights +3%
// tougher while running that formation. Loyalty to a scheme is power.
export const MASTERY_THRESHOLDS = [3, 8, 15];
export const masteryLevel = (holds: number): number =>
  MASTERY_THRESHOLDS.filter(t => holds >= t).length;
export const masteryDefMult = (holds: number): number => 1 + 0.03 * masteryLevel(holds);
export const nextMasteryAt = (holds: number): number | null =>
  MASTERY_THRESHOLDS.find(t => holds < t) ?? null;

export const formationDef = (f: FormationKey): FormationDef => FORMATIONS[f] ?? FORMATIONS.goalline;
/** Formations are a CHOICE, not a progression unlock — all three schemes are callable
 *  from Stadium L1 (July 2026 review decision). Progression lives in the 9-slot
 *  emplacement ladder + mastery. unlockStadium stays on the defs as flavor/history. */
export const formationUnlocked = (_f: FormationKey, _stadiumLevel: number) => true;

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
  // RING LEGALITY (the rule that kills 'turret dropped in the middle of nowhere'):
  // distance from the stadium's center decides the ring. Point-blank sleds must sit
  // MID (close enough that raiders come to them); long-range refs and splash cannons
  // must sit PERIMETER (facing the approach). JUGS is the swing piece — legal anywhere.
  const stadium = def.anchors[BuildingType.STADIUM];
  const scx = stadium.gridX + 0.5, scy = stadium.gridY + 0.5;
  for (const sl of slotsFor(f)) {
    const d = Math.max(Math.abs(sl.gridX - scx), Math.abs(sl.gridY - scy));
    if (sl.kind === 'sled' && d > 2.5) errors.push(`${sl.id} (sled) too far out (d=${d}) — point-blank belongs MID`);
    if ((sl.kind === 'ref' || sl.kind === 'tshirt') && d < 2.5) errors.push(`${sl.id} (${sl.kind}) too close in (d=${d}) — belongs PERIMETER`);
  }
  // Hero gate posts stand on OPEN ground — `seen` already holds every claimed tile
  // (footprints, slots, walls, bus), so any post on a claimed tile is a bug.
  for (const post of gatePostsFor(f)) {
    const pk = `${post.gridX},${post.gridY}`;
    if (seen.has(pk)) errors.push(`gate post ${post.id} at ${pk} sits on an occupied tile`);
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
