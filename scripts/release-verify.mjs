// One reproducible release verification. Offline checks run in order and stop at the first
// failure; credentialed live checks are never run implicitly — they are listed as SKIPPED with
// the exact owner command unless `--live` is passed and the credentials file exists.
//
//   npm run release:verify                offline: typecheck, tests, authority parity, hero atlases, production build (runs the raster decode via prebuild), balance guard
//   npm run release:verify -- --browser   also the Chrome determinism corpus, the startup budget and the PWA behaviour on a built preview (needs the installed Chrome)
//   npm run release:verify -- --live      also the credentialed live evidence (creates anonymous evidence accounts: owner-run only)
//   npm run release:verify -- --strict    treat a lagging authority deployment as a failure (before shipping a client that needs the staged server)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const started = Date.now();
const rows = [];
let failed = false;

const step = (name, command, { skip = null, note = '' } = {}) => {
  if (skip) { rows.push({ name, status: 'SKIPPED', ms: 0, note: skip }); return; }
  if (failed) { rows.push({ name, status: 'NOT RUN', ms: 0, note: 'earlier failure' }); return; }
  const t0 = Date.now();
  console.log(`\n=== ${name}: ${command} ===`);
  const result = spawnSync(command, { shell: true, stdio: 'inherit', env: { ...process.env, CI: process.env.CI ?? '1' } });
  const ok = result.status === 0;
  if (!ok) failed = true;
  rows.push({ name, status: ok ? 'PASS' : 'FAIL', ms: Date.now() - t0, note });
};

// Offline — deterministic, no credentials, no network.
step('typecheck', 'npm run -s typecheck');
step('unit and service tests', 'npm run -s test -- --reporter=dot');
step('authority parity (sources ↔ bundle ↔ artifacts ↔ deployment record)', `node scripts/build-authority.mjs --check${args.has('--strict') ? ' --require-deployed-current' : ''}`, { note: args.has('--strict') ? 'strict: lagging deployment fails' : 'lagging deployment is informational' });
step('hero atlas verification (non-destructive)', 'npm run -s art:verify');
step('restore/rollback rehearsal (isolated)', 'npm run -s authority:rehearsal');
step('derived art present (campus hero sheets)', 'npm run -s art:campus -- --check', { note: 'sheets are committed; regenerate with npm run art:campus after a reviewed art change' });
step('install icons present', 'node scripts/derive-brand-icons.mjs --check');
step('production build (+ raster decode of every shipped asset via prebuild)', 'npm run -s build');
step('build assets content-addressed', 'npm run -s build:verify');
step('balance regression guard', 'npm run -s balance');
step('Chrome determinism corpus', 'npm run -s determinism:browser', { skip: args.has('--browser') ? null : 'pass --browser (needs the installed Chrome; ~20 s)' });
// Rendered checks against a preview of the build just produced: startup transfer budget and the offline/update behaviour.
step('startup transfer budget on the built preview', 'node scripts/with-preview.mjs 4187 node scripts/perf-waterfall.mjs --url http://127.0.0.1:4187/ --block-server --budget --out docs/evidence/perf-latest-local-preview.json', { skip: args.has('--browser') ? null : 'pass --browser (Chrome; ~60 s)' });
step('offline shell and update flow on the built preview', 'node scripts/with-preview.mjs 4188 node scripts/pwa-check.mjs http://127.0.0.1:4188/', { skip: args.has('--browser') ? null : 'pass --browser (Chrome; ~30 s)' });

// Credentialed — creates anonymous evidence accounts against the deployed function. Owner-run only.
const env = '.env.production';
const liveSkip = !args.has('--live') ? 'pass --live; owner runs `npm run authority:evidence` (creates evidence accounts listed for deferred QA cleanup)' : !existsSync(env) ? `${env} is absent (credentials never stored in the repository)` : null;
step('live two-account evidence against the deployed function', 'npm run -s authority:evidence', { skip: liveSkip });
step('preview browser journey', 'node scripts/authority-browser-check.mjs', { skip: !args.has('--live') ? 'pass --live; owner runs it against a running `vite preview` (creates one evidence account)' : liveSkip });

console.log('\nRelease verification summary');
for (const r of rows) console.log(`  ${r.status.padEnd(8)} ${r.name}${r.ms ? ` (${(r.ms / 1000).toFixed(1)} s)` : ''}${r.note ? ` — ${r.note}` : ''}`);
const skipped = rows.filter(r => r.status === 'SKIPPED').length;
console.log(`\n${failed ? 'RESULT: release verification FAILED' : `RESULT: offline verification passed`} in ${((Date.now() - started) / 1000).toFixed(0)} s; ${skipped} live/optional check(s) skipped — deployed behavior is verified only by the live evidence recorded in docs/AUTHORITY-RECOVERY.md`);
process.exitCode = failed ? 1 : 0;
