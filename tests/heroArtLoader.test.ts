// Hero art loader: kinds load independently, concurrent callers share one request, failures
// are retryable and keep the fallback, campus sheets wait for the gate, warming is bounded and
// preference-aware. Runs against a minimal fake DOM (Image + 2D canvas) so no real decode happens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requests: string[] = [];
let failing = new Set<string>();
let pending: Array<() => void> = [];
class FakeImage {
  decoding = ''; onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 0; naturalHeight = 0;
  set src(value: string) {
    requests.push(value);
    const done = () => {
      if (failing.has(value)) { this.onerror?.(); return; }
      if (value.includes('/campus/')) { this.naturalWidth = 256 * 19; this.naturalHeight = 256; }
      else if (value.includes('/motion/')) { this.naturalWidth = 1774; this.naturalHeight = 887; }
      else { this.naturalWidth = 1254; this.naturalHeight = 1254; }
      this.onload?.();
    };
    pending.push(done);
  }
}
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const flush = async () => { for (let round = 0; round < 12; round++) { const batch = pending; pending = []; for (const p of batch) p(); await tick(); if (!pending.length) break; } };
const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, scale() {}, putImageData() {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }) }) });

beforeEach(() => {
  vi.resetModules(); requests.length = 0; failing = new Set(); pending = [];
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', { createElement: (tag: string) => tag === 'canvas' ? fakeCanvas() : {} });
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('navigator', {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const load = async () => { const gate = await import('../game/artGate'); gate.resetCampusArtGateForTests(); const loader = await import('../components/heroArtLoader'); return { ...loader, gate }; };

describe('hero art loader', () => {
  it('shares one request among concurrent callers and keeps decoded frames for synchronous reads', async () => {
    const { loadHeroArt, heroArtIfReady, heroArtInFlight } = await load();
    const a = loadHeroArt('elite', 'qb'), b = loadHeroArt('elite', 'qb');
    expect(a).toBe(b); expect(heroArtInFlight('elite', 'qb')).toBe(true);
    await flush();
    expect(requests).toEqual(['/assets/heroes/elite/qb.alpha.webp']);
    expect((await a).length).toBe(9);
    expect(heroArtIfReady('elite', 'qb')?.length).toBe(9);
    expect(heroArtIfReady('motion', 'qb')).toBeNull(); // nothing else was requested as a side effect
  });
  it('loads motion, reactions and signatures as independent requests', async () => {
    const { loadHeroArt } = await load();
    const motion = loadHeroArt('motion', 'qb'); const signature = loadHeroArt('signature', 'qb'); const reaction = loadHeroArt('reaction', 'qb');
    expect(requests.sort()).toEqual(['/assets/heroes/motion/qb.alpha.webp', '/assets/heroes/reactions/qb.alpha.webp', '/assets/heroes/signatures/qb.alpha.webp']);
    const first = pending.shift()!; first(); await tick();
    expect((await motion).length).toBe(32);
    let signatureDone = false; void signature.then(() => { signatureDone = true; });
    await tick(); expect(signatureDone).toBe(false); // still pending, independently
    await flush();
    expect((await signature).length).toBe(4); expect((await reaction).length).toBe(4);
    expect((await loadHeroArt('reaction', 'coach')).length).toBe(0); // nine-column heroes have no reaction sheet: no request
    expect(requests.filter(r => r.includes('reactions/coach'))).toEqual([]);
  });
  it('forgets a failed download so the next call retries, and the retry helper retries after a delay', async () => {
    vi.useFakeTimers();
    const { loadHeroArt, loadHeroArtWithRetry, heroArtIfReady } = await load();
    failing.add('/assets/heroes/motion/enforcer.alpha.webp'); failing.add('/assets/heroes/motion/enforcer.webp');
    await expect((async () => { const p = loadHeroArt('motion', 'enforcer'); await flush(); return p; })()).rejects.toThrow('Hero art unavailable');
    expect(heroArtIfReady('motion', 'enforcer')).toBeNull();
    const retried = loadHeroArtWithRetry('motion', 'enforcer');
    await flush(); // first attempt fails
    failing.delete('/assets/heroes/motion/enforcer.alpha.webp'); failing.delete('/assets/heroes/motion/enforcer.webp');
    await vi.advanceTimersByTimeAsync(2500);
    await flush();
    expect((await retried).length).toBe(32);
    expect(requests.filter(r => r.includes('motion/enforcer')).length).toBe(5);
  });
  it('falls back to the original when the derived sheet is unavailable', async()=>{
    const {loadHeroArt}=await load();
    failing.add('/assets/heroes/elite/qb.alpha.webp');
    const result=loadHeroArt('elite','qb');await flush();
    expect((await result).length).toBe(9);
    expect(requests).toEqual(['/assets/heroes/elite/qb.alpha.webp','/assets/heroes/elite/qb.webp']);
  });
  it('campus sheets wait for the art gate and validate their layout', async () => {
    const { loadHeroArt, gate } = await load();
    gate.armCampusArtGate({ getItem: () => null });
    const campus = loadHeroArt('campus', 'qb');
    await Promise.resolve(); await Promise.resolve();
    expect(requests).toEqual([]); // nothing requested while the naming card is up
    gate.openCampusArt();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(requests).toEqual(['/assets/heroes/campus/qb.webp']);
    await flush();
    expect((await campus).length).toBe(19);
  });
  it('warming is bounded, deduplicated and skipped under Save-Data', async () => {
    const { warmHeroArt } = await load();
    warmHeroArt(['qb', 'coach', 'kicker', 'burner', 'medic', 'captain', 'legend'], { concurrency: 2 });
    expect(requests.length).toBe(2); // concurrency bound
    await flush();
    const heroes = new Set(requests.map(r => r.split('/').pop()));
    expect(heroes.size).toBe(5); // maxHeroes: a lineup, never the library
    expect(requests.filter(r => r.includes('/reactions/')).length).toBe(1); // only qb has one among the five
    expect(requests.filter(r => r.includes('/signatures/')).length).toBe(0); // signatures are not warmed by default
    const before = requests.length;
    warmHeroArt(['qb']); await flush();
    expect(requests.length).toBe(before); // already cached: no new requests
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    warmHeroArt(['playmaker']); await flush();
    expect(requests.some(r => r.includes('playmaker'))).toBe(false);
  });
  it('reduced motion skips motion/reaction warming but still allows the elite poses', async () => {
    vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }) });
    const { warmHeroArt } = await load();
    warmHeroArt(['enforcer']); await flush();
    expect(requests).toEqual(['/assets/heroes/elite/enforcer.alpha.webp']);
  });
});

