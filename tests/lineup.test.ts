// Package A acceptance: the selected team decides Stadium ratings, previews match settlement,
// old saves migrate deterministically, and forged or stale assignments are refused.
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/initialState';
import { PlayerRarity, PlayerRole, PlayerState, UnitGroup, type GameState, type Player } from '../types';
import { unitPower } from '../battle';
import {
  LINEUP_SLOTS, LINEUP_SLOT_IDS, compareLineupChange, isEligible, lineupBlockers, lineupOf, lineupRatings,
  lineupSnapshot, lineupValid, lineupView, parseLineupAssignment, repairLineup, selectLineup, slotFit,
  snapshotSlotPlayer, validLineup, validLineupSnapshot, type LineupAssignment,
} from '../game/lineup';
import { applyClubAction, parseClubAction } from '../game/authority/clubActions';

const NOW = Date.parse('2026-09-11T12:00:00Z');
const club = (): GameState => ({ ...createInitialState(NOW), lastTick: NOW });
const player = (id: string, role: PlayerRole, unit: UnitGroup, stat: number, rarity = PlayerRarity.COMMON): Player => ({
  id, name: `Player ${id}`, role, unit, rarity, level: 1, stats: { strength: stat, speed: stat, iq: stat }, maxStat: 40,
  worldPos: { x: 0, y: 0, z: 0 }, targetPos: { x: 0, y: 0, z: 0 }, state: PlayerState.IDLE, avatarColor: '#fff', tendency: 'anchor',
});
const act = (state: GameState, action: unknown, now = NOW) => {
  const parsed = parseClubAction(action);
  if (!parsed) return { ok: false as const, state, code: 'invalid', message: 'rejected by the parser' };
  return applyClubAction(state, parsed, { now, random: () => 0.5 });
};

describe('lineup slots', () => {
  it('field a legal team from the starting roster with a reserve left over, using every unit group', () => {
    const state = club();
    expect(state.roster).toHaveLength(10);
    expect(LINEUP_SLOTS).toHaveLength(9);
    expect(new Set(LINEUP_SLOTS.map(s => s.unit)).size).toBe(4);
    const assignment = selectLineup(state.roster);
    expect(Object.keys(assignment)).toHaveLength(9);
    expect(lineupValid(state.roster, assignment)).toBe(true);
    const view = lineupView(state, assignment);
    expect(view.reserves).toHaveLength(1);
    expect(view.filled).toBe(9);
    expect(view.slots.every(s => !s.outOfPosition)).toBe(true);
    // Each slot got its named role where the roster has one.
    for (const slot of view.slots) expect(slot.player!.role, slot.slot).toBe(slot.preferredRole);
  });
  it('keep a club playable when a position is missing, marking the filler out of position instead of refusing', () => {
    const state = club();
    // A club with no secondary at all: two slots must still be filled from elsewhere.
    state.roster = state.roster.filter(p => p.unit !== UnitGroup.DEFENSE_SECONDARY);
    state.roster.push(player('x1', PlayerRole.WR, UnitGroup.OFFENSE_SKILL, 12), player('x2', PlayerRole.OL, UnitGroup.OFFENSE_LINE, 12));
    const assignment = selectLineup(state.roster);
    expect(Object.keys(assignment)).toHaveLength(9);
    expect(lineupValid(state.roster, assignment)).toBe(true);
    const view = lineupView(state, assignment);
    const secondary = view.slots.filter(s => s.unit === UnitGroup.DEFENSE_SECONDARY);
    expect(secondary).toHaveLength(2);
    expect(secondary.every(s => s.outOfPosition)).toBe(true);
    expect(secondary.every(s => !!s.player)).toBe(true);
    // Out of position is a note, not a blocker.
    expect(view.blockers).toEqual([]);
    expect(slotFit(LINEUP_SLOTS.find(s => s.id === 'COVER')!, state.roster.find(p => p.id === 'x1')!)).toBe(1);
  });
  it('leave a slot unfilled and unplayable only when the roster genuinely cannot cover it', () => {
    const state = club();
    state.roster = state.roster.slice(0, 4);
    const assignment = selectLineup(state.roster);
    expect(Object.keys(assignment)).toHaveLength(4);
    const view = lineupView(state, assignment);
    expect(view.valid).toBe(false);
    expect(view.blockers.every(b => b.code === 'unfilled')).toBe(true);
    expect(view.blockers).toHaveLength(5);
  });
});

