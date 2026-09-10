// The built worker's runtime behaviour under real-life storage and network conditions, with
// fake globals: first install, partial install failure, cached return, uncached art offline,
// quota/eviction failures, private-mode storage errors, reconnect, and the two-version
// lifecycle (the previous version's caches survive activation until every window is current).
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { ART_CACHE_LIMIT, HISTORY_KEY, META_CACHE } from '../pwa/swPolicy';
import { FakeCacheStorage, loadWorker, quotaError, securityError, windowClient } from './helpers/fakeServiceWorker';

const PRECACHE_V1 = ['/', '/manifest.webmanifest', '/assets/brand/icon-192.png', '/assets/index-AAAA1111.js', '/assets/index-BBBB2222.css'];
const PRECACHE_V2 = ['/', '/manifest.webmanifest', '/assets/brand/icon-192.png', '/assets/index-CCCC3333.js', '/assets/index-DDDD4444.css'];
const HERO = '/assets/heroes/campus/qb.71a1b63d.webp', HERO2 = '/assets/heroes/campus/rb.deadbeef.webp', MASCOT = '/assets/units/mascot.webp';
const text = async (r: Response | 'passthrough') => r === 'passthrough' ? 'passthrough' : await r.text();

afterEach(() => { vi.unstubAllGlobals(); });

