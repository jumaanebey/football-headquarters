// Failure injection for protected clubs: the real client (durable ledger) talks to the real
// authority service on the SQL-equivalent memory store through a transport that can drop the
// request before it is sent, drop the answer after the server committed, expire the session,
// or belong to another account. Success in every scenario means one server mutation, one
// charge, a recoverable receipt, and adoption of the confirmed server state.
import { describe, expect, it } from 'vitest';
import { AuthorityClient, type AuthorityTransport, type AuthorityTransportResult } from '../game/online/authorityClient';
import { createAuthorityService } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import { RAID_ENERGY } from '../constants';
import type { BattleConfig } from '../game/combat/contracts';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values }; };

interface Net { offline: boolean; dropAnswer: boolean; sessionOwner: string | null; sent: unknown[] }
/** One server, any number of "devices" (clients), each with its own signed-in session and fault switches. */
const world = () => {
  let now = ACTIVATION + 60_000;
  let ids = 5000;
  const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
  const service = createAuthorityService(store, { now: () => now, randomUint32: () => 0x2468_ace0, uuid: () => `00000000-0000-4000-8000-${String(ids++).padStart(12, '0')}` });
  let ops = 100;
  const device = (owner: string) => {
    const net: Net = { offline: false, dropAnswer: false, sessionOwner: owner, sent: [] };
    const transport: AuthorityTransport = async (body): Promise<AuthorityTransportResult> => {
      if (net.offline) return { status: 'offline' };
      if (!net.sessionOwner) return { status: 'unauthorized' };
      net.sent.push(body);
      const answer = await service({ owner: net.sessionOwner, createdAt: ACTIVATION + 1000 }, body);
      if (net.dropAnswer) return { status: 'offline' };
      return { status: 'ok', owner: net.sessionOwner, body: answer };
    };
    const storage = memory();
    const client = new AuthorityClient(transport, storage, { now: () => now, uuid: () => `10000000-0000-4000-8000-${String(ops++).padStart(12, '0')}` });
    /** A reload: a brand-new client over the same storage. */
    const reload = () => new AuthorityClient(transport, storage, { now: () => now, uuid: () => `10000000-0000-4000-8000-${String(ops++).padStart(12, '0')}` });
    return { net, storage, client, reload };
  };
  return { store, service, device, advance: (ms: number) => { now += ms; }, get now() { return now; }, state: (owner: string) => store.clubs.get(owner)!.state, revision: (owner: string) => store.clubs.get(owner)!.revision };
};
const bootstrap = async (client: AuthorityClient, owner: string) => { const answer = await client.query(owner, { kind: 'bootstrap' }); if (!answer.ok) throw new Error('bootstrap failed'); };
const coins = (w: ReturnType<typeof world>, owner: string) => w.state(owner).resources.COINS;

