// Executable restore/rollback rehearsal. Isolated: memory store only, synthetic ids, nothing
// read from or written to any database. Usage: npm run authority:rehearsal [-- --out DIR]
// Writes the synthetic backup and the after-replay snapshot to DIR (default dist/rehearsal) so
// the JSON shapes a real restore would insert can be inspected.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runRestoreRehearsal } from '../server/authorityRehearsal';
import { describeAuthoritySnapshot } from '../server/authoritySnapshot';

const outArg = process.argv.indexOf('--out');
const out = resolve(outArg >= 0 ? process.argv[outArg + 1] : 'dist/rehearsal');
try {
  const report = await runRestoreRehearsal();
  for (const s of report.steps) console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.step}: ${s.detail}`);
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'backup.json'), JSON.stringify(report.backup, null, 2));
  await writeFile(resolve(out, 'after-replay.json'), JSON.stringify(report.after, null, 2));
  console.log(`backup ${JSON.stringify(describeAuthoritySnapshot(report.backup))}`);
  console.log(`after  ${JSON.stringify(describeAuthoritySnapshot(report.after))}`);
  console.log(`snapshots written to ${out} (synthetic data)`);
  console.log(report.ok ? 'RESULT: restore, replay and rollback rehearsal passed' : 'RESULT: rehearsal failed');
  process.exitCode = report.ok ? 0 : 1;
} catch (error) {
  console.error(`FAIL  ${(error as Error).message}`);
  process.exitCode = 1;
}
