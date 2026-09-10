// Page-side registration and update flow. Registration happens only in production builds on
// secure origins. An update is never applied by itself: `onUpdateAvailable` tells the product UI
// a new version is waiting, and `applyUpdate()` is the caller's decision — but the decision is
// checked here, at activation time, against the readiness the product registered with
// `registerUpdateReadiness` (see pwa/updateReadiness.ts and docs/PWA-RELIABILITY.md). No call
// path, including the QA hook window.__fhqPwa.applyUpdate, can activate while a battle is on
// screen, a result or operation is unconfirmed, an upgrade/recruit request is outstanding or the
// account is changing: the attempt is refused, recorded in `updateState().lastRejection`, the
// waiting worker is kept and nothing reloads. A later attempt when the state is idle succeeds.
import { resolveReadiness, type ReadinessProvider, type ReadinessReason, type UpdateReadiness } from './updateReadiness';

export interface UpdateRejection { at: number; reasons: ReadinessReason[] }
export interface UpdateState {
  /** A new worker is installed and waiting. */
  available: boolean;
  /** The waiting worker's version (asked over a message channel), when known. */
  version: string | null;
  /** SKIP_WAITING was sent; the page reloads when the new worker takes control. */
  applying: boolean;
  /** An apply attempt was refused because the app was busy; the waiting worker is kept. */
  deferred: boolean;
  lastRejection: UpdateRejection | null;
  /** Number of refused attempts since the update became available. */
  rejectedAttempts: number;
}
export interface UpdateAttempt { applied: boolean; reasons: ReadinessReason[]; readiness: UpdateReadiness | null }
type Listener = (state: UpdateState) => void;
const listeners = new Set<Listener>();
const initial = (): UpdateState => ({ available: false, version: null, applying: false, deferred: false, lastRejection: null, rejectedAttempts: 0 });
let state: UpdateState = initial();
let waiting: ServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;
let readinessProvider: ReadinessProvider | null = null;
let now: () => number = () => Date.now();
const emit = () => { for (const l of listeners) { try { l(state); } catch { /* never break the page */ } } };

export const updateState = (): UpdateState => state;
export function onUpdateAvailable(listener: Listener): () => void { listeners.add(listener); if (state.available) listener(state); return () => { listeners.delete(listener); }; }

/** The product registers how busy it is; consulted on every apply attempt. Returns an unregister function. */
export function registerUpdateReadiness(provider: ReadinessProvider): () => void {
  readinessProvider = provider;
  return () => { if (readinessProvider === provider) readinessProvider = null; };
}
/** The current verdict from the registered provider (not ready when none is registered). */
export const updateReadiness = (): UpdateReadiness => resolveReadiness(readinessProvider);
/** Registered provider AND an optional caller-supplied one: ready only when every provider is ready; reasons are the union. */
const combinedReadiness = (extra?: ReadinessProvider): UpdateReadiness => {
  const providers = [readinessProvider, extra].filter((p): p is ReadinessProvider => !!p);
  if (!providers.length) return resolveReadiness(null);
  const verdicts = providers.map(resolveReadiness);
  return { ready: verdicts.every(v => v.ready), reasons: [...new Set(verdicts.flatMap(v => v.reasons))] };
};

export const serviceWorkerSupported = (): boolean => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && (window.isSecureContext ?? false);

/** Register /sw.js (idempotent). Resolves to the registration or null when unsupported/disabled. */
export async function registerServiceWorker(options: { enabled?: boolean; path?: string } = {}): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorkerSupported() || options.enabled === false) return null;
  try {
    registration = await navigator.serviceWorker.register(options.path ?? '/sw.js', { scope: '/' });
    const surface = (worker: ServiceWorker) => { waiting = worker; state = { ...state, available: true }; emit(); void askVersion(worker); };
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) surface(worker); });
    };
    if (registration.waiting && navigator.serviceWorker.controller) surface(registration.waiting);
    track(registration.installing);
    registration.addEventListener('updatefound', () => track(registration!.installing));
    // Reload once the new worker takes control after applyUpdate(); never on the first install,
    // and never when another tab activated the update (that tab decided for itself, not for us).
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (state.applying && !reloading) { reloading = true; window.location.reload(); } sayHello(); });
    sayHello();
    return registration;
  } catch { return null; }
}

/** Tell the controlling worker which bundle this page runs, so old-version caches are kept while old tabs live. */
export function sayHello(): void {
  try { navigator.serviceWorker?.controller?.postMessage({ type: 'CLIENT_HELLO', bundle: bundlePath() }); } catch { /* not controlled yet */ }
}
const bundlePath = (): string | null => { try { return new URL(import.meta.url).pathname; } catch { return null; } };

const askVersion = async (worker: ServiceWorker): Promise<void> => {
  if (typeof MessageChannel === 'undefined') return;
  try {
    const channel = new MessageChannel();
    const version = await new Promise<string | null>(resolve => {
      const t = setTimeout(() => resolve(null), 1500);
      channel.port1.onmessage = e => { clearTimeout(t); resolve(typeof e.data?.version === 'string' ? e.data.version : null); };
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    });
    channel.port1.close();
    if (version && waiting === worker) { state = { ...state, version }; emit(); }
  } catch { /* version stays unknown */ }
};

/** Ask the browser to check for a newer worker (e.g. when the tab becomes visible again). */
export async function checkForUpdate(): Promise<void> { try { await registration?.update(); } catch { /* offline or blocked: nothing to do */ } }

/**
 * Activate the waiting worker (then reload once it controls the page). Readiness is checked NOW:
 * the registered provider and, when given, the caller's `extra` provider must BOTH be ready (a
 * caller can add reasons, never remove them). When not ready the attempt is refused and recorded,
 * the waiting worker is kept and nothing reloads. With no provider at all the attempt is refused
 * (`no_readiness_provider`): an app that has not described its state is not known to be idle.
 */
export function applyUpdate(extra?: ReadinessProvider): UpdateAttempt {
  if (!waiting) return { applied: false, reasons: [], readiness: null };
  if (state.applying) return { applied: true, reasons: [], readiness: null };
  const readiness = combinedReadiness(extra);
  if (!readiness.ready) {
    state = { ...state, deferred: true, lastRejection: { at: now(), reasons: readiness.reasons }, rejectedAttempts: state.rejectedAttempts + 1 };
    emit();
    return { applied: false, reasons: readiness.reasons, readiness };
  }
  state = { ...state, applying: true, deferred: false }; emit();
  waiting.postMessage({ type: 'SKIP_WAITING' });
  return { applied: true, reasons: [], readiness };
}

/** Re-attempt a deferred update once the app reports it is idle again (call from a state effect). Never applies without a prior deferred attempt. */
export function retryDeferredUpdate(): UpdateAttempt {
  if (!state.deferred || !waiting || state.applying) return { applied: false, reasons: [], readiness: null };
  return applyUpdate();
}

/** Remove the worker and its caches (Settings › reset, or support). The page then runs from the network. */
export async function unregisterServiceWorker(): Promise<void> {
  if (!serviceWorkerSupported()) return;
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  if (typeof caches !== 'undefined') for (const name of await caches.keys()) if (name.startsWith('fhq-')) await caches.delete(name);
}

/** Test hook: forget the registration, listeners and readiness provider. */
export function resetRegisterForTests(clock?: () => number): void { listeners.clear(); state = initial(); waiting = null; registration = null; readinessProvider = null; now = clock ?? (() => Date.now()); }
