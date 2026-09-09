import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RASTER = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
export const CRITICAL_ATLASES = [
  'assets/battle/field-equipment-cutouts.webp',
  'assets/buildings/upgraded-campus-cutouts.webp',
  'assets/decor/grounds-cutouts.webp',
];

/** Decode pixels, not just headers: a valid RIFF/WEBP header can hide a truncated export. */
export async function decodeRaster(bytes, name = 'image') {
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.length >= 12) {
    const declared = bytes.readUInt32LE(4) + 8;
    if (declared !== bytes.length) throw new Error(`${name}: RIFF declares ${declared} bytes; received ${bytes.length}`);
  }
  const { info } = await sharp(bytes, { failOn: 'warning', pages: -1 }).raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function rasterFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await rasterFiles(path));
    else if (RASTER.has(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files.sort();
}

async function main() {
  const root = resolve('public');
  const errors = [];
  const files = await rasterFiles(root);
  const manifest = {};
  for (const path of files) {
    const name = relative(root, path);
    try { manifest[name] = await decodeRaster(await readFile(path), name); }
    catch (error) { errors.push(`${name}: ${error.message}`); }
  }
  const baseArg = process.argv.indexOf('--base-url');
  if (baseArg >= 0) {
    const base = new URL(process.argv[baseArg + 1]);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Expected an HTTP(S) base URL');
    for (const name of CRITICAL_ATLASES) {
      try {
        const response = await fetch(new URL(name, base), { signal: AbortSignal.timeout(15000), cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const served = await decodeRaster(Buffer.from(await response.arrayBuffer()), name);
        if (served.sha256 !== manifest[name]?.sha256) throw new Error('Served bytes differ from the validated local asset');
      } catch (error) { errors.push(`served ${name}: ${error.message}`); }
    }
  }
  for (const name of CRITICAL_ATLASES) console.log(`${name}: ${JSON.stringify(manifest[name] ?? 'FAILED')}`);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`PASS: fully decoded ${files.length} raster assets${baseArg >= 0 ? '; served critical atlases match SHA-256' : ''}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
