// Restore and rollback rehearsal in an isolated environment: a synthetic world (two clubs, a
// settled match, an open match, confirmed operations and a device with two unanswered
// requests) is backed up with `exportAuthoritySnapshot`, discarded, restored into a fresh
// memory store, and the device then replays what it never saw confirmed. Ownership,
// revisions and exactly-once outcomes are checked at every step. No network, no database, no
// production data: every id below is synthetic. `npm run authority:rehearsal` runs this and
// prints the report; tests/restoreRehearsal.test.ts asserts it.
import { AuthorityClient, type AuthorityTransport, type AuthorityTransportResult } from '../game/online/authorityClient';
import { createAuthorityService, type AuthorityService } from './authorityService';
import { MemoryAuthorityStore } from './memoryAuthorityStore';
import { exportAuthoritySnapshot, restoreAuthoritySnapshot, describeAuthoritySnapshot, type AuthoritySnapshot } from './authoritySnapshot';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import type { BattleConfig } from '../game/combat/contracts';

export const REHEARSAL_A = 'a0000000-0000-4000-8000-00000000000a';
export const REHEARSAL_B = 'b0000000-0000-4000-8000-00000000000b';
const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');

export interface RehearsalStep { step: string; ok: boolean; detail: string }
export interface RehearsalReport {
  ok: boolean;
  steps: RehearsalStep[];
  /** The backup taken before the simulated loss (synthetic data; safe to write to disk). */
  backup: AuthoritySnapshot;
  /** The state after restore and replay, for comparison. */
  after: AuthoritySnapshot;
}

const memoryStorage = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, values }; };

