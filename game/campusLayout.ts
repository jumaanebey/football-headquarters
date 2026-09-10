import { BuildingType, type BuildingInstance, type GameState } from '../types';
import { buildingTiles } from '../constants';
import { FORMATION_ORDER, anchorsFor, busTileFor, gatePostsFor, slotsFor, wallsFor, type FormationKey } from '../fixedBase';
import { canonicalJson } from './combat/canonical';

export interface CampusLayout {
  version: 1;
  formation: FormationKey;
  facilities: { id: string; type: BuildingType; gridX: number; gridY: number }[];
  slots: { id: string; kind: string; gridX: number; gridY: number }[];
  walls: { gridX: number; gridY: number }[];
  bus: { gridX: number; gridY: number };
  gates: { id: string; label: string; gridX: number; gridY: number }[];
}

export interface CampusLayoutIssue {
  code: 'shape' | 'identity' | 'bounds' | 'overlap' | 'gate-access' | 'reachability';
  message: string;
}

type GridPoint = { gridX: number; gridY: number };
type OwnedFacility = Pick<BuildingInstance, 'id' | 'type'>;

const keyOf = ({ gridX, gridY }: GridPoint) => `${gridX},${gridY}`;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const point = (v: unknown): v is GridPoint & Record<string, unknown> => record(v) && Number.isInteger(v.gridX) && Number.isInteger(v.gridY);
const ident = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
const compareId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const inside = (p: GridPoint) => p.gridX >= 0 && p.gridX <= 9 && p.gridY >= 0 && p.gridY <= 9;
const neighbors = (p: GridPoint): GridPoint[] =>
  [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([x, y]) => ({ gridX: p.gridX + x, gridY: p.gridY + y })).filter(inside);

export function templateCampusLayout(formation: FormationKey, buildings: OwnedFacility[]): CampusLayout {
  return {
    version: 1,
    formation,
    facilities: buildings.map(b => ({ id: b.id, type: b.type, ...anchorsFor(formation)[b.type] })),
    slots: slotsFor(formation).map(s => ({ id: s.id, kind: s.kind, gridX: s.gridX, gridY: s.gridY })),
    // All authored walls are reserved. Current wall capacity is applied when taking a defense snapshot.
    walls: wallsFor(formation, 100).map(p => ({ ...p })),
    bus: { ...busTileFor(formation) },
    gates: gatePostsFor(formation).map(p => ({ ...p })),
  };
}

