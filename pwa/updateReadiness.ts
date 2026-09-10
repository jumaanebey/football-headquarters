// Update readiness contract. Activating a waiting service worker reloads the page, so it must
// never happen while the player is mid-battle, while a result or another authority operation is
// unconfirmed, while an upgrade or recruit request is still in flight, or while the signed-in
// account is changing. The product describes its state as a `ReadinessInput`; this module turns
// it into a typed verdict with machine-readable reasons the UI can show ("Update waits until the
// game ends"). `pwa/register.ts` consults the registered provider at activation time — not when
// the banner appeared — so a state that became busy after the banner is still respected.
//
// Semantics: `pendingJobs` counts requests the player has issued whose outcome the club server has
// not yet answered (an upgrade tapped but not confirmed; a scout/recruit roll not yet answered).
// Confirmed timed construction that is merely counting down is NOT a blocker — otherwise a club
// with a two-hour upgrade running could never update.
export interface ReadinessInput {
  /** A battle (attack, defence, gauntlet, practice or replay) is on screen. */
  battleActive: boolean;
  /** A result has been sent to the authority and its receipt has not arrived (or been refused) yet. */
  awaitingConfirmation: boolean;
  /** Authority operations recorded locally that are not yet confirmed (useAuthority().pendingCount). */
  pendingOperations: number;
  /** Requests whose answer is outstanding, by kind. Confirmed countdown jobs do not count. */
  pendingJobs: { upgrade: number; recruit: number };
  /** Sign-in, sign-out or account link in progress; the club owner may change under us. */
  accountSwitching: boolean;
  /** A backup file is being imported (the save is about to be replaced). Optional. */
  restoringBackup?: boolean;
}
export type ReadinessReason = 'battle_active' | 'awaiting_confirmation' | 'pending_operations' | 'pending_upgrade' | 'pending_recruit' | 'account_switching' | 'restoring_backup' | 'no_readiness_provider' | 'readiness_error';
export interface UpdateReadiness { ready: boolean; reasons: ReadinessReason[] }

export const IDLE_INPUT: ReadinessInput = { battleActive: false, awaitingConfirmation: false, pendingOperations: 0, pendingJobs: { upgrade: 0, recruit: 0 }, accountSwitching: false, restoringBackup: false };

/** Pure: which reasons (if any) block activating an update right now. */
export function computeReadiness(input: Partial<ReadinessInput> | null | undefined): UpdateReadiness {
  const i: ReadinessInput = { ...IDLE_INPUT, ...(input ?? {}), pendingJobs: { ...IDLE_INPUT.pendingJobs, ...(input?.pendingJobs ?? {}) } };
  const reasons: ReadinessReason[] = [];
  if (i.battleActive) reasons.push('battle_active');
  if (i.awaitingConfirmation) reasons.push('awaiting_confirmation');
  if (count(i.pendingOperations) > 0) reasons.push('pending_operations');
  if (count(i.pendingJobs.upgrade) > 0) reasons.push('pending_upgrade');
  if (count(i.pendingJobs.recruit) > 0) reasons.push('pending_recruit');
  if (i.accountSwitching) reasons.push('account_switching');
  if (i.restoringBackup) reasons.push('restoring_backup');
  return { ready: reasons.length === 0, reasons };
}
const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/** Player-facing wording per reason, for the update banner. */
export const READINESS_MESSAGES: Record<ReadinessReason, string> = {
  battle_active: 'the game on screen ends',
  awaiting_confirmation: 'your result is confirmed',
  pending_operations: 'pending club actions are confirmed',
  pending_upgrade: 'the requested upgrade is confirmed',
  pending_recruit: 'the recruit request is answered',
  account_switching: 'the account change completes',
  restoring_backup: 'the backup finishes importing',
  no_readiness_provider: 'the app reports its state (no readiness provider registered)',
  readiness_error: 'the app can report its state again',
};
export const describeReadiness = (r: UpdateReadiness): string => r.ready ? 'Ready to update.' : `Update will apply after ${r.reasons.map(x => READINESS_MESSAGES[x]).join(' and ')}.`;

/** Either the raw product state or an already computed verdict; the provider may return either. */
export type ReadinessProvider = () => Partial<ReadinessInput> | UpdateReadiness;
export const isVerdict = (v: unknown): v is UpdateReadiness => !!v && typeof v === 'object' && typeof (v as UpdateReadiness).ready === 'boolean' && Array.isArray((v as UpdateReadiness).reasons);
/** Resolve a provider's answer into a verdict; a throwing or absent provider is treated as NOT ready (fail closed). */
export function resolveReadiness(provider: ReadinessProvider | null | undefined): UpdateReadiness {
  if (!provider) return { ready: false, reasons: ['no_readiness_provider'] };
  try { const v = provider(); return isVerdict(v) ? v : computeReadiness(v); } catch { return { ready: false, reasons: ['readiness_error'] }; }
}
