// Connection state for the product UI: the browser's online flag combined with the club
// server's last known reachability (from the authority client's diagnostics). Installation or
// an offline shell never implies that protected actions settle offline — `settlesOffline` is
// always false and exists so the UI can say so explicitly.
export type ClubServerStatus = 'ok' | 'offline' | 'unauthorized' | 'unknown';
export interface ConnectionState { online: boolean; clubServer: ClubServerStatus; settlesOffline: false; summary: string }
type Listener = (state: ConnectionState) => void;
const listeners = new Set<Listener>();
let clubServer: ClubServerStatus = 'unknown';
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
let armed = false;

export function connectionState(): ConnectionState {
  const summary = !online ? 'Offline: local play continues; online rewards, upgrades and rival games wait for the connection.'
    : clubServer === 'ok' ? 'Online: club server reachable.' : clubServer === 'unauthorized' ? 'Online: sign in again to confirm club actions.' : clubServer === 'offline' ? 'Online, but the club server is unreachable; local play continues.' : 'Online: club server not checked yet.';
  return { online, clubServer, settlesOffline: false, summary };
}
const emit = () => { const s = connectionState(); for (const l of listeners) { try { l(s); } catch { /* never break the page */ } } };
/** Feed the authority client's availability (game/online/authorityClient diagnostics().availability.status). */
export function reportClubServer(status: ClubServerStatus): void { if (status !== clubServer) { clubServer = status; emit(); } }
export function armConnectionTracking(target: Pick<Window, 'addEventListener'> | null = typeof window === 'undefined' ? null : window): void {
  if (armed || !target) return; armed = true;
  target.addEventListener('online', () => { online = true; emit(); });
  target.addEventListener('offline', () => { online = false; emit(); });
}
export function onConnectionChange(listener: Listener): () => void { listeners.add(listener); listener(connectionState()); return () => { listeners.delete(listener); }; }
/** Test hook. */
export function resetConnectionForTests(): void { listeners.clear(); clubServer = 'unknown'; online = true; armed = false; }
