// Item 17: the diagnostics export explains a failure with versions, codes and counts, and never
// carries what the ledger and storage also hold: request bodies (actions, films, legacy saves),
// server messages, bearer tokens, full account ids or the club name.
import { describe, expect, it, vi } from 'vitest';
import { AuthorityClient, type AuthorityTransportResult } from '../game/online/authorityClient';
import { buildAuthorityDiagnosticsReport, code, serializeAuthorityDiagnostics, summarizeAuthorityDiagnostics } from '../game/online/diagnosticsExport';
import { COMBAT_RULES_VERSION } from '../game/combat/actions';
import { createInitialState } from '../game/initialState';

const owner = 'deadbeef-1111-4111-8111-111111111111';
const SECRET = 'eyJhbGciOiJIUzI1NiJ9.SECRET-BEARER-TOKEN.signature';
const memory = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, values }; };
const club = (revision: number) => ({ owner, state: { ...createInitialState(1000), teamName: 'Very Private FC' }, revision, activeMatch: null, origin: 'new' });

describe('authority diagnostics export', () => {
  it('reports versions, availability, counts, codes and latencies without payloads, messages, tokens, names or full ids', async () => {
    let t = 1_700_000_000_000;
    const transport = vi.fn<(body: unknown) => Promise<AuthorityTransportResult>>()
      .mockResolvedValueOnce({ status: 'ok', owner, body: { ok: true, club: club(0) } })
      .mockResolvedValueOnce({ status: 'ok', owner, body: { ok: true, club: club(1), result: { type: 'rally' } } })
      .mockResolvedValueOnce({ status: 'ok', owner, body: { ok: false, code: 'invalid_request', message: `Server said: ${SECRET} for Very Private FC` } })
      .mockResolvedValueOnce({ status: 'offline' })
      .mockResolvedValueOnce({ status: 'unauthorized' });
    const storage = memory();
    let ids = 0;
    const client = new AuthorityClient(transport, storage, { now: () => (t += 137), uuid: () => `4444444${ids}-4444-4444-8444-44444444444${ids++}` });
    expect((await client.query(owner, { kind: 'bootstrap', legacy: { teamName: 'Very Private FC', token: SECRET } })).ok).toBe(true);
    expect((await client.operate(owner, 'action', { action: { type: 'rally', note: SECRET } })).status).toBe('confirmed');
    expect((await client.operate(owner, 'action', { action: { type: 'bogus', note: SECRET } })).status).toBe('failed');
    expect((await client.operate(owner, 'match.finish', { matchId: '55555555-5555-4555-8555-555555555555', submission: { script: [{ k: 'h', key: 'qb', x: 1, y: 2, tick: 0 }], finalHash: 'abcdef12', ticks: 3 } })).status).toBe('pending');
    expect((await client.query(owner, { kind: 'status' })).ok).toBe(false);

    const report = buildAuthorityDiagnosticsReport(client, { owner, now: () => t + 1000, build: '2026-09-10 05:00 UTC' });
    expect(report.format).toBe('fhq-authority-diagnostics/1');
    expect(report.rules).toBe(COMBAT_RULES_VERSION);
    expect(report.build).toBe('2026-09-10 05:00 UTC');
    expect(report.owner).toBe('deadbeef');
    expect(report.availability.status).toBe('unauthorized');
    expect(report.counts).toEqual({ pending: 1, failed: 1, confirmed: 1 });
    expect(report.averageConfirmLatencyMs).toBeGreaterThan(0);
    expect(report.recent.map(e => [e.kind, e.outcome, e.code])).toEqual([
      ['bootstrap', 'query', undefined], ['action', 'confirmed', undefined], ['action', 'failed', 'invalid_request'], ['match.finish', 'pending', 'offline'], ['status', 'query', 'unauthorized'],
    ]);
    expect(report.recent[1]).toMatchObject({ op: '44444440', revision: 1, latencyMs: expect.any(Number) });
    expect(report.unfinished).toEqual([
      { op: '44444441', kind: 'action', state: 'failed', code: 'invalid_request', ageMs: expect.any(Number) },
      { op: '44444442', kind: 'match.finish', state: 'pending', code: undefined, ageMs: expect.any(Number) },
    ]);

    const text = serializeAuthorityDiagnostics(report);
    // Everything the storage holds that must not leave the device.
    const persisted = [...storage.values.values()].join('\n');
    expect(persisted).toContain(SECRET); // the ledger really does hold the request bodies…
    expect(persisted).toContain('Very Private FC');
    for (const forbidden of [SECRET, 'SECRET', 'Bearer', 'Very Private', owner, 'script', 'finalHash', 'submission', 'legacy', 'Server said', '"message"', '"request"', 'teamName', 'COINS']) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    expect(text.length).toBeLessThan(6000);
    expect(summarizeAuthorityDiagnostics(report)).toBe(`${COMBAT_RULES_VERSION} · build 2026-09-10 05:00 UTC · server unauthorized · 1 confirmed, 1 pending, 1 failed · ~${report.averageConfirmLatencyMs} ms`);
  });
  it('redacts any non-identifier string at the source and tolerates corrupted diagnostics storage', () => {
    expect(code('revision_conflict')).toBe('revision_conflict');
    expect(code('match.finish')).toBe('match.finish');
    expect(code(undefined)).toBeUndefined();
    expect(code(SECRET)).toBe('redacted');
    expect(code('Reconnect your club to continue.')).toBe('redacted');
    expect(code('{"token":"x"}')).toBe('redacted');
    expect(code(42)).toBe('redacted');
    const storage = memory();
    storage.values.set('fhq_authority_diag_v1', JSON.stringify([{ at: 5, kind: `leak ${SECRET}`, outcome: 'query', code: 'Server exploded: ' + SECRET, operationId: SECRET }, { at: 'bad' }, 7]));
    storage.values.set('fhq_authority_ops_v1', '{broken');
    const client = new AuthorityClient(async () => ({ status: 'offline' }), storage);
    const report = buildAuthorityDiagnosticsReport(client, { owner: 'not-an-account-id', now: () => 10, build: 'dev' });
    expect(report.owner).toBeNull();
    expect(report.recent).toEqual([{ at: new Date(5).toISOString(), kind: 'redacted', op: 'redacted', outcome: 'query', code: 'redacted', latencyMs: undefined, revision: undefined }]);
    expect(serializeAuthorityDiagnostics(report)).not.toContain('SECRET');
    expect(report.unfinished).toEqual([]);
  });
});
