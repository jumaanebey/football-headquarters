// Update flow: an update is surfaced, never applied by itself; applyUpdate is gated by the
// registered readiness at activation time (battle, unconfirmed result, pending upgrade/recruit,
// account change), refused attempts are recorded without a reload and keep the waiting worker,
// a later idle attempt succeeds; unsupported contexts register nothing and the app runs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadinessInput } from '../pwa/updateReadiness';

const worker = (state: string) => { const w: Record<string, unknown> & { state: string; listeners: Record<string, () => void>; postMessage: ReturnType<typeof vi.fn> } = { state, listeners: {}, postMessage: vi.fn(), addEventListener: (t: string, h: () => void) => { w.listeners[t] = h; } }; return w; };
const idle = (): ReadinessInput => ({ battleActive: false, awaitingConfirmation: false, pendingOperations: 0, pendingJobs: { upgrade: 0, recruit: 0 }, accountSwitching: false });

/** A registered worker with an installed-and-waiting update already surfaced. */
async function withWaitingUpdate(clock = () => 1_000) {
  const installing = worker('installing');
  const swListeners: Record<string, () => void> = {};
  const registration = { installing, waiting: null as unknown, listeners: {} as Record<string, () => void>, addEventListener: (t: string, h: () => void) => { registration.listeners[t] = h; }, update: vi.fn().mockResolvedValue(undefined) };
  const reload = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn().mockResolvedValue(registration), controller: { postMessage: vi.fn() }, addEventListener: (t: string, h: () => void) => { swListeners[t] = h; } } });
  vi.stubGlobal('window', { isSecureContext: true, location: { reload } });
  const mod = await import('../pwa/register');
  mod.resetRegisterForTests(clock);
  const states: Array<ReturnType<typeof mod.updateState>> = []; mod.onUpdateAvailable(s => states.push({ ...s }));
  await mod.registerServiceWorker();
  installing.state = 'installed'; installing.listeners.statechange();
  return { ...mod, installing, registration, reload, swListeners, states };
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('service worker registration and updates', () => {
  it('registers nothing when unsupported or disabled, and the app keeps running', async () => {
    vi.stubGlobal('navigator', {}); vi.stubGlobal('window', { isSecureContext: true });
    const { registerServiceWorker, serviceWorkerSupported, applyUpdate, updateState, checkForUpdate, unregisterServiceWorker } = await import('../pwa/register');
    expect(serviceWorkerSupported()).toBe(false);
    expect(await registerServiceWorker()).toBeNull();
    expect(applyUpdate()).toEqual({ applied: false, reasons: [], readiness: null });
    expect(updateState().available).toBe(false);
    await expect(checkForUpdate()).resolves.toBeUndefined();
    await expect(unregisterServiceWorker()).resolves.toBeUndefined(); // no `caches`, no serviceWorker: nothing to do, nothing thrown
    const register = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { register, addEventListener() {} } });
    expect(await registerServiceWorker({ enabled: false })).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });
  it('surfaces a waiting worker, applies only on request when the app is idle, and reloads after control changes', async () => {
    const t = await withWaitingUpdate();
    expect(t.updateState().available).toBe(true); expect(t.states.map(s => s.available)).toEqual([true]);
    expect(t.installing.postMessage).not.toHaveBeenCalledWith({ type: 'SKIP_WAITING' }); // never applied automatically
    t.swListeners.controllerchange(); expect(t.reload).not.toHaveBeenCalled(); // another tab activating never reloads this one
    t.registerUpdateReadiness(idle);
    expect(t.applyUpdate()).toMatchObject({ applied: true, reasons: [] });
    expect(t.installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    t.swListeners.controllerchange(); t.swListeners.controllerchange();
    expect(t.reload).toHaveBeenCalledTimes(1);
    await t.checkForUpdate(); expect(t.registration.update).toHaveBeenCalled();
  });
  it('asks the waiting worker for its version over a message channel', async () => {
    const t = await withWaitingUpdate();
    const call = t.installing.postMessage.mock.calls.find(c => c[0]?.type === 'GET_VERSION');
    expect(call).toBeTruthy();
    const port = (call![1] as MessagePort[])[0];
    port.postMessage({ type: 'VERSION', version: 'abc123def456' });
    await vi.waitFor(() => expect(t.updateState().version).toBe('abc123def456'));
    port.close();
  });
});

