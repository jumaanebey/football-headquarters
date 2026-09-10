// Derive alpha-baked copies of the approved cutout atlases (game/derivedArt.ts). For each atlas:
// decode the original, run the SAME keying the renderer runs at runtime (keySceneryPixels for
// MatteSprite consumers, keyHeroPixels for the starter facilities), then encode lossy WebP with
// the alpha channel kept at full quality. Originals are never modified. Deterministic: same
// input + same quality → same bytes (sharp/libwebp are deterministic for a given version).
//   npm run art:cutouts              write the derived files and print byte counts
//   npm run art:cutouts -- --check   verify the derived files exist with the expected dimensions and alpha
//   npm run art:cutouts -- --quality 85
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { DERIVED_ATLASES } from '../game/derivedArt';
import { keySceneryPixels } from '../game/sceneryMatte';
import { keyHeroPixels } from '../game/heroAnimation';

const check = process.argv.includes('--check');
const qualityArg = process.argv.indexOf('--quality');
let failures = 0, inBytes = 0, outBytes = 0;
for (const atlas of DERIVED_ATLASES) {
  const original = `public${atlas.original}`, derived = `public${atlas.derived}`;
  const source = await readFile(original);
  const meta = await sharp(source).metadata();
  if (check) {
    try {
      const d = await sharp(await readFile(derived)).metadata();
      const ok = d.width === meta.width && d.height === meta.height && !!d.hasAlpha;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${atlas.derived} ${d.width}×${d.height}${d.hasAlpha ? ' alpha' : ' NO ALPHA'}`); if (!ok) failures++;
    } catch { console.log(`FAIL  ${atlas.derived} missing`); failures++; }
    continue;
  }
  const quality = qualityArg >= 0 ? Number(process.argv[qualityArg + 1]) : atlas.quality;
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  (atlas.keying === 'hero' ? keyHeroPixels : keySceneryPixels)(pixels);
  // Fully transparent pixels get a neutral colour so lossy chroma blocks cannot bleed backdrop tint into edges.
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] === 0) { pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; }
  const out = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer();
  await writeFile(derived, out);
  inBytes += source.length; outBytes += out.length;
  console.log(`wrote ${atlas.derived} q${quality}: ${(source.length / 1024).toFixed(0)} KB → ${(out.length / 1024).toFixed(0)} KB (${(100 - 100 * out.length / source.length).toFixed(0)}% smaller)`);
}
if (!check) console.log(`total ${(inBytes / 1024 / 1024).toFixed(2)} MB → ${(outBytes / 1024 / 1024).toFixed(2)} MB`);
process.exitCode = failures ? 1 : 0;
