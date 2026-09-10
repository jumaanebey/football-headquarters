// Service-worker caching policy as pure functions, so the rules that decide what may be cached
// are unit-tested outside a worker. Ownership: the worker owns two caches per version —
// `fhq-shell-<v>` (the precached app shell: HTML, the fingerprinted bundle, manifest, icons) and
// `fhq-art-<v>` (runtime-cached fingerprinted assets and art the current journey actually
// requested, bounded) — plus one tiny `fhq-meta` cache holding the version history. Everything
// else — the club server, auth, analytics, any cross-origin request, any non-GET — is never
// cached: rewards, reservations, replay permissions and account data always come from the network.
//
// Lifecycle: a newly activated worker takes over every open tab, including tabs still running
// the previous bundle. Deleting the previous version's caches at that moment would break those
// tabs' lazy asset loads (a hashed URL the new deploy no longer ships), so activation keeps the
// immediately preceding version and deletes only older ones; the previous version is removed once
// every open window has reported (CLIENT_HELLO) that it runs the current bundle.
export type FetchClass = 'shell' | 'immutable-asset' | 'art' | 'navigation' | 'network-only';

export const CACHE_PREFIX = 'fhq-';
export const META_CACHE = `${CACHE_PREFIX}meta`;
export const HISTORY_KEY = '/__fhq/version-history';
export const shellCache = (version: string) => `${CACHE_PREFIX}shell-${version}`;
export const artCache = (version: string) => `${CACHE_PREFIX}art-${version}`;
/** Bound on runtime-cached art entries; oldest entries go first. A full hero library never fits by design. */
export const ART_CACHE_LIMIT = 80;
/** How many versions the history remembers (current + two before). */
export const HISTORY_LIMIT = 3;

const FINGERPRINTED = /^\/assets\/.+\.[0-9a-f]{8}\.(?:webp|png|jpe?g|avif|gif)$/;
const BUNDLE = /^\/assets\/index-[^/]+\.(?:js|css)$/;
/** Vite code-split chunks (`CampusEditor-4hCeemTl.js`): content-hashed, so cache-first like the bundle. */
const CHUNK = /^\/assets\/[A-Za-z0-9_.]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
const ART = /^\/assets\/.+\.(?:webp|png|jpe?g|avif|gif|svg)$/;
const NEVER = [/^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/asset-manifest\.json$/, /^\/sw-version\.json$/, /^\/functions\//, /^\/rest\//, /^\/auth\//];

export function classify(input: { url: string; method: string; mode?: string; origin: string; precached: Set<string> }): FetchClass {
  if (input.method !== 'GET') return 'network-only';
  let url: URL;
  try { url = new URL(input.url); } catch { return 'network-only'; }
  if (url.origin !== input.origin) return 'network-only'; // club server, auth, analytics, fonts: never ours to cache
  const path = url.pathname;
  if (NEVER.some(re => re.test(path))) return 'network-only';
  if (input.mode === 'navigate') return 'navigation';
  if (input.precached.has(path)) return 'shell';
  if (FINGERPRINTED.test(path) || BUNDLE.test(path) || CHUNK.test(path)) return 'immutable-asset';
  if (ART.test(path)) return 'art';
  return 'network-only';
}

export const cachesForVersion = (version: string): string[] => [shellCache(version), artCache(version)];
/** Caches from other versions that this worker may delete: every `fhq-*` cache except the meta cache, this version's and any version in `keep`. */
export function staleCaches(names: string[], version: string, keep: string[] = []): string[] {
  const retained = new Set([META_CACHE, ...cachesForVersion(version), ...keep.flatMap(cachesForVersion)]);
  return names.filter(n => n.startsWith(CACHE_PREFIX) && !retained.has(n));
}

/** Append this version to the recorded history (deduplicated, newest last, bounded). */
export function versionHistory(previous: unknown, version: string): string[] {
  const list = Array.isArray(previous) ? previous.filter((v): v is string => typeof v === 'string' && v !== version) : [];
  return [...list, version].slice(-HISTORY_LIMIT);
}
/**
 * Caches to delete when this version activates: everything older than the version activated
 * immediately before this one. With no recorded predecessor (first install, or the history was
 * lost) nothing is deleted now — the order of the other versions is unknown, so they are left to
 * the hello-driven cleanup that runs once every window is current.
 */
export function activationDeletions(names: string[], version: string, history: string[]): string[] {
  const i = history.indexOf(version);
  if (i <= 0) return [];
  return staleCaches(names, version, [history[i - 1]]);
}
/** A page is current when the bundle it reported is one of this worker's precached bundle files. */
export const isCurrentBundle = (bundle: unknown, precached: Set<string>): boolean => typeof bundle === 'string' && precached.has(bundle);
/** Old-version caches may go only when every open window is known to run the current bundle (unknown = keep). */
export const clientsAllCurrent = (reports: unknown[], precached: Set<string>): boolean => reports.every(b => isCurrentBundle(b, precached));

/** Keys to evict so the art cache stays within its bound (oldest first; callers pass keys in insertion order). */
export const artEvictions = (keys: string[], limit = ART_CACHE_LIMIT): string[] => keys.length > limit ? keys.slice(0, keys.length - limit) : [];

/** Messages the page may send. Anything else is ignored. */
export type SwMessage = { type: 'SKIP_WAITING' } | { type: 'CLEAR_ART_CACHE' } | { type: 'CLIENT_HELLO'; bundle: string | null } | { type: 'GET_VERSION' };
const MESSAGE_TYPES = ['SKIP_WAITING', 'CLEAR_ART_CACHE', 'CLIENT_HELLO', 'GET_VERSION'];
export const isSwMessage = (m: unknown): m is SwMessage => !!m && typeof m === 'object' && MESSAGE_TYPES.includes(String((m as { type?: unknown }).type));
