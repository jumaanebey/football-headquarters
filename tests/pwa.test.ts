// PWA: caching policy, install helpers, connection state, update flow and the shipped manifest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { ART_CACHE_LIMIT, artCache, artEvictions, classify, isSwMessage, shellCache, staleCaches } from '../pwa/swPolicy';
import { armInstallCapture, detectPlatform, installSupport, onInstallSupportChange, promptInstall, resetInstallForTests, IOS_INSTRUCTIONS } from '../pwa/install';
import { armConnectionTracking, connectionState, onConnectionChange, reportClubServer, resetConnectionForTests } from '../pwa/connection';
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
  it('versions its two caches, deletes only its own stale caches and bounds the art cache', () => {
    expect(shellCache('v1')).toBe('fhq-shell-v1'); expect(artCache('v1')).toBe('fhq-art-v1');
    expect(staleCaches(['fhq-shell-v0', 'fhq-art-v0', 'fhq-shell-v1', 'fhq-art-v1', 'other-app-cache'], 'v1')).toEqual(['fhq-shell-v0', 'fhq-art-v0']);
    const keys = Array.from({ length: ART_CACHE_LIMIT + 3 }, (_, i) => `k${i}`);
    expect(artEvictions(keys)).toEqual(['k0', 'k1', 'k2']);
    expect(artEvictions(keys.slice(0, 10))).toEqual([]);
    expect(isSwMessage({ type: 'SKIP_WAITING' })).toBe(true); expect(isSwMessage({ type: 'DELETE_EVERYTHING' })).toBe(false); expect(isSwMessage(null)).toBe(false);
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
});

describe('connection state', () => {
  beforeEach(() => { resetConnectionForTests(); });
  it('combines browser online state with club-server reachability and never claims offline settlement', () => {
    const handlers: Record<string, () => void> = {};
    armConnectionTracking({ addEventListener: (type: string, h: unknown) => { handlers[type] = h as () => void; } } as unknown as Window);
    const seen: string[] = []; onConnectionChange(s => seen.push(`${s.online}/${s.clubServer}`));
    reportClubServer('ok'); reportClubServer('ok');
    handlers.offline(); handlers.online(); reportClubServer('unauthorized');
    expect(seen).toEqual(['true/unknown', 'true/ok', 'false/ok', 'true/ok', 'true/unauthorized']);
    expect(connectionState().settlesOffline).toBe(false);
    handlers.offline();
    expect(connectionState().summary).toMatch(/Offline: local play continues/);
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
