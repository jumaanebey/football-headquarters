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

// NOTE: no `pid` here. On a first-ever load, anonymous auth has not resolved yet, so
// playerId() hands back a throwaway `p_…` placeholder and only becomes the real auth
// uid once ensureSession() lands. Stamping the pid when the event is QUEUED therefore
// filed session_start under the placeholder and every later event under the uid — the
// same player counted as two, which made the funnel show a 100% drop at step 2 for
// every genuine new player. The pid is now resolved at FLUSH time (≥5s later, after
// auth), so one player is one pid.
interface QueuedEvent { session_id: string; event: string; props: Record<string, unknown>; ts: string }

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_MS = 5000;   // batch window — one insert per 5s of activity, not per event
const MAX_BATCH = 25;    // hard cap so a burst can't build an unbounded body

const postEvents = (rows: QueuedEvent[]): void => {
  if (!URL_ || !ANON || !rows.length) return;
  const url = `${URL_}/rest/v1/fhq_events`;
  const pid = playerId(); // resolved now, not at queue time — see note above
  const body = JSON.stringify(rows.map(r => ({ ...r, pid })));
  try {
    // NOT sendBeacon: PostgREST needs an `application/json` body, which is not a
    // CORS-safelisted content type, so the browser preflights the beacon and drops it —
    // while sendBeacon still returns true (it only reports "queued", never "delivered").
    // That silently swallowed 100% of events. `keepalive` fetch is likewise allowed to
    // outlive the page, and it actually surfaces failures.
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
 * Where this player came from — so a launch post can be judged on players, not clicks.
 * Tag shared links like ?src=reddit and it shows up in the funnel. Falls back to the
 * referring HOST only (never the full URL / query, which can carry personal data).
 */
export const trafficSource = (): { source: string; referrer: string } => {
  try {
    const tagged = new URLSearchParams(location.search).get('src')
      || new URLSearchParams(location.search).get('utm_source');
    const host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
    return {
      source: (tagged || host || 'direct').slice(0, 32),
      referrer: host.slice(0, 64),
    };
  } catch { return { source: 'direct', referrer: '' }; }
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
  queue.push({ session_id: SESSION_ID, event: event.slice(0, 64), props, ts: new Date().toISOString() });
  if (queue.length >= MAX_BATCH) { flush(); return; }
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
};

// Best-effort flush on the way out so we don't lose the session's final events.
if (typeof window !== 'undefined') {
  const bail = () => flush();
  window.addEventListener('pagehide', bail);
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') bail(); });
}
