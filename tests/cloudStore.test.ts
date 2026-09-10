import { describe, expect, it, vi } from 'vitest';
import { CloudSaveStore, jsonBytes } from '../game/online/cloudStore';
const uid = 'one-coach';
const headers = { Authorization: 'Bearer test' };
const first = '2026-09-08T12:00:00.000Z';
const second = '2026-09-09T12:00:00.000Z';
const cloud = (updated_at = first) => [{ save: { teamName: 'Cloud club' }, club_name: 'Cloud club', updated_at }];
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe('cloud compare-and-set saves', () => {
  it('never treats a failed lookup as an empty club or attempts a write', async () => {
    const request = vi.fn().mockResolvedValue(response({}, 503));
    const store = new CloudSaveStore('https://test', request);
    expect((await store.write(uid, headers, {}, 'Local', 1)).status).toBe('error');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].method).toBeUndefined();
  });
  it('does not overwrite an existing club on a blind first upload', async () => {
    const request = vi.fn().mockResolvedValue(response(cloud()));
    const store = new CloudSaveStore('https://test', request);
    expect((await store.write(uid, headers, {}, 'Local', 1)).status).toBe('conflict');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('requires an explicit choice for unknown cloud progress on first upgrade', async () => {
    const request = vi.fn().mockResolvedValue(response(cloud()));
    const store = new CloudSaveStore('https://test', request);
    expect(await store.read(uid, headers)).toMatchObject({ status: 'found', conflict: true });
    expect((await store.write(uid, headers, {}, 'Local', 1)).status).toBe('conflict');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('uses a conditional write and requires an acknowledged row', async () => {
    const request = vi.fn().mockResolvedValueOnce(response(cloud())).mockResolvedValueOnce(response([{ updated_at: second }]));
    const store = new CloudSaveStore('https://test', request);
    await store.read(uid, headers);
    store.acceptRevision(uid, first);
    expect(await store.write(uid, headers, {}, 'Local', 1)).toEqual({ status: 'saved', updatedAt: second });
    expect(request.mock.calls[1][0]).toContain(`updated_at=eq.${encodeURIComponent(first)}`);
    expect(request.mock.calls[1][1].method).toBe('PATCH');
    expect(request.mock.calls[1][1].headers.Prefer).toBe('return=representation');
  });
  it('keeps a two-device conflict blocked across reload until explicit choice', async () => {
    const storage = memory();
    const request = vi.fn().mockResolvedValueOnce(response(cloud())).mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(cloud(second)));
    const store = new CloudSaveStore('https://test', request, storage);
    await store.read(uid, headers);
    store.acceptRevision(uid, first);
    expect((await store.write(uid, headers, {}, 'Local', 1)).status).toBe('conflict');
    const reloaded = new CloudSaveStore('https://test', request, storage);
    expect(await reloaded.read(uid, headers)).toMatchObject({ status: 'found', conflict: true });
    expect((await reloaded.write(uid, headers, {}, 'Local', 1)).status).toBe('conflict');
    expect(request).toHaveBeenCalledTimes(3);
    reloaded.acceptRevision(uid, second);
    request.mockResolvedValueOnce(response([{ updated_at: '2026-09-09T12:00:01.000Z' }]));
    expect((await reloaded.write(uid, headers, {}, 'Local', 1)).status).toBe('saved');
    expect(request.mock.calls[3][0]).toContain(encodeURIComponent(second));
  });
  it('a lost response cannot cause a retry to overwrite another accepted revision', async () => {
    const request = vi.fn().mockResolvedValueOnce(response(cloud())).mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(response([]));
    const store = new CloudSaveStore('https://test', request);
    await store.read(uid, headers);
    store.acceptRevision(uid, first);
    expect((await store.write(uid, headers, {}, 'Local', 1)).status).toBe('error');
    expect((await store.write(uid, headers, {}, 'Local', 1)).status).toBe('conflict');
    expect(request.mock.calls[2][0]).toContain(encodeURIComponent(first));
  });
  it('a first-save race uses INSERT without upsert and reports duplicate as conflict', async () => {
    const request = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({}, 409));
    const store = new CloudSaveStore('https://test', request);
    expect((await store.write(uid, headers, {}, 'Local', 1)).status).toBe('conflict');
    expect(request.mock.calls[1][1].method).toBe('POST');
    expect(request.mock.calls[1][0]).not.toContain('on_conflict');
  });
  it('serializes simultaneous writes from the same account', async () => {
    let finish!: (value: Response) => void;
    const request = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    const store = new CloudSaveStore('https://test', request);
    store.acceptRevision(uid, first);
    const pending = store.write(uid, headers, {}, 'Local', 1);
    expect((await store.write(uid, headers, {}, 'Local', 1)).status).toBe('pending');
    finish(response([{ updated_at: second }]));
    expect((await pending).status).toBe('saved');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('bounds actual UTF-8 bytes, rejects circular payloads, and isolates account revisions', async () => {
    expect(jsonBytes('🏈')).toBe(6);
    const circular: Record<string, unknown> = {}; circular.self = circular;
    expect(jsonBytes(circular)).toBe(Infinity);
    const request = vi.fn().mockResolvedValue(response(cloud()));
    const store = new CloudSaveStore('https://test', request);
    expect((await store.write(uid, headers, { text: '🏈'.repeat(120_000) }, 'Local', 1)).status).toBe('invalid');
    expect(request).not.toHaveBeenCalled();
    store.acceptRevision('different-coach', first);
    expect((await store.write(uid, headers, {}, 'Local', 1)).status).toBe('conflict');
  });
  it('rejects malformed cloud rows instead of exposing them as valid progress', async () => {
    const request = vi.fn().mockResolvedValue(response([{ save: 'not a club', club_name: 'Name', updated_at: 'bad time' }]));
    expect(await new CloudSaveStore('https://test', request).read(uid, headers)).toEqual({ status: 'error' });
  });
});
