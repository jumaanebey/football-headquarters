// Service worker source. Built by build/serviceWorker.ts into dist/sw.js with __SW_VERSION__ and
// __PRECACHE__ substituted (the version is a hash of the precache list, so a new build always
// installs a new worker and an unchanged build never does). Rules live in pwa/swPolicy.ts.
//
// Hardening rules (tests/swRuntime.test.ts): a cache write that fails (quota, private mode,
// storage errors) never changes the response the page receives; a cache read that throws is a
// miss; an uncached request offline answers a clean network error the page already handles
// (portrait fallback, retry on `online`); the install fails atomically when any shell file is
// unavailable so the previous worker keeps serving.
/// <reference lib="webworker" />
import { activationDeletions, artCache, artEvictions, classify, clientsAllCurrent, HISTORY_KEY, isSwMessage, META_CACHE, shellCache, staleCaches, versionHistory } from './swPolicy';

declare const __SW_VERSION__: string;
declare const __PRECACHE__: string[];
declare const self: ServiceWorkerGlobalScope;

const VERSION = __SW_VERSION__;
const PRECACHE = new Set(__PRECACHE__);
const SHELL = shellCache(VERSION), ART = artCache(VERSION);
/** Which bundle each open window reported (CLIENT_HELLO); unknown windows are treated as old. */
const clientBundles = new Map<string, string | null>();

const readHistory = async (): Promise<string[]> => {
  try { const hit = await (await caches.open(META_CACHE)).match(HISTORY_KEY); return hit ? await hit.json() : []; } catch { return []; }
};
const writeHistory = async (history: string[]): Promise<void> => {
  try { await (await caches.open(META_CACHE)).put(HISTORY_KEY, new Response(JSON.stringify(history), { headers: { 'content-type': 'application/json' } })); } catch { /* history is advisory */ }
};
const deleteCaches = async (names: string[]) => { for (const name of names) { try { await caches.delete(name); } catch { /* best effort */ } } };

self.addEventListener('install', event => {
  // Precache the shell only; addAll is atomic, so one failed shell fetch fails the whole install and the old worker keeps serving.
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll([...PRECACHE])));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const history = versionHistory(await readHistory(), VERSION);
      await writeHistory(history);
      // Keep the previous version's caches: tabs still running that bundle are about to be claimed by this worker.
      await deleteCaches(activationDeletions(await caches.keys(), VERSION, history));
    } catch { /* a storage failure must not block activation */ }
    await self.clients.claim();
  })());
});

/** Delete every older version's caches once no open window depends on them. */
const cleanupWhenAllCurrent = async (): Promise<boolean> => {
  try {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!clientsAllCurrent(windows.map(w => clientBundles.get(w.id)), PRECACHE)) return false;
    await deleteCaches(staleCaches(await caches.keys(), VERSION));
    return true;
  } catch { return false; }
};

self.addEventListener('message', event => {
  if (!isSwMessage(event.data)) return;
  const message = event.data;
  if (message.type === 'SKIP_WAITING') void self.skipWaiting();
  if (message.type === 'CLEAR_ART_CACHE') event.waitUntil(deleteCaches([ART]));
  if (message.type === 'GET_VERSION') { const reply = { type: 'VERSION', version: VERSION }; if (event.ports[0]) event.ports[0].postMessage(reply); else (event.source as Client | null)?.postMessage(reply); }
  if (message.type === 'CLIENT_HELLO') {
    const source = event.source as Client | null;
    if (source?.id) clientBundles.set(source.id, typeof message.bundle === 'string' ? message.bundle : null);
    event.waitUntil(cleanupWhenAllCurrent());
  }
});

/** Store a copy in a cache; any failure (quota, private mode, closed cache) is swallowed — the page already has its response. */
const putSafely = async (cacheName: string, request: Request, response: Response, bounded: boolean): Promise<boolean> => {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
    if (bounded) { const keys = await cache.keys(); for (const stale of artEvictions(keys.map(k => k.url))) await cache.delete(stale); }
    return true;
  } catch { return false; }
};
/** A cache read that throws (storage disabled, private mode quirks) is a miss, never an error. */
const matchSafely = async (request: Request | string): Promise<Response | undefined> => {
  try { return await caches.match(request, { ignoreVary: true }); } catch { return undefined; }
};
const networkError = () => { try { return Response.error(); } catch { return new Response(null, { status: 503, statusText: 'offline' }); } };

self.addEventListener('fetch', event => {
  const kind = classify({ url: event.request.url, method: event.request.method, mode: event.request.mode, origin: self.location.origin, precached: PRECACHE });
  if (kind === 'network-only') return; // browser default: straight to the network
  if (kind === 'navigation') {
    // Network first so a deploy is picked up on the next visit; the precached shell answers offline.
    event.respondWith(fetch(event.request).catch(async () => (await matchSafely('/')) ?? networkError()));
    return;
  }
  if (kind === 'shell' || kind === 'immutable-asset') {
    event.respondWith((async () => {
      // Static files: ignore Vary so a CORS-mode module request matches the plain precache entry.
      const hit = await matchSafely(event.request);
      if (hit) return hit;
      let response: Response;
      try { response = await fetch(event.request); } catch { return networkError(); }
      // A shell file missing from its cache (browser eviction) is restored; hashed assets are cached bounded.
      if (response.ok) void putSafely(kind === 'shell' ? SHELL : ART, event.request, response.clone(), kind !== 'shell');
      return response;
    })());
    return;
  }
  // Fixed-URL art: stale-while-revalidate keeps the campus usable offline and fresh online.
  event.respondWith((async () => {
    const cached = await matchSafely(event.request);
    const refresh = fetch(event.request).then(response => { if (response.ok) void putSafely(ART, event.request, response.clone(), true); return response; }).catch(() => undefined);
    return cached ?? (await refresh) ?? networkError();
  })());
});