describe('service worker runtime', () => {
  it('first install with no prior cache precaches exactly the shell, activates, and serves the shell without the network', async () => {
    const w = await loadWorker({ version: 'v1', precache: PRECACHE_V1 });
    await w.install();
    expect(w.storage.urls('fhq-shell-v1').sort()).toEqual([...PRECACHE_V1].sort());
    await w.activate();
    expect(w.claim).toHaveBeenCalled();
    expect(await w.storage.keys()).toEqual(['fhq-shell-v1', META_CACHE]);
    w.network.requests.length = 0;
    expect(await text(await w.fetch('/assets/index-AAAA1111.js'))).toBe('body of /assets/index-AAAA1111.js');
    expect(w.network.requests).toEqual([]); // served from the shell cache
    expect(await w.fetch('/functions/v1/club-authority', { method: 'POST' })).toBe('passthrough'); // never ours
    expect(await w.fetch('https://x.supabase.co/rest/v1/fhq_events')).toBe('passthrough');
  });
  it('a partial install (one shell file 500) fails atomically and leaves the previous version serving', async () => {
    const w = await loadWorker({ version: 'v2', precache: PRECACHE_V2, scripted: { '/assets/index-CCCC3333.js': () => new Response('deploying', { status: 500 }) } });
    w.storage.seed('fhq-shell-v1', PRECACHE_V1, 'old shell'); w.storage.seed('fhq-art-v1', [HERO], 'old art');
    await expect(w.install()).rejects.toThrow(/addAll/);
    expect(w.storage.urls('fhq-shell-v2')).toEqual([]); // nothing half-written
    expect(w.storage.urls('fhq-shell-v1').length).toBe(PRECACHE_V1.length); // old worker's caches untouched
    expect(w.storage.urls('fhq-art-v1')).toEqual([HERO]);
    expect(w.claim).not.toHaveBeenCalled();
  });
  it('a cached return serves hashed art and the shell offline; a shell file evicted by the browser is refetched and restored', async () => {
    const w = await loadWorker({ version: 'v1', precache: PRECACHE_V1 });
    await w.install(); await w.activate();
    expect((await w.fetch(HERO) as Response).ok).toBe(true); await w.settle();
    expect(w.storage.urls('fhq-art-v1')).toEqual([HERO]);
    w.network.offline = true; w.network.requests.length = 0;
    expect(await text(await w.fetch(HERO))).toBe(`body of ${HERO}`);
    expect(await text(await w.fetch('/', { mode: 'navigate' }))).toBe('body of /'); // navigation falls back to the precached shell
    expect(w.network.requests).toEqual(['/']); // navigation tried the network first, then the cache
    w.network.offline = false;
    (await w.storage.open('fhq-shell-v1')).entries.delete(w.origin + '/assets/index-AAAA1111.js'); // browser eviction
    expect(await text(await w.fetch('/assets/index-AAAA1111.js'))).toBe('body of /assets/index-AAAA1111.js');
    await w.settle();
    expect(w.storage.urls('fhq-shell-v1')).toContain('/assets/index-AAAA1111.js');
  });
  it('uncached art offline fails cleanly (a network-error response, never a thrown handler) so the page keeps its portrait fallback', async () => {
    const w = await loadWorker({ version: 'v1', precache: PRECACHE_V1 });
    await w.install(); await w.activate();
    w.network.offline = true;
    const hashed = await w.fetch(HERO2) as Response, fixed = await w.fetch(MASCOT) as Response, nav = await w.fetch('/', { mode: 'navigate' }) as Response;
    expect(hashed.type).toBe('error'); expect(fixed.type).toBe('error');
    expect(nav.ok).toBe(true); // the shell still renders, the app keeps running
    expect(w.storage.urls('fhq-art-v1')).toEqual([]); // nothing bogus was cached
  });
  it('reconnect: after the connection returns the same request succeeds and is cached for the next offline visit', async () => {
    const w = await loadWorker({ version: 'v1', precache: PRECACHE_V1 });
    await w.install(); await w.activate();
    w.network.offline = true;
    expect((await w.fetch(HERO2) as Response).type).toBe('error');
    w.network.offline = false;
    expect((await w.fetch(HERO2) as Response).ok).toBe(true); await w.settle();
    w.network.offline = true;
    expect(await text(await w.fetch(HERO2))).toBe(`body of ${HERO2}`);
    expect((await w.fetch(MASCOT) as Response).type).toBe('error'); // fixed art never fetched online stays a clean error offline
  });
  it('a cache write that throws QuotaExceededError never changes the response the page receives', async () => {
    const w = await loadWorker({ version: 'v1', precache: PRECACHE_V1 });
    await w.install(); await w.activate();
    w.storage.putError = quotaError();
    const hashed = await w.fetch(HERO) as Response, fixed = await w.fetch(MASCOT) as Response;
    expect(hashed.ok && fixed.ok).toBe(true);
    expect(await hashed.text()).toBe(`body of ${HERO}`); expect(await fixed.text()).toBe(`body of ${MASCOT}`);
    await w.settle();
    expect(w.storage.urls('fhq-art-v1')).toEqual([]); // write failed, quietly
    // A later request still works, and when the quota clears the next write lands.
    w.storage.putError = null;
    expect((await w.fetch(HERO) as Response).ok).toBe(true); await w.settle();
    expect(w.storage.urls('fhq-art-v1')).toEqual([HERO]);
  });
  it('private mode / storage errors: caches.open and caches.match throwing still leaves network play working', async () => {
    const w = await loadWorker({ version: 'v1', precache: PRECACHE_V1 });
    await w.install(); await w.activate();
    w.storage.openError = securityError(); w.storage.matchError = securityError();
    expect(await text(await w.fetch('/assets/index-AAAA1111.js'))).toBe('body of /assets/index-AAAA1111.js');
    expect(await text(await w.fetch(HERO))).toBe(`body of ${HERO}`);
    expect(await text(await w.fetch(MASCOT))).toBe(`body of ${MASCOT}`);
    expect(await text(await w.fetch('/', { mode: 'navigate' }))).toBe('body of /');
    w.network.offline = true;
    expect((await w.fetch('/', { mode: 'navigate' }) as Response).type).toBe('error'); // nothing to fall back to, but no exception either
    await expect(w.message({ type: 'CLIENT_HELLO', bundle: '/assets/index-AAAA1111.js' }, windowClient('a'))).resolves.toBeUndefined();
    await expect(w.activate()).resolves.toBeUndefined(); // storage failure does not block activation
  });
  it('bounds the runtime cache: the oldest entries are evicted beyond the limit', async () => {
    const w = await loadWorker({ version: 'v1', precache: PRECACHE_V1 });
    await w.install(); await w.activate();
    for (let i = 0; i < ART_CACHE_LIMIT + 2; i++) { await w.fetch(`/assets/heroes/campus/h${i}.0000000${i % 10}.webp`); await w.settle(); }
    const urls = w.storage.urls('fhq-art-v1');
    expect(urls.length).toBe(ART_CACHE_LIMIT);
    expect(urls[0]).toContain('/h2.');
  });
  it('replies with its version over a port, clears the art cache on request, and ignores unknown messages', async () => {
    const w = await loadWorker({ version: 'v1', precache: PRECACHE_V1 });
    await w.install(); await w.activate();
    const port = { postMessage: vi.fn() } as unknown as MessagePort;
    await w.message({ type: 'GET_VERSION' }, null, [port]);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'VERSION', version: 'v1' });
    const client = windowClient('a');
    await w.message({ type: 'GET_VERSION' }, client);
    expect(client.postMessage).toHaveBeenCalledWith({ type: 'VERSION', version: 'v1' });
    await w.fetch(HERO); await w.settle();
    await w.message({ type: 'CLEAR_ART_CACHE' });
    expect(await w.storage.has('fhq-art-v1')).toBe(false);
    await w.message({ type: 'DELETE_EVERYTHING' }); await w.message(null);
    expect(w.skipWaiting).not.toHaveBeenCalled();
    await w.message({ type: 'SKIP_WAITING' });
    expect(w.skipWaiting).toHaveBeenCalled();
  });
});

