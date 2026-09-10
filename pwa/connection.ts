// Connection state for the product UI. `navigator.onLine` is only a hint (true means "maybe");
// what matters is the club server's last observed behaviour, which the authority client reports
// here after every exchange. Four failure shapes are kept apart because the player must do
// different things about them: the browser says offline (wait), the transport failed although
// the device claims a connection (wait, retry), the sign-in expired (`unauthorized`: sign in
// again), or the server answered but is unavailable (wait; nothing to do on the device).
// Installation or an offline shell never implies that protected actions settle offline —
// `settlesOffline` is always false and exists so the UI can say so explicitly.
export type ClubServerStatus = 'ok' | 'offline' | 'unauthorized' | 'unavailable' | 'unknown';
export type ConnectionAssessment = 'connected' | 'browser-offline' | 'transport-failure' | 'auth-expired' | 'server-unavailable' | 'unchecked';
export interface ConnectionState {
  /** The browser's hint. False is reliable (definitely offline); true only means "not known to be offline". */
  online: boolean;
  /** Last report from the authority client for the current account. */
  clubServer: ClubServerStatus;
  /** The two combined into one player-facing verdict. */
  assessment: ConnectionAssessment;
  settlesOffline: false;
  summary: string;
  /** Actionable hint for the connection row, or null when nothing is expected of the player. */
  action: 'wait' | 'sign-in' | null;
  lastOkAt: number | null;
  lastFailureAt: number | null;
  /** Failed exchanges since the last successful one (any failure shape). */
  consecutiveFailures: number;
  /** Account the reports belong to (null = guest/local); changes reset the server status. */
  account: string | null;
}
type Listener = (state: ConnectionState) => void;
const listeners = new Set<Listener>();
let clubServer: ClubServerStatus = 'unknown';
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
let lastOkAt: number | null = null, lastFailureAt: number | null = null, consecutiveFailures = 0;
let account: string | null = null;
let now: () => number = () => Date.now();
let disarm: (() => void) | null = null;

export const SUMMARIES: Record<ConnectionAssessment, string> = {
  'browser-offline': 'Offline: local play continues; online rewards, upgrades and rival games wait for the connection.',
  connected: 'Online: club server reachable.',
  'transport-failure': 'Your device reports a connection, but the club server could not be reached; local play continues and pending club actions retry when it answers.',
  'auth-expired': 'Online, but your sign-in has expired: sign in again to confirm club actions.',
  'server-unavailable': 'Online, but the club server is unavailable right now; local play continues and pending club actions retry.',
  unchecked: 'Online: club server not checked yet.',
};
const ACTIONS: Record<ConnectionAssessment, ConnectionState['action']> = { 'browser-offline': 'wait', connected: null, 'transport-failure': 'wait', 'auth-expired': 'sign-in', 'server-unavailable': 'wait', unchecked: null };

/** Pure: combine the browser hint with the last server report. */
export function assess(isOnline: boolean, status: ClubServerStatus): ConnectionAssessment {
  if (!isOnline) return 'browser-offline';
  switch (status) {
    case 'ok': return 'connected';
    case 'offline': return 'transport-failure';
    case 'unauthorized': return 'auth-expired';
    case 'unavailable': return 'server-unavailable';
    default: return 'unchecked';
  }
}

export function connectionState(): ConnectionState {
  const assessment = assess(online, clubServer);
  return { online, clubServer, assessment, settlesOffline: false, summary: SUMMARIES[assessment], action: ACTIONS[assessment], lastOkAt, lastFailureAt, consecutiveFailures, account };
}
const emit = () => { const s = connectionState(); for (const l of listeners) { try { l(s); } catch { /* never break the page */ } } };

/**
 * Feed the authority client's observation after each exchange with the club server:
 *   'ok'           the server answered (any application-level answer, including a refusal)
 *   'offline'      the transport failed (fetch threw, timed out, or no body came back)
 *   'unauthorized' the server rejected the session (HTTP 401/403 or an auth error)
 *   'unavailable'  the server was reached but cannot serve (HTTP 5xx, maintenance)
 * Repeats of the same status update the timestamps and counters without notifying listeners.
 */
export function reportClubServer(status: ClubServerStatus): void {
  const at = now();
  if (status === 'ok') { lastOkAt = at; consecutiveFailures = 0; }
  else if (status !== 'unknown') { lastFailureAt = at; consecutiveFailures++; }
  if (status !== clubServer) { clubServer = status; emit(); }
}

/**
 * The signed-in account changed (sign-in, sign-out to guest, link): the previous account's
 * server status, timestamps and failure count no longer describe this account. Listeners are
 * notified once so the UI re-renders as "not checked yet" for the new owner.
 */
export function resetConnectionForAccount(nextAccount: string | null): void {
  account = nextAccount; clubServer = 'unknown'; lastOkAt = null; lastFailureAt = null; consecutiveFailures = 0;
  emit();
}

/** Track the browser's online/offline events (idempotent). Returns a function that stops tracking. */
export function armConnectionTracking(target: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window): () => void {
  if (disarm || !target) return disarm ?? (() => {});
  const up = () => { online = true; emit(); }, down = () => { online = false; emit(); };
  target.addEventListener('online', up); target.addEventListener('offline', down);
  disarm = () => { target.removeEventListener('online', up); target.removeEventListener('offline', down); disarm = null; };
  return disarm;
}
/** Subscribe (called at once with the current state). Returns the unsubscribe function. */
export function onConnectionChange(listener: Listener): () => void { listeners.add(listener); listener(connectionState()); return () => { listeners.delete(listener); }; }
/** Test hook. */
export function resetConnectionForTests(clock?: () => number): void { listeners.clear(); clubServer = 'unknown'; online = true; lastOkAt = null; lastFailureAt = null; consecutiveFailures = 0; account = null; disarm?.(); disarm = null; now = clock ?? (() => Date.now()); }
