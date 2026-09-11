// Active Stadium lineup and reserves.
//
// The Stadium fields a short-format team: nine slots drawn from the four unit groups, with the
// rest of the roster as reserves. Two rules follow from that and are the point of this module:
//
//   * Only selected players contribute to Stadium ratings. Signing a reserve — however weak —
//     cannot lower the active team, which is what a whole-roster average did before.
//   * One implementation answers both "what would this change do?" (preview) and "what does the
//     team rate now?" (settlement), so a preview cannot disagree with the result.
//
// The roster array itself is never reordered or filtered here: a lineup is a set of ids pointing
// into it. A club whose roster lacks a rare position stays playable — each slot declares a
// fallback order over the other unit groups, and a player filling a slot outside their unit is
// reported as out of position rather than refused.
import { PlayerRole, UnitGroup, type GameState, type Player } from '../types';
import { combatStat, unitPower } from '../battle';

export const LINEUP_VERSION = 1;

export type LineupSlotId = 'QB' | 'BACK' | 'RECEIVER' | 'LINE1' | 'LINE2' | 'RUSHER' | 'BACKER' | 'COVER' | 'SAFETY';
export type LineupSide = 'offense' | 'defense';

export interface LineupSlotDef {
  id: LineupSlotId;
  label: string;
  side: LineupSide;
  /** The unit this slot is written for. */
  unit: UnitGroup;
  /** The role the slot is named after; used only for ordering candidates, never to refuse one. */
  preferredRole: PlayerRole;
  /** Units accepted when the roster cannot fill the slot from `unit`, best first. */
  fallback: readonly UnitGroup[];
  /** What this slot contributes to, so the UI can explain a swap. */
  contributes: readonly ('attack' | 'defense' | 'speed' | 'power' | 'iq')[];
}

/** Nine starters: three skill, two line, two front seven, two secondary. Chosen so the ten-player
 *  starting roster fields a legal team with one reserve, and so every unit group matters. */
export const LINEUP_SLOTS: readonly LineupSlotDef[] = [
  { id: 'QB', label: 'Quarterback', side: 'offense', unit: UnitGroup.OFFENSE_SKILL, preferredRole: PlayerRole.QB, fallback: [UnitGroup.OFFENSE_LINE, UnitGroup.DEFENSE_SECONDARY, UnitGroup.DEFENSE_LINE], contributes: ['attack', 'iq'] },
  { id: 'BACK', label: 'Running back', side: 'offense', unit: UnitGroup.OFFENSE_SKILL, preferredRole: PlayerRole.RB, fallback: [UnitGroup.OFFENSE_LINE, UnitGroup.DEFENSE_LINE, UnitGroup.DEFENSE_SECONDARY], contributes: ['attack', 'power'] },
  { id: 'RECEIVER', label: 'Receiver', side: 'offense', unit: UnitGroup.OFFENSE_SKILL, preferredRole: PlayerRole.WR, fallback: [UnitGroup.DEFENSE_SECONDARY, UnitGroup.OFFENSE_LINE, UnitGroup.DEFENSE_LINE], contributes: ['attack', 'speed'] },
  { id: 'LINE1', label: 'Left line', side: 'offense', unit: UnitGroup.OFFENSE_LINE, preferredRole: PlayerRole.OL, fallback: [UnitGroup.DEFENSE_LINE, UnitGroup.OFFENSE_SKILL, UnitGroup.DEFENSE_SECONDARY], contributes: ['attack', 'power'] },
  { id: 'LINE2', label: 'Right line', side: 'offense', unit: UnitGroup.OFFENSE_LINE, preferredRole: PlayerRole.OL, fallback: [UnitGroup.DEFENSE_LINE, UnitGroup.OFFENSE_SKILL, UnitGroup.DEFENSE_SECONDARY], contributes: ['attack', 'power'] },
  { id: 'RUSHER', label: 'Edge rusher', side: 'defense', unit: UnitGroup.DEFENSE_LINE, preferredRole: PlayerRole.DL, fallback: [UnitGroup.OFFENSE_LINE, UnitGroup.DEFENSE_SECONDARY, UnitGroup.OFFENSE_SKILL], contributes: ['defense', 'power'] },
  { id: 'BACKER', label: 'Linebacker', side: 'defense', unit: UnitGroup.DEFENSE_LINE, preferredRole: PlayerRole.LB, fallback: [UnitGroup.DEFENSE_SECONDARY, UnitGroup.OFFENSE_LINE, UnitGroup.OFFENSE_SKILL], contributes: ['defense', 'iq'] },
  { id: 'COVER', label: 'Cornerback', side: 'defense', unit: UnitGroup.DEFENSE_SECONDARY, preferredRole: PlayerRole.CB, fallback: [UnitGroup.OFFENSE_SKILL, UnitGroup.DEFENSE_LINE, UnitGroup.OFFENSE_LINE], contributes: ['defense', 'speed'] },
  { id: 'SAFETY', label: 'Safety', side: 'defense', unit: UnitGroup.DEFENSE_SECONDARY, preferredRole: PlayerRole.S, fallback: [UnitGroup.OFFENSE_SKILL, UnitGroup.DEFENSE_LINE, UnitGroup.OFFENSE_LINE], contributes: ['defense', 'iq'] },
];
export const LINEUP_SLOT_IDS: readonly LineupSlotId[] = LINEUP_SLOTS.map(s => s.id);
const SLOT_BY_ID = new Map(LINEUP_SLOTS.map(s => [s.id, s]));
export const lineupSlot = (id: string): LineupSlotDef | undefined => SLOT_BY_ID.get(id as LineupSlotId);

