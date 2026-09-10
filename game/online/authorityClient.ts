// Client for the club-authority service. Every state-changing request is recorded in a durable
// operation ledger BEFORE it is sent, so a lost reply is retried with the same operation id and
// request (the server answers a retry with the original receipt and never applies it twice).
// Operations for one account are sent one at a time, so a request queued behind another takes
// the revision the server confirmed rather than a stale one. The client never credits rewards
// itself: it adopts the server's club state after each answer, and only for the account the
// transport says the answer belongs to.
import type { GameState } from '../../types';
import { parseSavedClub } from '../saveValidation';
import { canonicalJson } from '../combat/canonical';
import { isPlayerId, isRecord } from './validation';

export interface AuthorityClubView { owner: string; state: GameState; revision: number; activeMatch: string | null; origin: string }
export interface AuthorityMatchView { id: string; owner: string; status: 'reserved' | 'started' | 'settled' | 'cancelled'; config: Record<string, unknown>; seed: number; issuedAt: number; expiresAt: number; metadata: Record<string, unknown> }
export interface AuthorityRivalView { owner: string; name: string; stadiumLevel: number; fans: number; trophies: number; revision: number }
export interface AuthorityAnswer {
  ok: boolean; code?: string; message?: string; serverNow?: number;
  club?: AuthorityClubView | null; match?: AuthorityMatchView | null; result?: unknown;
  rivals?: AuthorityRivalView[]; roadTargets?: unknown[]; leaderboard?: AuthorityRivalView[];
}
export type AuthorityTransportResult = { status: 'ok'; owner: string; body: unknown } | { status: 'unauthorized' } | { status: 'offline' };
export type AuthorityTransport = (body: unknown) => Promise<AuthorityTransportResult>;

export type AuthorityOperationKind = 'action' | 'match.reserve' | 'match.begin' | 'match.cancel' | 'match.finish';
export interface AuthorityLedgerEntry {
  operationId: string; owner: string; kind: AuthorityOperationKind;
  /** The exact request body. `expectedRevision` is filled in at first send and frozen from then on. */
  request: Record<string, unknown>;
  state: 'pending' | 'confirmed' | 'failed'; code?: string; message?: string; at: number; confirmedAt?: number;
}
/** What the caller sees after an operation attempt. `pending` means the server's answer is unknown and the ledger will retry. */
export type AuthorityOutcome =
  | { status: 'confirmed'; operationId: string; answer: AuthorityAnswer; duplicate: boolean }
  | { status: 'failed'; operationId: string; code: string; message: string; answer?: AuthorityAnswer }
  | { status: 'pending'; operationId: string; message: string };