export async function runRestoreRehearsal(): Promise<RehearsalReport> {
  const steps: RehearsalStep[] = [];
  const check = (step: string, ok: boolean, detail: string) => { steps.push({ step, ok, detail }); if (!ok) throw new Error(`${step}: ${detail}`); };
  let now = ACTIVATION + 60_000;
  let ids = 7000, ops = 1;
  const serviceFor = (store: MemoryAuthorityStore): AuthorityService => createAuthorityService(store, { now: () => now, randomUint32: () => 0x1357_9bdf, uuid: () => `00000000-0000-4000-8000-${String(ids++).padStart(12, '0')}` });
  const identity = (owner: string) => ({ owner, createdAt: ACTIVATION + 1000 });

  // ---- 1. Synthetic world on the "production-like" store ----
  const live = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
  let service = serviceFor(live);
  for (const owner of [REHEARSAL_A, REHEARSAL_B]) {
    const boot = await service(identity(owner), { kind: 'bootstrap' });
    check(`bootstrap ${owner.slice(0, 8)}`, boot.ok, boot.ok ? 'club created at revision 0' : 'bootstrap refused');
    live.clubs.get(owner)!.state.currentMatch = 5; // eligible as a rival target
  }
  // A settled campaign match for A (history + one operation row per step).
  const reserve = await service(identity(REHEARSAL_A), { kind: 'match.reserve', operationId: opId(ops++), expectedRevision: 0, choice: { kind: 'campaign', stage: 1 } });
  const settledId = reserve.ok ? (reserve.result as { matchId: string }).matchId : '';
  check('reserve campaign match', reserve.ok && !!settledId, settledId ? `match ${settledId.slice(0, 8)} reserved` : 'reservation refused');
  const begun = await service(identity(REHEARSAL_A), { kind: 'match.begin', operationId: opId(ops++), expectedRevision: 1, matchId: settledId });
  check('begin campaign match', begun.ok, begun.ok ? 'started' : 'begin refused');
  const settledMatch = live.matches.get(settledId)!;
  const film = playHeadlessMatch(settledMatch.config as BattleConfig, settledMatch.seed);
  now += film.submission.ticks * 50 + 500;
  const finished = await service(identity(REHEARSAL_A), { kind: 'match.finish', operationId: opId(ops++), expectedRevision: 2, matchId: settledId, submission: film.submission });
  check('settle campaign match', finished.ok && live.matches.get(settledId)!.status === 'settled', finished.ok ? `settled, A at revision ${live.clubs.get(REHEARSAL_A)!.revision}` : 'finish refused');

  // A device for A with a durable ledger: one confirmed action, one action whose answer was
  // lost after the server applied it, one action never delivered.
  const net = { dropAnswer: false, offline: false };
  const transportTo = (target: () => AuthorityService): AuthorityTransport => async (body): Promise<AuthorityTransportResult> => {
    if (net.offline) return { status: 'offline' };
    const answer = await target()(identity(REHEARSAL_A), body);
    if (net.dropAnswer) return { status: 'offline' };
    return { status: 'ok', owner: REHEARSAL_A, body: answer };
  };
  const storage = memoryStorage();
  const device = new AuthorityClient(transportTo(() => service), storage, { now: () => now, uuid: () => opId(ops++) });
  check('device bootstrap', (await device.query(REHEARSAL_A, { kind: 'bootstrap' })).ok, 'device mirrors A');
  const confirmed = await device.operate(REHEARSAL_A, 'action', { action: { type: 'sync' } });
  check('confirmed action', confirmed.status === 'confirmed', `revision ${live.clubs.get(REHEARSAL_A)!.revision}`);
  net.dropAnswer = true;
  const lost = await device.operate(REHEARSAL_A, 'action', { action: { type: 'sync' } });
  net.dropAnswer = false;
  const revisionAfterLost = live.clubs.get(REHEARSAL_A)!.revision;
  check('answer lost after commit', lost.status === 'pending' && revisionAfterLost === 5, `server at revision ${revisionAfterLost}, device still pending`);
  net.offline = true;
  // A different action from the unanswered one: an identical request would be a twin tap, which the ledger folds into the pending entry.
  const undelivered = await device.operate(REHEARSAL_A, 'action', { action: { type: 'club.rename', name: 'Rehearsal FC' } });
  net.offline = false;
  check('request never delivered', undelivered.status === 'pending' && live.clubs.get(REHEARSAL_A)!.revision === 5, 'held behind the unanswered request; server unchanged');
  // An open rival match B → A, so the restore must carry an active match and its target binding.
  const rivalReserve = await service(identity(REHEARSAL_B), { kind: 'match.reserve', operationId: opId(ops++), expectedRevision: 0, choice: { kind: 'rival', target: REHEARSAL_A } });
  const openId = rivalReserve.ok ? (rivalReserve.result as { matchId: string }).matchId : '';
  const rivalBegin = openId ? await service(identity(REHEARSAL_B), { kind: 'match.begin', operationId: opId(ops++), expectedRevision: 1, matchId: openId }) : { ok: false as const };
  check('open rival match', rivalReserve.ok && rivalBegin.ok && live.clubs.get(REHEARSAL_B)!.activeMatch === openId, `B started ${openId.slice(0, 8)} against A`);

  // ---- 2. Backup ----
  const backup = exportAuthoritySnapshot(live, now);
  const text = JSON.stringify(backup);
  const summary = describeAuthoritySnapshot(backup);
  check('backup taken', summary.clubs === 2 && summary.matches === 2 && summary.openMatches === 1 && summary.operations === 7, `${text.length} bytes: ${JSON.stringify(summary)}`);
  const expectedRevisions = { [REHEARSAL_A]: live.clubs.get(REHEARSAL_A)!.revision, [REHEARSAL_B]: live.clubs.get(REHEARSAL_B)!.revision };

  // ---- 3. Loss and restore ----
  live.clubs.clear(); live.matches.clear(); live.operations.clear();
  const restored = restoreAuthoritySnapshot(JSON.parse(text), { now: () => now });
  service = serviceFor(restored);
  const ownership = [...restored.clubs.values()].every(c => c.owner === c.owner.toLowerCase() && backup.clubs.some(b => b.pid === c.owner))
    && [...restored.matches.values()].every(m => restored.clubs.has(m.owner)) && [...restored.operations.values()].every(o => restored.clubs.has(o.owner));
  check('restored ownership', ownership, 'every club, match and operation belongs to a restored owner');
  check('restored revisions', restored.clubs.get(REHEARSAL_A)!.revision === expectedRevisions[REHEARSAL_A] && restored.clubs.get(REHEARSAL_B)!.revision === expectedRevisions[REHEARSAL_B], JSON.stringify({ A: expectedRevisions[REHEARSAL_A], B: expectedRevisions[REHEARSAL_B] }));
  check('restored active match', restored.clubs.get(REHEARSAL_B)!.activeMatch === openId && restored.matches.get(openId)!.status === 'started' && restored.matches.get(settledId)!.status === 'settled', 'B still owns the started match; A\'s settled match kept its result');
  check('restore is faithful', JSON.stringify(exportAuthoritySnapshot(restored, now)) === text, 'export(restore(backup)) equals backup byte for byte');
  const status = await service(identity(REHEARSAL_A), { kind: 'status' });
  check('restored club answers', status.ok && status.club?.revision === expectedRevisions[REHEARSAL_A], 'status serves the restored revision');

  // ---- 4. Replay the device's pending requests against the restored store ----
  const replayed = await device.retry(REHEARSAL_A);
  const afterReplay = restored.clubs.get(REHEARSAL_A)!.revision;
  check('replay: lost answer is a duplicate', replayed[0]?.status === 'confirmed' && restored.operations.has(`${REHEARSAL_A}:${replayed[0].operationId}`), 'the restored operation row answered the retry with its original receipt');
  check('replay: undelivered request applied once', replayed[1]?.status === 'confirmed' && afterReplay === expectedRevisions[REHEARSAL_A] + 1, `A moved from revision ${expectedRevisions[REHEARSAL_A]} to ${afterReplay}`);
  check('replay: nothing left pending', device.pending(REHEARSAL_A).length === 0, 'ledger drained');
  const again = await device.retry(REHEARSAL_A);
  check('second replay is a no-op', again.length === 0 && restored.clubs.get(REHEARSAL_A)!.revision === afterReplay && restored.commits === 1, `commits after restore: ${restored.commits}`);
  // Verbatim resend of the undelivered request straight to the service: same receipt, no new commit.
  const entry = device.ledger(REHEARSAL_A).find(e => e.operationId === replayed[1].operationId)!;
  const verbatim = await service(identity(REHEARSAL_A), entry.request);
  check('verbatim resend returns the same receipt', verbatim.ok && verbatim.club?.revision === afterReplay && restored.commits === 1, 'no second commit');

  // ---- 5. Finish the restored open match exactly once ----
  const open = restored.matches.get(openId)!;
  const rivalFilm = playHeadlessMatch(open.config as BattleConfig, open.seed);
  now += rivalFilm.submission.ticks * 50 + 500;
  const finishId = opId(ops++);
  const revisionB = restored.clubs.get(REHEARSAL_B)!.revision, revisionA = restored.clubs.get(REHEARSAL_A)!.revision;
  const settle = await service(identity(REHEARSAL_B), { kind: 'match.finish', operationId: finishId, expectedRevision: revisionB, matchId: openId, submission: rivalFilm.submission });
  check('restored match settles', settle.ok && restored.matches.get(openId)!.status === 'settled' && restored.clubs.get(REHEARSAL_B)!.activeMatch === null, `B ${revisionB}→${restored.clubs.get(REHEARSAL_B)!.revision}, A ${revisionA}→${restored.clubs.get(REHEARSAL_A)!.revision} (defender receipt)`);
  const receipts = restored.clubs.get(REHEARSAL_A)!.state.defenseLog.length;
  const settleAgain = await service(identity(REHEARSAL_B), { kind: 'match.finish', operationId: finishId, expectedRevision: revisionB, submission: rivalFilm.submission, matchId: openId });
  check('settlement is exactly once', settleAgain.ok && restored.commits === 2 && restored.clubs.get(REHEARSAL_A)!.state.defenseLog.length === receipts && JSON.stringify(settleAgain.result) === JSON.stringify(settle.ok ? settle.result : null), 'duplicate finish returned the stored receipt; no second defender entry');

  // ---- 6. Rollback: restoring the backup again discards the replay, as a rollback would ----
  const rolledBack = restoreAuthoritySnapshot(JSON.parse(text), { now: () => now });
  check('rollback to backup', rolledBack.clubs.get(REHEARSAL_A)!.revision === expectedRevisions[REHEARSAL_A] && rolledBack.matches.get(openId)!.status === 'started', 'the backup restores to exactly its pre-loss state; the device\'s ledger would replay again');

  return { ok: steps.every(s => s.ok), steps, backup, after: exportAuthoritySnapshot(restored, now) };
}

const opId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