/** Stored on the club: slot id → player id. Absent slots are unfilled. */
export type LineupAssignment = Partial<Record<LineupSlotId, string>>;
export interface LineupState { version: number; slots: LineupAssignment; updatedAt: number }

export type LineupBlockerCode = 'unfilled' | 'unknown-player' | 'duplicate-player' | 'out-of-position' | 'empty-roster';
export interface LineupBlocker { code: LineupBlockerCode; slot?: LineupSlotId; playerId?: string; message: string }

export interface LineupRatings { attack: number; defense: number; speed: number; power: number; iq: number }
export interface LineupSlotView {
  slot: LineupSlotId; label: string; side: LineupSide; unit: UnitGroup; preferredRole: PlayerRole;
  contributes: readonly ('attack' | 'defense' | 'speed' | 'power' | 'iq')[];
  playerId: string | null; player: Player | null;
  /** The player fills the slot from another unit group. Allowed; surfaced so the UI can say so. */
  outOfPosition: boolean;
  /** Every roster player who may be assigned here, best first, with their rating effect. */
  candidates: LineupCandidate[];
}
export interface LineupCandidate { playerId: string; name: string; role: PlayerRole; unit: UnitGroup; power: number; outOfPosition: boolean; selectedElsewhere: LineupSlotId | null }
export interface LineupView {
  slots: LineupSlotView[];
  /** Roster players not in any slot, best first. */
  reserves: LineupCandidate[];
  ratings: LineupRatings;
  valid: boolean;
  blockers: LineupBlocker[];
  /** Slot count that is filled, for a compact "9/9" readout. */
  filled: number;
  total: number;
}
export interface LineupComparison {
  slot: LineupSlotId;
  incoming: { playerId: string; name: string; power: number } | null;
  outgoing: { playerId: string; name: string; power: number } | null;
  before: LineupRatings;
  after: LineupRatings;
  delta: LineupRatings;
  /** The assignment that would result, ready to send as the authority action payload. */
  assignment: LineupAssignment;
  valid: boolean;
  blockers: LineupBlocker[];
}

const STAT_FLOOR = 15;
const rosterIndex = (roster: readonly Player[]) => new Map(roster.map(p => [p.id, p]));
/** Deterministic ordering: strongest first, ties broken by id so two equal players never swap between runs. */
const byStrength = (a: Player, b: Player) => unitPower(b) - unitPower(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const mean = (values: number[], fallback: number) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : fallback);

