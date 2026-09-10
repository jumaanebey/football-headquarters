// Match lifecycle boundary cases: expiry at the exact instant, shield and beginner-protection
// transitions, abandoned reservations blocking club changes, and Energy conservation across every
// cancellation path. Extends tests/authorityService.test.ts where a boundary was missing.
import { describe, expect, it } from 'vitest';
import { createAuthorityService } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import { RAID_ENERGY } from '../constants';
import type { BattleConfig } from '../game/combat/contracts';
import type { GameState } from '../types';
import { settleClubState } from '../game/authority/clubActions';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EXPIRY_MS = 15 * 60_000;

const harness = () => {
  let now = ACTIVATION + 60_000; let ops = 1; let ids = 8500;
  const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
  const service = createAuthorityService(store, { now: () => now, randomUint32: () => 99, uuid: () => op(ids++) });
  const call = (owner: string, input: unknown) => service({ owner, createdAt: ACTIVATION + 1000 }, input);
  const revision = (owner = A) => store.clubs.get(owner)!.revision;
  const request = (owner: string, kind: string, fields: Record<string, unknown>) => call(owner, { kind, operationId: op(ops++), expectedRevision: revision(owner), ...fields });
  const reserve = async (owner: string, choice: unknown) => { const r = await request(owner, 'match.reserve', { choice }); return { answer: r, matchId: r.ok ? (r.result as { matchId: string }).matchId : '' }; };
  const filmFor = (matchId: string) => { const m = store.matches.get(matchId)!; return playHeadlessMatch(m.config as BattleConfig, m.seed); };
  return { store, call, request, reserve, filmFor, revision, state: (owner = A) => store.clubs.get(owner)!.state, set: (owner: string, f: (s: GameState) => void) => f(store.clubs.get(owner)!.state), advance: (ms: number) => { now += ms; }, get now() { return now; } };
};
const boot = async (h: ReturnType<typeof harness>, owner: string) => { expect((await h.call(owner, { kind: 'bootstrap' })).ok).toBe(true); };

describe('expiry boundaries', () => {
  it('begin is allowed at the exact expiry instant and refused one millisecond later; cancelling a reserved game after expiry still refunds', async () => {
    const h = harness(); await boot(h, A);
    const { matchId } = await h.reserve(A, { kind: 'campaign', stage: 1 });
    h.advance(EXPIRY_MS + 1);
    const late = await h.request(A, 'match.begin', { matchId });
    expect(!late.ok && late.code).toBe('expired');
    const cancelled = await h.request(A, 'match.cancel', { matchId });
    expect(cancelled.ok && cancelled.result).toMatchObject({ refunded: true });
    expect(h.state().resources.ENERGY).toBe(100);
    const h2 = harness(); await boot(h2, A);
    const second = await h2.reserve(A, { kind: 'campaign', stage: 1 });
    h2.advance(EXPIRY_MS);
    expect((await h2.request(A, 'match.begin', { matchId: second.matchId })).ok).toBe(true);
  });
  it('finish is allowed at the expiry instant and refused after it; an expired started game cannot settle and cancels without refund', async () => {
    const h = harness(); await boot(h, A);
    const { matchId } = await h.reserve(A, { kind: 'campaign', stage: 1 });
    expect((await h.request(A, 'match.begin', { matchId })).ok).toBe(true);
    const film = h.filmFor(matchId);
    h.advance(EXPIRY_MS); // exactly at expiry (the film's ticks fit inside the window)
    const onTime = await h.request(A, 'match.finish', { matchId, submission: film.submission });
    expect(onTime.ok).toBe(true);
    const h2 = harness(); await boot(h2, A);
    const late = await h2.reserve(A, { kind: 'campaign', stage: 1 });
    expect((await h2.request(A, 'match.begin', { matchId: late.matchId })).ok).toBe(true);
    const film2 = h2.filmFor(late.matchId);
    h2.advance(EXPIRY_MS + 1);
    const expired = await h2.request(A, 'match.finish', { matchId: late.matchId, submission: film2.submission });
    expect(!expired.ok && expired.code).toBe('expired');
    expect(h2.state().currentMatch).toBe(1);
    const beforeCancel = JSON.parse(JSON.stringify(h2.state())) as GameState;
    const cancelled = await h2.request(A, 'match.cancel', { matchId: late.matchId });
    expect(cancelled.ok && cancelled.result).toMatchObject({ refunded: false });
    // No refund: only the clock's regen over the expired window is applied.
    expect(h2.state().resources.ENERGY).toBe(settleClubState(beforeCancel, { now: h2.now }).resources.ENERGY);
    expect(h2.state().resources.ENERGY).toBeLessThan(100 - RAID_ENERGY + 100); // sanity: no double credit
  });
  it('an abandoned reservation blocks club changes until it is released, and the release is idempotent', async () => {
    const h = harness(); await boot(h, A);
    const { matchId } = await h.reserve(A, { kind: 'campaign', stage: 1 });
    expect((await h.request(A, 'action', { action: { type: 'rally' } })).ok).toBe(false);
    expect((await h.request(A, 'match.reserve', { choice: { kind: 'gauntlet' } })).ok).toBe(false);
    expect((await h.request(A, 'match.cancel', { matchId })).ok).toBe(true);
    const twice = await h.request(A, 'match.cancel', { matchId });
    expect(!twice.ok && twice.code).toBe('match_conflict');
    expect(h.state().resources.ENERGY).toBe(100);
    expect((await h.request(A, 'action', { action: { type: 'sync' } })).ok).toBe(true);
  });
});

