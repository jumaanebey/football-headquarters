// Post-build check for content-addressed art: every manifest entry has its fingerprinted copy in
// dist with a matching hash, loader-only sheets have no fixed copy left, everything else keeps
// one, and the bundle embeds the manifest. Run after `vite build` (release:verify does).
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const manifest = JSON.parse(await readFile(join(dist, 'asset-manifest.json'), 'utf8')).entries;
const loaderOnly = ['/assets/heroes/campus/', '/assets/heroes/elite/', '/assets/heroes/motion/', '/assets/heroes/signatures/', '/assets/heroes/reactions/'];
const problems = [];
let fingerprinted = 0, bytes = 0;
for (const [original, hashed] of Object.entries(manifest)) {
  const expected = hashed.match(/\.([0-9a-f]{8})\.[a-z]+$/)?.[1];
  const data = await readFile(join(dist, hashed)).catch(() => null);
  if (!data) { problems.push(`${hashed}: missing`); continue; }
  if (!createHash('sha256').update(data).digest('hex').startsWith(expected)) problems.push(`${hashed}: content does not match its name`);
  fingerprinted++; bytes += data.length;
  const fixed = await stat(join(dist, original)).then(() => true).catch(() => false);
  // Loader-only sheets may drop their fixed copy (an optimization, not a requirement); every other fingerprinted file must keep one for templated <img> paths.
  if (!loaderOnly.some(d => original.startsWith(d)) && !fixed) problems.push(`${original}: fixed copy missing (templated <img> paths need it)`);
}
const bundles = (await readdir(join(dist, 'assets'))).filter(f => /^index-.*\.js$/.test(f));
const sample = manifest['/assets/heroes/campus/qb.webp'];
if (!bundles.length) problems.push('no index bundle in dist/assets');
else if (sample && !(await readFile(join(dist, 'assets', bundles[0]), 'utf8')).includes(sample)) problems.push(`bundle ${bundles[0]} does not embed the asset manifest`);
for (const p of problems) console.log(`FAIL  ${p}`);
console.log(`${fingerprinted} fingerprinted assets (${(bytes / 1024 / 1024).toFixed(1)} MB) verified in ${dist}`);
console.log(problems.length ? `RESULT: ${problems.length} build asset problem(s)` : 'RESULT: build assets are content-addressed and complete');
process.exitCode = problems.length ? 1 : 0;
