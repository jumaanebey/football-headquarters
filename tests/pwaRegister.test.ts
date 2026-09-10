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
    (navigator.serviceWorker as unknown as {controller:unknown}).controller=installing;
    swListeners.controllerchange(); swListeners.controllerchange();
    expect(reload).toHaveBeenCalledTimes(1);
    await checkForUpdate(); expect(registration.update).toHaveBeenCalled();
  });
});

describe('update failures and concurrent calls',()=>{
 it('deduplicates registration, preserves a waiting update after post failure and rechecks the guard',async()=>{
  const waiting=worker('installed');
  const registration={waiting,installing:null,addEventListener:vi.fn()};
  const register=vi.fn().mockResolvedValue(registration);
  vi.stubGlobal('navigator',{serviceWorker:{register,controller:{},addEventListener:vi.fn()}});
  vi.stubGlobal('window',{isSecureContext:true,location:{reload:vi.fn()}});
  const m=await import('../pwa/register');
  await Promise.all([m.registerServiceWorker(),m.registerServiceWorker()]);expect(register).toHaveBeenCalledTimes(1);
  let safe=false;m.setUpdateGuard(()=>safe);expect(m.applyUpdate()).toBe(false);safe=true;
  (waiting.postMessage as ReturnType<typeof vi.fn>).mockImplementation(()=>{throw new Error('worker gone');});
  expect(m.applyUpdate()).toBe(false);expect(m.updateState().applying).toBe(false);expect(m.updateState().available).toBe(true);
  expect(m.updateState().error).toContain('could not start');
  m.setUpdateGuard(()=>{throw new Error('stale state');});expect(()=>m.applyUpdate()).not.toThrow();
 });
 it('recovers from activation timeout and does not treat another tab control change as its own reload',async()=>{
  vi.useFakeTimers();
  try {
   const waiting=worker('installed');const callbacks:Record<string,()=>void>={};const reload=vi.fn();
   vi.stubGlobal('navigator',{serviceWorker:{register:vi.fn().mockResolvedValue({waiting,installing:null,addEventListener(){}}),controller:{},addEventListener:(k:string,f:()=>void)=>callbacks[k]=f}});
   vi.stubGlobal('window',{isSecureContext:true,location:{reload}});
   const m=await import('../pwa/register');await m.registerServiceWorker();m.setUpdateGuard(()=>true);
   expect(m.applyUpdate()).toBe(true);expect(m.applyUpdate()).toBe(false);callbacks.controllerchange();expect(reload).not.toHaveBeenCalled();
   vi.advanceTimersByTime(15000);expect(m.updateState().applying).toBe(false);expect(m.updateState().error).toContain('did not activate');
  }finally{vi.useRealTimers();}
 });
});
