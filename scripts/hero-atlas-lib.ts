// Non-destructive verification of hero art atlases: do the authored regions in
// game/heroMotionBounds.ts, game/heroAtlas.ts and game/heroSignatureAtlas.ts still describe
// real content in the shipped sheets, and does every hero ship the action coverage the
// renderer expects? Pure functions over decoded RGBA pixels; scripts/verify-hero-atlases.ts
// decodes the files and tests/heroAtlasTooling.test.ts drives synthetic sheets. Nothing here
// writes or regenerates art (Codex owns the art; this tooling only measures it).
import { keyHeroPixels } from '../game/heroAnimation';
import { heroPixelOwners } from '../game/heroPixelOwners';
import { heroMotionColumns } from '../game/heroMotion';
import { HERO_ATLAS } from '../game/heroAtlas';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';
import { HERO_SIGNATURE_ATLAS, signatureRegistration } from '../game/heroSignatureAtlas';

export interface Sheet { width: number; height: number; pixels: Uint8ClampedArray }
export interface Finding { asset: string; level: 'fail' | 'warn'; text: string }
export type Bounds = readonly (readonly number[])[];

/** What the battle renderer draws for a hero: motion frames by row/column, reactions for the eight-column sheets (hit-flash frames 32–35), four signature poses, nine elite poses. */
export const expectedActionCoverage = (key: string) => {
  const columns = heroMotionColumns(key);
  return { columns, rows: 4, motionFrames: columns * 4, reactionFrames: columns === 8 ? 4 : 0, signatureFrames: 4, elitePoses: 9 };
};

export const REACTION_SPEC = { anchorX: [.5, .5, .5, .5] as const, stature: .92 } as const;

/** Region checks shared by the motion sheets and the elite atlas. Overlap between authored regions is a warning (poses legitimately cross nominal cells; the pixel-owner pass resolves it), everything else fails. */
export function verifyRegions(asset: string, sheet: Sheet, bounds: Bounds | undefined, options: { count: number; columns: number; minOpaque?: number; maxOverlap?: number }): Finding[] {
  const findings: Finding[] = [];
  const fail = (text: string) => findings.push({ asset, level: 'fail', text });
  const warn = (text: string) => findings.push({ asset, level: 'warn', text });
  if (!bounds) { fail('no authored regions'); return findings; }
  if (bounds.length !== options.count) { fail(`${bounds.length} regions, expected ${options.count}`); return findings; }
  const { width, height } = sheet;
  bounds.forEach((b, i) => {
    if (b.length !== 4 || b.some(n => !Number.isInteger(n))) return fail(`region ${i} is not an integer box`);
    const [x, y, right, bottom] = b;
    if (x < 0 || y < 0 || right > width || bottom > height) fail(`region ${i} [${b.join(',')}] leaves the ${width}×${height} sheet`);
    if (right - x < 8 || bottom - y < 8) fail(`region ${i} [${b.join(',')}] is degenerate`);
  });
  if (findings.length) return findings;
  // Row/column order: the renderer indexes frames as row * columns + column.
  for (let i = 0; i < bounds.length; i++) {
    const row = Math.floor(i / options.columns), col = i % options.columns;
    if (col > 0 && bounds[i][0] < bounds[i - 1][0]) fail(`region ${i} (row ${row}, column ${col}) is left of the previous column`);
    if (col === 0 && row > 0) {
      const previousRowCenter = (bounds[i - 1][1] + bounds[i - 1][3]) / 2, center = (bounds[i][1] + bounds[i][3]) / 2;
      if (center <= previousRowCenter) fail(`row ${row} does not sit below row ${row - 1}`);
    }
  }
  // Content: after keying the backdrop, every region must own real foreground.
  const pixels = new Uint8ClampedArray(sheet.pixels);
  keyHeroPixels(pixels);
  const owners = heroPixelOwners(pixels, width, height, bounds);
  const opaque = new Array<number>(bounds.length).fill(0);
  for (let i = 0; i < owners.length; i++) if (owners[i] >= 0 && pixels[i * 4 + 3] >= 24) opaque[owners[i]]++;
  const minOpaque = options.minOpaque ?? 400;
  opaque.forEach((n, i) => { if (n < minOpaque) fail(`region ${i} [${bounds[i].join(',')}] owns only ${n} foreground pixels (min ${minOpaque}): empty or mis-authored`); });
  const maxOverlap = options.maxOverlap ?? .35;
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
    const a = bounds[i], b = bounds[j];
    const inter = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const smaller = Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
    if (inter / smaller > maxOverlap) warn(`regions ${i} and ${j} overlap by ${Math.round(inter / smaller * 100)}% of the smaller box`);
  }
  return findings;
}

export const verifyMotionSheet = (key: string, sheet: Sheet): Finding[] => verifyRegions(`heroes/motion/${key}.webp`, sheet, HERO_MOTION_BOUNDS[key], { count: expectedActionCoverage(key).motionFrames, columns: expectedActionCoverage(key).columns });
export const verifyEliteAtlas = (key: string, sheet: Sheet): Finding[] => verifyRegions(`heroes/elite/${key}.webp`, sheet, HERO_ATLAS[key], { count: 9, columns: 3, maxOverlap: .6 });

/** Signature and reaction sheets carry no authored boxes: registration is measured from the keyed pixels, so the check is that all four cells register and hold content. */
export function verifySignatureSheet(key: string, sheet: Sheet, reaction = false): Finding[] {
  const asset = `heroes/${reaction ? 'reactions' : 'signatures'}/${key}.webp`;
  const spec = reaction ? { src: asset, ...REACTION_SPEC } : HERO_SIGNATURE_ATLAS[key];
  if (!spec) return [{ asset, level: 'fail', text: 'no signature registration spec' }];
  const pixels = new Uint8ClampedArray(sheet.pixels);
  keyHeroPixels(pixels);
  try {
    const regions = signatureRegistration(key, pixels, sheet.width, sheet.height, spec);
    return regions.flatMap((r, i) => r.w * r.h < 64 * 64 ? [{ asset, level: 'fail' as const, text: `frame ${i} registers only ${r.w}×${r.h} pixels` }] : []);
  } catch (error) { return [{ asset, level: 'fail', text: (error as Error).message }]; }
}

/** Presence check against the expected coverage for a hero; `have` lists which sheets decoded. */
export function verifyCoverage(key: string, have: { motion: boolean; elite: boolean; signature: boolean; reaction: boolean }): Finding[] {
  const coverage = expectedActionCoverage(key);
  const findings: Finding[] = [];
  if (!have.motion) findings.push({ asset: `heroes/motion/${key}.webp`, level: 'fail', text: `missing: ${coverage.motionFrames} motion frames expected` });
  if (!have.elite) findings.push({ asset: `heroes/elite/${key}.webp`, level: 'fail', text: 'missing: 9 elite poses expected' });
  if (!have.signature) findings.push({ asset: `heroes/signatures/${key}.webp`, level: 'fail', text: 'missing: 4 signature poses expected' });
  if (coverage.reactionFrames && !have.reaction) findings.push({ asset: `heroes/reactions/${key}.webp`, level: 'fail', text: 'missing: hit-flash frames 32–35 come from the reaction sheet on eight-column heroes' });
  if (!coverage.reactionFrames && have.reaction) findings.push({ asset: `heroes/reactions/${key}.webp`, level: 'warn', text: 'present but unused: nine-column heroes take hit flash from motion column 8' });
  return findings;
}
