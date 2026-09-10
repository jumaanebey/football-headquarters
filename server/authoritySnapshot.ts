// Backup and restore of authority data in the shapes the SQL tables use, so a rehearsal in the
// memory store and a real restore into `fhq_authority_clubs/matches/operations/configuration`
// move the same rows. The snapshot is validated on the way in: every row must belong to a
// well-formed owner, revisions must be non-negative integers, an active match must exist in
// the same snapshot and belong to that owner, and unknown fields are refused rather than
// carried along. Nothing here talks to a database; `restoreAuthoritySnapshot` fills a fresh
// MemoryAuthorityStore (the isolated environment the rehearsal script uses).
import type { GameState } from '../types';
import { parseSavedClub } from '../game/saveValidation';
import { MemoryAuthorityStore } from './memoryAuthorityStore';
import type { AuthorityClub, AuthorityMatch, AuthorityMatchStatus, AuthorityOperation } from './authorityStore';

export const AUTHORITY_SNAPSHOT_FORMAT = 'fhq-authority-snapshot/1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: AuthorityMatchStatus[] = ['reserved', 'started', 'settled', 'cancelled'];

/** Column-shaped rows (snake_case as in the migration) so a restore can be written as plain inserts. */
export interface AuthoritySnapshot {
  format: typeof AUTHORITY_SNAPSHOT_FORMAT;
  takenAt: string;
  configuration: { activation_at: string };
  clubs: Array<{ pid: string; state: GameState; revision: number; active_match: string | null; origin: string; updated_at: string }>;
  matches: Array<{ id: string; owner: string; status: AuthorityMatchStatus; config: unknown; seed: number; issued_at: string; expires_at: string; metadata: Record<string, unknown>; result: unknown }>;
  operations: Array<{ owner: string; operation_id: string; request_hash: string; result: unknown }>;
}

