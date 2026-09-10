// PWA: caching policy, install helpers, connection state, update flow and the shipped manifest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { ART_CACHE_LIMIT, activationDeletions, artCache, artEvictions, classify, clientsAllCurrent, isCurrentBundle, isSwMessage, shellCache, staleCaches, versionHistory } from '../pwa/swPolicy';
import { armInstallCapture, detectPlatform, installSupport, onInstallSupportChange, promptInstall, resetInstallForTests, IOS_INSTRUCTIONS } from '../pwa/install';
import { armConnectionTracking, assess, connectionState, onConnectionChange, reportClubServer, resetConnectionForAccount, resetConnectionForTests, SUMMARIES } from '../pwa/connection';
import { PUBLIC_GAME_URL, shareUrl } from '../game/publicUrl';

const origin = 'https://football-headquarters.vercel.app';
const precached = new Set(['/', '/manifest.webmanifest', '/assets/index-abc123.js', '/assets/brand/icon-192.png']);
const c = (url: string, extra: Partial<{ method: string; mode: string }> = {}) => classify({ url: url.startsWith('/') ? origin + url : url, method: extra.method ?? 'GET', mode: extra.mode, origin, precached });

describe('service worker policy', () => {
  it('never caches the club server, auth, analytics, cross-origin or non-GET traffic', () => {
    expect(c('https://ruzkpbvgzvqrrnexrffz.supabase.co/functions/v1/club-authority', { method: 'POST' })).toBe('network-only');
    expect(c('https://ruzkpbvgzvqrrnexrffz.supabase.co/rest/v1/fhq_events', { method: 'POST' })).toBe('network-only');
    expect(c('https://ruzkpbvgzvqrrnexrffz.supabase.co/auth/v1/token')).toBe('network-only');
    expect(c('https://fonts.googleapis.com/css2?family=Inter')).toBe('network-only');
    expect(c('/assets/heroes/motion/qb.e7cbacc6.webp', { method: 'POST' })).toBe('network-only');
    expect(c('/functions/v1/anything')).toBe('network-only');
    expect(c('/sw.js')).toBe('network-only'); expect(c('/manifest.webmanifest')).toBe('network-only'); expect(c('/asset-manifest.json')).toBe('network-only');
    expect(c('not a url')).toBe('network-only');
  });
  it('classifies the shell, fingerprinted assets, fixed art and navigations', () => {
    expect(c('/', { mode: 'navigate' })).toBe('navigation');
    expect(c('/?src=pwa', { mode: 'navigate' })).toBe('navigation');
    expect(c('/assets/index-abc123.js')).toBe('shell');
    expect(c('/assets/index-zzz999.js')).toBe('immutable-asset');
    expect(c('/assets/heroes/campus/qb.71a1b63d.webp')).toBe('immutable-asset');
    expect(c('/assets/heroes/motion/qb.webp')).toBe('art');
    expect(c('/assets/units/mascot.webp')).toBe('art');
    expect(c('/some/page.json')).toBe('network-only');
  });
  it('treats Vite code-split chunks as immutable assets and never caches the worker metadata files', () => {
    expect(c('/assets/CampusEditor-4hCeemTl.js')).toBe('immutable-asset');
    expect(c('/assets/vendor.react-Bx9_2kQz.js')).toBe('immutable-asset');
    expect(c('/assets/index-CCD_ct4c.css')).toBe('immutable-asset');
    expect(c('/assets/CampusEditor.js')).toBe('network-only'); // no content hash: nothing to trust
    expect(c('/sw-version.json')).toBe('network-only');
  });
  it('versions its two caches, deletes only its own stale caches and bounds the art cache', () => {
    expect(shellCache('v1')).toBe('fhq-shell-v1'); expect(artCache('v1')).toBe('fhq-art-v1');
    expect(staleCaches(['fhq-shell-v0', 'fhq-art-v0', 'fhq-shell-v1', 'fhq-art-v1', 'fhq-meta', 'other-app-cache'], 'v1')).toEqual(['fhq-shell-v0', 'fhq-art-v0']);
    expect(staleCaches(['fhq-shell-v0', 'fhq-art-v0', 'fhq-shell-v1', 'fhq-shell-vX'], 'v1', ['v0'])).toEqual(['fhq-shell-vX']); // a kept version survives
    const keys = Array.from({ length: ART_CACHE_LIMIT + 3 }, (_, i) => `k${i}`);
    expect(artEvictions(keys)).toEqual(['k0', 'k1', 'k2']);
    expect(artEvictions(keys.slice(0, 10))).toEqual([]);
    expect(isSwMessage({ type: 'SKIP_WAITING' })).toBe(true); expect(isSwMessage({ type: 'CLIENT_HELLO', bundle: '/assets/index-a.js' })).toBe(true); expect(isSwMessage({ type: 'GET_VERSION' })).toBe(true);
    expect(isSwMessage({ type: 'DELETE_EVERYTHING' })).toBe(false); expect(isSwMessage(null)).toBe(false);
  });
  it('keeps the previous version on activation and only deletes older ones; unknown order deletes nothing', () => {
    expect(versionHistory([], 'v1')).toEqual(['v1']);
    expect(versionHistory(['v1'], 'v2')).toEqual(['v1', 'v2']);
    expect(versionHistory(['v1', 'v2', 'v3'], 'v4')).toEqual(['v2', 'v3', 'v4']); // bounded
    expect(versionHistory(['v1', 'v2'], 'v1')).toEqual(['v2', 'v1']); // re-activation moves to the end
    expect(versionHistory('garbage', 'v1')).toEqual(['v1']); expect(versionHistory([1, null, 'v0'], 'v1')).toEqual(['v0', 'v1']);
    const names = ['fhq-shell-v0', 'fhq-art-v0', 'fhq-shell-v1', 'fhq-art-v1', 'fhq-shell-v2', 'fhq-meta', 'other-app-cache'];
    expect(activationDeletions(names, 'v2', ['v0', 'v1', 'v2'])).toEqual(['fhq-shell-v0', 'fhq-art-v0']); // v1 (the previous) survives
    expect(activationDeletions(names, 'v2', ['v2'])).toEqual([]); // first install or lost history: unknown order, delete nothing
    expect(activationDeletions(names, 'v2', [])).toEqual([]);
  });
  it('old caches go only once every open window is known to run the current bundle', () => {
    const current = new Set(['/', '/assets/index-NEW.js']);
    expect(clientsAllCurrent([], current)).toBe(true); // no windows: nothing depends on old caches
    expect(clientsAllCurrent(['/assets/index-NEW.js'], current)).toBe(true);
    expect(clientsAllCurrent(['/assets/index-NEW.js', '/assets/index-OLD.js'], current)).toBe(false);
    expect(clientsAllCurrent(['/assets/index-NEW.js', undefined], current)).toBe(false); // a window that never said hello is treated as old
    expect(clientsAllCurrent([null], current)).toBe(false);
    expect(isCurrentBundle('/assets/index-NEW.js', current)).toBe(true); expect(isCurrentBundle(42, current)).toBe(false);
  });
});