/** How well a player suits a slot, for ordering candidates and for the deterministic migration. */
export function slotFit(slot: LineupSlotDef, player: Player): number {
  if (player.role === slot.preferredRole) return 3;
  if (player.unit === slot.unit) return 2;
  return slot.fallback.includes(player.unit) ? 1 : 0;
}
export const isEligible = (slot: LineupSlotDef, player: Player): boolean => slotFit(slot, player) > 0;

/**
 * Ratings of the SELECTED team only. Offensive slots drive `attack`, defensive slots `defense`,
 * and speed/power/iq are the selected players' means — so a reserve, however weak, changes
 * nothing, and replacing a starter changes exactly what the preview said it would.
 */
export function lineupRatings(roster: readonly Player[], assignment: LineupAssignment): LineupRatings {
  const index = rosterIndex(roster);
  const chosen = LINEUP_SLOTS.map(slot => ({ slot, player: assignment[slot.id] ? index.get(assignment[slot.id]!) ?? null : null })).filter((e): e is { slot: LineupSlotDef; player: Player } => !!e.player);
  const side = (want: LineupSide) => chosen.filter(e => e.slot.side === want).map(e => unitPower(e.player));
  const stat = (key: 'strength' | 'speed' | 'iq') => mean(chosen.map(e => combatStat(e.player, key)), STAT_FLOOR);
  return {
    attack: Math.round(mean(side('offense'), STAT_FLOOR)),
    defense: Math.round(mean(side('defense'), STAT_FLOOR)),
    speed: stat('speed'), power: stat('strength'), iq: stat('iq'),
  };
}

/** Validate an assignment against a roster. Pure; returns every problem rather than the first. */
export function lineupBlockers(roster: readonly Player[], assignment: LineupAssignment): LineupBlocker[] {
  const index = rosterIndex(roster);
  const blockers: LineupBlocker[] = [];
  if (!roster.length) return [{ code: 'empty-roster', message: 'This club has no players.' }];
  const seen = new Map<string, LineupSlotId>();
  for (const slot of LINEUP_SLOTS) {
    const playerId = assignment[slot.id];
    if (!playerId) { blockers.push({ code: 'unfilled', slot: slot.id, message: `${slot.label} is empty.` }); continue; }
    const player = index.get(playerId);
    if (!player) { blockers.push({ code: 'unknown-player', slot: slot.id, playerId, message: `${slot.label} names a player who is not on this roster.` }); continue; }
    const first = seen.get(playerId);
    if (first) blockers.push({ code: 'duplicate-player', slot: slot.id, playerId, message: `${player.name} is already playing ${SLOT_BY_ID.get(first)!.label}.` });
    else seen.set(playerId, slot.id);
    if (!isEligible(slot, player)) blockers.push({ code: 'out-of-position', slot: slot.id, playerId, message: `${player.name} cannot play ${slot.label}.` });
  }
  return blockers;
}
/** A lineup is playable when nothing but an out-of-position note remains. */
export const lineupValid = (roster: readonly Player[], assignment: LineupAssignment): boolean => lineupBlockers(roster, assignment).length === 0;

/**
 * Deterministic legal selection for a club that has none (an old save) or whose lineup lost
 * players. Fills the slots that are hardest to serve first, taking the best-fitting player and
 * breaking ties by strength then id. `keep` (an existing partial assignment) is preserved where
 * it is still legal, so repairing a lineup never reshuffles the whole team.
 */
