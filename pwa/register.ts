// Page-side registration and update flow. Registration happens only in production builds on
// secure origins. An update is never applied by itself: `onUpdateAvailable` tells the product UI
// a new version is waiting, and `applyUpdate()` (which reloads) is the caller's decision — the
// UI must not call it while a battle is on screen or an authority operation is unconfirmed
// (see docs/PERF-INSTALL-MILESTONE.md › Codex integration).
export interface UpdateState { available: boolean; version: string | null; applying: boolean }
type Listener = (state: UpdateState) => void;
const listeners = new Set<Listener>();
let state: UpdateState = { available: false, version: null, applying: false };
let waiting: ServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;
let updateGuard: () => boolean = () => false;
/** Product must declare it safe at click time, including ledger entries not yet rendered. */
export function setUpdateGuard(guard: () => boolean): () => void {
  updateGuard = guard;
  return () => { if (updateGuard === guard) updateGuard = () => false; };
}
const emit = () => { for (const l of listeners) { try { l(state); } catch { /* never break the page */ } } };

export const updateState = (): UpdateState => state;
export function onUpdateAvailable(listener: Listener): () => void { listeners.add(listener); if (state.available) listener(state); return () => { listeners.delete(listener); }; }

export const serviceWorkerSupported = (): boolean => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && (window.isSecureContext ?? false);

/** Register /sw.js (idempotent). Resolves to the registration or null when unsupported/disabled. */
export async function registerServiceWorker(options: { enabled?: boolean; path?: string } = {}): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorkerSupported() || options.enabled === false) return null;
  try {
    registration = await navigator.serviceWorker.register(options.path ?? '/sw.js', { scope: '/' });
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) { waiting = worker; state = { ...state, available: true }; emit(); } });
    };
    if (registration.waiting && navigator.serviceWorker.controller) { waiting = registration.waiting; state = { ...state, available: true }; emit(); }
    track(registration.installing);
    registration.addEventListener('updatefound', () => track(registration!.installing));
    // Reload once the new worker takes control after applyUpdate(); never on the first install.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (state.applying && !reloading) { reloading = true; window.location.reload(); } });
    return registration;
  } catch { return null; }
}

/** Ask the browser to check for a newer worker (e.g. when the tab becomes visible again). */
export async function checkForUpdate(): Promise<void> { try { await registration?.update(); } catch { /* offline or blocked: nothing to do */ } }

/** Activate the waiting worker and reload. Only call when the product UI knows it is safe. */
export function applyUpdate(): boolean {
  if (!waiting || !updateGuard()) return false;
  state = { ...state, applying: true }; emit();
  waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

/** Remove the worker and its caches (Settings › reset, or support). The page then runs from the network. */
export async function unregisterServiceWorker(): Promise<void> {
  if (!serviceWorkerSupported()) return;
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  if (typeof caches !== 'undefined') for (const name of await caches.keys()) if (name.startsWith('fhq-')) await caches.delete(name);
}