describe('selected players decide the rating', () => {
  it('signing a weaker reserve leaves the active ratings untouched', () => {
    const state = club();
    const assignment = selectLineup(state.roster);
    const before = lineupRatings(state.roster, assignment);
    const withReserve: GameState = { ...state, roster: [...state.roster, player('weak', PlayerRole.WR, UnitGroup.OFFENSE_SKILL, 1)] };
    const after = lineupRatings(withReserve.roster, assignment);
    expect(after).toEqual(before);
    expect(lineupView(withReserve, assignment).reserves.map(r => r.playerId)).toContain('weak');
    // The old whole-roster mean did move: this is the behaviour the package replaces.
    const rosterMean = (roster: Player[]) => Math.round(roster.filter(p => p.unit === UnitGroup.OFFENSE_SKILL || p.unit === UnitGroup.OFFENSE_LINE).reduce((s, p) => s + unitPower(p), 0) / roster.filter(p => p.unit === UnitGroup.OFFENSE_SKILL || p.unit === UnitGroup.OFFENSE_LINE).length);
    expect(rosterMean(withReserve.roster)).toBeLessThan(rosterMean(state.roster));
  });
  it('replacing a starter moves the rating by exactly the advertised difference', () => {
    const state = club();
    const assignment = selectLineup(state.roster);
    const star = player('star', PlayerRole.WR, UnitGroup.OFFENSE_SKILL, 30, PlayerRarity.EPIC);
    const withStar: GameState = { ...state, roster: [...state.roster, star], lineup: { version: 1, slots: assignment, updatedAt: NOW } };
    const preview = compareLineupChange(withStar, 'RECEIVER', 'star');
    expect(preview.incoming?.playerId).toBe('star');
    expect(preview.outgoing?.playerId).toBe(assignment.RECEIVER);
    expect(preview.delta.attack).toBeGreaterThan(0);
    expect(preview.valid).toBe(true);
    const settled = lineupRatings(withStar.roster, preview.assignment);
    expect(settled).toEqual(preview.after);
    expect(settled.attack - preview.before.attack).toBe(preview.delta.attack);
  });
  it('promoting a player who already starts swaps the two rather than duplicating him', () => {
    const state = club();
    const assignment = selectLineup(state.roster);
    const preview = compareLineupChange({ ...state, lineup: { version: 1, slots: assignment, updatedAt: NOW } }, 'BACK', assignment.RECEIVER!);
    expect(preview.assignment.BACK).toBe(assignment.RECEIVER);
    expect(preview.assignment.RECEIVER).toBe(assignment.BACK);
    expect(preview.valid).toBe(true);
    expect(new Set(Object.values(preview.assignment)).size).toBe(9);
  });
});

describe('migration and repair', () => {
  it('an old save without a lineup gets the same legal team every time', () => {
    const state = club();
    delete state.lineup;
    const a = lineupOf(state), b = lineupOf({ ...state, roster: [...state.roster] });
    expect(a).toEqual(b);
    expect(lineupValid(state.roster, a)).toBe(true);
    // Order of the saved roster must not change the outcome, and the roster itself is untouched.
    const shuffled = { ...state, roster: [...state.roster].reverse() };
    expect(lineupOf(shuffled)).toEqual(a);
    expect(state.roster.map(p => p.id)).toEqual(club().roster.map(p => p.id));
  });
  it('ties break on strength then id, never on roster order', () => {
    const base = club();
    const equalPair = [player('zz', PlayerRole.WR, UnitGroup.OFFENSE_SKILL, 10), player('aa', PlayerRole.WR, UnitGroup.OFFENSE_SKILL, 10)];
    const roster = [...base.roster, ...equalPair];
    const candidates = lineupView({ roster, lineup: undefined }, selectLineup(roster)).slots.find(s => s.slot === 'RECEIVER')!.candidates;
    const tied = candidates.filter(c => c.playerId === 'aa' || c.playerId === 'zz').map(c => c.playerId);
    expect(tied).toEqual(['aa', 'zz']); // equal strength: the lower id ranks first
    expect(selectLineup(roster)).toEqual(selectLineup([...roster].reverse()));
    const stronger = [...base.roster, player('zz', PlayerRole.WR, UnitGroup.OFFENSE_SKILL, 30), player('aa', PlayerRole.WR, UnitGroup.OFFENSE_SKILL, 10)];
    const strongerFirst = lineupView({ roster: stronger, lineup: undefined }, selectLineup(stronger)).slots.find(s => s.slot === 'RECEIVER')!.candidates
      .filter(c => c.playerId === 'aa' || c.playerId === 'zz').map(c => c.playerId);
    expect(strongerFirst).toEqual(['zz', 'aa']); // strength wins over the id
  });
  it('repair keeps every still-legal choice and reports only the slots that moved', () => {
    const state = club();
    const assignment = selectLineup(state.roster);
    const cutId = assignment.RECEIVER!;
    const trimmed = state.roster.filter(p => p.id !== cutId);
    const { slots, repaired } = repairLineup(trimmed, assignment);
    expect(repaired).toEqual(['RECEIVER']);
    for (const id of LINEUP_SLOT_IDS) if (id !== 'RECEIVER') expect(slots[id]).toBe(assignment[id]);
    expect(slots.RECEIVER).not.toBe(cutId);
    expect(lineupValid(trimmed, slots)).toBe(true);
  });
});

