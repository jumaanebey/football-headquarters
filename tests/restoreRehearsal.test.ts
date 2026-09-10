// Item 19: the restore/rollback rehearsal passes end to end, and the snapshot validator refuses
// tampered or partial backups instead of restoring them.
import { describe, expect, it } from 'vitest';
import { runRestoreRehearsal, REHEARSAL_A, REHEARSAL_B } from '../server/authorityRehearsal';
import { exportAuthoritySnapshot, restoreAuthoritySnapshot, AuthoritySnapshotError, type AuthoritySnapshot } from '../server/authoritySnapshot';

describe('restore and rollback rehearsal', () => {
  it('restores synthetic clubs, operations and matches with ownership and revisions intact and replays pending requests exactly once', async () => {
    const report = await runRestoreRehearsal();
    expect(report.steps.filter(s => !s.ok)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.steps.map(s => s.step)).toContain('replay: undelivered request applied once');
    expect(report.backup.clubs.map(c => c.pid).sort()).toEqual([REHEARSAL_A, REHEARSAL_B]);
    const a = report.backup.clubs.find(c => c.pid === REHEARSAL_A)!, after = report.after.clubs.find(c => c.pid === REHEARSAL_A)!;
    expect(after.revision).toBe(a.revision + 2); // one undelivered action + one defender receipt
    expect(report.after.matches.every(m => m.status === 'settled')).toBe(true);
    expect(report.after.operations.length).toBe(report.backup.operations.length + 2);
    // Snapshot rows are column-shaped and carry no client-only fields.
    expect(Object.keys(report.backup.clubs[0]).sort()).toEqual(['active_match', 'origin', 'pid', 'revision', 'state', 'updated_at']);
    expect(Object.keys(report.backup.matches[0]).sort()).toEqual(['config', 'expires_at', 'id', 'issued_at', 'metadata', 'owner', 'result', 'seed', 'status']);
    expect(Object.keys(report.backup.operations[0]).sort()).toEqual(['operation_id', 'owner', 'request_hash', 'result']);
  });
  it('refuses tampered, partial or inconsistent snapshots without restoring anything', async () => {
    const { backup } = await runRestoreRehearsal();
    const mutate = (f: (s: AuthoritySnapshot) => void) => { const s = JSON.parse(JSON.stringify(backup)) as AuthoritySnapshot; f(s); return s; };
    const cases: Array<[string, unknown]> = [
      ['wrong format', { ...backup, format: 'fhq-authority-snapshot/2' }],
      ['extra top-level field', { ...backup, bases: [] }],
      ['club with unknown column', mutate(s => { (s.clubs[0] as unknown as Record<string, unknown>).email = 'x@example.invalid'; })],
      ['club without revision', mutate(s => { delete (s.clubs[0] as unknown as Record<string, unknown>).revision; })],
      ['negative revision', mutate(s => { s.clubs[0].revision = -1; })],
      ['owner that is not an id', mutate(s => { s.clubs[0].pid = 'coach@example.invalid'; })],
      ['duplicate club', mutate(s => { s.clubs.push({ ...s.clubs[0] }); })],
      ['corrupt club state', mutate(s => { (s.clubs[0].state as unknown as Record<string, unknown>).resources = 'rich'; })],
      ['active match owned by someone else', mutate(s => { const open = s.matches.find(m => m.status === 'started')!; open.owner = s.clubs.find(c => c.pid !== open.owner)!.pid; })],
      ['active match missing', mutate(s => { s.matches = s.matches.filter(m => m.status !== 'started'); })],
      ['open match not active', mutate(s => { const c = s.clubs.find(c => c.active_match)!; c.active_match = null; })],
      ['settled match without result', mutate(s => { s.matches.find(m => m.status === 'settled')!.result = null; })],
      ['operation for a foreign owner', mutate(s => { s.operations[0].owner = 'c0000000-0000-4000-8000-00000000000c'; })],
      ['operation with a bad hash', mutate(s => { s.operations[0].request_hash = 'nothex'; })],
      ['match owner without a club', mutate(s => { s.matches[0].owner = 'c0000000-0000-4000-8000-00000000000c'; s.clubs.forEach(c => { if (c.active_match === s.matches[0].id) c.active_match = null; }); })],
      ['bad timestamp', mutate(s => { s.clubs[0].updated_at = 'yesterday'; })],
      ['not an object', 'backup'],
    ];
    for (const [name, snapshot] of cases) expect(() => restoreAuthoritySnapshot(snapshot), name).toThrow(AuthoritySnapshotError);
    // Case-normalized ids restore to the same rows.
    const upper = mutate(s => { s.clubs[1].pid = s.clubs[1].pid.toUpperCase(); s.matches.forEach(m => { if (m.owner === backup.clubs[1].pid) m.owner = m.owner.toUpperCase(); }); s.operations.forEach(o => { if (o.owner === backup.clubs[1].pid) o.owner = o.owner.toUpperCase(); }); });
    expect(JSON.stringify(exportAuthoritySnapshot(restoreAuthoritySnapshot(upper), Date.parse(backup.takenAt)))).toBe(JSON.stringify(backup));
  });
});