describe('interrupted requests recover with one server mutation', () => {
  it('offline before submission: nothing is sent, the receipt is durable, reconnect delivers it once', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    w.store.clubs.get(A)!.state.resources.COINS = 100_000;
    await d.client.query(A, { kind: 'status' });
    d.net.offline = true;
    const attempt = await d.client.operate(A, 'action', { action: { type: 'facility.upgrade', buildingId: 'stadium-1' } });
    expect(attempt.status).toBe('pending');
    expect(d.net.sent).toHaveLength(2); // bootstrap + status only
    expect(w.state(A).upgrades).toHaveLength(0);
    d.net.offline = false;
    const [retried] = await d.client.retry(A);
    expect(retried.status).toBe('confirmed');
    expect(w.state(A).upgrades).toHaveLength(1);
    expect(coins(w, A)).toBe(100_000 - 1400);
    expect(await d.client.retry(A)).toEqual([]);
    expect(w.store.commits).toBe(1);
  });
  it('answer lost after the server committed: the retry carries the same operation id and gets the receipt, no second charge', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    w.store.clubs.get(A)!.state.resources.COINS = 100_000;
    await d.client.query(A, { kind: 'status' });
    d.net.dropAnswer = true;
    const attempt = await d.client.operate(A, 'action', { action: { type: 'facility.upgrade', buildingId: 'stadium-1' } });
    expect(attempt.status).toBe('pending');
    expect(w.state(A).upgrades).toHaveLength(1); // committed server-side, unknown to the device
    d.net.dropAnswer = false;
    const [retried] = await d.client.retry(A);
    expect(retried.status).toBe('confirmed');
    const bodies = d.net.sent.filter((b: any) => b.kind === 'action') as Record<string, unknown>[];
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]); // identical request, identical operation id
    expect(coins(w, A)).toBe(100_000 - 1400);
    expect(w.state(A).upgrades).toHaveLength(1);
    expect(w.store.commits).toBe(1);
    expect(d.client.club(A)?.revision).toBe(1);
  });
  it('reload with a pending operation: the new client re-validates the account, then delivers the ledger entry', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    await d.client.query(A, { kind: 'status' });
    d.net.dropAnswer = true;
    await d.client.operate(A, 'action', { action: { type: 'gate.assign', postId: 'south', heroKey: 'kicker' } });
    d.net.dropAnswer = false;
    const reloaded = d.reload();
    expect(reloaded.pending(A)).toHaveLength(1);
    expect(await reloaded.retry(A)).toEqual([]); // cannot deliver before the account is known
    expect((await reloaded.query(A, { kind: 'status' })).ok).toBe(true);
    const [retried] = await reloaded.retry(A);
    expect(retried.status).toBe('confirmed');
    expect(reloaded.pending(A)).toEqual([]);
    expect(w.state(A).heroGates.south).toBe('kicker');
    expect(w.revision(A)).toBe(1);
  });
  it('expired session: the request waits, and after sign-in the retry delivers it', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    await d.client.query(A, { kind: 'status' });
    d.net.sessionOwner = null;
    const attempt = await d.client.operate(A, 'action', { action: { type: 'rally' } });
    expect(attempt).toMatchObject({ status: 'pending', message: expect.stringContaining('Reconnect') });
    expect(d.client.diagnostics(A).availability.status).toBe('unauthorized');
    expect(w.revision(A)).toBe(0);
    d.net.sessionOwner = A;
    const [retried] = await d.client.retry(A);
    expect(retried.status).toBe('failed'); // rally itself is refused (Energy is full) — one server answer, nothing charged twice
    expect(retried.status === 'failed' && retried.code).toBe('limit_reached');
    expect(d.client.pending(A)).toEqual([]);
  });
});

describe('accounts never leak into each other', () => {
  it('a pending operation from account A is not sent under account B and B\'s club is never adopted as A', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    await d.client.query(A, { kind: 'status' });
    d.net.dropAnswer = true;
    await d.client.operate(A, 'action', { action: { type: 'gate.assign', postId: 'south', heroKey: 'kicker' } });
    d.net.dropAnswer = false;
    // Sign out and sign in as B on the same device (same storage, same ledger file).
    d.client.forgetClubs();
    d.net.sessionOwner = B;
    await bootstrap(d.client, B);
    expect(d.client.club(A)).toBeNull();
    expect(d.client.club(B)?.owner).toBe(B);
    expect(await d.client.retry(A)).toEqual([]); // A's ledger entry stays pending: A's club is not known while B is signed in
    expect(d.client.pending(A)).toHaveLength(1);
    expect(w.state(B).heroGates).toEqual({});
    // B's own operation works and does not touch A's ledger.
    const own = await d.client.operate(B, 'action', { action: { type: 'gate.assign', postId: 'north', heroKey: 'qb' } });
    expect(own.status).toBe('confirmed');
    expect(d.client.pending(A)).toHaveLength(1);
    expect(d.client.ledger(B)).toHaveLength(1);
    // Back as A: the original receipt is delivered under A only.
    d.client.forgetClubs(); d.net.sessionOwner = A;
    await d.client.query(A, { kind: 'status' });
    const [retried] = await d.client.retry(A);
    expect(retried.status).toBe('confirmed');
    expect(w.state(A).heroGates).toEqual({ south: 'kicker' });
    expect(w.state(B).heroGates).toEqual({ north: 'qb' });
  });
  it('an answer issued for another account is never adopted, even if the transport mislabels it', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    await bootstrap(w.device(B).client, B);
    const transport: AuthorityTransport = async body => ({ status: 'ok', owner: B, body: await w.service({ owner: B, createdAt: ACTIVATION + 1000 }, body) });
    const crossed = new AuthorityClient(transport, memory());
    expect((await crossed.query(A, { kind: 'status' })).ok).toBe(false);
    expect(crossed.club(A)).toBeNull();
  });
});