describe('update readiness gate', () => {
  it('refuses without a readiness provider: the app has not said it is idle', async () => {
    const t = await withWaitingUpdate(() => 42);
    const attempt = t.applyUpdate();
    expect(attempt).toMatchObject({ applied: false, reasons: ['no_readiness_provider'] });
    expect(t.installing.postMessage).not.toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(t.updateState()).toMatchObject({ available: true, applying: false, deferred: true, rejectedAttempts: 1, lastRejection: { at: 42, reasons: ['no_readiness_provider'] } });
    expect(t.reload).not.toHaveBeenCalled();
  });
  it.each([
    ['an active game', { battleActive: true }, 'battle_active'],
    ['a result awaiting confirmation', { awaitingConfirmation: true }, 'awaiting_confirmation'],
    ['a pending upgrade request', { pendingJobs: { upgrade: 1, recruit: 0 } }, 'pending_upgrade'],
    ['a pending recruit request', { pendingJobs: { upgrade: 0, recruit: 1 } }, 'pending_recruit'],
    ['unconfirmed authority operations', { pendingOperations: 3 }, 'pending_operations'],
    ['an account change', { accountSwitching: true }, 'account_switching'],
  ] as const)('keeps the waiting worker and records the refusal during %s', async (_label, busy, reason) => {
    let clock = 100;
    const t = await withWaitingUpdate(() => clock);
    const input: ReadinessInput = { ...idle(), ...busy };
    t.registerUpdateReadiness(() => input);
    const before = t.states.length;
    expect(t.applyUpdate()).toMatchObject({ applied: false, reasons: [reason] });
    expect(t.installing.postMessage).not.toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(t.updateState()).toMatchObject({ available: true, applying: false, deferred: true, lastRejection: { at: 100, reasons: [reason] }, rejectedAttempts: 1 });
    expect(t.states.length).toBe(before + 1); // the UI is told without a reload
    expect(t.states.at(-1)!.lastRejection?.reasons).toEqual([reason]);
    t.swListeners.controllerchange(); expect(t.reload).not.toHaveBeenCalled();
    // The same worker is still waiting; once idle, the update applies.
    clock = 200;
    Object.assign(input, idle());
    expect(t.applyUpdate()).toMatchObject({ applied: true });
    expect(t.installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(t.updateState()).toMatchObject({ applying: true, deferred: false, rejectedAttempts: 1 });
  });
  it('re-checks at activation time: a state that became busy after the banner appeared still blocks, and a later idle attempt succeeds', async () => {
    const t = await withWaitingUpdate();
    const input = idle();
    t.registerUpdateReadiness(() => input);
    expect(t.updateReadiness().ready).toBe(true); // banner shown while idle
    input.battleActive = true; // player tapped Kickoff before tapping "Update now"
    expect(t.applyUpdate()).toMatchObject({ applied: false, reasons: ['battle_active'] });
    expect(t.updateState().deferred).toBe(true);
    expect(t.retryDeferredUpdate()).toMatchObject({ applied: false, reasons: ['battle_active'] }); // still in the game
    expect(t.updateState().rejectedAttempts).toBe(2);
    input.battleActive = false; input.awaitingConfirmation = true; // result sent, receipt outstanding
    expect(t.retryDeferredUpdate()).toMatchObject({ applied: false, reasons: ['awaiting_confirmation'] });
    input.awaitingConfirmation = false;
    expect(t.retryDeferredUpdate()).toMatchObject({ applied: true });
    expect(t.installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(t.retryDeferredUpdate()).toMatchObject({ applied: false }); // already applying: nothing more to do
    t.swListeners.controllerchange(); expect(t.reload).toHaveBeenCalledTimes(1);
  });
  it('never retries by itself: retryDeferredUpdate is a no-op unless an attempt was deferred', async () => {
    const t = await withWaitingUpdate();
    t.registerUpdateReadiness(idle);
    expect(t.retryDeferredUpdate()).toMatchObject({ applied: false });
    expect(t.installing.postMessage).not.toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
  it('a caller-supplied provider can only add reasons, never override the registered one', async () => {
    const t = await withWaitingUpdate();
    t.registerUpdateReadiness(() => ({ ...idle(), battleActive: true }));
    expect(t.applyUpdate(() => ({ ready: true, reasons: [] }))).toMatchObject({ applied: false, reasons: ['battle_active'] });
    t.registerUpdateReadiness(idle);
    expect(t.applyUpdate(() => ({ ...idle(), accountSwitching: true }))).toMatchObject({ applied: false, reasons: ['account_switching'] });
    expect(t.applyUpdate(() => { throw new Error('boom'); })).toMatchObject({ applied: false, reasons: ['readiness_error'] });
    expect(t.applyUpdate(idle)).toMatchObject({ applied: true });
  });
  it('unregistering a provider returns the gate to fail-closed', async () => {
    const t = await withWaitingUpdate();
    const off = t.registerUpdateReadiness(idle);
    expect(t.updateReadiness().ready).toBe(true);
    off();
    expect(t.updateReadiness()).toEqual({ ready: false, reasons: ['no_readiness_provider'] });
    expect(t.applyUpdate()).toMatchObject({ applied: false, reasons: ['no_readiness_provider'] });
  });
  it('the QA hook window.__fhqPwa.applyUpdate goes through the same gate', async () => {
    const t = await withWaitingUpdate();
    const doc: Record<string, unknown> = { addEventListener: vi.fn(), visibilityState: 'visible' };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { isSecureContext: true, location: { reload: t.reload }, addEventListener: vi.fn(), matchMedia: () => ({ matches: false }) });
    const { bootPwa } = await import('../pwa/boot');
    bootPwa({ register: false });
    const hook = (window as Window).__fhqPwa!;
    expect(hook.applyUpdate()).toMatchObject({ applied: false, reasons: ['no_readiness_provider'] });
    expect(hook.update().deferred).toBe(true);
    hook.registerUpdateReadiness(() => ({ ...idle(), pendingJobs: { upgrade: 1, recruit: 0 } }));
    expect(hook.readiness()).toEqual({ ready: false, reasons: ['pending_upgrade'] });
    expect(hook.applyUpdate()).toMatchObject({ applied: false, reasons: ['pending_upgrade'] });
    hook.registerUpdateReadiness(idle);
    expect(hook.applyUpdate()).toMatchObject({ applied: true });
    expect(t.installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
  it('boots without a service worker or Cache API (unsupported browser) and exposes an inert hook', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 9) OldBrowser/1.0', onLine: true });
    vi.stubGlobal('window', { isSecureContext: true, addEventListener: vi.fn(), matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('document', { addEventListener: vi.fn() });
    vi.stubGlobal('caches', undefined);
    const { bootPwa } = await import('../pwa/boot');
    expect(() => bootPwa({ register: true })).not.toThrow();
    const hook = (window as Window).__fhqPwa!;
    expect(hook.install().platform).toBe('unsupported');
    expect(hook.update()).toMatchObject({ available: false, applying: false });
    expect(hook.applyUpdate()).toMatchObject({ applied: false });
    expect(hook.connection().online).toBe(true);
  });
});
