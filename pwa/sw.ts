// Service worker source. Built by build/serviceWorker.ts into dist/sw.js with __SW_VERSION__ and
// __PRECACHE__ substituted (the version is a hash of the precache list, so a new build always
// installs a new worker and an unchanged build never does). Rules live in pwa/swPolicy.ts.
/// <reference lib="webworker" />
import { artCache, artEvictions, classify, isSwMessage, shellCache, staleCaches } from './swPolicy';

declare const __SW_VERSION__: string;
declare const __PRECACHE__: string[];
declare const self: ServiceWorkerGlobalScope;

const VERSION = __SW_VERSION__;
const PRECACHE = new Set(__PRECACHE__);
const SHELL = shellCache(VERSION), ART = artCache(VERSION);

self.addEventListener('install', event => {
  // Precache the shell only; a failed shell fetch fails the install so an old worker keeps serving.
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll([...PRECACHE])));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of staleCaches(await caches.keys(), VERSION)) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (!isSwMessage(event.data)) return;
  if (event.data.type === 'SKIP_WAITING') void self.skipWaiting();
  if (event.data.type === 'CLEAR_ART_CACHE') event.waitUntil(caches.delete(ART));
});

const putBounded = async (request: Request, response: Response) => {
  const cache = await caches.open(ART);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (const stale of artEvictions(keys.map(k => k.url))) await cache.delete(stale);
};

self.addEventListener('fetch', event => {
  const kind = classify({ url: event.request.url, method: event.request.method, mode: event.request.mode, origin: self.location.origin, precached: PRECACHE });
  if (kind === 'network-only') return; // browser default: straight to the network
  if (kind === 'navigation') {
    // Network first so a deploy is picked up on the next visit; the precached shell answers offline.
    event.respondWith(fetch(event.request).catch(async () => (await caches.match('/', { ignoreVary: true })) ?? Response.error()));
    return;
  }
  if (kind === 'shell' || kind === 'immutable-asset') {
    event.respondWith((async () => {
      // Static files: ignore Vary so a CORS-mode module request matches the plain precache entry.
      const hit = await caches.match(event.request, { ignoreVary: true });
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok && kind === 'immutable-asset') void putBounded(event.request, response.clone());
      return response;
    })());
    return;
  }
  // Fixed-URL art: stale-while-revalidate keeps the campus usable offline and fresh online.
  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreVary: true });
    const refresh = fetch(event.request).then(response => { if (response.ok) void putBounded(event.request, response.clone()); return response; }).catch(() => undefined);
    return cached ?? (await refresh) ?? Response.error();
  })());
});
