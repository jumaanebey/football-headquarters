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
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll([...PRECACHE])).catch(async error => { await caches.delete(SHELL).catch(() => false); throw error; }));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try { for (const name of staleCaches(await caches.keys(), VERSION, 2)) await caches.delete(name); } catch { /* Storage restrictions must not prevent activation. */ }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (!isSwMessage(event.data)) return;
  if (event.data.type === 'SKIP_WAITING') void self.skipWaiting();
  if (event.data.type === 'CLEAR_ART_CACHE') event.waitUntil(caches.delete(ART));
});

const matchCached = async (request: Request | string) => {
  try {
    for (const name of [SHELL,ART]) {const hit=await (await caches.open(name)).match(request,{ignoreVary:true});if(hit)return hit;}
    return await caches.match(request, {ignoreVary:true});
  } catch { return undefined; }
};
const putBounded = async (request: Request, response: Response) => {
  try {
  const cache = await caches.open(ART);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (const stale of artEvictions(keys.map(k => k.url))) await cache.delete(stale);
  } catch { /* Quota/private-mode failures must never reject a successful network response. */ }
};

self.addEventListener('fetch', event => {
  const kind = classify({ url: event.request.url, method: event.request.method, mode: event.request.mode, origin: self.location.origin, precached: PRECACHE });
  if (kind === 'network-only') return;
  const background: Promise<unknown>[]=[];
  const response=(async () => {
    if (kind === 'navigation') {
      try {return await fetch(event.request);} catch {
        try {return (await (await caches.open(SHELL)).match('/', {ignoreVary:true})) ?? Response.error();}catch{return Response.error();}
      }
    }
    const cached=await matchCached(event.request);
    if (kind === 'shell' || kind === 'immutable-asset') {
      if (cached) return cached;
      const response=await fetch(event.request);
      if(response.ok && kind==='immutable-asset') background.push(putBounded(event.request,response.clone()));
      return response;
    }
    const refresh=fetch(event.request).then(async response=>{
      if(response.ok) await putBounded(event.request,response.clone());
      return response;
    }).catch(()=>undefined);
    background.push(refresh);
    return cached ?? (await refresh) ?? Response.error();
  })();
  event.respondWith(response);
  // Register lifetime extension synchronously, including refreshes after a cached response.
  event.waitUntil(response.then(()=>Promise.all(background)).catch(()=>undefined));
});
