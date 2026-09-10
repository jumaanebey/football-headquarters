import { describe, expect, it, vi } from 'vitest';
import { AuthorityClient, type AuthorityTransportResult } from '../game/online/authorityClient';
import { createInitialState } from '../game/initialState';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const ids = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'];
const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values }; };
const club = (revision: number, coins = 500) => ({ owner, state: { ...createInitialState(1000), resources: { COINS: coins, GEMS: 10, ENERGY: 100, FANS: 0 } }, revision, activeMatch: null, origin: 'new' });
const ok = (body: unknown, who = owner): AuthorityTransportResult => ({ status: 'ok', owner: who, body });
const make = (transport: (body: unknown) => Promise<AuthorityTransportResult>, storage = memory()) => {
  let n = 0;
  return { client: new AuthorityClient(transport, storage, { now: () => 5000, uuid: () => ids[n++] }), storage };
};

describe('authority client ledger', () => {
  it('records an operation before sending, keeps it pending on a lost reply, and confirms the retry without re-issuing', async () => {
    const transport = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>()
      .mockResolvedValueOnce(ok({ ok: true, club: club(0) }))
      .mockResolvedValueOnce({ status: 'offline' })
      .mockResolvedValueOnce(ok({ ok: true, club: club(1, 400), result: { type: 'rally' } }));
    const { client, storage } = make(transport);
    expect((await client.query(owner, { kind: 'bootstrap' })).ok).toBe(true);
    const first = await client.operate(owner, 'action', { action: { type: 'rally' } });
    expect(first.status).toBe('pending');
    expect(client.pending(owner)).toHaveLength(1);
    expect(JSON.parse(storage.values.get('fhq_authority_ops_v1')!)[0]).toMatchObject({ operationId: ids[0], state: 'pending', request: { kind: 'action', operationId: ids[0], expectedRevision: 0 } });
    // A reload builds a new client from the same storage; the club must be re-validated before retrying.
    const reloaded = new AuthorityClient(transport, storage);
    expect(await reloaded.retry(owner)).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(2);
    transport.mockResolvedValueOnce(ok({ ok: true, club: club(1, 400) }));
    await reloaded.query(owner, { kind: 'status' });
    const [retried] = await reloaded.retry(owner);
    expect(retried.status).toBe('confirmed');
    expect(transport.mock.calls[3][0]).toEqual(transport.mock.calls[1][0]); // identical request, same operation id
    expect(reloaded.pending(owner)).toEqual([]);
    expect(reloaded.club(owner)?.revision).toBe(1);
  });
  it('fails a stale request on a revision conflict and adopts the latest club instead of retrying', async () => {
    const transport = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>()
      .mockResolvedValueOnce(ok({ ok: true, club: club(0) }))
      .mockResolvedValueOnce(ok({ ok: false, code: 'revision_conflict', message: 'Your club changed on another device.', club: club(3, 900) }));
    const { client } = make(transport);
    await client.query(owner, { kind: 'bootstrap' });
    const outcome = await client.operate(owner, 'action', { action: { type: 'rally' } });
    expect(outcome.status).toBe('failed');
    expect(client.club(owner)?.revision).toBe(3);
    expect(client.club(owner)?.state.resources.COINS).toBe(900);
    expect(client.pending(owner)).toEqual([]);
    expect(await client.retry(owner)).toEqual([]);
  });
  it('keeps retrying when the service reports itself unavailable, and refuses to reuse an operation id', async () => {
    const transport = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>()
      .mockResolvedValueOnce(ok({ ok: true, club: club(0) }))
      .mockResolvedValueOnce(ok({ ok: false, code: 'unavailable', message: 'Retry to check whether the request completed.' }));
    const { client } = make(transport);
    await client.query(owner, { kind: 'bootstrap' });
    const outcome = await client.operate(owner, 'action', { action: { type: 'rally' } }, ids[2]);
    expect(outcome.status).toBe('pending');
    expect(client.pending(owner).map(e => e.operationId)).toEqual([ids[2]]);
    const reused = await client.operate(owner, 'action', { action: { type: 'builder.hire' } }, ids[2]);
    expect(reused).toMatchObject({ status: 'failed', code: 'operation_conflict' });
  });
  it('never adopts a club issued for another account or one that fails save validation', async () => {
    const transport = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>()
      .mockResolvedValueOnce(ok({ ok: true, club: club(0) }, other))
      .mockResolvedValueOnce(ok({ ok: true, club: { ...club(0), state: { resources: { COINS: -1 } } } }));
    const { client } = make(transport);
    const foreign = await client.query(owner, { kind: 'bootstrap' });
    expect(foreign.ok).toBe(false);
    expect(client.club(owner)).toBeNull();
    const broken = await client.query(owner, { kind: 'bootstrap' });
    expect(broken.ok).toBe(true);
    expect('club' in broken ? broken.club : undefined).toBeNull();
    expect(client.club(owner)).toBeNull();
    expect((await client.operate(owner, 'action', { action: { type: 'rally' } })).status).toBe('failed');
  });
});