export function validateCampusLayout(input: unknown, buildings?: OwnedFacility[]): { valid: boolean; issues: CampusLayoutIssue[] } {
  const issues: CampusLayoutIssue[] = [];
  const fail = (code: CampusLayoutIssue['code'], message: string) => issues.push({ code, message });
  if (!record(input) || input.version !== 1 || !FORMATION_ORDER.includes(input.formation as FormationKey)
    || !Array.isArray(input.facilities) || input.facilities.length !== Object.values(BuildingType).length
    || !Array.isArray(input.slots) || input.slots.length !== slotsFor('goalline').length
    || !Array.isArray(input.walls) || input.walls.length > 44
    || !Array.isArray(input.gates) || input.gates.length !== 2
    || !point(input.bus)
    || !input.facilities.every(p => point(p) && record(p) && ident(p.id) && Object.values(BuildingType).includes(p.type as BuildingType))
    || !input.slots.every(p => point(p) && record(p) && ident(p.id) && ident(p.kind))
    || !input.walls.every(point)
    || !input.gates.every(p => point(p) && record(p) && ident(p.id) && typeof p.label === 'string' && p.label.length <= 60)) {
    return { valid: false, issues: [{ code: 'shape', message: 'This layout is incomplete or uses an unsupported format.' }] };
  }
  const layout = input as unknown as CampusLayout;
  const expectedSlots = slotsFor(layout.formation);
  if (new Set(layout.facilities.map(p => p.type)).size !== Object.values(BuildingType).length
    || new Set(layout.facilities.map(p => p.id)).size !== layout.facilities.length
    || new Set([...layout.facilities, ...layout.slots].map(p => p.id)).size !== layout.facilities.length + layout.slots.length
    || layout.facilities.some(p => p.id === 'team-bus' || p.id.startsWith('wall-'))
    || (buildings && (buildings.length !== layout.facilities.length || buildings.some(b => !layout.facilities.some(p => p.id === b.id && p.type === b.type)))))
    fail('identity', 'Keep every owned facility in the formation exactly once.');
  if (new Set(layout.slots.map(p => p.id)).size !== expectedSlots.length || expectedSlots.some(s => !layout.slots.some(p => p.id === s.id && p.kind === s.kind)))
    fail('identity', 'Keep each equipment slot and its equipment type exactly once.');
  if (layout.gates.map(p => p.id).sort().join(',') !== gatePostsFor(layout.formation).map(p => p.id).sort().join(','))
    fail('identity', 'Both hero gate posts must stay in the formation.');
  if (layout.walls.length !== wallsFor(layout.formation, 100).length)
    fail('identity', 'Keep the same number of walls when editing this formation.');
  const occupied = new Map<string, string>();
  const solid = new Set<string>();
  const claim = (p: GridPoint, label: string, permanent = true) => {
    const key = keyOf(p);
    if (p.gridX < 1 || p.gridX > 8 || p.gridY < 1 || p.gridY > 8) fail('bounds', `${label} must stay inside the open outer boundary.`);
    if (occupied.has(key)) fail('overlap', `${label} overlaps ${occupied.get(key)} at column ${p.gridX + 1}, row ${p.gridY + 1}.`);
    occupied.set(key, label);
    if (permanent) solid.add(key);
  };
  for (const facility of layout.facilities) for (const [gridX, gridY] of buildingTiles(facility.gridX, facility.gridY)) claim({ gridX, gridY }, facility.type.replace(/_/g, ' '));
  for (const slot of layout.slots) claim(slot, slot.id);
  layout.walls.forEach((p, i) => claim(p, `Wall ${i + 1}`, false));
  claim(layout.bus, 'Team bus', false);
  const gatePositions = new Set<string>();
  for (const gate of layout.gates) {
    if (!inside(gate) || gate.gridX === 0 || gate.gridX === 9 || gate.gridY === 0 || gate.gridY === 9) fail('bounds', `${gate.label} must stay inside the open outer boundary.`);
    if (occupied.has(keyOf(gate)) || gatePositions.has(keyOf(gate))) fail('overlap', `${gate.label} needs its own open tile.`);
    gatePositions.add(keyOf(gate));
  }
  const flood = (blocked: Set<string>) => {
    const found = new Set<string>();
    const queue: GridPoint[] = [];
    for (let i = 0; i < 10; i++) for (const p of [{ gridX: i, gridY: 0 }, { gridX: i, gridY: 9 }, { gridX: 0, gridY: i }, { gridX: 9, gridY: i }]) {
      if (!blocked.has(keyOf(p)) && !found.has(keyOf(p))) { found.add(keyOf(p)); queue.push(p); }
    }
    for (let i = 0; i < queue.length; i++) for (const p of neighbors(queue[i])) if (!blocked.has(keyOf(p)) && !found.has(keyOf(p))) { found.add(keyOf(p)); queue.push(p); }
    return found;
  };
  const open = flood(new Set(occupied.keys()));
  for (const gate of layout.gates) if (!open.has(keyOf(gate))) fail('gate-access', `${gate.label} needs an open route to the outside of the campus.`);
  const breachable = flood(solid);
  for (const facility of layout.facilities) {
    const cells = buildingTiles(facility.gridX, facility.gridY).map(([gridX, gridY]) => ({ gridX, gridY }));
    if (!cells.some(p => neighbors(p).some(n => breachable.has(keyOf(n))))) fail('reachability', `${facility.type.replace(/_/g, ' ')} needs an approach tile after walls are breached.`);
  }
  return { valid: issues.length === 0, issues };
}

export function canonicalCampusLayout(layout: CampusLayout): CampusLayout {
  return {
    version: 1,
    formation: layout.formation,
    facilities: layout.facilities.map(p => ({ id: p.id, type: p.type, gridX: p.gridX, gridY: p.gridY })).sort(compareId),
    slots: layout.slots.map(p => ({ id: p.id, kind: p.kind, gridX: p.gridX, gridY: p.gridY })).sort(compareId),
    walls: layout.walls.map(p => ({ gridX: p.gridX, gridY: p.gridY })),
    bus: { gridX: layout.bus.gridX, gridY: layout.bus.gridY },
    gates: layout.gates.map(p => ({ id: p.id, label: p.label, gridX: p.gridX, gridY: p.gridY })).sort(compareId),
  };
}

export function parseCampusLayout(input: unknown, buildings?: OwnedFacility[]): CampusLayout | null {
  return validateCampusLayout(input, buildings).valid ? canonicalCampusLayout(input as CampusLayout) : null;
}

export function campusLayoutId(layout: CampusLayout): string {
  const content = canonicalJson(canonicalCampusLayout(layout));
  let hash = 14695981039346656037n;
  for (let i = 0; i < content.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(content.charCodeAt(i))) * 1099511628211n);
  return `campus-v1-${hash.toString(16).padStart(16, '0')}`;
}

export function campusLayoutForState(state: GameState): CampusLayout {
  const saved = parseCampusLayout(state.campusLayout, state.buildings);
  return saved?.formation === state.formation ? saved : canonicalCampusLayout(templateCampusLayout(state.formation, state.buildings));
}

export function applyCampusLayout(state: GameState, input: unknown): GameState {
  const layout = parseCampusLayout(input, state.buildings);
  if (!layout) throw new Error('The formation is not ready to use. Fix its placement issues first.');
  return { ...state, formation: layout.formation, campusLayout: layout, buildings: state.buildings.map(b => ({ ...b, ...layout.facilities.find(p => p.id === b.id) })) };
}