/** Bounded, privacy-safe diagnostics: no tokens, payloads or club saves — only what recovery needs. */
export interface AuthorityDiagnosticEvent { at: number; kind: string; operationId?: string; outcome: 'confirmed' | 'failed' | 'pending' | 'query'; code?: string; latencyMs?: number; revision?: number }
export interface AuthorityDiagnostics {
  events: AuthorityDiagnosticEvent[];
  availability: { status: 'ok' | 'offline' | 'unauthorized' | 'unknown'; at: number | null };
  pending: number; failed: number; confirmed: number; averageConfirmLatencyMs: number | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'fhq_authority_ops_v1';
const DIAG_KEY = 'fhq_authority_diag_v1';
const DIAG_LIMIT = 40;
const RETRY_CODES = new Set(['unavailable']);
const PENDING_MESSAGE = 'Waiting for online protection to confirm this request.';
const validClub = (value: unknown): AuthorityClubView | null => {
  if (!isRecord(value) || !isPlayerId(value.owner) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !isRecord(value.state)) return null;
  if (value.activeMatch !== null && value.activeMatch !== undefined && !isPlayerId(value.activeMatch)) return null;
  try { parseSavedClub(JSON.stringify(value.state)); } catch { return null; }
  return { owner: value.owner, state: value.state as unknown as GameState, revision: value.revision as number, activeMatch: (value.activeMatch as string | null | undefined) ?? null, origin: String(value.origin ?? '') };
};
const validMatch = (value: unknown): AuthorityMatchView | null => {
  if (!isRecord(value) || !isPlayerId(value.id) || !isPlayerId(value.owner) || !['reserved', 'started', 'settled', 'cancelled'].includes(String(value.status)) || !isRecord(value.config)
    || !Number.isSafeInteger(value.seed) || !Number.isFinite(value.issuedAt) || !Number.isFinite(value.expiresAt)) return null;
  return { id: value.id, owner: value.owner, status: value.status as AuthorityMatchView['status'], config: value.config, seed: value.seed as number, issuedAt: value.issuedAt as number, expiresAt: value.expiresAt as number, metadata: isRecord(value.metadata) ? value.metadata : {} };
};
const validRival = (value: unknown): value is AuthorityRivalView => isRecord(value) && isPlayerId(value.owner) && typeof value.name === 'string' && Number.isFinite(value.trophies) && Number.isFinite(value.stadiumLevel) && Number.isFinite(value.fans) && Number.isFinite(value.revision);
/** Bounds and shapes an untrusted server answer; a club that fails validation is dropped, never adopted. */
export const parseAuthorityAnswer = (body: unknown): AuthorityAnswer | null => {
  if (!isRecord(body) || typeof body.ok !== 'boolean') return null;
  const answer: AuthorityAnswer = { ok: body.ok };
  if (typeof body.code === 'string') answer.code = body.code.slice(0, 60);
  if (typeof body.message === 'string') answer.message = body.message.slice(0, 400);
  if (Number.isFinite(body.serverNow)) answer.serverNow = body.serverNow as number;
  if (body.club !== undefined) answer.club = body.club === null ? null : validClub(body.club);
  if (body.match !== undefined) answer.match = body.match === null ? null : validMatch(body.match);
  if ('result' in body) answer.result = body.result;
  if (Array.isArray(body.rivals)) answer.rivals = body.rivals.filter(validRival).slice(0, 30);
  if (Array.isArray(body.leaderboard)) answer.leaderboard = body.leaderboard.filter(validRival).slice(0, 50);
  if (Array.isArray(body.roadTargets)) answer.roadTargets = body.roadTargets.slice(0, 3);
  return answer;
};
const shortId = (id: string) => id.slice(0, 8);
const validEntry = (row: unknown): row is AuthorityLedgerEntry => isRecord(row) && isPlayerId(row.operationId) && isPlayerId(row.owner)
  && ['action', 'match.reserve', 'match.begin', 'match.cancel', 'match.finish'].includes(String(row.kind)) && isRecord(row.request)
  && ['pending', 'confirmed', 'failed'].includes(String(row.state)) && Number.isFinite(row.at);

export interface AuthorityClientOptions { now?: () => number; uuid?: () => string }

export class AuthorityClient {
  private entries: AuthorityLedgerEntry[] = [];
  private loaded = false;
  private inflight = new Set<string>();
  private queues = new Map<string, Promise<unknown>>();
  private clubs = new Map<string, AuthorityClubView>();
  private listeners = new Set<() => void>();
  private diag: AuthorityDiagnosticEvent[] = [];
  private diagLoaded = false;
  private availability: AuthorityDiagnostics['availability'] = { status: 'unknown', at: null };
  constructor(private transport: AuthorityTransport, private storage: StorageLike, private options: AuthorityClientOptions = {}) {}
  private now() { return this.options.now?.() ?? Date.now(); }
  private newId() { return this.options.uuid?.() ?? crypto.randomUUID(); }
  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const rows: unknown = JSON.parse(this.storage.getItem(KEY) ?? '[]');
      if (Array.isArray(rows)) this.entries = rows.filter(validEntry).slice(-50);
    } catch { this.entries = []; }
  }
  private persist(): boolean {
    try { this.storage.setItem(KEY, JSON.stringify(this.entries)); return true; } catch { return false; }
  }
  private loadDiag() {
    if (this.diagLoaded) return;
    this.diagLoaded = true;
    try { const rows: unknown = JSON.parse(this.storage.getItem(DIAG_KEY) ?? '[]'); if (Array.isArray(rows)) this.diag = rows.filter(r => isRecord(r) && Number.isFinite(r.at)).slice(-DIAG_LIMIT) as AuthorityDiagnosticEvent[]; } catch { this.diag = []; }
  }
  private record(event: Omit<AuthorityDiagnosticEvent, 'at'>) {
    this.loadDiag();
    this.diag = [...this.diag, { at: this.now(), ...event }].slice(-DIAG_LIMIT);
    try { this.storage.setItem(DIAG_KEY, JSON.stringify(this.diag)); } catch { /* diagnostics are best effort */ }
  }
  private emit() { for (const listener of this.listeners) { try { listener(); } catch { /* listeners cannot break the ledger */ } } }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  /** The last server-confirmed club for this account on this client. */
  club(owner: string): AuthorityClubView | null { return this.clubs.get(owner) ?? null; }
  /** Drop every in-memory club view (sign-out / account switch). The durable ledger stays owner-bound. */
  forgetClubs(): void { this.clubs.clear(); this.emit(); }
  private adopt(owner: string, answer: AuthorityAnswer) {
    if (answer.club && answer.club.owner === owner) { this.clubs.set(owner, answer.club); this.emit(); }
  }
  pending(owner: string): AuthorityLedgerEntry[] { this.load(); return this.entries.filter(e => e.owner === owner && e.state === 'pending'); }
  ledger(owner: string): AuthorityLedgerEntry[] { this.load(); return this.entries.filter(e => e.owner === owner); }
  diagnostics(owner?: string): AuthorityDiagnostics {
    this.load(); this.loadDiag();
    const mine = owner ? this.entries.filter(e => e.owner === owner) : this.entries;
    const latencies = this.diag.filter(e => e.outcome === 'confirmed' && Number.isFinite(e.latencyMs)).map(e => e.latencyMs as number);
    return {
      events: [...this.diag], availability: { ...this.availability },
      pending: mine.filter(e => e.state === 'pending').length, failed: mine.filter(e => e.state === 'failed').length, confirmed: mine.filter(e => e.state === 'confirmed').length,
      averageConfirmLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    };
  }

  private async send(body: Record<string, unknown>, owner: string): Promise<{ status: 'ok'; answer: AuthorityAnswer } | { status: 'offline' | 'unauthorized' | 'other-account' }> {
    const sent = await this.transport(body);
    if (sent.status !== 'ok') { this.availability = { status: sent.status, at: this.now() }; return sent; }
    if (sent.owner !== owner) return { status: 'other-account' };
    const answer = parseAuthorityAnswer(sent.body);
    if (!answer) { this.availability = { status: 'offline', at: this.now() }; return { status: 'offline' }; }
    this.availability = { status: 'ok', at: this.now() };
    this.adopt(owner, answer);
    return { status: 'ok', answer };
  }
  /** Read-only requests: no ledger entry, nothing to retry. */
  async query(owner: string, body: { kind: 'bootstrap'; legacy?: unknown } | { kind: 'status' } | { kind: 'leaderboard' } | { kind: 'film'; matchId: string }): Promise<AuthorityAnswer | { ok: false; code: 'offline' | 'unauthorized' | 'other-account'; message: string }> {
    const started = this.now();
    const sent = await this.send(body, owner);
    this.record({ kind: body.kind, outcome: 'query', code: sent.status === 'ok' ? (sent.answer.ok ? undefined : sent.answer.code) : sent.status, latencyMs: this.now() - started });
    if (sent.status === 'ok') return sent.answer;
    return { ok: false, code: sent.status, message: sent.status === 'unauthorized' ? 'Reconnect your club to continue.' : sent.status === 'offline' ? 'Online protection is unreachable right now. Your club has been kept.' : 'The signed-in account changed.' };
  }
  private enqueue<T>(owner: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(owner) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.queues.set(owner, next);
    next.finally(() => { if (this.queues.get(owner) === next) this.queues.delete(owner); }).catch(() => undefined);
    return next;
  }
  /** State-changing request. Recorded before sending; sent after the account's earlier operations; retried verbatim by `retry`. */
  async operate(owner: string, kind: AuthorityOperationKind, fields: Record<string, unknown>, operationId = this.newId()): Promise<AuthorityOutcome> {
    this.load();
    if (!this.clubs.get(owner)) return { status: 'failed', operationId, code: 'not_bootstrapped', message: 'Connect your protected club before playing online.' };
    if (this.entries.some(e => e.operationId === operationId)) return { status: 'failed', operationId, code: 'operation_conflict', message: 'That request identifier was already used.' };
    // A second tap while the same request is still unconfirmed must not become a second mutation.
    const signature = canonicalJson({ kind, ...fields });
    const twin = this.entries.find(e => e.owner === owner && e.state === 'pending' && canonicalJson({ ...e.request, operationId: undefined, expectedRevision: undefined }) === signature);
    if (twin) return this.inflight.has(twin.operationId) ? { status: 'pending', operationId: twin.operationId, message: 'This request is already being sent.' } : this.enqueue(owner, () => this.deliver(twin));
    this.entries = this.entries.filter(e => e.state === 'pending' || e.at > this.now() - 7 * 86_400_000).slice(-49);
    const entry: AuthorityLedgerEntry = { operationId, owner, kind, request: { kind, operationId, ...fields }, state: 'pending', at: this.now() };
    this.entries.push(entry);
    if (!this.persist()) { this.entries.pop(); return { status: 'failed', operationId, code: 'storage', message: 'This device could not record the request. Nothing was sent.' }; }
    this.emit();
    return this.enqueue(owner, () => this.deliver(entry));
  }
  private async deliver(entry: AuthorityLedgerEntry): Promise<AuthorityOutcome> {
    if (this.inflight.has(entry.operationId)) return { status: 'pending', operationId: entry.operationId, message: 'This request is already being sent.' };
    // A twin tap that queued behind the original finds it already answered: report that answer, send nothing.
    if (entry.state === 'confirmed') return { status: 'confirmed', operationId: entry.operationId, answer: { ok: true, club: this.clubs.get(entry.owner) ?? null }, duplicate: true };
    if (entry.state === 'failed') return { status: 'failed', operationId: entry.operationId, code: entry.code ?? 'failed', message: entry.message ?? 'The request was not accepted.' };
    const club = this.clubs.get(entry.owner);
    if (!club) return { status: 'pending', operationId: entry.operationId, message: 'Reconnect your club to confirm this request.' };
    // An earlier request whose answer was lost may already have moved the server's revision.
    // Later requests wait for its receipt instead of freezing a revision that may be stale.
    const blocker = this.entries.find(e => e.owner === entry.owner && e.state === 'pending' && e !== entry && e.at <= entry.at && e.request.expectedRevision !== undefined && e.operationId !== entry.operationId);
    if (blocker && entry.request.expectedRevision === undefined) return { status: 'pending', operationId: entry.operationId, message: 'Waiting for an earlier request to be confirmed first.' };
    if (entry.request.expectedRevision === undefined) { entry.request = { ...entry.request, expectedRevision: club.revision }; this.persist(); }
    this.inflight.add(entry.operationId);
    const started = this.now();
    const done = (outcome: AuthorityOutcome, code?: string) => { this.record({ kind: entry.kind, operationId: shortId(entry.operationId), outcome: outcome.status, code, latencyMs: this.now() - started, revision: this.clubs.get(entry.owner)?.revision }); this.emit(); return outcome; };
    try {
      const sent = await this.send(entry.request, entry.owner);
      if (sent.status !== 'ok') return done({ status: 'pending', operationId: entry.operationId, message: sent.status === 'unauthorized' ? 'Reconnect your club to confirm this request.' : PENDING_MESSAGE }, sent.status);
      const { answer } = sent;
      if (answer.ok) {
        entry.state = 'confirmed'; entry.confirmedAt = this.now(); this.persist();
        return done({ status: 'confirmed', operationId: entry.operationId, answer, duplicate: false });
      }
      if (answer.code && RETRY_CODES.has(answer.code)) return done({ status: 'pending', operationId: entry.operationId, message: answer.message ?? PENDING_MESSAGE }, answer.code);
      entry.state = 'failed'; entry.code = answer.code ?? 'failed'; entry.message = answer.message; this.persist();
      return done({ status: 'failed', operationId: entry.operationId, code: entry.code, message: answer.message ?? 'The request was not accepted.', answer }, entry.code);
    } catch {
      return done({ status: 'pending', operationId: entry.operationId, message: PENDING_MESSAGE }, 'exception');
    } finally { this.inflight.delete(entry.operationId); }
  }
  /** Re-sends every pending operation for `owner` in order. Confirmed answers adopt the latest club. */
  async retry(owner: string): Promise<AuthorityOutcome[]> {
    this.load();
    const results: AuthorityOutcome[] = [];
    for (const entry of this.entries.filter(e => e.owner === owner && e.state === 'pending')) {
      if (!this.clubs.get(owner)) break; // status/bootstrap must run first so the answer can be validated against an account
      results.push(await this.enqueue(owner, () => this.deliver(entry)));
    }
    return results;
  }
}
