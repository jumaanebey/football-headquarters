// Hero art loading. One decoded-frame cache per (kind, hero); each kind is an independent
// request so a campus card never waits for battle motion, and battle motion never waits for
// signatures. Concurrent callers share one in-flight promise; a failed download is forgotten so
// the next call retries (after a short delay, and immediately when the browser comes back
// online); callers keep their portrait fallback in the meantime. `warmHeroArt` is the only
// speculative path and it is bounded: a handful of heroes, only after a real player action,
// skipped under Save-Data, and it never fetches the whole library.
//
// Kinds: campus (derived 256 px sheet with alpha — cheap idle/stride/pose frames for the home
// campus and cards), elite (nine authored poses), motion (32/36 directional stride frames),
// reaction (hit flash, eight-column heroes), signature (four authored signature poses).
import { HERO_ATLAS } from '../game/heroAtlas';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';
import { HERO_MOVEMENT_STYLE } from '../game/heroMovementStyle';
import { keyHeroPixels } from '../game/heroAnimation';
import { heroPixelOwners } from '../game/heroPixelOwners';
import { HERO_SIGNATURE_ATLAS, signatureRegistration } from '../game/heroSignatureAtlas';
import { CAMPUS_FRAME, campusFrameCount, campusSheetPath } from '../game/heroCampusSheet';
import { assetUrl } from '../game/assetUrl';
import { campusArtReady } from '../game/artGate';

export type HeroArtKind = 'campus' | 'elite' | 'motion' | 'reaction' | 'signature';
export type HeroFrames = HTMLCanvasElement[];
export const HERO_ART_PATH: Record<HeroArtKind, (key: string) => string> = {
  campus: campusSheetPath,
  elite: key => `/assets/heroes/elite/${key}.webp`,
  motion: key => `/assets/heroes/motion/${key}.webp`,
  reaction: key => `/assets/heroes/reactions/${key}.webp`,
  signature: key => `/assets/heroes/signatures/${key}.webp`,
};
export const REACTION_HEROES = ['qb', 'enforcer'];
export const hasReactionSheet = (key: string) => REACTION_HEROES.includes(key);

interface Entry { promise: Promise<HeroFrames>; frames: HeroFrames | null }
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
const id = (kind: HeroArtKind, key: string) => `${kind}:${key}`;
const RETRY_DELAY_MS = 2500;

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.decoding = 'async'; image.onload = () => resolve(image); image.onerror = () => reject(new Error(`Hero art unavailable: ${src}`)); image.src = src; });
const canvasOf = (width: number, height: number) => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; };
const keyed = (image: HTMLImageElement) => {
  const canvas = canvasOf(image.naturalWidth, image.naturalHeight);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  keyHeroPixels(data.data); ctx.putImageData(data, 0, 0);
  return { canvas, ctx, data };
};
const frame256 = () => { const out = canvasOf(256, 256); const target = out.getContext('2d'); if (!target) throw new Error('Canvas unavailable'); target.scale(2 / 3, 2 / 3); return { out, target }; };

async function decodeElite(key: string): Promise<HeroFrames> {
  const bounds = HERO_ATLAS[key];
  if (!bounds || bounds.length !== 9) throw new Error('Incomplete hero atlas');
  const { canvas, ctx, data } = keyed(await loadImage(assetUrl(HERO_ART_PATH.elite(key))));
  const owners = heroPixelOwners(data.data, canvas.width, canvas.height, bounds);
  const scale = Math.min(340 / Math.max(...bounds.map(b => b[2] - b[0])), 346 / Math.max(...bounds.map(b => b[3] - b[1])));
  return bounds.map((b, frame) => {
    const { out, target } = frame256();
    const [x, y, right, bottom] = b, w = right - x, h = bottom - y;
    const crop = canvasOf(w, h), cropCtx = crop.getContext('2d')!;
    const clean = ctx.getImageData(x, y, w, h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const owner = owners[(y + yy) * canvas.width + x + xx]; if (owner >= 0 && owner !== frame) clean.data[(yy * w + xx) * 4 + 3] = 0; }
    cropCtx.putImageData(clean, 0, 0);
    let sum = 0, count = 0;
    for (let yy = Math.ceil(y + h * .06); yy < y + h * .30; yy++) for (let xx = x; xx < right; xx++) if (owners[yy * canvas.width + xx] === frame && data.data[(yy * canvas.width + xx) * 4 + 3] > 128) { sum += xx; count++; }
    const anchor = count ? sum / count - x : w / 2;
    const left = Math.max(12, Math.min(372 - w * scale, 192 - anchor * scale));
    const lift = frame === 3 || frame === 6 ? (HERO_MOVEMENT_STYLE[key]?.lift ?? 5) : 0;
    target.drawImage(crop, left, 370 - h * scale - lift, w * scale, h * scale);
    return out;
  });
}

