// Visual and numeric comparison of derived alpha-baked atlases against the originals keyed at
// runtime. For every atlas: sample regions (as the renderer crops them), composite both versions
// over light turf, dark turf and a checkerboard at phone scale (≈120 px) and desktop scale
// (≈420 px), write a contact sheet PNG per atlas to docs/evidence/derived-art/, and print
// metrics: bytes, mean/max colour difference over visible pixels, alpha mismatch count, and
// "fringe" pixels (visible pixels whose colour still carries backdrop magenta).
//   npm run art:compare
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { DERIVED_ATLASES } from '../game/derivedArt';
import { keySceneryPixels } from '../game/sceneryMatte';
import { keyHeroPixels } from '../game/heroAnimation';

type Raw = { data: Uint8ClampedArray; width: number; height: number };
const decode = async (path: string): Promise<Raw> => { const { data, info } = await sharp(await readFile(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height }; };
/** Regions in normalized [x, y, w, h], as the renderers crop them. */
const REGIONS: Record<string, Array<[string, number, number, number, number]>> = {
  '/assets/buildings/starter-campus-cutouts.webp': [['film room', 76 / 1254, 136 / 1254, 451 / 1254, 424 / 1254], ['practice field', 686 / 1254, 725 / 1254, 477 / 1254, 379 / 1254], ['rehab', 77 / 1254, 717 / 1254, 470 / 1254, 431 / 1254]],
  '/assets/buildings/stadium-1-cutout.webp': [['stadium', 0, 0, 1, 1]],
  '/assets/buildings/upgraded-campus-cutouts.webp': [['stadium-3', 3 / 4, 2 / 4, 1 / 4, 1 / 4], ['headquarters-2', 2 / 4, 0, 1 / 4, 1 / 4], ['weight-room-5', 3 / 4, 3 / 4, 1 / 4, 1 / 4]],
  '/assets/decor/tailgate-tent-cutout.webp': [['tent', 0, 0, 1, 1]],
  '/assets/decor/grounds-cutouts.webp': [['fan tents', 0, 95 / 600, 1 / 2, 410 / 600], ['tree cluster', 1 / 2, 0, 1 / 2, 1]],
  '/assets/battle/field-equipment-cutouts.webp': [['rival stadium', 1 / 4, 0, 1 / 4, 1 / 4], ['jugs machine', 2 / 4, 0, 1 / 4, 1 / 4], ['ref tower', 3 / 4, 1 / 4, 1 / 4, 1 / 4], ['t-shirt cannon', 2 / 4, 2 / 4, 1 / 4, 1 / 4]],
};
const BACKGROUNDS: Array<[string, (x: number, y: number) => [number, number, number]]> = [
  ['light turf', () => [92, 158, 74]], ['dark turf', () => [34, 82, 38]], ['checker', (x, y) => ((Math.floor(x / 12) + Math.floor(y / 12)) % 2 ? [200, 200, 200] : [120, 120, 120])],
];
const crop = (src: Raw, r: [number, number, number, number]) => { const x = Math.round(r[0] * src.width), y = Math.round(r[1] * src.height), w = Math.round(r[2] * src.width), h = Math.round(r[3] * src.height); const out = new Uint8ClampedArray(w * h * 4); for (let yy = 0; yy < h; yy++) out.set(src.data.subarray(((y + yy) * src.width + x) * 4, ((y + yy) * src.width + x + w) * 4), yy * w * 4); return { data: out, width: w, height: h }; };
const composite = async (img: Raw, bg: (x: number, y: number) => [number, number, number], size: number) => {
  const scale = size / Math.max(img.width, img.height); const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const resized = await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } }).resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer();
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, o = (y * w + x) * 3, a = resized[i + 3] / 255, [br, bgc, bb] = bg(x, y); out[o] = Math.round(resized[i] * a + br * (1 - a)); out[o + 1] = Math.round(resized[i + 1] * a + bgc * (1 - a)); out[o + 2] = Math.round(resized[i + 2] * a + bb * (1 - a)); }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
};
const metrics = (a: Raw, b: Raw) => {
  let visible = 0, sum = 0, max = 0, alphaMismatch = 0, fringeA = 0, fringeB = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const aa = a.data[i + 3], ab = b.data[i + 3];
    if (Math.abs(aa - ab) > 32) alphaMismatch++;
    if (aa > 24 && ab > 24) { visible++; const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])); sum += d; if (d > max) max = d; }
    if (aa > 24 && Math.min(a.data[i], a.data[i + 2]) - a.data[i + 1] > 20) fringeA++;
    if (ab > 24 && Math.min(b.data[i], b.data[i + 2]) - b.data[i + 1] > 20) fringeB++;
  }
  return { visible, meanDiff: visible ? sum / visible : 0, maxDiff: max, alphaMismatch, fringeOriginal: fringeA, fringeDerived: fringeB };
};

await mkdir('docs/evidence/derived-art', { recursive: true });
const report: Record<string, unknown>[] = [];
for (const atlas of DERIVED_ATLASES) {
  const original = await decode(`public${atlas.original}`); (atlas.keying === 'hero' ? keyHeroPixels : keySceneryPixels)(original.data);
  const derived = await decode(`public${atlas.derived}`);
  const inBytes = (await readFile(`public${atlas.original}`)).length, outBytes = (await readFile(`public${atlas.derived}`)).length;
  const m = metrics(original, derived);
  const tiles: Array<{ input: Buffer; left: number; top: number }> = []; let top = 0, sheetWidth = 0;
  for (const [label, ...r] of REGIONS[atlas.original]) {
    const a = crop(original, r as [number, number, number, number]), b = crop(derived, r as [number, number, number, number]);
    let left = 0, rowHeight = 0;
    for (const size of [120, 420]) for (const [, bg] of BACKGROUNDS) for (const img of [a, b]) { const png = await composite(img, bg, size); const meta = await sharp(png).metadata(); tiles.push({ input: png, left, top }); left += (meta.width ?? size) + 6; rowHeight = Math.max(rowHeight, meta.height ?? size); }
    sheetWidth = Math.max(sheetWidth, left); top += rowHeight + 10;
    void label;
  }
  const sheet = await sharp({ create: { width: sheetWidth, height: top, channels: 3, background: { r: 24, g: 24, b: 28 } } }).composite(tiles).png().toBuffer();
  const file = `docs/evidence/derived-art/${atlas.original.split('/').pop()!.replace('.webp', '')}.png`;
  await writeFile(file, sheet);
  const row = { atlas: atlas.original, keying: atlas.keying, inBytes, outBytes, ...m, meanDiff: Number(m.meanDiff.toFixed(2)), sheet: file, regions: REGIONS[atlas.original].map(r => r[0]) };
  report.push(row);
  console.log(`${atlas.original}: ${(inBytes / 1024).toFixed(0)} → ${(outBytes / 1024).toFixed(0)} KB · visible px ${m.visible} · mean Δ ${m.meanDiff.toFixed(2)} max Δ ${m.maxDiff} · alpha mismatches ${m.alphaMismatch} · fringe px original ${m.fringeOriginal} / derived ${m.fringeDerived} · sheet ${file}`);
}
await writeFile('docs/evidence/derived-art/report.json', JSON.stringify(report, null, 2));
