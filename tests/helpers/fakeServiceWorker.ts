// A small in-memory ServiceWorkerGlobalScope + CacheStorage so pwa/sw.ts can be exercised in
// vitest: install/activate/fetch/message events are dispatched by hand, `fetch` is scripted per
// URL, and failures (quota on put, storage errors on open, offline) are switchable per test.
import { vi } from 'vitest';

export type Scripted = Record<string, () => Response | Promise<Response>>;
export interface FakeRequest { url: string; method: string; mode?: string }
const urlOf = (r: FakeRequest | Request | string, origin = ""): string => { const u = typeof r === "string" ? r : r.url; return u.startsWith("http") ? u : origin + u; };

export class FakeCache {
  entries = new Map<string, Response>();
  constructor(private store: FakeCacheStorage) {}
  async match(r: FakeRequest | Request | string): Promise<Response | undefined> { if (this.store.matchError) throw this.store.matchError; const hit = this.entries.get(urlOf(r, this.store.origin)); return hit ? hit.clone() : undefined; }
  async put(r: FakeRequest | Request | string, response: Response): Promise<void> { if (this.store.putError) throw this.store.putError; this.entries.set(urlOf(r, this.store.origin), response); }
  async addAll(urls: string[]): Promise<void> {
    const responses = await Promise.all(urls.map(u => this.store.fetch({ url: this.store.origin + u, method: 'GET' })));
    if (responses.some(r => !r.ok)) throw new TypeError('addAll: a request failed'); // atomic, like the browser
    urls.forEach((u, i) => this.entries.set(this.store.origin + u, responses[i]));
  }
  async keys(): Promise<Array<{ url: string }>> { return [...this.entries.keys()].map(url => ({ url })); }
  async delete(r: FakeRequest | Request | string): Promise<boolean> { return this.entries.delete(urlOf(r, this.store.origin)); }
}
export class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  putError: Error | null = null; openError: Error | null = null; matchError: Error | null = null;
  constructor(public origin: string, public fetch: (r: FakeRequest) => Promise<Response>) {}
  async open(name: string): Promise<FakeCache> { if (this.openError) throw this.openError; let c = this.caches.get(name); if (!c) { c = new FakeCache(this); this.caches.set(name, c); } return c; }
  async keys(): Promise<string[]> { if (this.openError) throw this.openError; return [...this.caches.keys()]; }
  async delete(name: string): Promise<boolean> { return this.caches.delete(name); }
  async has(name: string): Promise<boolean> { return this.caches.has(name); }
  async match(r: FakeRequest | Request | string): Promise<Response | undefined> { if (this.openError) throw this.openError; for (const c of this.caches.values()) { const hit = await c.match(r); if (hit) return hit; } return undefined; }
  urls(name: string): string[] { return [...(this.caches.get(name)?.entries.keys() ?? [])].map(u => new URL(u).pathname); }
  seed(name: string, paths: string[], body = 'seeded'): void { const c = new FakeCache(this); for (const p of paths) c.entries.set(this.origin + p, new Response(body)); this.caches.set(name, c); }
}

export interface FakeWindowClient { id: string; url: string; postMessage: ReturnType<typeof vi.fn> }
export interface WorkerHarness {
  origin: string; storage: FakeCacheStorage; windows: FakeWindowClient[];
  network: { offline: boolean; scripted: Scripted; requests: string[] };
  claim: ReturnType<typeof vi.fn>; skipWaiting: ReturnType<typeof vi.fn>;
  install(): Promise<void>; activate(): Promise<void>;
  /** Dispatch a fetch event; resolves to the response or 'passthrough' when the worker did not respond. */
  fetch(path: string, init?: Partial<FakeRequest>): Promise<Response | 'passthrough'>;
  message(data: unknown, source?: FakeWindowClient | null, ports?: MessagePort[]): Promise<void>;
  /** Let queued cache writes settle. */
  settle(): Promise<void>;
}

const DEFAULT_ORIGIN = 'https://football-headquarters.test';
export async function loadWorker(options: { version: string; precache: string[]; origin?: string; storage?: FakeCacheStorage; scripted?: Scripted }): Promise<WorkerHarness> {
  const origin = options.origin ?? DEFAULT_ORIGIN;
  const network = { offline: false, scripted: options.scripted ?? {}, requests: [] as string[] };
  const fetchImpl = async (r: FakeRequest | Request | string): Promise<Response> => {
    const url = urlOf(r); const path = new URL(url).pathname; network.requests.push(path);
    if (network.offline) throw new TypeError('Failed to fetch');
    const script = network.scripted[path];
    return script ? await script() : new Response(`body of ${path}`, { status: 200, headers: { 'content-type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.webp') ? 'image/webp' : 'text/html' } });
  };
  const storage = options.storage ?? new FakeCacheStorage(origin, fetchImpl);
  storage.fetch = fetchImpl;
  const handlers: Record<string, (event: unknown) => void> = {};
  const windows: FakeWindowClient[] = [];
  const claim = vi.fn().mockResolvedValue(undefined), skipWaiting = vi.fn().mockResolvedValue(undefined);
  const self = { addEventListener: (type: string, h: (event: unknown) => void) => { handlers[type] = h; }, location: { origin }, clients: { claim, matchAll: async () => windows }, skipWaiting, registration: { unregister: vi.fn() } };
  vi.resetModules();
  vi.stubGlobal('self', self); vi.stubGlobal('caches', storage); vi.stubGlobal('fetch', fetchImpl);
  vi.stubGlobal('__SW_VERSION__', options.version); vi.stubGlobal('__PRECACHE__', options.precache);
  await import('../../pwa/sw');
  const lifecycle = async (type: string) => { const waits: Promise<unknown>[] = []; handlers[type]({ waitUntil: (p: Promise<unknown>) => waits.push(p) }); await Promise.all(waits); };
  return {
    origin, storage, windows, network, claim, skipWaiting,
    install: () => lifecycle('install'), activate: () => lifecycle('activate'),
    async fetch(path, init = {}) {
      const request: FakeRequest = { url: path.startsWith('http') ? path : origin + path, method: init.method ?? 'GET', mode: init.mode };
      let responded: Promise<Response> | null = null;
      handlers.fetch({ request, respondWith: (p: Promise<Response>) => { responded = p; }, waitUntil: () => {} });
      return responded ? await responded : 'passthrough';
    },
    async message(data, source = null, ports = []) { const waits: Promise<unknown>[] = []; handlers.message({ data, source, ports, waitUntil: (p: Promise<unknown>) => waits.push(p) }); await Promise.all(waits); },
    settle: () => new Promise(r => setTimeout(r, 0)),
  };
}
export const windowClient = (id: string, url = DEFAULT_ORIGIN + '/'): FakeWindowClient => ({ id, url, postMessage: vi.fn() });
export const quotaError = (): Error => { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; return e; };
export const securityError = (): Error => { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; return e; };
