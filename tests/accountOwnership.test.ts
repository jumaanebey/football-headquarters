// Account linking and switching cannot move a club between owners: linking keeps the same uid,
// a rejected link leaves the session and local data untouched, signing into another account
// changes the owner every authority request is bound to, and an answer that arrives after the
// account changed is discarded rather than adopted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const uidA = '11111111-1111-4111-8111-111111111111';
const uidB = '22222222-2222-4222-8222-222222222222';
const session = (uid: string) => ({ access_token: `token-${uid.slice(0, 4)}`, refresh_token: `refresh-${uid.slice(0, 4)}`, expires_at: Date.now() / 1000 + 3600, uid });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let values: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  values = new Map();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('guest → account linking', () => {
  it('keeps the same identity, so the club, ledger and published base stay owned by the same uid', async () => {
    values.set('fhq_session_v1', JSON.stringify(session(uidA))); values.set('fhq_pid', uidA); values.set('fhq_save_v1', '{"club":"local"}');
    const request = vi.fn().mockResolvedValueOnce(response({ id: uidA, email: 'coach@example.invalid' }));
    vi.stubGlobal('fetch', request);
    const pvp = await import('../pvp');
    expect((await pvp.linkAccount('coach@example.invalid', 'longpassword')).ok).toBe(true);
    expect(request.mock.calls[0][1].method).toBe('PUT'); // attaches credentials to the CURRENT user
    expect(pvp.playerId()).toBe(uidA);
    expect(values.get('fhq_save_v1')).toBe('{"club":"local"}');
  });
  it('a rejected link (email already registered) changes nothing: same uid, same session, local club intact', async () => {
    values.set('fhq_session_v1', JSON.stringify(session(uidA))); values.set('fhq_pid', uidA); values.set('fhq_save_v1', '{"club":"local"}');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ msg: 'A user with this email address has already been registered' }, 422)));
    const pvp = await import('../pvp');
    const result = await pvp.linkAccount('taken@example.invalid', 'longpassword');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('already been registered');
    expect(pvp.playerId()).toBe(uidA);
    expect(JSON.parse(values.get('fhq_session_v1')!).uid).toBe(uidA);
    expect(values.get('fhq_save_v1')).toBe('{"club":"local"}');
  });
});

describe('signing into an existing account', () => {
  it('switches the owner every authority request is bound to and never sends the old owner\'s answers as the new one', async () => {
    values.set('fhq_session_v1', JSON.stringify(session(uidA))); values.set('fhq_pid', uidA);
    const request = vi.fn()
      .mockResolvedValueOnce(response({ access_token: 'token-B', refresh_token: 'refresh-B', expires_in: 3600, user: { id: uidB } }))
      .mockResolvedValueOnce(response({ ok: true, club: null }));
    vi.stubGlobal('fetch', request);
    const pvp = await import('../pvp');
    expect(pvp.playerId()).toBe(uidA);
    expect((await pvp.signInWithPassword('b@example.invalid', 'longpassword')).ok).toBe(true);
    expect(pvp.playerId()).toBe(uidB);
    const sent = await pvp.postAuthority({ kind: 'status' });
    expect(sent.status).toBe('ok');
    expect(sent.status === 'ok' && sent.owner).toBe(uidB);
    expect(request.mock.calls[1][1].headers.Authorization).toBe('Bearer token-B');
  });
  it('an authority answer that arrives after the account changed is discarded, never adopted', async () => {
    values.set('fhq_session_v1', JSON.stringify(session(uidA))); values.set('fhq_pid', uidA);
    let release!: (value: Response) => void;
    const request = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
      .mockResolvedValueOnce(response({ access_token: 'token-B', refresh_token: 'refresh-B', expires_in: 3600, user: { id: uidB } }));
    vi.stubGlobal('fetch', request);
    const pvp = await import('../pvp');
    const inflight = pvp.postAuthority({ kind: 'status' });
    await new Promise(resolve => setTimeout(resolve, 0)); // the request is on the wire under account A
    expect(request).toHaveBeenCalledTimes(1);
    expect((await pvp.signInWithPassword('b@example.invalid', 'longpassword')).ok).toBe(true);
    release(response({ ok: true, club: { owner: uidA, state: {}, revision: 9, activeMatch: null, origin: 'new' } }));
    const result = await inflight;
    expect(result.status).toBe('offline'); // the context is no longer current; the caller treats it as unknown and never adopts
    expect(pvp.playerId()).toBe(uidB);
  });
  it('signing out returns to a fresh guest identity and leaves the local save file alone', async () => {
    values.set('fhq_session_v1', JSON.stringify(session(uidA))); values.set('fhq_pid', uidA); values.set('fhq_save_v1', '{"club":"mirror"}');
    const pvp = await import('../pvp');
    pvp.signOutToGuest();
    expect(pvp.playerId()).not.toBe(uidA);
    expect(values.get('fhq_session_v1')).toBeUndefined();
    expect(values.get('fhq_save_v1')).toBe('{"club":"mirror"}');
    expect((await pvp.postAuthority({ kind: 'status' })).status).toBe('unauthorized'); // a guest with a previous identity never mints a new one silently
  });
});
