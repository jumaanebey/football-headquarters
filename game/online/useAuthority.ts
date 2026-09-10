// React integration for protected clubs. The hook owns: detecting whether the signed-in
// account has a server club (which makes the account protected on every device), bootstrap
// (opt-in), the status refresh, retries of pending operations, and the match lifecycle.
// Every confirmed answer replaces the local club with the server's state; the hook never
// credits rewards or mutates the club itself.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../../types';
import type { EnemyBase, ReplayData } from '../../battle';
import type { BattleConfig } from '../combat/contracts';
import { validateReplay } from '../combat/replay';
import { authorityClient, getProfile, playerId, pvpEnabled } from '../../pvp';
import { clearAuthorityProtection, enableAuthorityProtection, readAuthorityProtection, setAuthorityProtectionPending } from '../authority/protection';
import type { MatchChoice, MatchSubmission } from '../authority/matches';
import type { AuthorityAnswer, AuthorityDiagnostics, AuthorityMatchView, AuthorityOutcome, AuthorityRivalView } from './authorityClient';

export interface AuthorityActionReceipt { type: string; [key: string]: unknown }
export interface AuthorityHook {
  /** Online protection is configured for this build and the account has a server club. */
  active: boolean;
  /** A protection record exists on this device but the signed-in account cannot view it (signed out or another account). */
  locked: boolean;
  /** The status/bootstrap round trip for this load has settled. */
  ready: boolean;
  owner: string | null;
  revision: number;
  pendingCount: number;
  notice: string | null;
  match: AuthorityMatchView | null;
  rivals: AuthorityRivalView[];
  roadTargets: EnemyBase[];
  /** Synchronous view of `active` for handlers that run before React re-renders (e.g. right after `enable`). */
  isActiveNow(): boolean;
  enable(legacy: GameState): Promise<{ ok: boolean; message: string }>;
  /** Re-detect after sign-in, sign-out or account linking; drops in-memory club views first. */
  resync(): Promise<void>;
  refresh(): Promise<void>;
  diagnostics(): AuthorityDiagnostics;
  retry(): Promise<void>;
  dispatch(action: Record<string, unknown>): Promise<AuthorityOutcome>;
  reserve(choice: MatchChoice): Promise<{ matchId: string; config: BattleConfig } | { error: string }>;
  begin(matchId: string): Promise<{ ok: true } | { ok: false; message: string }>;
  cancel(matchId: string): Promise<boolean>;
  finish(matchId: string, submission: MatchSubmission): Promise<AuthorityOutcome>;
  film(matchId: string): Promise<ReplayData | null>;
  setNotice(notice: string | null): void;
}
interface Options { applyState: (state: GameState) => void }

const isEnemyBase = (value: unknown): value is EnemyBase => !!value && typeof value === 'object' && typeof (value as EnemyBase).name === 'string' && Array.isArray((value as EnemyBase).buildings);