describe('install helpers', () => {
  beforeEach(() => { resetInstallForTests(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('detects platforms without assuming support, and offers iOS manual instructions', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', true)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/152', true)).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/152', true)).toBe('desktop');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14) Chrome/152', false)).toBe('unsupported');
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', serviceWorker: {}, maxTouchPoints: 5 });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(installSupport()).toEqual({ platform: 'ios', installed: false, canPrompt: false, manualInstructions: IOS_INSTRUCTIONS });
  });
  it('captures the browser install event, prompts only on request and reports installed state', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/152', serviceWorker: {}, maxTouchPoints: 5 });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const handlers: Record<string, (e: unknown) => void> = {};
    armInstallCapture({ addEventListener: (type: string, h: unknown) => { handlers[type] = h as (e: unknown) => void; } } as unknown as Window);
    const seen: boolean[] = []; onInstallSupportChange(s => seen.push(s.canPrompt));
    expect(installSupport().canPrompt).toBe(false);
    expect(await promptInstall()).toBe('unavailable');
    let prompted = 0; const event = { preventDefault: vi.fn(), prompt: async () => { prompted++; }, userChoice: Promise.resolve({ outcome: 'accepted' as const }) };
    handlers.beforeinstallprompt(event);
    expect(event.preventDefault).toHaveBeenCalled(); // no automatic prompt
    expect(prompted).toBe(0); expect(installSupport().canPrompt).toBe(true); expect(seen).toEqual([true]);
    expect(await promptInstall()).toBe('accepted'); expect(prompted).toBe(1);
    expect(installSupport().canPrompt).toBe(false);
    vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: q.includes('standalone') }) });
    expect(installSupport().installed).toBe(true);
  });
  it('a dismissed or failing prompt leaves the UI in a consistent state and never prompts twice', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/152', serviceWorker: {}, maxTouchPoints: 5 });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const handlers: Record<string, (e: unknown) => void> = {};
    armInstallCapture({ addEventListener: (type: string, h: unknown) => { handlers[type] = h as (e: unknown) => void; } } as unknown as Window);
    armInstallCapture({ addEventListener: () => { throw new Error('armed twice'); } } as unknown as Window); // idempotent
    const seen: boolean[] = []; onInstallSupportChange(s => seen.push(s.canPrompt));
    // Dismissed: the event is consumed (browsers do not allow a second prompt() on the same event).
    handlers.beforeinstallprompt({ preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' as const }) });
    expect(await promptInstall()).toBe('dismissed');
    expect(installSupport().canPrompt).toBe(false); expect(await promptInstall()).toBe('unavailable');
    // Failing: prompt() throws (not triggered by a user gesture, or the browser withdrew the offer).
    handlers.beforeinstallprompt({ preventDefault() {}, prompt: async () => { throw new Error('NotAllowedError'); }, userChoice: new Promise(() => {}) });
    expect(installSupport().canPrompt).toBe(true);
    expect(await promptInstall()).toBe('unavailable');
    expect(installSupport().canPrompt).toBe(false);
    expect(seen).toEqual([true, false, true, false]);
    // The browser reports installation (from its own UI, not ours): the held event is dropped.
    handlers.beforeinstallprompt({ preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' as const }) });
    handlers.appinstalled({});
    expect(installSupport().canPrompt).toBe(false);
  });
  it('already installed: no prompt and no manual guidance, on iOS (standalone) and Android (display-mode)', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', serviceWorker: {}, maxTouchPoints: 5, standalone: true });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(installSupport()).toEqual({ platform: 'ios', installed: true, canPrompt: false, manualInstructions: null });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/152', serviceWorker: {}, maxTouchPoints: 5 });
    vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: q.includes('standalone') }) });
    const handlers: Record<string, (e: unknown) => void> = {};
    armInstallCapture({ addEventListener: (type: string, h: unknown) => { handlers[type] = h as (e: unknown) => void; } } as unknown as Window);
    handlers.beforeinstallprompt({ preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' as const }) });
    expect(installSupport()).toEqual({ platform: 'android', installed: true, canPrompt: false, manualInstructions: null }); // a held event is not offered to an installed app
  });
  it('unsupported browsers (no service worker) get neither a prompt nor iOS guidance, and matchMedia errors read as not installed', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 9) OldBrowser/1.0', maxTouchPoints: 5 });
    vi.stubGlobal('window', { matchMedia: () => { throw new Error('no matchMedia'); } });
    expect(installSupport()).toEqual({ platform: 'unsupported', installed: false, canPrompt: false, manualInstructions: null });
    // iPadOS reports itself as a Mac with touch: still iOS guidance.
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', serviceWorker: {}, maxTouchPoints: 5 });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(installSupport()).toMatchObject({ platform: 'ios', manualInstructions: IOS_INSTRUCTIONS });
  });
});