describe('two sessions against the same revision', () => {
  it('the second device adopts the confirmed club and its stale purchase fails instead of replaying', async () => {
    const w = world(); const one = w.device(A); const two = w.device(A);
    await bootstrap(one.client, A); await bootstrap(two.client, A);
    w.store.clubs.get(A)!.state.resources.COINS = 100_000;
    await one.client.query(A, { kind: 'status' }); await two.client.query(A, { kind: 'status' });
    const first = await one.client.operate(A, 'action', { action: { type: 'facility.upgrade', buildingId: 'stadium-1' } });
    expect(first.status).toBe('confirmed');
    const stale = await two.client.operate(A, 'action', { action: { type: 'facility.upgrade', buildingId: 'stadium-1' } });
    expect(stale).toMatchObject({ status: 'failed', code: 'revision_conflict' });
    expect(two.client.club(A)?.revision).toBe(1);
    expect(two.client.club(A)?.state.upgrades).toHaveLength(1);
    expect(two.client.pending(A)).toEqual([]);
    expect(coins(w, A)).toBe(100_000 - 1400);
    expect(w.store.commits).toBe(1);
  });
  it('a duplicate tap while the same request is unconfirmed becomes one operation, and queued requests take the confirmed revision', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    await d.client.query(A, { kind: 'status' });
    const [x, y, z] = await Promise.all([
      d.client.operate(A, 'action', { action: { type: 'gate.assign', postId: 'south', heroKey: 'kicker' } }),
      d.client.operate(A, 'action', { action: { type: 'gate.assign', postId: 'south', heroKey: 'kicker' } }),
      d.client.operate(A, 'action', { action: { type: 'gate.assign', postId: 'north', heroKey: 'qb' } }),
    ]);
    expect(x.status).toBe('confirmed');
    expect(y.operationId).toBe(x.operationId); // the twin tap rode the same ledger entry
    expect(z.status).toBe('confirmed');
    const bodies = d.net.sent.filter((b: any) => b.kind === 'action') as Record<string, unknown>[];
    expect(bodies.map(b => b.expectedRevision)).toEqual([0, 1]); // serialized: the second request used the confirmed revision
    expect(w.revision(A)).toBe(2);
    expect(w.state(A).heroGates).toEqual({ south: 'kicker', north: 'qb' });
    expect(d.client.ledger(A)).toHaveLength(2);
  });
  it('a request queued behind a lost answer is delivered after the receipt, still in order', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    await d.client.query(A, { kind: 'status' });
    d.net.dropAnswer = true;
    const first = d.client.operate(A, 'action', { action: { type: 'gate.assign', postId: 'south', heroKey: 'kicker' } });
    const second = d.client.operate(A, 'action', { action: { type: 'gate.assign', postId: 'north', heroKey: 'qb' } });
    expect((await first).status).toBe('pending');
    expect((await second).status).toBe('pending'); // the answer was dropped for both; both are durable
    d.net.dropAnswer = false;
    const outcomes = await d.client.retry(A);
    expect(outcomes.map(o => o.status)).toEqual(['confirmed', 'confirmed']);
    expect(w.state(A).heroGates).toEqual({ south: 'kicker', north: 'qb' });
    expect(w.revision(A)).toBe(2);
    expect(w.store.commits).toBe(2);
  });
});

