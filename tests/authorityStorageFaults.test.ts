// Persistence failure injection for the authority ledger: unavailable storage, quota errors,
// malformed or corrupted persisted operations and interrupted writes. A storage failure must
// never look like a confirmed request and must never erase the last recoverable ledger.
import { describe, expect, it, vi } from 'vitest';
import { AuthorityClient, type AuthorityTransportResult } from '../game/online/authorityClient';
import { createInitialState } from '../game/initialState';
import { preserveLocalClub, readAuthorityProtection, enableAuthorityProtection, clearAuthorityProtection } from '../game/authority/protection';

const owner = '11111111-1111-4111-8111-111111111111';
const club = (revision: number) => ({ owner, state: createInitialState(1000), revision, activeMatch: null, origin: 'new' });
const ok = (body: unknown): AuthorityTransportResult => ({ status: 'ok', owner, body });
type Storage2 = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; values: Map<string, string> };
const memory = (): Storage2 => { const values = new Map<string, string>(); return { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, values }; };
const bootstrapped = async (transport: (body: unknown) => Promise<AuthorityTransportResult>, storage: Storage2) => {
  const client = new AuthorityClient(transport, storage, { uuid: () => '33333333-3333-4333-8333-333333333333' });
  expect((await client.query(owner, { kind: 'bootstrap' })).ok).toBe(true);
  return client;
};

describe('authority ledger under storage faults', () => {
  it('a quota error while recording a request sends nothing and reports a storage failure, not a confirmation', async () => {
    const transport = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>().mockResolvedValue(ok({ ok: true, club: club(0) }));
    const storage = memory();
    const client = await bootstrapped(transport, storage);
    storage.setItem = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
    const outcome = await client.operate(owner, 'action', { action: { type: 'rally' } });
    expect(outcome).toMatchObject({ status: 'failed', code: 'storage' });
    expect(transport).toHaveBeenCalledTimes(1); // only the bootstrap
    expect(client.pending(owner)).toEqual([]);
    expect(storage.values.get('fhq_authority_ops_v1')).toBeUndefined();
  });
  it('a storage that throws on read yields an empty ledger and still lets fresh requests work', async () => {
    const transport = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>().mockResolvedValueOnce(ok({ ok: true, club: club(0) })).mockResolvedValueOnce(ok({ ok: true, club: club(1), result: { type: 'rally' } }));
    const storage = memory();
    storage.getItem = () => { throw new Error('storage blocked'); };
    const client = await bootstrapped(transport, storage);
    expect(client.pending(owner)).toEqual([]);
    expect((await client.operate(owner, 'action', { action: { type: 'rally' } })).status).toBe('confirmed');
  });
  it('malformed, corrupted or foreign persisted operations are ignored without erasing valid ones', async () => {
    const transport = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>().mockResolvedValue(ok({ ok: true, club: club(0) }));
    const valid = { operationId: '44444444-4444-4444-8444-444444444444', owner, kind: 'action', request: { kind: 'action', operationId: '44444444-4444-4444-8444-444444444444', expectedRevision: 0, action: { type: 'rally' } }, state: 'pending', at: 5 };
    for (const raw of ['{broken', '"text"', '42', 'null']) {
      const storage = memory(); storage.values.set('fhq_authority_ops_v1', raw);
      const client = await bootstrapped(transport, storage);
      expect(client.pending(owner)).toEqual([]);
    }
    const storage = memory();
    storage.values.set('fhq_authority_ops_v1', JSON.stringify([valid, { ...valid, operationId: 'not-a-uuid' }, { ...valid, kind: 'delete-club' }, { ...valid, request: 'x' }, { ...valid, state: 'confirmed?', operationId: '55555555-5555-4555-8555-555555555555' }, 7, null]));
    const fresh = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>().mockResolvedValue(ok({ ok: true, club: club(0) }));
    const client = await bootstrapped(fresh, storage);
    expect(client.pending(owner).map(e => e.operationId)).toEqual([valid.operationId]);
    // A retry delivers the surviving entry with its original id and request.
    const [outcome] = await client.retry(owner);
    expect(outcome.status).toBe('confirmed');
    expect(fresh.mock.calls[1][0]).toEqual(valid.request);
  });
  it('an interrupted persist (write throws after the entry exists) keeps the previous ledger and the outcome stays honest', async () => {
    const transport = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>().mockResolvedValueOnce(ok({ ok: true, club: club(0) })).mockResolvedValueOnce({ status: 'offline' }).mockResolvedValueOnce(ok({ ok: true, club: club(1), result: { type: 'rally' } }));
    const storage = memory();
    const client = await bootstrapped(transport, storage);
    const first = await client.operate(owner, 'action', { action: { type: 'rally' } });
    expect(first.status).toBe('pending');
    const persisted = storage.values.get('fhq_authority_ops_v1')!;
    // Storage starts failing (e.g. quota) exactly when the confirmation would be recorded.
    let calls = 0; storage.setItem = () => { calls++; throw new Error('write interrupted'); };
    const [retried] = await client.retry(owner);
    expect(retried.status).toBe('confirmed'); // the server confirmed; the device just could not note it
    expect(storage.values.get('fhq_authority_ops_v1')).toBe(persisted); // the last readable ledger is intact
    expect(calls).toBeGreaterThan(0);
    // A reload sees the entry as still pending and retries; the server answers with the receipt (dedupe), never a second charge.
    const reloaded = new AuthorityClient(transport, storage);
    expect(reloaded.pending(owner)).toHaveLength(1);
  });
  it('diagnostics storage failures never break an operation', async () => {
    const transport = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>().mockResolvedValueOnce(ok({ ok: true, club: club(0) })).mockResolvedValueOnce(ok({ ok: true, club: club(1), result: { type: 'rally' } }));
    const storage = memory();
    const inner = storage.setItem; storage.setItem = (k, v) => { if (k === 'fhq_authority_diag_v1') throw new Error('no room'); inner(k, v); };
    const client = await bootstrapped(transport, storage);
    expect((await client.operate(owner, 'action', { action: { type: 'rally' } })).status).toBe('confirmed');
    expect(client.diagnostics(owner).confirmed).toBe(1);
  });
});

describe('device club preservation before adoption', () => {
  const storage = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); }, values }; };
  it('keeps the current local save as a readable backup and reports when there was nothing to keep', () => {
    const s = storage();
    expect(preserveLocalClub(s)).toBe(false);
    s.values.set('fhq_save_v1', JSON.stringify(createInitialState(1)));
    expect(preserveLocalClub(s)).toBe(true);
    expect(s.values.get('fhq_backup_preprotect')).toBe(s.values.get('fhq_save_v1'));
    expect(Number(s.values.get('fhq_backup_preprotect_at'))).toBeGreaterThan(0);
  });
  it('a failing storage reports no backup rather than pretending', () => {
    const s = storage(); s.values.set('fhq_save_v1', '{}'); s.setItem = () => { throw new Error('quota'); };
    expect(preserveLocalClub(s)).toBe(false);
  });
  it('protection records survive a storage that only fails on write', () => {
    const s = storage();
    enableAuthorityProtection(owner, s);
    expect(readAuthorityProtection(s)?.viewOwner).toBe(owner);
    clearAuthorityProtection(s);
    expect(readAuthorityProtection(s)).toBeNull();
  });
});
