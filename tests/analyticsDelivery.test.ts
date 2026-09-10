// Item 18: analytics delivery verified against a test sink (production `fhq_events` inserts are
// not inspectable from tests). Events for one session reach the sink once, in the order they
// happened, stamped with one player id; batches are bounded; the body carries no session
// tokens; and with no destination configured nothing is sent at all. There is no retry in
// analytics.ts (fire-and-forget), so the only retry-induced duplicates possible are callers
// re-tracking on a duplicate authority confirmation — covered by the twin-tap ledger test in
// tests/authorityRecovery.test.ts and the `duplicate` guards in App.tsx protectedAction/finish.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const values = new Map<string, string>();
const ACCESS = 'eyJhbGciOiJIUzI1NiJ9.ACCESS-TOKEN-SECRET.sig';
const REFRESH = 'refresh-token-secret-value';
const uid = '7e275a6a-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); values.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
  vi.stubGlobal('location', { search: '?src=reddit' });
  vi.stubGlobal('document', { referrer: 'https://www.example.org/thread?user=someone', visibilityState: 'visible' });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const configured = () => { vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key'); };
const sink = () => { const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetch); return fetch; };
const rows = (fetch: ReturnType<typeof vi.fn>, call = 0) => JSON.parse(fetch.mock.calls[call][1].body as string) as Array<{ event: string; pid: string; session_id: string; props: Record<string, unknown>; ts: string }>;

describe('analytics delivery to a test sink', () => {
  it('delivers the tutorial → match start → settlement → upgrade sequence once, in order, under one player id, without tokens', async () => {
    configured(); const fetch = sink();
    values.set('fhq_session_v1', JSON.stringify({ access_token: ACCESS, refresh_token: REFRESH, uid, expires_at: Math.floor(Date.now() / 1000) + 3600 }));
    const { track, trafficSource } = await import('../analytics');
    track('session_start', { trophies: 0, returning: false, ...trafficSource() });
    track('club_created', { startRaid: false, nameLen: 12 });
    track('tutorial_choice', { stormFirst: false });
    track('authority_enable', { origin: 'tutorial', ok: true });
    track('campaign_start', { stage: 1 });
    track('battle_result', { mode: 'attack', won: true, stars: 3, pct: 100, campaign: true, protected: true });
    track('battle_confirmed', { mode: 'attack', won: true });
    track('building_upgrade', { type: 'STADIUM', toLevel: 2, protected: true });
    expect(fetch).not.toHaveBeenCalled(); // batched, not per event
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://test.supabase.co/rest/v1/fhq_events');
    expect(init.method).toBe('POST'); expect(init.keepalive).toBe(true);
    expect(init.headers.Authorization).toBe('Bearer public-anon-key'); // the public key, never the session
    const delivered = rows(fetch);
    expect(delivered.map(r => r.event)).toEqual(['session_start', 'club_created', 'tutorial_choice', 'authority_enable', 'campaign_start', 'battle_result', 'battle_confirmed', 'building_upgrade']);
    expect(new Set(delivered.map(r => r.pid))).toEqual(new Set([uid]));
    expect(new Set(delivered.map(r => r.session_id)).size).toBe(1);
    expect(delivered.every((r, i, all) => i === 0 || r.ts >= all[i - 1].ts)).toBe(true);
    expect(delivered[0].props).toEqual({ trophies: 0, returning: false, source: 'reddit', referrer: 'example.org' }); // host only, never the referrer path/query
    const body = init.body as string;
    for (const forbidden of [ACCESS, REFRESH, 'access_token', 'refresh_token', 'someone', 'thread?user']) expect(body, forbidden).not.toContain(forbidden);
    // Nothing is re-sent later: the queue was drained by the flush.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('a burst is capped at one bounded batch per 25 events and never duplicates across batches', async () => {
    configured(); const fetch = sink();
    const { track } = await import('../analytics');
    for (let i = 0; i < 30; i++) track(`e${i}`, { i });
    expect(fetch).toHaveBeenCalledTimes(1); // the 25th event flushed immediately
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(2);
    const all = [...rows(fetch, 0), ...rows(fetch, 1)].map(r => r.event);
    expect(rows(fetch, 0)).toHaveLength(25);
    expect(all).toEqual(Array.from({ length: 30 }, (_, i) => `e${i}`));
    expect(new Set(all).size).toBe(30);
  });
  it('a sink failure is swallowed and the failed batch is not retried (no duplicate delivery, no gameplay error)', async () => {
    configured();
    const fetch = vi.fn().mockRejectedValue(new Error('network down')); vi.stubGlobal('fetch', fetch);
    const { track } = await import('../analytics');
    track('daily_claim', { id: 'q1' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('with no destination configured nothing is queued or sent', async () => {
    const fetch = sink();
    const { track } = await import('../analytics');
    track('session_start', {});
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).not.toHaveBeenCalled();
  });
});
