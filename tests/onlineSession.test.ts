import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const uid = '11111111-1111-4111-8111-111111111111';
const session = () => ({ access_token: 'test-access', refresh_token: 'test-refresh', expires_at: Date.now() / 1000 - 60, uid });
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

describe('online identity preservation', () => {
  it('does not silently create a different identity when a refresh token is rejected', async () => {
    values.set('fhq_session_v1', JSON.stringify(session())); values.set('fhq_pid', uid);
    const request = vi.fn().mockResolvedValue(response({ error: 'invalid_grant' }, 400)); vi.stubGlobal('fetch', request);
    const pvp = await import('../pvp');
    expect(await pvp.getProfile()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain('grant_type=refresh_token');
    expect(pvp.playerId()).toBe(uid);
    expect(values.get('fhq_session_v1')).toContain('test-refresh');
  });
  it('keeps the previous identity when stored session data is malformed', async () => {
    values.set('fhq_session_v1', '{broken'); values.set('fhq_pid', uid);
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    expect(await (await import('../pvp')).getProfile()).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(values.get('fhq_pid')).toBe(uid);
  });
  it('rejects a malformed success response without clearing the old session', async () => {
    values.set('fhq_session_v1', JSON.stringify(session())); values.set('fhq_pid', uid);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ user: { id: uid }, access_token: 'missing-refresh' })));
    expect((await (await import('../pvp')).signInWithPassword('test@example.invalid', 'test-password')).ok).toBe(false);
    expect(JSON.parse(values.get('fhq_session_v1')!).access_token).toBe('test-access');
  });
  it('prevents an old refresh response from signing a player back in after sign-out', async () => {
    values.set('fhq_session_v1', JSON.stringify(session())); values.set('fhq_pid', uid);
    let finish!: (value: Response) => void;
    const request = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal('fetch', request);
    const pvp = await import('../pvp');
    const profile = pvp.getProfile();
    pvp.signOutToGuest();
    finish(response({ access_token: 'refreshed', refresh_token: 'new-refresh', expires_in: 3600, user: { id: uid } }));
    expect(await profile).toBeNull();
    expect(values.get('fhq_session_v1')).toBeUndefined();
    expect(pvp.playerId()).not.toBe(uid);
  });
  it('does not claim deletion when RLS silently leaves the published base behind', async () => {
    values.set('fhq_session_v1', JSON.stringify({ ...session(), expires_at: Date.now() / 1000 + 3600 }));
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([{ pid: uid }]));
    vi.stubGlobal('fetch', request);
    expect(await (await import('../pvp')).deleteCloudData()).toBe(false);
    expect(request).toHaveBeenCalledTimes(4);
  });
  it('confirms cloud deletion only when both owner rows are absent', async () => {
    values.set('fhq_session_v1', JSON.stringify({ ...session(), expires_at: Date.now() / 1000 + 3600 }));
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal('fetch', request);
    expect(await (await import('../pvp')).deleteCloudData()).toBe(true);
  });

  it('discards an old cloud fetch after a different account signs in', async () => {
    values.set('fhq_session_v1', JSON.stringify({ ...session(), expires_at: Date.now() / 1000 + 3600 }));
    let finish!: (value: Response) => void;
    const nextUid = '22222222-2222-4222-8222-222222222222';
    const request = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(response({ access_token: 'next-access', refresh_token: 'next-refresh', expires_in: 3600, user: { id: nextUid } }));
    vi.stubGlobal('fetch', request);
    const pvp = await import('../pvp');
    const pending = pvp.fetchCloudSave();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect((await pvp.signInWithPassword('next@example.invalid', 'test-password')).ok).toBe(true);
    finish(response([{ save: { teamName: 'Old account' }, club_name: 'Old account', updated_at: '2026-09-09T12:00:00Z' }]));
    expect(await pending).toEqual({ status: 'error' });
    expect(pvp.playerId()).toBe(nextUid);
  });
  it('does not emit an old account write success into the new account UI', async () => {
    values.set('fhq_session_v1', JSON.stringify({ ...session(), expires_at: Date.now() / 1000 + 3600 }));
    let finish!: (value: Response) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(response({ access_token: 'next-access', refresh_token: 'next-refresh', expires_in: 3600, user: { id: '22222222-2222-4222-8222-222222222222' } }));
    vi.stubGlobal('fetch', request);
    const pvp = await import('../pvp'); const statuses: string[] = [];
    pvp.subscribeCloudWriteStatus(status => statuses.push(status.status));
    pvp.acceptCloudRevision(null);
    const pending = pvp.pushCloudSaveDetailed({ teamName: 'Old account' }, 'Old account', 1);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await pvp.signInWithPassword('next@example.invalid', 'test-password');
    finish(response([{ updated_at: '2026-09-09T12:00:00Z' }]));
    expect((await pending).status).toBe('unavailable');
    expect(statuses).not.toContain('saved');
  });
  it('waits for an in-flight upload before deletion and blocks later uploads', async () => {
    values.set('fhq_session_v1', JSON.stringify({ ...session(), expires_at: Date.now() / 1000 + 3600 }));
    let finish!: (value: Response) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([]));
    vi.stubGlobal('fetch', request);
    const pvp = await import('../pvp'); pvp.acceptCloudRevision(null);
    const upload = pvp.pushCloudSaveDetailed({ teamName: 'Club' }, 'Club', 1);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const deletion = pvp.deleteCloudData();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect((await pvp.pushCloudSaveDetailed({ teamName: 'Club' }, 'Club', 1)).status).toBe('pending');
    expect(request).toHaveBeenCalledTimes(1);
    finish(response([{ updated_at: '2026-09-09T12:00:00Z' }]));
    await upload;
    expect(await deletion).toBe(true);
    expect(request.mock.calls.map(call => call[1]?.method ?? 'GET')).toEqual(['POST', 'DELETE', 'DELETE', 'GET', 'GET']);
  });

});