export function useAuthority({ applyState }: Options): AuthorityHook {
  const [owner, setOwner] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(!pvpEnabled());
  const [revision, setRevision] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [match, setMatch] = useState<AuthorityMatchView | null>(null);
  const [rivals, setRivals] = useState<AuthorityRivalView[]>([]);
  const [roadTargets, setRoadTargets] = useState<EnemyBase[]>([]);
  const ownerRef = useRef<string | null>(null);
  ownerRef.current = owner;
  const activeRef = useRef(false);
  const setActiveNow = useCallback((value: boolean) => { activeRef.current = value; setActive(value); }, []);

  const adopt = useCallback((answer: AuthorityAnswer, who: string) => {
    if (answer.club && answer.club.owner === who) { applyState(answer.club.state); setRevision(answer.club.revision); }
    if (answer.match !== undefined) setMatch(answer.match ?? null);
    if (answer.rivals) setRivals(answer.rivals);
    if (answer.roadTargets) setRoadTargets(answer.roadTargets.filter(isEnemyBase));
  }, [applyState]);
  const syncPending = useCallback((who: string | null) => {
    const count = who ? authorityClient.pending(who).length : 0;
    setPendingCount(count);
    setAuthorityProtectionPending(count > 0);
  }, []);
  useEffect(() => authorityClient.subscribe(() => syncPending(ownerRef.current)), [syncPending]);

  const retry = useCallback(async () => {
    const who = ownerRef.current;
    if (!who) return;
    const outcomes = await authorityClient.retry(who);
    for (const outcome of outcomes) if (outcome.status === 'confirmed') adopt(outcome.answer, who);
    const failed = outcomes.find(o => o.status === 'failed');
    if (failed && failed.status === 'failed') setNotice(failed.message);
    syncPending(who);
  }, [adopt, syncPending]);

  /** Resolve the signed-in account and its server club. A server club makes the account protected on this device. */
  const detect = useCallback(async () => {
    if (!pvpEnabled()) { setReady(true); return; }
    await getProfile();
    const who = playerId();
    const record = readAuthorityProtection();
    if (!/^[0-9a-f-]{36}$/i.test(who)) { setOwner(null); setLocked(!!record); setActiveNow(false); setReady(true); return; }
    const answer = await authorityClient.query(who, { kind: 'status' });
    if (!answer.ok) {
      // Unreachable: keep the device's record as the source of truth for this load.
      const known = record?.viewOwner === who;
      setOwner(known ? who : null); setActiveNow(known); setLocked(!!record && !known);
      if (known) { setRevision(authorityClient.club(who)?.revision ?? 0); setNotice(answer.message ?? null); }
      syncPending(known ? who : null); setReady(true); return;
    }
    if (answer.club) {
      enableAuthorityProtection(who);
      setOwner(who); setActiveNow(true); setLocked(false);
      adopt(answer, who);
      syncPending(who);
      await authorityClient.retry(who).then(outcomes => { for (const o of outcomes) if (o.status === 'confirmed') adopt(o.answer, who); });
      // Pending receipts may have settled the open game; only release what is still open now.
      const latest = authorityClient.club(who);
      const open = latest?.activeMatch === answer.match?.id ? answer.match : null;
      if (open && (open.status === 'reserved' || open.status === 'started')) {
        // A reservation cannot be resumed after a reload; release it so the club can play again.
        const cancelled = await authorityClient.operate(who, 'match.cancel', { matchId: open.id });
        if (cancelled.status === 'confirmed') { adopt(cancelled.answer, who); setNotice(open.status === 'reserved' ? 'Your unfinished game was released and its Energy refunded.' : 'Your unfinished game was closed. A game that never reached the whistle earns nothing.'); }
      }
    } else {
      if (record?.viewOwner === who) clearAuthorityProtection(); // the server has no club for this account
      setOwner(null); setActiveNow(false); setLocked(!!record && record.viewOwner !== who);
    }
    setReady(true);
  }, [adopt, syncPending, setActiveNow]);
  useEffect(() => {
    void detect();
    const online = () => { void retry(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [detect, retry]);

  const resync = useCallback(async () => { authorityClient.forgetClubs(); setOwner(null); setActiveNow(false); setLocked(false); setMatch(null); setReady(false); await detect(); }, [detect, setActiveNow]);
  const enable = useCallback(async (legacy: GameState) => {
    if (!pvpEnabled()) return { ok: false, message: 'Online protection is not configured in this build.' };
    await getProfile();
    const who = playerId();
    if (!/^[0-9a-f-]{36}$/i.test(who)) return { ok: false, message: 'Connect to the internet once so this device gets its online identity, then try again.' };
    const answer = await authorityClient.query(who, { kind: 'bootstrap', legacy });
    if (!answer.ok || !answer.club) return { ok: false, message: answer.message ?? 'Online protection could not admit this club. Your local club is unchanged.' };
    enableAuthorityProtection(who);
    setOwner(who); ownerRef.current = who; setActiveNow(true); setLocked(false);
    adopt(answer, who);
    const status = await authorityClient.query(who, { kind: 'status' });
    if (status.ok) adopt(status, who);
    return { ok: true, message: answer.club.origin === 'legacy' ? 'Your club is now protected online. Progress is confirmed by the server from here on.' : 'A fresh protected club is ready. Your earlier local progress could not be carried over and is kept in a backup.' };
  }, [adopt, setActiveNow]);

  const refresh = useCallback(async () => {
    const who = ownerRef.current;
    if (!who) return;
    const answer = await authorityClient.query(who, { kind: 'status' });
    if (answer.ok) adopt(answer, who); else setNotice(answer.message ?? null);
  }, [adopt]);

  const operate = useCallback(async (kind: 'action' | 'match.reserve' | 'match.begin' | 'match.cancel' | 'match.finish', fields: Record<string, unknown>): Promise<AuthorityOutcome> => {
    const who = ownerRef.current;
    if (!who) return { status: 'failed', operationId: '', code: 'inactive', message: 'Online protection is not active for this club.' };
    const outcome = await authorityClient.operate(who, kind, fields);
    if (outcome.status === 'confirmed') adopt(outcome.answer, who);
    else if (outcome.status === 'failed' && outcome.answer) adopt(outcome.answer, who);
    syncPending(who);
    return outcome;
  }, [adopt, syncPending]);

  const dispatch = useCallback((action: Record<string, unknown>) => operate('action', { action }), [operate]);
  const reserve = useCallback(async (choice: MatchChoice) => {
    const outcome = await operate('match.reserve', { choice });
    if (outcome.status !== 'confirmed') return { error: outcome.message };
    const issued = outcome.answer.match;
    const matchId = (outcome.answer.result as { matchId?: string } | null)?.matchId;
    if (!issued || !matchId || issued.id !== matchId) return { error: 'The game was reserved but its details did not arrive. Refresh and try again.' };
    return { matchId, config: issued.config as unknown as BattleConfig };
  }, [operate]);
  const begin = useCallback(async (matchId: string) => {
    const outcome = await operate('match.begin', { matchId });
    return outcome.status === 'confirmed' ? { ok: true as const } : { ok: false as const, message: outcome.message };
  }, [operate]);
  const cancel = useCallback(async (matchId: string) => (await operate('match.cancel', { matchId })).status === 'confirmed', [operate]);
  const finish = useCallback((matchId: string, submission: MatchSubmission) => operate('match.finish', { matchId, submission }), [operate]);
  const film = useCallback(async (matchId: string) => {
    const who = ownerRef.current;
    if (!who) return null;
    const answer = await authorityClient.query(who, { kind: 'film', matchId });
    if (!answer.ok) { setNotice(answer.message ?? null); return null; }
    const result = answer.result as { replay?: unknown } | null;
    return result?.replay == null ? null : validateReplay(result.replay);
  }, []);

  const isActiveNow = useCallback(() => activeRef.current, []);
  const diagnostics = useCallback(() => authorityClient.diagnostics(ownerRef.current ?? undefined), []);
  return useMemo(() => ({ active, locked, ready, owner, revision, pendingCount, notice, match, rivals, roadTargets, isActiveNow, enable, resync, refresh, retry, dispatch, reserve, begin, cancel, finish, film, diagnostics, setNotice }),
    [active, locked, ready, owner, revision, pendingCount, notice, match, rivals, roadTargets, isActiveNow, enable, resync, refresh, retry, dispatch, reserve, begin, cancel, finish, film, diagnostics]);
}