describe('match reservations interrupted at each phase', () => {
  const reserveAndBegin = async (w: ReturnType<typeof world>, d: ReturnType<ReturnType<typeof world>['device']>) => {
    const reserved = await d.client.operate(A, 'match.reserve', { choice: { kind: 'campaign', stage: 1 } });
    if (reserved.status !== 'confirmed') throw new Error('reserve failed');
    const matchId = (reserved.answer.result as { matchId: string }).matchId;
    return { matchId, config: reserved.answer.match!.config as unknown as BattleConfig, seed: reserved.answer.match!.seed };
  };
  it('before kickoff: a lost reservation answer is recovered, and cancelling refunds the Energy', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    await d.client.query(A, { kind: 'status' });
    d.net.dropAnswer = true;
    expect((await d.client.operate(A, 'match.reserve', { choice: { kind: 'campaign', stage: 1 } })).status).toBe('pending');
    expect(w.state(A).resources.ENERGY).toBe(100 - RAID_ENERGY); // reserved server-side
    d.net.dropAnswer = false;
    const [retried] = await d.client.retry(A);
    expect(retried.status).toBe('confirmed');
    const matchId = retried.status === 'confirmed' ? (retried.answer.result as { matchId: string }).matchId : '';
    expect(d.client.club(A)?.activeMatch).toBe(matchId);
    const cancelled = await d.client.operate(A, 'match.cancel', { matchId });
    expect(cancelled.status).toBe('confirmed');
    expect(cancelled.status === 'confirmed' && cancelled.answer.result).toEqual({ type: 'match.cancel', matchId, refunded: true });
    expect(w.state(A).resources.ENERGY).toBe(100);
  });
  it('after kickoff: cancelling keeps the Energy charge, exactly once', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    await d.client.query(A, { kind: 'status' });
    const { matchId } = await reserveAndBegin(w, d);
    d.net.dropAnswer = true;
    expect((await d.client.operate(A, 'match.begin', { matchId })).status).toBe('pending');
    expect(w.store.matches.get(matchId)?.status).toBe('started');
    d.net.dropAnswer = false;
    expect((await d.client.retry(A))[0].status).toBe('confirmed');
    const cancelled = await d.client.operate(A, 'match.cancel', { matchId });
    expect(cancelled.status === 'confirmed' && cancelled.answer.result).toEqual({ type: 'match.cancel', matchId, refunded: false });
    expect(w.state(A).resources.ENERGY).toBe(100 - RAID_ENERGY);
    expect(w.store.matches.get(matchId)?.status).toBe('cancelled');
  });
  it('during settlement: the lost finish answer is recovered from the receipt and rewards are credited once', async () => {
    const w = world(); const d = w.device(A); await bootstrap(d.client, A);
    await d.client.query(A, { kind: 'status' });
    const { matchId, config, seed } = await reserveAndBegin(w, d);
    expect((await d.client.operate(A, 'match.begin', { matchId })).status).toBe('confirmed');
    const film = playHeadlessMatch(config, seed);
    w.advance(film.submission.ticks * 50 + 500);
    const before = coins(w, A);
    d.net.dropAnswer = true;
    const lost = await d.client.operate(A, 'match.finish', { matchId, submission: film.submission });
    expect(lost.status).toBe('pending');
    expect(w.store.matches.get(matchId)?.status).toBe('settled');
    expect(coins(w, A)).toBe(before + film.result.coins);
    // A reload happens; the new client re-validates the account and delivers the pending finish.
    d.net.dropAnswer = false;
    const reloaded = d.reload();
    await reloaded.query(A, { kind: 'status' });
    const [retried] = await reloaded.retry(A);
    expect(retried.status).toBe('confirmed');
    const battle = retried.status === 'confirmed' ? (retried.answer.result as { battleResult: { coins: number } }).battleResult : null;
    expect(battle?.coins).toBe(film.result.coins);
    expect(coins(w, A)).toBe(before + film.result.coins);
    expect(reloaded.club(A)?.activeMatch).toBeNull();
    expect(reloaded.club(A)?.state.currentMatch).toBe(2);
    expect(w.store.commits).toBe(3); // reserve, begin, finish
  });
  it('a reservation left behind on another device is released by the next load, then play continues', async () => {
    const w = world(); const one = w.device(A); const two = w.device(A);
    await bootstrap(one.client, A); await bootstrap(two.client, A);
    await one.client.query(A, { kind: 'status' });
    const { matchId } = await reserveAndBegin(w, one);
    // Device two loads: status shows the open reservation; it cancels it (what useAuthority.detect does) and reserves its own game.
    const status = await two.client.query(A, { kind: 'status' });
    expect(status.ok && status.match?.id).toBe(matchId);
    expect((await two.client.operate(A, 'match.cancel', { matchId })).status).toBe('confirmed');
    expect(w.state(A).resources.ENERGY).toBe(100);
    const fresh = await two.client.operate(A, 'match.reserve', { choice: { kind: 'campaign', stage: 1 } });
    expect(fresh.status).toBe('confirmed');
    // Device one, unaware, tries to begin its old match and learns the truth instead of playing a phantom game.
    const stale = await one.client.operate(A, 'match.begin', { matchId });
    expect(stale.status).toBe('failed');
    expect(one.client.club(A)?.revision).toBe(w.revision(A));
  });
});
