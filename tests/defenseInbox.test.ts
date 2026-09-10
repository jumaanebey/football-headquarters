import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/initialState';
import { parseSavedClub } from '../game/saveValidation';
import { applyAttackInbox, defenseCursor, establishDefenseInbox } from '../game/online/defenseInbox';
import type { AttackInbox, LiveAttack } from '../pvp';
const owner = '11111111-1111-4111-8111-111111111111';
const rival = '22222222-2222-4222-8222-222222222222';
const at = '2026-09-09T12:00:00.000Z';
const attack = (id: number): LiveAttack => ({ id, attacker_name: 'Rival', attacker_pid: rival, stars: 1, pct: 60, coins_lost: 100, created_at: at });
const initialClub = () => establishDefenseInbox(createInitialState(), owner, { createdAt: new Date(0).toISOString(), id: 0 });
const page = (...ids: number[]): AttackInbox => ({ status: 'ok', attacks: ids.map(attack), cursor: { createdAt: at, id: Math.max(...ids) }, hasMore: false, playerId: owner });

describe('atomic live-defense inbox application', () => {
  it('records losses and the complete cursor in the same validated save', () => {
    const initial = initialClub();
    const next = applyAttackInbox(initial, page(1, 2), owner);
    expect(next.resources.COINS).toBeLessThan(initial.resources.COINS);
    expect(next.defenseInbox).toEqual({ ownerId: owner, createdAt: at, id: 2 });
    expect(parseSavedClub(JSON.stringify(next)).defenseInbox).toEqual(next.defenseInbox);
    expect(initial.defenseInbox?.id).toBe(0);
  });
  it('is idempotent after reload even if the visible defense log has been trimmed', () => {
    const next = applyAttackInbox(initialClub(), page(1, 2), owner);
    const trimmed = { ...parseSavedClub(JSON.stringify(next)), defenseLog: [] };
    expect(applyAttackInbox(trimmed, page(1, 2), owner)).toBe(trimmed);
  });
  it('handles multiple pages with identical timestamps and overlapping deliveries', () => {
    const first = applyAttackInbox(initialClub(), page(1, 2), owner);
    const second = applyAttackInbox(first, page(2, 3), owner);
    expect(second.defenseLog.map(row => row.id)).toEqual(['pvp_3', 'pvp_2', 'pvp_1']);
    expect(second.defenseInbox?.id).toBe(3);
  });
  it('rejects pages returned after an account switch and future cursors beyond a page', () => {
    const initial = initialClub();
    expect(applyAttackInbox(initial, page(1), rival)).toBe(initial);
    const invalid = { ...page(1), cursor: { createdAt: at, id: 5 } } as AttackInbox;
    expect(applyAttackInbox(initial, invalid, owner)).toBe(initial);
  });
  it('establishes legacy baselines without reapplying historical losses or changing logs', () => {
    const legacy = createInitialState();
    expect(applyAttackInbox(legacy, page(1, 2), owner)).toBe(legacy);
    const baseline = establishDefenseInbox(legacy, owner, { createdAt: at, id: 200 });
    expect(baseline.resources).toBe(legacy.resources);
    expect(baseline.defenseLog).toBe(legacy.defenseLog);
    expect(baseline.trophies).toBe(legacy.trophies);
    expect(applyAttackInbox(baseline, page(1, 2), owner)).toBe(baseline);
    expect(applyAttackInbox(baseline, page(201), owner).resources.COINS).toBeLessThan(baseline.resources.COINS);
  });
  it('does not reuse another account cursor or reset an established owner baseline', () => {
    const next = applyAttackInbox(initialClub(), page(1), owner);
    expect(defenseCursor(next, rival)).toEqual({ createdAt: new Date(0).toISOString(), id: 0 });
    expect(establishDefenseInbox(next, owner, { createdAt: at, id: 1000 })).toBe(next);
  });
  it('rejects invalid cursor imports while preserving legacy saves without the optional field', () => {
    const initial = initialClub();
    expect(() => parseSavedClub(JSON.stringify(initial))).not.toThrow();
    expect(() => parseSavedClub(JSON.stringify({ ...initial, defenseInbox: { ownerId: owner, createdAt: 'wrong', id: 1 } }))).toThrow('live defense cursor');
  });
});
