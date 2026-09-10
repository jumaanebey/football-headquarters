// Update flow: an update is surfaced, never applied by itself; applyUpdate posts SKIP_WAITING and
// reloads only after the new worker takes control; unsupported contexts register nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const worker = (state: string) => { const w: Record<string, unknown> & { state: string; listeners: Record<string, () => void> } = { state, listeners: {}, postMessage: vi.fn(), addEventListener: (t: string, h: () => void) => { w.listeners[t] = h; } }; return w; };
beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('service worker registration and updates', () => {
  it('registers nothing when unsupported or disabled', async () => {
    vi.stubGlobal('navigator', {}); vi.stubGlobal('window', { isSecureContext: true });
    const { registerServiceWorker, serviceWorkerSupported } = await import('../pwa/register');
    expect(serviceWorkerSupported()).toBe(false);
    expect(await registerServiceWorker()).toBeNull();
    const register = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { register, addEventListener() {} } });
    expect(await registerServiceWorker({ enabled: false })).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });
  it('surfaces a waiting worker, applies only on request, and reloads after control changes', async () => {
    const installing = worker('installing');
    const swListeners: Record<string, () => void> = {};
    const registration = { installing, waiting: null as unknown, listeners: {} as Record<string, () => void>, addEventListener: (t: string, h: () => void) => { registration.listeners[t] = h; }, update: vi.fn().mockResolvedValue(undefined) };
    const register = vi.fn().mockResolvedValue(registration);
    const reload = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { register, controller: {}, addEventListener: (t: string, h: () => void) => { swListeners[t] = h; } } });
    vi.stubGlobal('window', { isSecureContext: true, location: { reload } });
    const { registerServiceWorker, onUpdateAvailable, applyUpdate, updateState, checkForUpdate, setUpdateGuard } = await import('../pwa/register');
    const seen: boolean[] = []; onUpdateAvailable(s => seen.push(s.available));
    expect(await registerServiceWorker()).toBe(registration);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(applyUpdate()).toBe(false); // nothing waiting yet
    installing.state = 'installed'; installing.listeners.statechange();
    expect(updateState().available).toBe(true); expect(seen).toEqual([true]);
    expect(installing.postMessage).not.toHaveBeenCalled(); // never applied automatically
    swListeners.controllerchange(); expect(reload).not.toHaveBeenCalled(); // a control change without applyUpdate never reloads
    expect(applyUpdate()).toBe(false); // no product safety declaration
    let busy = true;
    setUpdateGuard(() => !busy);
    expect(applyUpdate()).toBe(false); // waiting banner must not override a pending game
    expect(installing.postMessage).not.toHaveBeenCalled();
    busy = false;
    expect(applyUpdate()).toBe(true);
    expect(installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    swListeners.controllerchange(); swListeners.controllerchange();
    expect(reload).toHaveBeenCalledTimes(1);
    await checkForUpdate(); expect(registration.update).toHaveBeenCalled();
  });
});
