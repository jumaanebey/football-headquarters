import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// This executable check is also the CI/release path, not a second header-only test.
// @ts-expect-error The Node release script intentionally ships as executable ESM.
import { decodeRaster, CRITICAL_ATLASES } from '../scripts/verify-assets.mjs';

describe('image release integrity', () => {
  it('fully decodes the restored atlases', async () => {
    for (const path of CRITICAL_ATLASES) {
      const info = await decodeRaster(readFileSync(`public/${path}`), path);
      expect(info.width).toBeGreaterThan(0);
      expect(info.height).toBeGreaterThan(0);
      expect(info.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('rejects the exact truncation class that reached production', async () => {
    const bytes = readFileSync(`public/${CRITICAL_ATLASES[0]}`);
    await expect(decodeRaster(bytes.subarray(0, 600062), 'truncated atlas')).rejects.toThrow(/RIFF declares/);
  });
});