describe('connection state', () => {
  const fakeWindow = () => { const handlers: Record<string, Set<() => void>> = {}; return { handlers, fire: (t: string) => { for (const h of handlers[t] ?? []) h(); }, addEventListener: (t: string, h: () => void) => { (handlers[t] ??= new Set()).add(h); }, removeEventListener: (t: string, h: () => void) => { handlers[t]?.delete(h); } }; };
  let clock = 1_000;
  beforeEach(() => { clock = 1_000; resetConnectionForTests(() => clock); });
  it('combines browser online state with club-server reachability and never claims offline settlement', () => {
    const w = fakeWindow();
    armConnectionTracking(w as unknown as Window);
    const seen: string[] = []; onConnectionChange(s => seen.push(`${s.online}/${s.clubServer}`));
    reportClubServer('ok'); reportClubServer('ok');
    w.fire('offline'); w.fire('online'); reportClubServer('unauthorized');
    expect(seen).toEqual(['true/unknown', 'true/ok', 'false/ok', 'true/ok', 'true/unauthorized']);
    expect(connectionState().settlesOffline).toBe(false);
    w.fire('offline');
    expect(connectionState().summary).toMatch(/Offline: local play continues/);
  });
  it('keeps transport failure, expired sign-in and server unavailability apart, with accurate summaries and actions', () => {
    expect(assess(true, 'ok')).toBe('connected'); expect(assess(true, 'unknown')).toBe('unchecked');
    expect(assess(true, 'offline')).toBe('transport-failure'); expect(assess(true, 'unauthorized')).toBe('auth-expired'); expect(assess(true, 'unavailable')).toBe('server-unavailable');
    expect(assess(false, 'ok')).toBe('browser-offline'); // the browser's "definitely offline" wins over a stale OK
    reportClubServer('offline');
    expect(connectionState()).toMatchObject({ online: true, assessment: 'transport-failure', action: 'wait', consecutiveFailures: 1, lastFailureAt: 1_000, lastOkAt: null });
    expect(connectionState().summary).toMatch(/device reports a connection, but the club server could not be reached/);
    clock = 2_000; reportClubServer('unauthorized');
    expect(connectionState()).toMatchObject({ assessment: 'auth-expired', action: 'sign-in', consecutiveFailures: 2, lastFailureAt: 2_000 });
    expect(connectionState().summary).toMatch(/sign in again/);
    clock = 3_000; reportClubServer('unavailable');
    expect(connectionState()).toMatchObject({ assessment: 'server-unavailable', action: 'wait', consecutiveFailures: 3 });
    expect(connectionState().summary).toMatch(/club server is unavailable/);
    clock = 4_000; reportClubServer('ok');
    expect(connectionState()).toMatchObject({ assessment: 'connected', action: null, consecutiveFailures: 0, lastOkAt: 4_000, lastFailureAt: 3_000 });
    for (const key of Object.keys(SUMMARIES) as Array<keyof typeof SUMMARIES>) expect(SUMMARIES[key]).not.toMatch(/settle|saved online/i); // no summary promises offline settlement
  });
  it('navigator.onLine is a hint: online=true with a failing transport is not "connected", and online=false overrides everything', () => {
    const w = fakeWindow(); armConnectionTracking(w as unknown as Window);
    reportClubServer('ok');
    w.fire('offline');
    expect(connectionState()).toMatchObject({ online: false, clubServer: 'ok', assessment: 'browser-offline' });
    w.fire('online');
    reportClubServer('offline'); reportClubServer('offline');
    expect(connectionState()).toMatchObject({ online: true, assessment: 'transport-failure', consecutiveFailures: 2 });
  });
  it('repeated identical reports update counters without re-notifying; subscriptions and tracking clean up', () => {
    const w = fakeWindow(); const stop = armConnectionTracking(w as unknown as Window);
    expect(armConnectionTracking(w as unknown as Window)).toBe(stop); // idempotent
    const seen: string[] = []; const off = onConnectionChange(s => seen.push(s.assessment));
    reportClubServer('offline'); reportClubServer('offline'); reportClubServer('offline');
    expect(seen).toEqual(['unchecked', 'transport-failure']); expect(connectionState().consecutiveFailures).toBe(3);
    off(); reportClubServer('ok'); w.fire('offline');
    expect(seen).toEqual(['unchecked', 'transport-failure']); // unsubscribed
    stop();
    expect(w.handlers.online.size + w.handlers.offline.size).toBe(0); // listeners removed
    w.fire('online'); expect(connectionState().online).toBe(false); // nothing listens any more
  });
  it('an account change resets the server status so the previous owner\'s failures never describe the next one', () => {
    const seen: Array<[string, string | null, number]> = []; onConnectionChange(s => seen.push([s.assessment, s.account, s.consecutiveFailures]));
    reportClubServer('unauthorized'); reportClubServer('unauthorized');
    expect(connectionState()).toMatchObject({ assessment: 'auth-expired', consecutiveFailures: 2, account: null });
    resetConnectionForAccount('owner-b');
    expect(connectionState()).toMatchObject({ assessment: 'unchecked', clubServer: 'unknown', consecutiveFailures: 0, lastFailureAt: null, lastOkAt: null, account: 'owner-b' });
    expect(seen).toEqual([['unchecked', null, 0], ['auth-expired', null, 1], ['unchecked', 'owner-b', 0]]);
    resetConnectionForAccount(null); // signed out to guest
    expect(connectionState().account).toBeNull();
    expect(seen.length).toBe(4); // always notified on an account change, even when the assessment did not change
  });
});