async function decodeMotion(key: string): Promise<HeroFrames> {
  const bounds = HERO_MOTION_BOUNDS[key], original = HERO_ATLAS[key];
  if (!bounds || !original) return [];
  const { canvas, ctx, data } = keyed(await loadImage(assetUrl(HERO_ART_PATH.motion(key))));
  const owners = heroPixelOwners(data.data, canvas.width, canvas.height, bounds);
  const baseScale = Math.min(340 / Math.max(...original.map(b => b[2] - b[0])), 346 / Math.max(...original.map(b => b[3] - b[1])));
  const scale = Math.min((original[0][3] - original[0][1]) * baseScale / (bounds[0][3] - bounds[0][1]), 340 / Math.max(...bounds.map(b => b[2] - b[0])), 346 / Math.max(...bounds.map(b => b[3] - b[1])));
  return bounds.map(([x, y, right, bottom], index) => {
    const { out, target } = frame256();
    const crop = canvasOf(right - x, bottom - y);
    const clean = ctx.getImageData(x, y, crop.width, crop.height);
    for (let yy = 0; yy < crop.height; yy++) for (let xx = 0; xx < crop.width; xx++) { const owner = owners[(y + yy) * canvas.width + x + xx]; if (owner >= 0 && owner !== index) clean.data[(yy * crop.width + xx) * 4 + 3] = 0; }
    crop.getContext('2d')!.putImageData(clean, 0, 0);
    const w = crop.width * scale, h = crop.height * scale;
    target.drawImage(crop, 192 - w / 2, 370 - h, w, h);
    return out;
  });
}

async function decodeSignature(key: string, reaction: boolean): Promise<HeroFrames> {
  const spec = reaction ? (hasReactionSheet(key) ? { src: HERO_ART_PATH.reaction(key), anchorX: [.5, .5, .5, .5], stature: .92 } : undefined) : HERO_SIGNATURE_ATLAS[key];
  if (!spec) return [];
  const { canvas, data } = keyed(await loadImage(assetUrl(spec.src)));
  return signatureRegistration(key, data.data, canvas.width, canvas.height, spec).map(frame => {
    const { out, target } = frame256();
    target.drawImage(canvas, frame.x, frame.y, frame.w, frame.h, frame.dx, frame.dy, frame.w * frame.scale, frame.h * frame.scale);
    return out;
  });
}

/** The derived sheet already carries alpha and registration: slice it into frames, nothing else. */
async function decodeCampus(key: string): Promise<HeroFrames> {
  await campusArtReady();
  const count = campusFrameCount(key);
  const image = await loadImage(assetUrl(HERO_ART_PATH.campus(key)));
  if (image.naturalWidth !== CAMPUS_FRAME * count || image.naturalHeight !== CAMPUS_FRAME) throw new Error(`Campus sheet for ${key} has an unexpected layout`);
  return Array.from({ length: count }, (_, i) => { const out = canvasOf(CAMPUS_FRAME, CAMPUS_FRAME); out.getContext('2d')!.drawImage(image, i * CAMPUS_FRAME, 0, CAMPUS_FRAME, CAMPUS_FRAME, 0, 0, CAMPUS_FRAME, CAMPUS_FRAME); return out; });
}

const decoders: Record<HeroArtKind, (key: string) => Promise<HeroFrames>> = { campus: decodeCampus, elite: decodeElite, motion: decodeMotion, reaction: k => decodeSignature(k, true), signature: k => decodeSignature(k, false) };
const notify = () => { for (const l of listeners) { try { l(); } catch { /* listeners never break loading */ } } };

