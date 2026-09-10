// Vite plugin: content-addressed URLs for the heavy, loader-driven art under public/assets.
// At build time every raster file in the configured directories gets a copy named
// `<name>.<sha256:8>.<ext>` next to the original in dist, and the mapping is exposed as the
// virtual module `virtual:fhq-asset-manifest` (imported by game/assetUrl.ts) and written to
// dist/asset-manifest.json. Fixed (unhashed) URLs stay in place when any source file references
// them literally — those keep `must-revalidate` caching; the hashed copies get immutable caching
// through vercel.json. In dev and tests the manifest is empty and assetUrl() is the identity.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, relative, extname, posix } from 'node:path';
import type { Plugin } from 'vite';

/** Hero sheets are read only by components/heroArtLoader.ts, so their fixed URLs can go; the
 *  cutout atlases are read through MatteSprite/BuildingArt but may also appear in templates or
 *  markup, so their fixed copies stay alongside the fingerprinted ones. Everything else (unit
 *  frames, portraits, coaches, brand) is small, reached by templated `<img>` paths and left alone. */
export const LOADER_ONLY_DIRS = ['assets/heroes/campus', 'assets/heroes/elite', 'assets/heroes/motion', 'assets/heroes/signatures', 'assets/heroes/reactions'];
export const FINGERPRINT_DIRS = [...LOADER_ONLY_DIRS, 'assets/heroes/rig', 'assets/heroes/franchise-rig', 'assets/buildings', 'assets/decor', 'assets/battle'];
const FINGERPRINT_FILE = (rel: string) => LOADER_ONLY_DIRS.some(d => rel.startsWith('/' + d + '/')) || rel.includes('/heroes/rig/') || rel.includes('/heroes/franchise-rig/') || rel.includes('cutout');
const RASTER = new Set(['.webp', '.png', '.jpg', '.jpeg', '.avif', '.gif']);
const VIRTUAL = 'virtual:fhq-asset-manifest';
const RESOLVED = '\0' + VIRTUAL;

export const hashedName = (file: string, hash: string) => { const ext = extname(file); return `${file.slice(0, -ext.length)}.${hash.slice(0, 8)}${ext}`; };

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (RASTER.has(extname(entry.name).toLowerCase())) out.push(path);
  }
  return out.sort();
}

/** Literal `/assets/...` references anywhere in the source tree keep their unhashed copy. */
async function literalReferences(root: string): Promise<Set<string>> {
  const refs = new Set<string>();
  const scan = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git', 'public', 'supabase', 'tests', 'art', 'docs', 'scripts'].includes(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (/\.(tsx?|css|html|mjs)$/.test(entry.name)) for (const m of (await fs.readFile(path, 'utf8')).matchAll(/\/assets\/[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g|avif|gif)/g)) refs.add(m[0]);
    }
  };
  await scan(root);
  return refs;
}

export async function buildAssetManifest(root: string, publicDir = 'public'): Promise<Record<string, string>> {
  const manifest: Record<string, string> = {};
  for (const dir of FINGERPRINT_DIRS) {
    for (const file of await walk(join(root, publicDir, dir))) {
      const rel = '/' + posix.join(...relative(join(root, publicDir), file).split(/[\\/]/));
      if (!FINGERPRINT_FILE(rel)) continue;
      const hash = createHash('sha256').update(await fs.readFile(file)).digest('hex');
      manifest[rel] = hashedName(rel, hash);
    }
  }
  return manifest;
}

export function fingerprintAssets(): Plugin {
  let root = process.cwd(), outDir = 'dist', building = false;
  let manifest: Record<string, string> = {};
  return {
    name: 'fhq-fingerprint-assets',
    configResolved(config) { root = config.root; outDir = config.build.outDir; building = config.command === 'build'; },
    async buildStart() { manifest = building ? await buildAssetManifest(root) : {}; },
    resolveId(id) { return id === VIRTUAL ? RESOLVED : null; },
    load(id) { return id === RESOLVED ? `export default ${JSON.stringify(manifest)};` : null; },
    async closeBundle() {
      if (!building) return;
      const refs = await literalReferences(root);
      let copied = 0, removed = 0;
      for (const [original, hashed] of Object.entries(manifest)) {
        const from = join(root, outDir, original), to = join(root, outDir, hashed);
        await fs.copyFile(from, to); copied++;
        const loaderOnly = LOADER_ONLY_DIRS.some(d => original.startsWith('/' + d + '/'));
        if (loaderOnly && !refs.has(original)) { await fs.unlink(from); removed++; }
      }
      await fs.writeFile(join(root, outDir, 'asset-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), entries: manifest }, null, 1));
      console.log(`fhq-fingerprint-assets: ${copied} fingerprinted copies; ${removed} loader-only fixed URLs removed; ${copied - removed} fixed URLs kept`);
    },
  };
}
