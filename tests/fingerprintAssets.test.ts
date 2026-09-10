// Build fingerprinting: content-addressed names, manifest over the loader-driven directories,
// identity resolver outside a production build.
import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAssetManifest, hashedName, LOADER_ONLY_DIRS } from '../build/fingerprintAssets';
import { assetUrl, assetManifestSize, isFingerprinted } from '../game/assetUrl';

describe('asset fingerprinting', () => {
  it('names copies by content hash and maps every raster in the fingerprinted directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fhq-fp-'));
    try {
      await mkdir(join(root, 'public/assets/heroes/campus'), { recursive: true });
      await mkdir(join(root, 'public/assets/brand'), { recursive: true });
      await writeFile(join(root, 'public/assets/heroes/campus/qb.webp'), 'RIFF-A');
      await writeFile(join(root, 'public/assets/heroes/campus/qb.txt'), 'not raster');
      await writeFile(join(root, 'public/assets/brand/logo.webp'), 'brand'); // not a fingerprinted directory
      await mkdir(join(root, 'public/assets/units'), { recursive: true }); await writeFile(join(root, 'public/assets/units/mascot.webp'), 'unit'); // templated <img> paths stay fixed
      const manifest = await buildAssetManifest(root);
      expect(Object.keys(manifest)).toEqual(['/assets/heroes/campus/qb.webp']);
      expect(manifest['/assets/heroes/campus/qb.webp']).toMatch(/^\/assets\/heroes\/campus\/qb\.[0-9a-f]{8}\.webp$/);
      await writeFile(join(root, 'public/assets/heroes/campus/qb.webp'), 'RIFF-B');
      expect((await buildAssetManifest(root))['/assets/heroes/campus/qb.webp']).not.toBe(manifest['/assets/heroes/campus/qb.webp']);
    } finally { await rm(root, { recursive: true, force: true }); }
    expect(hashedName('/assets/heroes/elite/qb.webp', 'abcdef0123456789')).toBe('/assets/heroes/elite/qb.abcdef01.webp');
    expect(LOADER_ONLY_DIRS).toContain('assets/heroes/motion');
  });
  it('resolves to the fixed path outside a production build', () => {
    expect(assetManifestSize()).toBe(0);
    expect(assetUrl('/assets/heroes/elite/qb.webp')).toBe('/assets/heroes/elite/qb.webp');
    expect(isFingerprinted('/assets/heroes/elite/qb.webp')).toBe(false);
  });
});