/** Load (or share the in-flight load of) one kind of art for one hero. Rejections clear the slot so a later call retries. */
export function loadHeroArt(kind: HeroArtKind, key: string): Promise<HeroFrames> {
  const slot = id(kind, key);
  const existing = cache.get(slot);
  if (existing) return existing.promise;
  const entry: Entry = { frames: null, promise: decoders[kind](key).then(frames => { entry.frames = frames; notify(); return frames; }).catch(error => { cache.delete(slot); throw error; }) };
  cache.set(slot, entry);
  return entry.promise;
}
/** Synchronous view for render loops: frames if decoded, otherwise null (never triggers a load). */
export const heroArtIfReady = (kind: HeroArtKind, key: string): HeroFrames | null => cache.get(id(kind, key))?.frames ?? null;
export const heroArtInFlight = (kind: HeroArtKind, key: string): boolean => { const e = cache.get(id(kind, key)); return !!e && !e.frames; };
/** Drop decoded frames (e.g. after a battle) so memory is released; the next request decodes again. */
export function releaseHeroArt(key: string, kinds: HeroArtKind[] = ['elite', 'motion', 'reaction', 'signature']): void { for (const kind of kinds) cache.delete(id(kind, key)); }
export function subscribeHeroArt(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** Retry helper for renderers: waits, then retries once; also retries as soon as the browser reports it is online again. */
export function loadHeroArtWithRetry(kind: HeroArtKind, key: string, signal?: { disposed: boolean }): Promise<HeroFrames> {
  return loadHeroArt(kind, key).catch(() => new Promise<HeroFrames>((resolve, reject) => {
    let settled = false;
    const attempt = () => { if (settled || signal?.disposed) return; settled = true; cleanup(); loadHeroArt(kind, key).then(resolve, reject); };
    const timer = setTimeout(attempt, RETRY_DELAY_MS);
    const cleanup = () => { clearTimeout(timer); if (typeof window !== 'undefined') window.removeEventListener('online', attempt); };
    if (typeof window !== 'undefined') window.addEventListener('online', attempt);
  }));
}

export interface WarmOptions { kinds?: HeroArtKind[]; maxHeroes?: number; concurrency?: number; respectPreferences?: boolean }
/** Data-saver preference, when the browser exposes it. Reduced motion skips motion/reaction/signature warming (those frames are not drawn under it). */
export const dataSaverOn = (): boolean => { try { return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData; } catch { return false; } };
export const reducedMotionOn = (): boolean => { try { return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/**
 * Intent-based warming: call after a real player action that makes these heroes likely to be
 * drawn soon (a game reserved with this lineup, a hero chosen in the Film Room). Bounded to
 * `maxHeroes` (default 5, a full lineup), `concurrency` 2, and skipped under Save-Data. Returns a
 * cancel function; cancelling stops further starts but never aborts an in-flight decode that a
 * renderer may also be waiting on.
 */
export function warmHeroArt(keys: string[], options: WarmOptions = {}): () => void {
  const { kinds = ['elite', 'motion', 'reaction'], maxHeroes = 5, concurrency = 2, respectPreferences = true } = options;
  if (respectPreferences && dataSaverOn()) return () => {};
  const wanted = kinds.filter(kind => !(respectPreferences && reducedMotionOn() && kind !== 'elite' && kind !== 'campus'));
  const queue: Array<[HeroArtKind, string]> = [];
  for (const key of [...new Set(keys)].slice(0, maxHeroes)) for (const kind of wanted) if (!(kind === 'reaction' && !hasReactionSheet(key)) && !cache.has(id(kind, key))) queue.push([kind, key]);
  let cancelled = false, active = 0;
  const next = () => { if (cancelled) return; while (active < concurrency && queue.length) { const [kind, key] = queue.shift()!; active++; loadHeroArt(kind, key).catch(() => {}).finally(() => { active--; next(); }); } };
  next();
  return () => { cancelled = true; queue.length = 0; };
}

/** Compatibility exports for the art review pages. */
export const loadHeroMotion = (key: string) => loadHeroArt('motion', key);
export const loadHeroSignatures = (key: string, reaction = false) => loadHeroArt(reaction ? 'reaction' : 'signature', key);