describe('service worker lifecycle across versions', () => {
  const twoVersions = async () => {
    const v1 = await loadWorker({ version: 'v1', precache: PRECACHE_V1 });
    await v1.install(); await v1.activate();
    await v1.fetch(HERO); await v1.settle();
    // Older leftovers from a version before v1, and a cache that is not ours.
    v1.storage.seed('fhq-shell-v0', ['/'], 'ancient'); v1.storage.seed('other-app', ['/x'], 'not ours');
    const v2 = await loadWorker({ version: 'v2', precache: PRECACHE_V2, storage: v1.storage });
    await v2.install(); await v2.activate();
    return v2;
  };
  it('activation keeps the previous version\'s caches (open tabs still run that bundle) and deletes older ones', async () => {
    const w = await twoVersions();
    const names = (await w.storage.keys()).sort();
    expect(names).toEqual(['fhq-art-v1', 'fhq-meta', 'fhq-shell-v1', 'fhq-shell-v2', 'other-app']);
    const history = await (await (await w.storage.open(META_CACHE)).match(HISTORY_KEY))!.json();
    expect(history).toEqual(['v1', 'v2']);
    // The old tab's hashed asset, requested through the NEW worker, is still answered from the old cache — even offline.
    w.network.offline = true;
    expect(await text(await w.fetch(HERO))).toBe(`body of ${HERO}`);
    expect(await text(await w.fetch('/assets/index-AAAA1111.js'))).toBe('body of /assets/index-AAAA1111.js');
  });
  it('removes the previous version only when every open window reports the current bundle', async () => {
    const w = await twoVersions();
    const oldTab = windowClient('old'), newTab = windowClient('new');
    w.windows.push(oldTab, newTab);
    await w.message({ type: 'CLIENT_HELLO', bundle: '/assets/index-CCCC3333.js' }, newTab);
    expect(await w.storage.has('fhq-shell-v1')).toBe(true); // the old tab has not said what it runs: keep
    await w.message({ type: 'CLIENT_HELLO', bundle: '/assets/index-AAAA1111.js' }, oldTab);
    expect(await w.storage.has('fhq-shell-v1')).toBe(true); // it runs the old bundle: keep
    w.windows.splice(w.windows.indexOf(oldTab), 1); // old tab closed
    await w.message({ type: 'CLIENT_HELLO', bundle: '/assets/index-CCCC3333.js' }, newTab);
    expect((await w.storage.keys()).sort()).toEqual(['fhq-meta', 'fhq-shell-v2', 'other-app']);
    // The old tab reloaded onto the new bundle also counts as current.
    w.windows.push(oldTab);
    w.storage.seed('fhq-shell-v1', ['/'], 'stale again');
    await w.message({ type: 'CLIENT_HELLO', bundle: '/assets/index-CCCC3333.js' }, oldTab);
    expect(await w.storage.has('fhq-shell-v1')).toBe(false);
  });
  it('a hello without a source or with a non-string bundle is treated as an unknown (old) window', async () => {
    const w = await twoVersions();
    const tab = windowClient('t'); w.windows.push(tab);
    await w.message({ type: 'CLIENT_HELLO', bundle: null }, tab);
    expect(await w.storage.has('fhq-shell-v1')).toBe(true);
    await w.message({ type: 'CLIENT_HELLO', bundle: '/assets/index-CCCC3333.js' }, null);
    expect(await w.storage.has('fhq-shell-v1')).toBe(true);
  });
  it('a third version keeps only the second: storage cannot grow without bound', async () => {
    const w2 = await twoVersions();
    const w3 = await loadWorker({ version: 'v3', precache: ['/', '/assets/index-EEEE5555.js'], storage: w2.storage });
    await w3.install(); await w3.activate();
    expect((await w3.storage.keys()).sort()).toEqual(['fhq-meta', 'fhq-shell-v2', 'fhq-shell-v3', 'other-app']);
  });
  it('a brand-new storage (history lost) still activates and keeps whatever other version is present', async () => {
    const storage = new FakeCacheStorage('https://football-headquarters.test', async () => new Response('x'));
    storage.seed('fhq-shell-v1', ['/'], 'old');
    const w = await loadWorker({ version: 'v2', precache: PRECACHE_V2, storage });
    await w.install(); await w.activate();
    expect((await w.storage.keys()).sort()).toEqual(['fhq-meta', 'fhq-shell-v1', 'fhq-shell-v2']);
  });
});