describe('warming handles and decoded-art lifecycle', () => {
  it('a newer warm supersedes the older one: stale selections never widen to the library, in-flight unretained requests are abandoned', async () => {
    const { warmHeroArt, heroArtStats } = await load();
    const first = warmHeroArt(['coach', 'kicker', 'burner', 'medic', 'captain'], { concurrency: 2 });
    expect(requests.length).toBe(2); // two in flight, rest queued
    const second = warmHeroArt(['qb'], { concurrency: 2 });
    expect(second.generation).toBeGreaterThan(first.generation);
    const firstOutcome = await first.done;
    expect(firstOutcome.cancelled).toBe(true);
    await flush(); await flush();
    const heroes = new Set(requests.filter(Boolean).map(r => r.split('/').pop()!.replace(/(?:\.alpha)?\.webp$/, '')));
    expect([...heroes].every(h => ['coach', 'kicker', 'qb'].includes(h))).toBe(true); // only what had started plus the new selection
    for (const never of ['burner', 'medic', 'captain']) expect(heroes.has(never), never).toBe(false); // the queued rest of the stale selection is never requested
    expect(heroArtStats().entries.some(e => e.key === 'burner')).toBe(false);
    const secondOutcome = await second.done;
    expect(secondOutcome).toMatchObject({ requested: 3, loaded: 3, failed: 0, cancelled: false });
    expect(heroArtStats().entries.filter(e => e.key === 'qb').map(e => e.kind).sort()).toEqual(['elite', 'motion', 'reaction']);
  });
  it('cancellation abandons only unretained requests; retained entries survive release; stats track frames and subscribers', async () => {
    const { loadHeroArt, retainHeroArt, cancelHeroArt, releaseUnretainedHeroArt, heroArtStats, subscribeHeroArt } = await load();
    const motion = loadHeroArt('motion', 'qb'); const release = retainHeroArt('motion', 'qb');
    await Promise.resolve();
    expect(cancelHeroArt('motion', 'qb')).toBe(false); // retained by a mounted consumer: not abandonable
    const elite = loadHeroArt('elite', 'qb'); await Promise.resolve();
    expect(cancelHeroArt('elite', 'qb')).toBe(true); // nobody holds it: abandoned
    await expect(elite).rejects.toThrow('abandoned');
    await flush();
    expect((await motion).length).toBe(32);
    const unsubscribe = subscribeHeroArt(() => {});
    const gate = await import('../game/artGate'); gate.openCampusArt();
    const sig = loadHeroArt('signature', 'qb'); const campus = loadHeroArt('campus', 'coach'); await flush(); await sig; await campus;
    let stats = heroArtStats();
    expect(stats.retainedEntries).toBe(1); expect(stats.listeners).toBe(1);
    expect(stats.entries.find(e => e.kind === 'signature')?.frames).toBe(4);
    expect(releaseUnretainedHeroArt()).toBe(1); // the unretained signature frames go; retained motion and the campus sheet stay
    stats = heroArtStats();
    expect(stats.entries.map(e => `${e.kind}:${e.key}`).sort()).toEqual(['campus:coach', 'motion:qb']);
    release(); unsubscribe();
    expect(releaseUnretainedHeroArt({ keep: ['qb'] })).toBe(0); // kept on request
    expect(releaseUnretainedHeroArt()).toBe(1);
    expect(heroArtStats()).toMatchObject({ decodedFrames: 19, retainedEntries: 0, listeners: 0 });
  });
  it('heroesInConfig lists exactly the heroes a battle draws', async () => {
    const { heroesInConfig } = await load();
    expect(heroesInConfig({ heroes: [{ key: 'qb' }, { key: 'burner' }, { key: 'qb' }], guards: [{ heroKey: 'enforcer' }, {}] })).toEqual(['qb', 'burner', 'enforcer']);
    expect(heroesInConfig(null)).toEqual([]);
  });
});
