// Item 21: hero atlas tooling. The shared bounds writer preserves other heroes when one encoder
// reruns (the QB/Enforcer encoder used to overwrite the file with two heroes); the region
// verifier catches empty, misplaced, mis-ordered and mis-counted regions on synthetic sheets;
// expected action coverage matches what the renderer indexes.
import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMotionBounds, writeMotionBounds, mergeMotionBounds } from '../art/motion-bounds-io.mjs';
import { expectedActionCoverage, verifyRegions, verifyCoverage, type Sheet } from '../scripts/hero-atlas-lib';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';
import { heroMotionColumns } from '../game/heroMotion';

/** A magenta-keyed sheet with one opaque blob per region. */
const sheet = (width: number, height: number, blobs: number[][]): Sheet => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) { pixels[i * 4] = 255; pixels[i * 4 + 1] = 0; pixels[i * 4 + 2] = 255; pixels[i * 4 + 3] = 255; } // key colour everywhere
  for (const [x, y, right, bottom] of blobs) for (let yy = y; yy < bottom; yy++) for (let xx = x; xx < right; xx++) { const i = (yy * width + xx) * 4; pixels[i] = 30; pixels[i + 1] = 90; pixels[i + 2] = 40; pixels[i + 3] = 255; }
  return { width, height, pixels };
};
const grid = (columns: number, rows: number, cell = 50) => Array.from({ length: columns * rows }, (_, i) => { const c = i % columns, r = Math.floor(i / columns); return [c * cell + 8, r * cell + 8, c * cell + cell - 8, r * cell + cell - 8]; });
const fails = (f: ReturnType<typeof verifyRegions>) => f.filter(x => x.level === 'fail').map(x => x.text);

describe('motion bounds writer', () => {
  it('merges an encoder\'s heroes into the existing file and never drops the others', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fhq-bounds-'));
    const file = join(dir, 'heroMotionBounds.ts');
    try {
      const all = writeMotionBounds({ qb: [[1, 2, 30, 40]], coach: [[5, 6, 70, 80]], legend: [[9, 9, 90, 90]] }, file);
      expect(Object.keys(all)).toEqual(['qb', 'coach', 'legend']);
      // The QB/Enforcer encoder reruns with only its two heroes.
      const rerun = writeMotionBounds({ qb: [[2, 3, 31, 41]], enforcer: [[0, 0, 20, 20]] }, file);
      expect(rerun).toEqual({ qb: [[2, 3, 31, 41]], coach: [[5, 6, 70, 80]], legend: [[9, 9, 90, 90]], enforcer: [[0, 0, 20, 20]] });
      expect(readMotionBounds(file)).toEqual(rerun);
      const text = await readFile(file, 'utf8');
      expect(text.startsWith('// Authored source regions')).toBe(true);
      expect(text).toContain('export const HERO_MOTION_BOUNDS: Record<string, number[][]> = ');
      expect(() => mergeMotionBounds(rerun, { medic: [[1, 2, 3]] })).toThrow('not integer');
      expect(() => mergeMotionBounds(rerun, { medic: [[-1, 2, 3, 4]] })).toThrow('not integer');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('both encoders write through the shared merge (no wholesale overwrite left)', () => {
    for (const encoder of ['art/encode-motion.mjs', 'art/encode-roster-motion.mjs']) {
      const source = readFileSync(encoder, 'utf8');
      expect(source, encoder).toContain("from './motion-bounds-io.mjs'");
      expect(source, encoder).toContain('writeMotionBounds(bounds)');
      expect(source, encoder).not.toMatch(/writeFileSync\(['"]game\/heroMotionBounds/);
    }
    // The committed file parses through the same reader the encoders use and matches the module.
    expect(readMotionBounds()).toEqual(HERO_MOTION_BOUNDS);
  });
});

describe('atlas region verifier', () => {
  it('accepts a sheet whose regions each own content in row/column order', () => {
    const blobs = grid(4, 2);
    expect(verifyRegions('test', sheet(200, 100, blobs), blobs, { count: 8, columns: 4, minOpaque: 100 })).toEqual([]);
  });
  it('reports empty, escaped, mis-ordered, degenerate and mis-counted regions and overlapping ones', () => {
    const blobs = grid(4, 2);
    const emptyThird = sheet(200, 100, blobs.filter((_, i) => i !== 2));
    expect(fails(verifyRegions('t', emptyThird, blobs, { count: 8, columns: 4, minOpaque: 100 }))).toEqual([expect.stringContaining('region 2 [108,8,142,42] owns only 0 foreground pixels')]);
    const good = sheet(200, 100, blobs);
    expect(fails(verifyRegions('t', good, blobs.map((b, i) => i === 7 ? [b[0], b[1], 250, b[3]] : b), { count: 8, columns: 4 }))).toEqual([expect.stringContaining('leaves the 200×100 sheet')]);
    const swapped = blobs.map((b, i) => i === 1 ? blobs[2] : i === 2 ? blobs[1] : b);
    expect(fails(verifyRegions('t', good, swapped, { count: 8, columns: 4, minOpaque: 100 }))).toEqual([expect.stringContaining('region 2 (row 0, column 2) is left of the previous column')]);
    const rowsSwapped = [...blobs.slice(4), ...blobs.slice(0, 4)];
    expect(fails(verifyRegions('t', good, rowsSwapped, { count: 8, columns: 4, minOpaque: 100 }))).toEqual([expect.stringContaining('row 1 does not sit below row 0')]);
    expect(fails(verifyRegions('t', good, blobs.map((b, i) => i === 0 ? [b[0], b[1], b[0] + 3, b[3]] : b), { count: 8, columns: 4 }))).toEqual([expect.stringContaining('degenerate')]);
    expect(fails(verifyRegions('t', good, blobs.slice(0, 7), { count: 8, columns: 4 }))).toEqual(['7 regions, expected 8']);
    expect(fails(verifyRegions('t', good, undefined, { count: 8, columns: 4 }))).toEqual(['no authored regions']);
    const overlapping = blobs.map((b, i) => i === 1 ? [b[0] - 30, b[1], b[2], b[3]] : b);
    const warned = verifyRegions('t', good, overlapping, { count: 8, columns: 4, minOpaque: 100, maxOverlap: .2 }); // boxes overlap; the blobs do not
    expect(warned.filter(f => f.level === 'warn').map(f => f.text)).toEqual([expect.stringContaining('regions 0 and 1 overlap')]);
    expect(fails(warned)).toEqual([]);
  });
  it('expected coverage matches the renderer\'s frame indexing and the committed bounds', () => {
    for (const key of Object.keys(HERO_MOTION_BOUNDS)) {
      const c = expectedActionCoverage(key);
      expect(c.columns).toBe(heroMotionColumns(key));
      expect(HERO_MOTION_BOUNDS[key]).toHaveLength(c.motionFrames);
      expect(c.reactionFrames).toBe(c.columns === 8 ? 4 : 0); // hit flash: reaction sheet on 8-column heroes, column 8 otherwise
    }
    expect(verifyCoverage('qb', { motion: true, elite: true, signature: true, reaction: false })).toEqual([expect.objectContaining({ level: 'fail', asset: 'heroes/reactions/qb.webp' })]);
    expect(verifyCoverage('coach', { motion: true, elite: true, signature: true, reaction: true })).toEqual([expect.objectContaining({ level: 'warn' })]);
    expect(verifyCoverage('coach', { motion: false, elite: true, signature: true, reaction: false })).toEqual([expect.objectContaining({ level: 'fail', text: expect.stringContaining('36 motion frames') })]);
  });
});