export class AuthoritySnapshotError extends Error { constructor(message: string) { super(message); this.name = 'AuthoritySnapshotError'; } }

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const iso = (ms: number) => new Date(ms).toISOString();
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function fail(message: string): never { throw new AuthoritySnapshotError(message); }
const exactKeys = (row: Record<string, unknown>, keys: string[], what: string) => { const extra = Object.keys(row).filter(k => !keys.includes(k)); const missing = keys.filter(k => !(k in row)); if (extra.length || missing.length) fail(`${what}: unexpected fields ${JSON.stringify(extra)}, missing ${JSON.stringify(missing)}`); };
const time = (value: unknown, what: string): number => { const ms = typeof value === 'string' ? Date.parse(value) : NaN; if (!Number.isFinite(ms)) fail(`${what}: invalid timestamp`); return ms; };
const uuid = (value: unknown, what: string): string => { if (typeof value !== 'string' || !UUID.test(value)) fail(`${what}: invalid id`); return (value as string).toLowerCase(); };
const revision = (value: unknown, what: string): number => { if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${what}: invalid revision`); return value as number; };

/** Serialize a memory store: what a `select *` on the four tables would return, as JSON. */
export function exportAuthoritySnapshot(store: MemoryAuthorityStore, takenAt = Date.now()): AuthoritySnapshot {
  return {
    format: AUTHORITY_SNAPSHOT_FORMAT,
    takenAt: iso(takenAt),
    configuration: { activation_at: iso(store.activationAt) },
    clubs: [...store.clubs.values()].map(c => ({ pid: c.owner, state: clone(c.state), revision: c.revision, active_match: c.activeMatch, origin: c.origin, updated_at: iso(c.updatedAt) })),
    matches: [...store.matches.values()].map(m => ({ id: m.id, owner: m.owner, status: m.status, config: clone(m.config), seed: m.seed, issued_at: iso(m.issuedAt), expires_at: iso(m.expiresAt), metadata: clone(m.metadata), result: m.result == null ? null : clone(m.result) })),
    operations: [...store.operations.values()].map(o => ({ owner: o.owner, operation_id: o.operationId, request_hash: o.requestHash, result: o.result == null ? null : clone(o.result) })),
  };
}

/** Validate a snapshot and load it into a fresh memory store. Refuses anything malformed rather than restoring part of it. */
export function restoreAuthoritySnapshot(raw: unknown, options: { now?: () => number } = {}): MemoryAuthorityStore {
  if (!object(raw) || raw.format !== AUTHORITY_SNAPSHOT_FORMAT) fail('not an authority snapshot');
  const snapshot = raw as Record<string, unknown>;
  exactKeys(snapshot, ['format', 'takenAt', 'configuration', 'clubs', 'matches', 'operations'], 'snapshot');
  if (!object(snapshot.configuration)) fail('configuration missing');
  exactKeys(snapshot.configuration, ['activation_at'], 'configuration');
  const activationAt = time(snapshot.configuration.activation_at, 'configuration.activation_at');
  time(snapshot.takenAt, 'takenAt');
  if (!Array.isArray(snapshot.clubs) || !Array.isArray(snapshot.matches) || !Array.isArray(snapshot.operations)) fail('tables must be arrays');
  const clubs = new Map<string, AuthorityClub>();
  const matches = new Map<string, AuthorityMatch>();
  const operations = new Map<string, AuthorityOperation>();
  for (const [i, row] of (snapshot.matches as unknown[]).entries()) {
    const what = `matches[${i}]`;
    if (!object(row)) fail(`${what}: not a row`);
    exactKeys(row, ['id', 'owner', 'status', 'config', 'seed', 'issued_at', 'expires_at', 'metadata', 'result'], what);
    const id = uuid(row.id, `${what}.id`), owner = uuid(row.owner, `${what}.owner`);
    if (matches.has(id)) fail(`${what}: duplicate match ${id}`);
    if (!STATUSES.includes(row.status as AuthorityMatchStatus)) fail(`${what}: invalid status`);
    if (!object(row.config) || !object(row.metadata) || !Number.isSafeInteger(row.seed)) fail(`${what}: invalid config, metadata or seed`);
    if (row.status === 'settled' && row.result == null) fail(`${what}: settled without a result`);
    matches.set(id, { id, owner, status: row.status as AuthorityMatchStatus, config: clone(row.config) as unknown as AuthorityMatch['config'], seed: row.seed as number, issuedAt: time(row.issued_at, `${what}.issued_at`), expiresAt: time(row.expires_at, `${what}.expires_at`), metadata: clone(row.metadata), result: row.result == null ? null : clone(row.result) });
  }
  for (const [i, row] of (snapshot.clubs as unknown[]).entries()) {
    const what = `clubs[${i}]`;
    if (!object(row)) fail(`${what}: not a row`);
    exactKeys(row, ['pid', 'state', 'revision', 'active_match', 'origin', 'updated_at'], what);
    const owner = uuid(row.pid, `${what}.pid`);
    if (clubs.has(owner)) fail(`${what}: duplicate club ${owner}`);
    let state: GameState;
    try { state = parseSavedClub(JSON.stringify(row.state)); } catch (error) { return fail(`${what}.state: ${(error as Error).message}`); }
    const activeMatch = row.active_match == null ? null : uuid(row.active_match, `${what}.active_match`);
    if (activeMatch) {
      const match = matches.get(activeMatch);
      if (!match || match.owner !== owner) fail(`${what}: active match ${activeMatch} is not this owner's match in the snapshot`);
      if (!['reserved', 'started'].includes(match.status)) fail(`${what}: active match ${activeMatch} is ${match.status}`);
    }
    if (typeof row.origin !== 'string') fail(`${what}.origin: invalid`);
    clubs.set(owner, { owner, state, revision: revision(row.revision, `${what}.revision`), activeMatch, origin: row.origin, updatedAt: time(row.updated_at, `${what}.updated_at`) });
  }
  for (const match of matches.values()) {
    if (!clubs.has(match.owner)) fail(`match ${match.id}: owner ${match.owner} has no club in the snapshot`);
    if (['reserved', 'started'].includes(match.status) && clubs.get(match.owner)!.activeMatch !== match.id) fail(`match ${match.id}: open but not the owner's active match`);
  }
  for (const [i, row] of (snapshot.operations as unknown[]).entries()) {
    const what = `operations[${i}]`;
    if (!object(row)) fail(`${what}: not a row`);
    exactKeys(row, ['owner', 'operation_id', 'request_hash', 'result'], what);
    const owner = uuid(row.owner, `${what}.owner`), operationId = uuid(row.operation_id, `${what}.operation_id`);
    if (!clubs.has(owner)) fail(`${what}: owner ${owner} has no club in the snapshot`);
    if (typeof row.request_hash !== 'string' || !/^[0-9a-f]{64}$/.test(row.request_hash)) fail(`${what}.request_hash: invalid`);
    const key = `${owner}:${operationId}`;
    if (operations.has(key)) fail(`${what}: duplicate operation`);
    operations.set(key, { owner, operationId, requestHash: row.request_hash, result: row.result == null ? null : clone(row.result) });
  }
  const store = new MemoryAuthorityStore({ activationAt, now: options.now });
  for (const [k, v] of clubs) store.clubs.set(k, v);
  for (const [k, v] of matches) store.matches.set(k, v);
  for (const [k, v] of operations) store.operations.set(k, v);
  return store;
}

/** Row-count and ownership summary used by the rehearsal report. */
export const describeAuthoritySnapshot = (s: AuthoritySnapshot) => ({
  clubs: s.clubs.length, matches: s.matches.length, operations: s.operations.length,
  openMatches: s.matches.filter(m => m.status === 'reserved' || m.status === 'started').length,
  revisions: Object.fromEntries(s.clubs.map(c => [c.pid.slice(0, 8), c.revision])),
});