export function selectLineup(roster: readonly Player[], keep: LineupAssignment = {}): LineupAssignment {
  const index = rosterIndex(roster);
  const assignment: LineupAssignment = {};
  const used = new Set<string>();
  for (const slot of LINEUP_SLOTS) {
    const id = keep[slot.id];
    const player = id ? index.get(id) : undefined;
    if (player && !used.has(player.id) && isEligible(slot, player)) { assignment[slot.id] = player.id; used.add(player.id); }
  }
  // Scarcest slots first: a slot with few eligible players must choose before a flexible one.
  const remaining = LINEUP_SLOTS.filter(slot => !assignment[slot.id]);
  const supply = (slot: LineupSlotDef) => roster.filter(p => !used.has(p.id) && slotFit(slot, p) >= 2).length;
  const order = [...remaining].sort((a, b) => supply(a) - supply(b) || LINEUP_SLOT_IDS.indexOf(a.id) - LINEUP_SLOT_IDS.indexOf(b.id));
  for (const slot of order) {
    const pick = roster.filter(p => !used.has(p.id) && isEligible(slot, p)).sort((a, b) => slotFit(slot, b) - slotFit(slot, a) || byStrength(a, b))[0];
    if (pick) { assignment[slot.id] = pick.id; used.add(pick.id); }
  }
  return assignment;
}

/** The club's stored lineup, or a deterministic one for a club that has never chosen. */
export const lineupOf = (club: Pick<GameState, 'roster' | 'lineup'>): LineupAssignment =>
  club.lineup?.slots && Object.keys(club.lineup.slots).length ? { ...club.lineup.slots } : selectLineup(club.roster);

/**
 * Repair after the roster changed (a player was cut, or a save arrived with a stale lineup):
 * keep every still-legal choice and fill the rest deterministically. Returns the repaired
 * assignment and which slots changed, so the caller can tell the player what happened.
 */
export function repairLineup(roster: readonly Player[], assignment: LineupAssignment): { slots: LineupAssignment; repaired: LineupSlotId[] } {
  const next = selectLineup(roster, assignment);
  const repaired = LINEUP_SLOT_IDS.filter(id => (assignment[id] ?? null) !== (next[id] ?? null));
  return { slots: next, repaired };
}

/** Full read model for the roster UI. One call gives slots, candidates, reserves, ratings and blockers. */
export function lineupView(club: Pick<GameState, 'roster' | 'lineup'>, assignment: LineupAssignment = lineupOf(club)): LineupView {
  const index = rosterIndex(club.roster);
  const selected = new Map<string, LineupSlotId>();
  for (const slot of LINEUP_SLOTS) { const id = assignment[slot.id]; if (id) selected.set(id, slot.id); }
  const candidateOf = (slot: LineupSlotDef, player: Player): LineupCandidate => ({
    playerId: player.id, name: player.name, role: player.role, unit: player.unit,
    power: unitPower(player), outOfPosition: player.unit !== slot.unit, selectedElsewhere: selected.get(player.id) ?? null,
  });
  const slots = LINEUP_SLOTS.map((slot): LineupSlotView => {
    const playerId = assignment[slot.id] ?? null;
    const player = playerId ? index.get(playerId) ?? null : null;
    return {
      slot: slot.id, label: slot.label, side: slot.side, unit: slot.unit, preferredRole: slot.preferredRole, contributes: slot.contributes,
      playerId: player ? player.id : null, player,
      outOfPosition: !!player && player.unit !== slot.unit,
      candidates: club.roster.filter(p => isEligible(slot, p)).sort((a, b) => slotFit(slot, b) - slotFit(slot, a) || byStrength(a, b)).map(p => candidateOf(slot, p)),
    };
  });
  const reserves = club.roster.filter(p => !selected.has(p.id)).sort(byStrength).map(p => ({ playerId: p.id, name: p.name, role: p.role, unit: p.unit, power: unitPower(p), outOfPosition: false, selectedElsewhere: null }));
  const blockers = lineupBlockers(club.roster, assignment);
  return { slots, reserves, ratings: lineupRatings(club.roster, assignment), valid: blockers.length === 0, blockers, filled: slots.filter(s => s.playerId).length, total: LINEUP_SLOTS.length };
}

/**
 * What a proposed change would do, using the same rating function settlement uses. Passing
 * `playerId: null` empties the slot. If the incoming player already starts elsewhere the two
 * swap, which is what a roster UI drag means.
 */
