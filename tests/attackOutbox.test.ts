import { describe, expect, it, vi } from 'vitest';
import { AttackOutbox, type AttackPayload } from '../game/online/attackOutbox';
const uid = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const payload: AttackPayload = { attacker_pid: uid, target_pid: target, attacker_name: 'Test coach', stars: 1, pct: 40, coins_lost: 50, replay: null };
const headers = { Authorization: 'Bearer test' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };

describe('durable account-owned raid outbox', () => {
  it('retries a lost reply using the SAME operation key and confirms the existing row', async () => {
    const storage = memory();
    const request = vi.fn().mockResolvedValueOnce(response([])).mockRejectedValueOnce(new Error('reply lost'));
    const outbox = new AttackOutbox('https://test', request, storage);
    outbox.queue(id, payload);
    expect((await outbox.send(id, uid, headers)).status).toBe('pending');
    const reloaded = new AttackOutbox('https://test', request, storage);
    request.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([payload]));
    expect((await reloaded.retry(uid, headers))[0].status).toBe('reported');
    const posts = request.mock.calls.filter(call => call[1]?.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts.map(call => JSON.parse(call[1].body)[0].operation_id)).toEqual([id, id]);
    expect(posts.every(call => call[1].headers.Prefer.includes('ignore-duplicates'))).toBe(true);
  });
  it('acknowledges only an actual matching server row', async () => {
    for (const matching of [true, false]) {
      const request = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([{ id: 4, ...payload, pct: matching ? payload.pct : 99 }]));
      const outbox = new AttackOutbox('https://test', request, memory());
      outbox.queue(id, payload);
      expect((await outbox.send(id, uid, headers)).status).toBe(matching ? 'reported' : 'pending');
    }
  });
  it('never retries an unconfirmed legacy insert, including after reload', async () => {
    const storage = memory();
    const request = vi.fn().mockResolvedValueOnce(response({ code: '42703' }, 400)).mockRejectedValueOnce(new Error('reply lost'));
    const outbox = new AttackOutbox('https://test', request, storage);
    outbox.queue(id, payload);
    expect((await outbox.send(id, uid, headers)).status).toBe('unconfirmed');
    const reloaded = new AttackOutbox('https://test', request, storage);
    expect(await reloaded.retry(uid, headers)).toEqual([]);
    expect((await reloaded.send(id, uid, headers)).status).toBe('unconfirmed');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('keeps reports attached to their original account', async () => {
    const request = vi.fn();
    const outbox = new AttackOutbox('https://test', request, memory());
    outbox.queue(id, payload);
    expect(await outbox.retry(target, headers)).toEqual([]);
    expect((await outbox.send(id, target, headers)).status).toBe('rejected');
    expect(request).not.toHaveBeenCalled();
  });
  it('deduplicates completion callbacks and rejects reuse for a changed result', () => {
    const outbox = new AttackOutbox('https://test', vi.fn(), memory());
    expect(outbox.queue(id, payload).status).toBe('pending');
    expect(outbox.queue(id, payload).status).toBe('pending');
    expect(outbox.queue(id, { ...payload, pct: 100 }).status).toBe('rejected');
    expect(outbox.list(uid)).toHaveLength(1);
  });
  it('does not claim to queue a report if device persistence fails', () => {
    const outbox = new AttackOutbox('https://test', vi.fn(), { getItem: () => null, setItem: () => { throw new Error('quota'); } });
    expect(outbox.queue(id, payload).status).toBe('rejected');
    expect(outbox.list(uid)).toEqual([]);
  });
  it('does not interpret outage, authentication, or arbitrary 400 as legacy capability', async () => {
    for (const status of [400, 401, 503]) {
      const request = vi.fn().mockResolvedValue(response({ code: 'different' }, status));
      const outbox = new AttackOutbox('https://test', request, memory());
      outbox.queue(id, payload);
      expect((await outbox.send(id, uid, headers)).status).toBe('pending');
      expect(request).toHaveBeenCalledTimes(1);
    }
  });
  it('does not acknowledge a reused server key with a different stored payload', async () => {
    const request = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([{ ...payload, pct: 99 }]));
    const outbox = new AttackOutbox('https://test', request, memory());
    outbox.queue(id, payload);
    expect((await outbox.send(id, uid, headers)).status).toBe('pending');
  });
  it('rejects invalid, oversized, and self-attack payloads before any request', () => {
    const outbox = new AttackOutbox('https://test', vi.fn(), memory());
    expect(outbox.queue(id, { ...payload, target_pid: uid }).status).toBe('rejected');
    expect(outbox.queue(id, { ...payload, pct: Infinity }).status).toBe('rejected');
    expect(outbox.queue(id, { ...payload, replay: '🏈'.repeat(20_000) }).status).toBe('rejected');
  });
});
