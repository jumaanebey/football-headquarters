// Service-worker caching policy as pure functions, so the rules that decide what may be cached
// are unit-tested outside a worker. Ownership: the worker owns exactly two caches per version —
// `fhq-shell-<v>` (the precached app shell: HTML, the fingerprinted bundle, manifest, icons) and
// `fhq-art-<v>` (runtime-cached art the current journey actually requested, bounded). Everything
// else — the club server, auth, analytics, any cross-origin request, any non-GET — is never
// cached: rewards, reservations, replay permissions and account data always come from the network.
export type FetchClass = 'shell' | 'immutable-asset' | 'art' | 'navigation' | 'network-only';

export const CACHE_PREFIX = 'fhq-';
export const shellCache = (version: string) => `${CACHE_PREFIX}shell-${version}`;
export const artCache = (version: string) => `${CACHE_PREFIX}art-${version}`;
/** Bound on runtime-cached art entries; oldest entries go first. A full hero library never fits by design. */
export const ART_CACHE_LIMIT = 80;

const FINGERPRINTED = /^\/assets\/.+\.[0-9a-f]{8}\.(?:webp|png|jpe?g|avif|gif)$/;
const BUNDLE = /^\/assets\/index-[^/]+\.(?:js|css)$/;
const ART = /^\/assets\/.+\.(?:webp|png|jpe?g|avif|gif|svg)$/;
const NEVER = [/^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/asset-manifest\.json$/, /^\/functions\//, /^\/rest\//, /^\/auth\//];

export function classify(input: { url: string; method: string; mode?: string; origin: string; precached: Set<string> }): FetchClass {
  if (input.method !== 'GET') return 'network-only';
  let url: URL;
  try { url = new URL(input.url); } catch { return 'network-only'; }
  if (url.origin !== input.origin) return 'network-only'; // club server, auth, analytics, fonts: never ours to cache
  const path = url.pathname;
  if (NEVER.some(re => re.test(path))) return 'network-only';
  if (input.mode === 'navigate') return 'navigation';
  if (input.precached.has(path)) return 'shell';
  if (FINGERPRINTED.test(path) || BUNDLE.test(path)) return 'immutable-asset';
  if (ART.test(path)) return 'art';
  return 'network-only';
}

/** Caches from older versions that this worker should delete on activate. */
export const staleCaches = (names: string[], version: string): string[] => names.filter(n => n.startsWith(CACHE_PREFIX) && n !== shellCache(version) && n !== artCache(version));

/** Keys to evict so the art cache stays within its bound (oldest first; callers pass keys in insertion order). */
export const artEvictions = (keys: string[], limit = ART_CACHE_LIMIT): string[] => keys.length > limit ? keys.slice(0, keys.length - limit) : [];

/** Messages the page may send. Anything else is ignored. */
export type SwMessage = { type: 'SKIP_WAITING' } | { type: 'CLEAR_ART_CACHE' };
export const isSwMessage = (m: unknown): m is SwMessage => !!m && typeof m === 'object' && ['SKIP_WAITING', 'CLEAR_ART_CACHE'].includes(String((m as { type?: unknown }).type));