describe('eligibility transitions', () => {
  const graduate = async (h: ReturnType<typeof harness>, owner: string) => { h.set(owner, s => { s.currentMatch = 3; }); };
  it('beginner protection lifts exactly when the third Season game is reached, for attacker and target alike', async () => {
    const h = harness(); await boot(h, A); await boot(h, B);
    h.set(A, s => { s.currentMatch = 2; }); h.set(B, s => { s.currentMatch = 3; });
    expect((await h.reserve(A, { kind: 'rival', target: B })).answer).toMatchObject({ ok: false, code: 'beginner_protection' });
    h.set(A, s => { s.currentMatch = 3; }); h.set(B, s => { s.currentMatch = 2; });
    expect((await h.reserve(A, { kind: 'rival', target: B })).answer).toMatchObject({ ok: false, code: 'beginner_protection' });
    h.set(B, s => { s.currentMatch = 3; });
    expect((await h.reserve(A, { kind: 'rival', target: B })).answer.ok).toBe(true);
    expect(h.state().resources.ENERGY).toBe(100 - RAID_ENERGY);
  });
  it('a shield that ends at this instant no longer protects; one millisecond of shield still does', async () => {
    const h = harness(); await boot(h, A); await boot(h, B);
    await graduate(h, A); await graduate(h, B);
    h.set(B, s => { s.shieldUntil = h.now + 1; });
    expect((await h.reserve(A, { kind: 'rival', target: B })).answer).toMatchObject({ ok: false, code: 'shielded' });
    h.set(B, s => { s.shieldUntil = h.now; });
    expect((await h.reserve(A, { kind: 'rival', target: B })).answer.ok).toBe(true);
  });
  it('kickoff of an attack drops the attacker\'s own shield; a lost defense raises the defender\'s for two hours; a held defense earns a mastery hold instead', async () => {
    const h = harness(); await boot(h, A); await boot(h, B);
    await graduate(h, A); await graduate(h, B);
    h.set(A, s => { s.shieldUntil = h.now + 3_600_000; });
    const { matchId } = await h.reserve(A, { kind: 'rival', target: B });
    expect(h.state(A).shieldUntil).toBe(h.now + 3_600_000);
    expect((await h.request(A, 'match.begin', { matchId })).ok).toBe(true);
    expect(h.state(A).shieldUntil).toBe(0);
    const film = h.filmFor(matchId);
    h.advance(film.submission.ticks * 50 + 500);
    const settled = await h.request(A, 'match.finish', { matchId, submission: film.submission });
    const battle = settled.ok ? (settled.result as { battleResult: { won: boolean; stars: number } }).battleResult : null;
    if (battle?.won) { expect(h.state(B).shieldUntil).toBe(h.now + 2 * 3_600_000); expect(h.state(B).formationMastery).toEqual({}); }
    else { expect(h.state(B).shieldUntil ?? 0).toBe(0); expect(h.state(B).formationMastery.goalline).toBe(1); }
    expect(h.state(B).defenseLog).toHaveLength(1);
  });
  it('a target that becomes busy after listing is refused at reservation, and a target that is deleted is target_missing', async () => {
    const h = harness(); await boot(h, A); await boot(h, B);
    await graduate(h, A); await graduate(h, B);
    const own = await h.reserve(B, { kind: 'campaign', stage: 1 });
    expect(own.answer.ok).toBe(true);
    expect((await h.reserve(A, { kind: 'rival', target: B })).answer).toMatchObject({ ok: false, code: 'target_busy' });
    expect((await h.reserve(A, { kind: 'rival', target: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })).answer).toMatchObject({ ok: false, code: 'target_missing' });
    expect(h.state(A).resources.ENERGY).toBe(100);
  });
});

describe('Energy conservation across every path', () => {
  it('reserve → cancel, reserve → begin → cancel, reserve → expire → cancel, and reserve → finish each account for Energy exactly once', async () => {
    const h = harness(); await boot(h, A);
    let energy = 100;
    const r1 = await h.reserve(A, { kind: 'campaign', stage: 1 }); await h.request(A, 'match.cancel', { matchId: r1.matchId });
    expect(h.state().resources.ENERGY).toBe(energy);
    const r2 = await h.reserve(A, { kind: 'campaign', stage: 1 }); await h.request(A, 'match.begin', { matchId: r2.matchId }); await h.request(A, 'match.cancel', { matchId: r2.matchId });
    energy -= RAID_ENERGY; expect(h.state().resources.ENERGY).toBe(energy);
    const r3 = await h.reserve(A, { kind: 'campaign', stage: 1 }); h.advance(EXPIRY_MS + 1); await h.request(A, 'match.cancel', { matchId: r3.matchId });
    expect(h.state().resources.ENERGY).toBeGreaterThanOrEqual(energy); // refunded; regen over the 15 minutes may add
    const before = h.state().resources.ENERGY;
    const r4 = await h.reserve(A, { kind: 'campaign', stage: 1 }); await h.request(A, 'match.begin', { matchId: r4.matchId });
    const film = h.filmFor(r4.matchId); h.advance(film.submission.ticks * 50 + 500);
    expect((await h.request(A, 'match.finish', { matchId: r4.matchId, submission: film.submission })).ok).toBe(true);
    expect(h.state().resources.ENERGY).toBeLessThanOrEqual(before - RAID_ENERGY + 20); // charged once; a little regen during the drive
    expect(h.store.matches.size).toBe(4);
    expect([...h.store.matches.values()].map(m => m.status).sort()).toEqual(['cancelled', 'cancelled', 'cancelled', 'settled']);
  });
});