describe('shipped manifest, icons and public URL', () => {
  it('manifest is valid with standalone display, theme colours and correctly sized any + maskable icons', async () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    expect(manifest).toMatchObject({ name: 'Football Headquarters', short_name: 'Football HQ', start_url: '/?src=pwa', scope: '/', display: 'standalone', theme_color: '#0f172a', background_color: '#0f172a' });
    const purposes = manifest.icons.map((i: { purpose: string }) => i.purpose);
    expect(purposes).toContain('any'); expect(purposes).toContain('maskable');
    for (const icon of manifest.icons) {
      const meta = await sharp(readFileSync(`public${icon.src}`)).metadata();
      expect(`${meta.width}x${meta.height}`, icon.src).toBe(icon.sizes); expect(meta.format).toBe('png');
    }
    const html = readFileSync('index.html', 'utf8');
    for (const needle of ['rel="manifest" href="/manifest.webmanifest"', 'rel="canonical" href="https://football-headquarters.vercel.app/"', 'og:image:width" content="1600"', 'twitter:card" content="summary_large_image"', 'apple-touch-icon-180.png']) expect(html).toContain(needle);
    const og = await sharp(readFileSync('public/assets/brand/og-image.png')).metadata();
    expect([og.width, og.height]).toEqual([1600, 900]);
    expect(readFileSync('public/robots.txt', 'utf8')).toContain(`Sitemap: ${PUBLIC_GAME_URL}sitemap.xml`);
    expect(readFileSync('public/sitemap.xml', 'utf8')).toContain(`<loc>${PUBLIC_GAME_URL}</loc>`);
    expect(shareUrl('reddit')).toBe('https://football-headquarters.vercel.app/?src=reddit');
  });
});