export function compareLineupChange(club: Pick<GameState, 'roster' | 'lineup'>, slotId: LineupSlotId, playerId: string | null, base: LineupAssignment = lineupOf(club)): LineupComparison {
  const index = rosterIndex(club.roster);
  const before = lineupRatings(club.roster, base);
  const assignment: LineupAssignment = { ...base };
  const outgoingId = base[slotId] ?? null;
  if (playerId === null) delete assignment[slotId];
  else {
    const swapFrom = LINEUP_SLOT_IDS.find(id => id !== slotId && base[id] === playerId);
    assignment[slotId] = playerId;
    if (swapFrom) { if (outgoingId) assignment[swapFrom] = outgoingId; else delete assignment[swapFrom]; }
  }
  const after = lineupRatings(club.roster, assignment);
  const describe = (id: string | null) => { const p = id ? index.get(id) : undefined; return p ? { playerId: p.id, name: p.name, power: unitPower(p) } : null; };
  const blockers = lineupBlockers(club.roster, assignment);
  return {
    slot: slotId, incoming: describe(playerId), outgoing: describe(outgoingId), before, after,
    delta: { attack: after.attack - before.attack, defense: after.defense - before.defense, speed: after.speed - before.speed, power: after.power - before.power, iq: after.iq - before.iq },
    assignment, valid: blockers.length === 0, blockers,
  };
}

/** Parse an untrusted `lineup.set` payload. Shape only; roster agreement is checked by the reducer. */
export function parseLineupAssignment(input: unknown): LineupAssignment | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length > LINEUP_SLOTS.length || keys.some(key => !SLOT_BY_ID.has(key as LineupSlotId))) return null;
  const out: LineupAssignment = {};
  for (const key of keys) {
    const id = value[key];
    if (typeof id !== 'string' || !id.length || id.length > 120) return null;
    out[key as LineupSlotId] = id;
  }
  return out;
}

/** Save validation for `GameState.lineup`. Absent is legal (an old club selects deterministically on load). */
export function validLineup(input: unknown): input is LineupState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const s = input as LineupState;
  if (!Number.isSafeInteger(s.version) || s.version < 1 || s.version > LINEUP_VERSION) return false;
  if (!Number.isSafeInteger(s.updatedAt) || s.updatedAt < 0) return false;
  return parseLineupAssignment(s.slots) !== null;
}

/** The snapshot a started Stadium game keeps so later roster moves cannot change a pending game. */
export interface LineupSnapshot { slots: LineupAssignment; players: { id: string; name: string; role: PlayerRole; unit: UnitGroup; power: number }[] }
export function lineupSnapshot(club: Pick<GameState, 'roster' | 'lineup'>, assignment: LineupAssignment = lineupOf(club)): LineupSnapshot {
  const index = rosterIndex(club.roster);
  const players = LINEUP_SLOT_IDS.map(id => assignment[id]).filter((id): id is string => !!id).map(id => index.get(id)).filter((p): p is Player => !!p)
    .map(p => ({ id: p.id, name: p.name, role: p.role, unit: p.unit, power: unitPower(p) }));
  return { slots: { ...assignment }, players };
}
export function validLineupSnapshot(input: unknown): input is LineupSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const s = input as LineupSnapshot;
  if (parseLineupAssignment(s.slots) === null || !Array.isArray(s.players) || s.players.length > LINEUP_SLOTS.length) return false;
  return s.players.every(p => !!p && typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 120 && typeof p.name === 'string' && p.name.length <= 120
    && Object.values(PlayerRole).includes(p.role) && Object.values(UnitGroup).includes(p.unit) && Number.isFinite(p.power) && p.power >= 0 && p.power <= 10_000);
}
/** Which selected player answers for a Stadium situation, from the snapshot a game carries. */
export function snapshotSlotPlayer(snapshot: LineupSnapshot | undefined, slotId: LineupSlotId): LineupSnapshot['players'][number] | null {
  const id = snapshot?.slots?.[slotId];
  return (id && snapshot?.players.find(p => p.id === id)) || null;
}