describe('validation refuses forged assignments', () => {
  const state = club();
  const good = selectLineup(state.roster);
  it('rejects unknown players, duplicates, unknown slots and extra keys', () => {
    expect(lineupBlockers(state.roster, { ...good, QB: 'nobody' }).map(b => b.code)).toEqual(['unknown-player']);
    const dup: LineupAssignment = { ...good, BACK: good.QB };
    expect(lineupBlockers(state.roster, dup).map(b => b.code)).toEqual(['duplicate-player']);
    expect(parseLineupAssignment({ ...good, NOPE: 'x' })).toBeNull();
    expect(parseLineupAssignment({ QB: 42 })).toBeNull();
    expect(parseLineupAssignment('QB')).toBeNull();
    expect(parseLineupAssignment({ QB: 'a'.repeat(200) })).toBeNull();
    expect(parseLineupAssignment(good)).toEqual(good);
  });
  it('rejects a player who cannot play the slot at all', () => {
    const narrow = { ...state, roster: [...state.roster] };
    const qbSlot = LINEUP_SLOTS.find(s => s.id === 'QB')!;
    // Every unit is either the slot's own or in its fallback, so build an impossible case explicitly.
    // A corrupt player: a quarterback's role with a unit no slot accepts.
    const alien = { ...player('alien', PlayerRole.QB, 'MASCOT' as UnitGroup, 10) };
    narrow.roster = [...narrow.roster, alien];
    expect(isEligible(qbSlot, alien)).toBe(false);
    expect(lineupBlockers(narrow.roster, { ...good, QB: 'alien' }).map(b => b.code)).toEqual(['out-of-position']);
  });
  it('accepts and rejects persisted lineup shapes', () => {
    expect(validLineup({ version: 1, slots: good, updatedAt: NOW })).toBe(true);
    expect(validLineup({ version: 0, slots: good, updatedAt: NOW })).toBe(false);
    expect(validLineup({ version: 99, slots: good, updatedAt: NOW })).toBe(false);
    expect(validLineup({ version: 1, slots: { NOPE: 'x' }, updatedAt: NOW })).toBe(false);
    expect(validLineup({ version: 1, slots: good, updatedAt: -1 })).toBe(false);
    expect(validLineup(null)).toBe(false);
  });
});

describe('the authority action', () => {
  it('stores a valid lineup and answers with the ratings it produced', () => {
    const state = club();
    const assignment = selectLineup(state.roster);
    const result = act(state, { type: 'lineup.set', lineup: assignment });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.lineup?.slots).toEqual(assignment);
    expect(result.state.lineup?.version).toBe(1);
    expect(result.result.ratings).toEqual(lineupRatings(state.roster, assignment));
    expect(result.state.roster.map(p => p.id)).toEqual(state.roster.map(p => p.id));
  });
  it('refuses forged ids, duplicates and unknown slots through the pipeline', () => {
    const state = club();
    const assignment = selectLineup(state.roster);
    expect(act(state, { type: 'lineup.set', lineup: { ...assignment, QB: 'ghost' } })).toMatchObject({ ok: false, code: 'not_found' });
    expect(act(state, { type: 'lineup.set', lineup: { ...assignment, BACK: assignment.QB } })).toMatchObject({ ok: false, code: 'invalid' });
    expect(act(state, { type: 'lineup.set', lineup: { BENCH: 'x' } })).toMatchObject({ ok: false });
    expect(act(state, { type: 'lineup.set', lineup: assignment, extra: 1 })).toMatchObject({ ok: false });
  });
  it('releasing a starter repairs the lineup and names the slot that changed', () => {
    let state = club();
    const assignment = selectLineup(state.roster);
    const set = act(state, { type: 'lineup.set', lineup: assignment });
    expect(set.ok).toBe(true); if (!set.ok) return;
    state = set.state;
    const spare = player('spare', PlayerRole.WR, UnitGroup.OFFENSE_SKILL, 9);
    state = { ...state, roster: [...state.roster, spare] };
    const cut = act(state, { type: 'recruit.cut', playerId: assignment.RECEIVER! });
    expect(cut.ok).toBe(true); if (!cut.ok) return;
    expect(cut.result.repaired).toEqual(['RECEIVER']);
    expect(cut.state.lineup!.slots.RECEIVER).toBe('spare');
    expect(lineupValid(cut.state.roster, cut.state.lineup!.slots)).toBe(true);
  });
});

describe('snapshots', () => {
  it('carry the selected players so a later roster change cannot alter a pending game', () => {
    const state = club();
    const assignment = selectLineup(state.roster);
    const snapshot = lineupSnapshot({ ...state, lineup: { version: 1, slots: assignment, updatedAt: NOW } });
    expect(snapshot.players).toHaveLength(9);
    expect(validLineupSnapshot(snapshot)).toBe(true);
    const qb = snapshotSlotPlayer(snapshot, 'QB');
    expect(qb?.id).toBe(assignment.QB);
    expect(snapshotSlotPlayer(snapshot, 'RECEIVER')?.role).toBe(PlayerRole.WR);
    expect(snapshotSlotPlayer(undefined, 'QB')).toBeNull();
    expect(validLineupSnapshot({ slots: assignment, players: [{ id: 'x', name: 'x', role: 'NOPE', unit: UnitGroup.OFFENSE_SKILL, power: 1 }] })).toBe(false);
  });
});
