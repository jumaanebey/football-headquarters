// --- PRODUCT ANALYTICS: privacy-light, self-hosted on the Supabase we already run. ---
// You can't market what you can't measure. This records anonymous funnel events
// (club created → first raid → retention) so we can see where coaches drop off and
// which systems get used. NO PII: just the existing anonymous device pid, a per-load
// session id, an event name, and a small JSON props bag. Same graceful-no-op contract
// as pvp.ts — every call is inert until the VITE_ env vars are set, and any failure is
// swallowed so instrumentation can never break gameplay.

import { pvpEnabled, playerId } from './pvp';

const env = (import.meta as any).env || {};
const URL_ = env.VITE_SUPABASE_URL as string | undefined;
const ANON = env.VITE_SUPABASE_ANON_KEY as string | undefined;
const DEV = !!env.DEV;

// A random id for THIS page load — lets us stitch a single play session together
// without any cross-session tracking. Regenerated every reload; never persisted.
const SESSION_ID = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

interface QueuedEvent { pid: string; session_id: string; event: string; props: Record<string, unknown>; ts: string }

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_MS = 5000;   // batch window — one insert per 5s of activity, not per event
const MAX_BATCH = 25;    // hard cap so a burst can't build an unbounded body

const postEvents = (rows: QueuedEvent[]): void => {
  if (!URL_ || !ANON || !rows.length) return;
  const url = `${URL_}/rest/v1/fhq_events`;
  const body = JSON.stringify(rows);
  try {
    // sendBeacon survives tab-close (the moment we most want the session's tail).
    // It can't set an apikey header, so we pass it as a query param (PostgREST accepts it).
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(`${url}?apikey=${ANON}`, new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }
    // Fallback: keepalive fetch (also allowed during unload).
    fetch(url, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ });
  } catch { /* never let telemetry throw into gameplay */ }
};

const flush = (): void => {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!queue.length) return;
  postEvents(queue.splice(0, queue.length));
};

/**
 * Record an anonymous product event. No-op unless Supabase is configured.
 * Keep `props` small and non-identifying (counts, tiers, booleans — never names/emails).
 */
export const track = (event: string, props: Record<string, unknown> = {}): void => {
  if (!pvpEnabled()) {
    if (DEV) console.debug('[analytics:noop]', event, props); // eslint-disable-line no-console
    return;
  }
  queue.push({ pid: playerId(), session_id: SESSION_ID, event: event.slice(0, 64), props, ts: new Date().toISOString() });
  if (queue.length >= MAX_BATCH) { flush(); return; }
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
};

// Best-effort flush on the way out so we don't lose the session's final events.
if (typeof window !== 'undefined') {
  const bail = () => flush();
  window.addEventListener('pagehide', bail);
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') bail(); });
}
