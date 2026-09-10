// Update readiness contract: pure verdicts from product state, fail-closed when the app has not
// described its state, and player-facing wording for every reason.
import { describe, expect, it } from 'vitest';
import { computeReadiness, describeReadiness, IDLE_INPUT, READINESS_MESSAGES, resolveReadiness, type ReadinessReason } from '../pwa/updateReadiness';

describe('update readiness', () => {
  it('is ready only when nothing is in flight', () => {
    expect(computeReadiness(IDLE_INPUT)).toEqual({ ready: true, reasons: [] });
    expect(computeReadiness({})).toEqual({ ready: true, reasons: [] }); // partial input defaults to idle fields
    expect(computeReadiness(null)).toEqual({ ready: true, reasons: [] });
  });
  it('names every blocking reason in a stable order', () => {
    const r = computeReadiness({ battleActive: true, awaitingConfirmation: true, pendingOperations: 2, pendingJobs: { upgrade: 1, recruit: 1 }, accountSwitching: true, restoringBackup: true });
    expect(r.ready).toBe(false);
    expect(r.reasons).toEqual(['battle_active', 'awaiting_confirmation', 'pending_operations', 'pending_upgrade', 'pending_recruit', 'account_switching', 'restoring_backup']);
    expect(computeReadiness({ battleActive: true }).reasons).toEqual(['battle_active']);
    expect(computeReadiness({ awaitingConfirmation: true }).reasons).toEqual(['awaiting_confirmation']);
    expect(computeReadiness({ pendingJobs: { upgrade: 1, recruit: 0 } }).reasons).toEqual(['pending_upgrade']);
    expect(computeReadiness({ pendingJobs: { upgrade: 0, recruit: 3 } }).reasons).toEqual(['pending_recruit']);
    expect(computeReadiness({ accountSwitching: true }).reasons).toEqual(['account_switching']);
    expect(computeReadiness({ pendingOperations: 1 }).reasons).toEqual(['pending_operations']);
  });
  it('treats malformed counts as zero rather than as blockers, and a partial jobs bag as idle for the missing kind', () => {
    expect(computeReadiness({ pendingOperations: Number.NaN }).ready).toBe(true);
    expect(computeReadiness({ pendingOperations: 'many' as unknown as number }).ready).toBe(true);
    expect(computeReadiness({ pendingJobs: { upgrade: 2 } as { upgrade: number; recruit: number } }).reasons).toEqual(['pending_upgrade']);
  });
  it('fails closed: no provider or a throwing provider is not ready, with a reason the UI can show', () => {
    expect(resolveReadiness(null)).toEqual({ ready: false, reasons: ['no_readiness_provider'] });
    expect(resolveReadiness(undefined)).toEqual({ ready: false, reasons: ['no_readiness_provider'] });
    expect(resolveReadiness(() => { throw new Error('state not mounted'); })).toEqual({ ready: false, reasons: ['readiness_error'] });
    expect(resolveReadiness(() => ({ battleActive: true }))).toEqual({ ready: false, reasons: ['battle_active'] });
    expect(resolveReadiness(() => ({ ready: true, reasons: [] }))).toEqual({ ready: true, reasons: [] }); // an already computed verdict passes through
  });
  it('describes every reason for the banner', () => {
    const all: ReadinessReason[] = ['battle_active', 'awaiting_confirmation', 'pending_operations', 'pending_upgrade', 'pending_recruit', 'account_switching', 'restoring_backup', 'no_readiness_provider', 'readiness_error'];
    for (const reason of all) expect(READINESS_MESSAGES[reason].length).toBeGreaterThan(5);
    expect(describeReadiness({ ready: true, reasons: [] })).toBe('Ready to update.');
    expect(describeReadiness({ ready: false, reasons: ['battle_active', 'pending_upgrade'] })).toBe('Update will apply after the game on screen ends and the requested upgrade is confirmed.');
  });
});
