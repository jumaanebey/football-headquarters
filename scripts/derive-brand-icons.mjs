// Derive install icons from the approved app icon (public/assets/brand/app-icon.png, 1024²):
// regular 192/512 (transparent corners preserved) and a maskable 512 with the icon scaled into
// the safe zone on the brand background, plus the 180 px Apple touch icon. Run once; outputs are
// committed. `--check` verifies the outputs exist with the right dimensions.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const source = 'public/assets/brand/app-icon.png';
const BG = { r: 15, g: 23, b: 42, alpha: 1 }; // #0f172a, the theme colour
const outputs = [
  { file: 'public/assets/brand/icon-192.png', size: 192, maskable: false },
  { file: 'public/assets/brand/icon-512.png', size: 512, maskable: false },
  { file: 'public/assets/brand/icon-512-maskable.png', size: 512, maskable: true },
  { file: 'public/assets/brand/apple-touch-icon-180.png', size: 180, maskable: true },
];
const check = process.argv.includes('--check');
let failures = 0;
for (const o of outputs) {
  if (check) {
    try { const m = await sharp(await readFile(o.file)).metadata(); const ok = m.width === o.size && m.height === o.size; console.log(`${ok ? 'PASS' : 'FAIL'}  ${o.file} ${m.width}×${m.height}`); if (!ok) failures++; } catch { console.log(`FAIL  ${o.file} missing`); failures++; }
    continue;
  }
  const icon = sharp(await readFile(source));
  let out;
  if (o.maskable) {
    // Maskable safe zone: content within the central 80 %; fill the rest with the theme colour.
    const inner = Math.round(o.size * 0.8);
    const scaled = await icon.resize(inner, inner).png().toBuffer();
    out = await sharp({ create: { width: o.size, height: o.size, channels: 4, background: BG } }).composite([{ input: scaled, left: Math.round((o.size - inner) / 2), top: Math.round((o.size - inner) / 2) }]).png().toBuffer();
  } else out = await icon.resize(o.size, o.size).png().toBuffer();
  await writeFile(o.file, out);
  console.log(`wrote ${o.file} (${(out.length / 1024).toFixed(0)} KB)`);
}
process.exitCode = failures ? 1 : 0;
