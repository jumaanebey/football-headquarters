// Verify the shipped hero atlases without touching them. Decodes every hero sheet, checks the
// authored regions against real content and expected action coverage, and records asset
// hashes in art/hero-atlas-manifest.json so an unreviewed regeneration is caught.
//   npm run art:verify            check (fails on findings or on hashes that differ from the manifest)
//   npm run art:verify -- --write rewrite the manifest after a reviewed art change
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { MODERN_HEROES } from '../game/heroAnimation';
import { HERO_ATLAS } from '../game/heroAtlas';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';
import { HERO_SIGNATURE_ATLAS } from '../game/heroSignatureAtlas';
import { expectedActionCoverage, verifyCoverage, verifyEliteAtlas, verifyMotionSheet, verifySignatureSheet, type Finding, type Sheet } from './hero-atlas-lib';

const root = resolve(process.cwd());
const manifestPath = resolve(root, 'art/hero-atlas-manifest.json');
const write = process.argv.includes('--write');
const sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

type Entry = { sha256: string; width: number; height: number };
type Manifest = { heroes: Record<string, { files: Record<string, Entry>; regions: string }> };

const decode = async (rel: string): Promise<{ sheet: Sheet; entry: Entry } | null> => {
  const bytes = await readFile(resolve(root, 'public', rel)).catch(() => null);
  if (!bytes) return null;
  const { data, info } = await sharp(bytes, { failOn: 'warning' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { sheet: { width: info.width, height: info.height, pixels: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) }, entry: { sha256: sha(bytes), width: info.width, height: info.height } };
};

const findings: Finding[] = [];
const manifest: Manifest = { heroes: {} };
for (const key of MODERN_HEROES) {
  const files: Record<string, Entry> = {};
  const [motion, elite, signature, reaction] = await Promise.all(['motion', 'elite', 'signatures', 'reactions'].map(dir => decode(`assets/heroes/${dir}/${key}.webp`)));
  findings.push(...verifyCoverage(key, { motion: !!motion, elite: !!elite, signature: !!signature, reaction: !!reaction }));
  if (motion) { files[`motion/${key}.webp`] = motion.entry; findings.push(...verifyMotionSheet(key, motion.sheet)); }
  if (elite) { files[`elite/${key}.webp`] = elite.entry; findings.push(...verifyEliteAtlas(key, elite.sheet)); }
  if (signature) { files[`signatures/${key}.webp`] = signature.entry; findings.push(...verifySignatureSheet(key, signature.sheet)); }
  if (reaction && expectedActionCoverage(key).reactionFrames) { files[`reactions/${key}.webp`] = reaction.entry; findings.push(...verifySignatureSheet(key, reaction.sheet, true)); }
  manifest.heroes[key] = { files, regions: sha(JSON.stringify({ motion: HERO_MOTION_BOUNDS[key], elite: HERO_ATLAS[key], signature: HERO_SIGNATURE_ATLAS[key] })).slice(0, 16) };
  const c = expectedActionCoverage(key);
  console.log(`${key}: ${c.motionFrames} motion frames (${c.columns}×${c.rows}), ${c.elitePoses} elite poses, ${c.signatureFrames} signature poses${c.reactionFrames ? `, ${c.reactionFrames} reaction frames` : ''} — ${Object.keys(files).length} sheets decoded`);
}
for (const f of findings) console.log(`${f.level === 'fail' ? 'FAIL' : 'WARN'}  ${f.asset}: ${f.text}`);

let drift: string[] = [];
const previous = await readFile(manifestPath, 'utf8').then(t => JSON.parse(t) as Manifest).catch(() => null);
if (previous && !write) {
  for (const [key, hero] of Object.entries(manifest.heroes)) {
    const was = previous.heroes[key];
    if (!was) { drift.push(`${key}: not in manifest`); continue; }
    for (const [file, entry] of Object.entries(hero.files)) if (was.files[file]?.sha256 !== entry.sha256) drift.push(`${file}: sha256 ${entry.sha256.slice(0, 12)}… (manifest ${was.files[file]?.sha256.slice(0, 12) ?? 'absent'}…)`);
    for (const file of Object.keys(was.files)) if (!hero.files[file]) drift.push(`${file}: listed in manifest but no longer decodes`);
    if (was.regions !== hero.regions) drift.push(`${key}: authored regions changed (${was.regions} → ${hero.regions})`);
  }
  for (const d of drift) console.log(`FAIL  ${d}: changed without a manifest update — review with Codex, then npm run art:verify -- --write`);
}
if (write || !previous) { await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n'); console.log(`${previous ? 'rewrote' : 'wrote'} ${manifestPath}`); }
const failed = findings.filter(f => f.level === 'fail').length + drift.length;
console.log(failed ? `RESULT: ${failed} atlas problem(s)` : `RESULT: ${MODERN_HEROES.length} heroes verified; regions and hashes match the manifest`);
process.exitCode = failed ? 1 : 0;
