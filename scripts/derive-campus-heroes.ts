// Derive the campus sheets (public/assets/heroes/campus/<key>.webp) from the approved elite
// atlases and motion sheets. Same crop, owner cleanup, scale and registration as
// components/AnimatedHero.tsx (elite) and components/loadHeroMotion.ts (motion), baked at the
// renderer's native 256 px frame size, saved with alpha as lossy WebP. Nothing under
// heroes/elite, heroes/motion, heroes/signatures or heroes/reactions is touched.
//   npm run art:campus            write sheets and print sizes
//   npm run art:campus -- --check fail if a sheet is missing or its frame count/dimensions disagree with game/heroCampusSheet.ts
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import sharp from 'sharp';
import { MODERN_HEROES, keyHeroPixels } from '../game/heroAnimation';
import { HERO_ATLAS } from '../game/heroAtlas';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';
import { HERO_MOVEMENT_STYLE } from '../game/heroMovementStyle';
import { heroPixelOwners } from '../game/heroPixelOwners';
import { CAMPUS_FRAME, campusFrameCount, campusFrameMap } from '../game/heroCampusSheet';

const check = process.argv.includes('--check');
const quality = Number(process.argv[process.argv.indexOf('--quality') + 1]) || 88;
const decode = async (path: string) => { const { data, info } = await sharp(await readFile(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { pixels: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height }; };

/** Crop a frame region, drop pixels owned by other frames, and place it in a 256 px frame at the given 384-space rectangle. */
async function bakeFrame(sheet: { pixels: Uint8ClampedArray; width: number; height: number }, owners: Int16Array, frame: number, bounds: readonly number[], place: { left: number; top: number; w: number; h: number }) {
  const [x, y, right, bottom] = bounds; const w = right - x, h = bottom - y;
  const crop = Buffer.alloc(w * h * 4);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const src = ((y + yy) * sheet.width + x + xx), dst = (yy * w + xx) * 4;
    const owner = owners[src];
    crop[dst] = sheet.pixels[src * 4]; crop[dst + 1] = sheet.pixels[src * 4 + 1]; crop[dst + 2] = sheet.pixels[src * 4 + 2];
    crop[dst + 3] = owner >= 0 && owner !== frame ? 0 : sheet.pixels[src * 4 + 3];
  }
  const scale = 2 / 3; // 384-space → 256 px frame, as the renderer's ctx.scale(2/3, 2/3)
  const dw = Math.max(1, Math.round(place.w * scale)), dh = Math.max(1, Math.round(place.h * scale));
  const resized = await sharp(crop, { raw: { width: w, height: h, channels: 4 } }).resize(dw, dh, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  return { input: resized, left: Math.round(place.left * scale), top: Math.round(place.top * scale), width: dw, height: dh };
}

async function deriveHero(key: string) {
  const elite = await decode(`public/assets/heroes/elite/${key}.webp`);
  const motion = await decode(`public/assets/heroes/motion/${key}.webp`);
  keyHeroPixels(elite.pixels); keyHeroPixels(motion.pixels);
  const eliteBounds = HERO_ATLAS[key], motionBounds = HERO_MOTION_BOUNDS[key];
  const eliteOwners = heroPixelOwners(elite.pixels, elite.width, elite.height, eliteBounds);
  const motionOwners = heroPixelOwners(motion.pixels, motion.width, motion.height, motionBounds);
  const map = campusFrameMap(key);
  const frames: Array<{ input: Buffer; left: number; top: number }> = [];
  // Elite poses: AnimatedHero.loadSheet registration.
  const eliteScale = Math.min(340 / Math.max(...eliteBounds.map(b => b[2] - b[0])), 346 / Math.max(...eliteBounds.map(b => b[3] - b[1])));
  for (const frame of map.elite) {
    const [x, y, right, bottom] = eliteBounds[frame], w = right - x, h = bottom - y;
    let sum = 0, count = 0;
    for (let yy = Math.ceil(y + h * .06); yy < y + h * .30; yy++) for (let xx = x; xx < right; xx++) { const i = yy * elite.width + xx; if (eliteOwners[i] === frame && elite.pixels[i * 4 + 3] > 128) { sum += xx; count++; } }
    const anchor = count ? sum / count - x : w / 2;
    const left = Math.max(12, Math.min(372 - w * eliteScale, 192 - anchor * eliteScale));
    const lift = frame === 3 || frame === 6 ? (HERO_MOVEMENT_STYLE[key]?.lift ?? 5) : 0;
    frames.push(await bakeFrame(elite, eliteOwners, frame, eliteBounds[frame], { left, top: 370 - h * eliteScale - lift, w: w * eliteScale, h: h * eliteScale }));
  }
  // Motion frames: loadHeroMotion registration.
  const baseScale = eliteScale;
  const motionScale = Math.min((eliteBounds[0][3] - eliteBounds[0][1]) * baseScale / (motionBounds[0][3] - motionBounds[0][1]), 340 / Math.max(...motionBounds.map(b => b[2] - b[0])), 346 / Math.max(...motionBounds.map(b => b[3] - b[1])));
  for (const [motionIndex] of Object.entries(map.motion).map(([m, i]) => [Number(m), i] as const).sort((a, b) => a[1] - b[1])) {
    const [x, y, right, bottom] = motionBounds[motionIndex], w = (right - x) * motionScale, h = (bottom - y) * motionScale;
    frames.push(await bakeFrame(motion, motionOwners, motionIndex, motionBounds[motionIndex], { left: 192 - w / 2, top: 370 - h, w, h }));
  }
  const composite = frames.map((f, i) => ({ input: f.input, left: i * CAMPUS_FRAME + f.left, top: f.top }));
  const sheet = await sharp({ create: { width: CAMPUS_FRAME * frames.length, height: CAMPUS_FRAME, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).webp({ quality, alphaQuality: 90, effort: 6 }).toBuffer();
  return sheet;
}

await mkdir('public/assets/heroes/campus', { recursive: true });
let failures = 0, total = 0;
for (const key of MODERN_HEROES) {
  const path = `public/assets/heroes/campus/${key}.webp`;
  const expectedWidth = CAMPUS_FRAME * campusFrameCount(key);
  if (check) {
    try { const meta = await sharp(await readFile(path)).metadata(); const ok = meta.width === expectedWidth && meta.height === CAMPUS_FRAME && meta.hasAlpha; console.log(`${ok ? 'PASS' : 'FAIL'}  ${path} ${meta.width}×${meta.height}${ok ? '' : ` (expected ${expectedWidth}×${CAMPUS_FRAME} with alpha)`}`); if (!ok) failures++; }
    catch { console.log(`FAIL  ${path} missing`); failures++; }
    continue;
  }
  const sheet = await deriveHero(key);
  await writeFile(path, sheet);
  total += sheet.length;
  console.log(`wrote ${path} ${campusFrameCount(key)} frames ${(sheet.length / 1024).toFixed(0)} KB (from elite ${((await stat(`public/assets/heroes/elite/${key}.webp`)).size / 1024).toFixed(0)} KB + motion ${((await stat(`public/assets/heroes/motion/${key}.webp`)).size / 1024).toFixed(0)} KB)`);
}
if (!check) console.log(`campus sheets total ${(total / 1024).toFixed(0)} KB for ${MODERN_HEROES.length} heroes`);
process.exitCode = failures ? 1 : 0;
