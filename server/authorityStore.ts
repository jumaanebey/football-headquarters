// server/authorityStore.ts
import type { GameState } from '../types';
import type { BattleConfig } from '../game/combat/contracts';

export type AuthorityMatchStatus = 'reserved' | 'started' | 'settled' | 'cancelled';

/** The battle config an issued match carries: the shared BattleConfig plus the authority envelope
 *  and the defense-snapshot fields the server stamps on rival/gauntlet games. */
export interface AuthorityMatchConfig extends BattleConfig {
  authority?: { matchId: string; seed: number; rules: string; issuedAt: number; expiresAt: number };
  defenseLayoutId?: string;
  defenseSnapshotId?: string;
  defenseFormation?: string;
}

export interface AuthorityClub {
  owner: string;
  state: GameState;
  revision: number;
  activeMatch: string | null;
  origin: string;
  updatedAt: number;
}

export interface AuthorityMatch {
  id: string;
  owner: string;
  status: AuthorityMatchStatus;
  config: AuthorityMatchConfig;
  seed: number;
  issuedAt: number;
  expiresAt: number;
  metadata: Record<string, unknown>;
  result: unknown;
}

export interface AuthorityOperation {
  owner: string;
  operationId: string;
  requestHash: string;
  result: unknown;
}

export interface AuthorityConfiguration {
  activationAt: number;
}

export interface AuthorityRival {
  owner: string;
  name: string;
  stadiumLevel: number;
  fans: number;
  trophies: number;
  revision: number;
}

/** A match row written by a commit: a reserved match omits `result`; transitions carry `expectedStatus`. */
export interface AuthorityCommitMatch extends Omit<AuthorityMatch, 'result'> {
  result?: unknown;
  expectedStatus?: AuthorityMatchStatus;
}

export interface AuthorityCommitTarget {
  owner: string;
  expectedRevision: number;
  nextState: GameState;
}

export interface AuthorityCommit {
  owner: string;
  expectedRevision: number;
  operationId: string;
  requestHash: string;
  nextState: GameState;
  result: unknown;
  match?: AuthorityCommitMatch;
  target?: AuthorityCommitTarget;
  activeMatch?: string | null;
}

export type AuthorityCommitCode = 'revision_conflict' | 'operation_conflict' | 'not_found' | 'match_conflict';

export type AuthorityCommitResult =
  | { ok: true; duplicate: boolean; club: AuthorityClub; result: unknown }
  | { ok: false; code: AuthorityCommitCode; club?: AuthorityClub };

export interface AuthorityStore {
  getConfiguration(): Promise<AuthorityConfiguration>;
  getClub(owner: string): Promise<AuthorityClub | null>;
  createClub(owner: string, state: GameState, origin: string): Promise<AuthorityClub>;
  getMatch(owner: string, id: string): Promise<AuthorityMatch | null>;
  getMatchForParticipant(owner: string, id: string): Promise<AuthorityMatch | null>;
  findOperation(owner: string, operationId: string): Promise<AuthorityOperation | null>;
  commit(command: AuthorityCommit): Promise<AuthorityCommitResult>;
  listRivals(owner: string): Promise<AuthorityRival[]>;
  getLeaderboard(): Promise<AuthorityRival[]>;
}

export interface SupabaseAuthorityStoreOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type RestInit = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (value: string): string => {
  if (!UUID.test(value)) throw new TypeError('Invalid authority identifier.');
  return value;
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthorityStoreUnavailable();
  return value as Record<string, unknown>;
};
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new AuthorityStoreUnavailable();
  return value;
};
const timestamp = (value: unknown): number => {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(result) || result < 0) throw new AuthorityStoreUnavailable();
  return result;
};

export class AuthorityStoreUnavailable extends Error {
  constructor() {
    super('Club service is temporarily unavailable.');
    this.name = 'AuthorityStoreUnavailable';
  }
}

const clubFromRow = (value: unknown): AuthorityClub => {
  const row = record(value);
  return {
    owner: uuid(String(row.pid)),
    state: record(row.state) as unknown as GameState,
    revision: integer(row.revision),
    activeMatch: row.active_match == null ? null : uuid(String(row.active_match)),
    origin: String(row.origin),
    updatedAt: timestamp(row.updated_at)
  };
};

const matchFromRow = (value: unknown): AuthorityMatch => {
  const row = record(value);
  if (!['reserved', 'started', 'settled', 'cancelled'].includes(String(row.status))) throw new AuthorityStoreUnavailable();
  return {
    id: uuid(String(row.id)),
    owner: uuid(String(row.owner)),
    status: row.status as AuthorityMatchStatus,
    config: record(row.config) as unknown as AuthorityMatchConfig,
    seed: integer(row.seed),
    issuedAt: timestamp(row.issued_at),
    expiresAt: timestamp(row.expires_at),
    metadata: record(row.metadata),
    result: row.result
  };
};

export function createSupabaseAuthorityStore(options: SupabaseAuthorityStoreOptions): AuthorityStore {
  if (typeof window !== 'undefined') throw new Error('Authority storage is server-only.');
  const base = new URL(options.url);
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new TypeError('Invalid Supabase server URL.');
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new TypeError('HTTPS is required.');
  if (!options.serviceRoleKey || options.serviceRoleKey.startsWith('sb_publishable_')) throw new TypeError('A private server key is required.');
  const send = options.fetch ?? fetch;
  const headers: Record<string, string> = { apikey: options.serviceRoleKey, 'Content-Type': 'application/json' };
  if (!options.serviceRoleKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${options.serviceRoleKey}`;
  const request = async (path: string, init: RestInit = {}): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15e3);
    try {
      const response = await send(new URL(`/rest/v1/${path}`, base), {
        ...init,
        headers: { ...headers, ...init.headers },
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new AuthorityStoreUnavailable();
      return await response.json();
    } catch {
      throw new AuthorityStoreUnavailable();
    } finally {
      clearTimeout(timer);
    }
  };
  const rows = async (path: string, init?: RestInit): Promise<unknown[]> => {
    const result = await request(path, init);
    if (!Array.isArray(result)) throw new AuthorityStoreUnavailable();
    return result;
  };
  const getClub = async (owner: string): Promise<AuthorityClub | null> => {
    const result = await rows(`fhq_authority_clubs?pid=eq.${uuid(owner)}&select=pid,state,revision,active_match,origin,updated_at&limit=1`);
    return result.length ? clubFromRow(result[0]) : null;
  };
  return {
    async getConfiguration() {
      const result = await rows('fhq_authority_configuration?singleton=eq.true&select=activation_at&limit=1');
      if (result.length !== 1) throw new AuthorityStoreUnavailable();
      return { activationAt: timestamp(record(result[0]).activation_at) };
    },
    getClub,
    async createClub(owner, state, origin) {
      uuid(owner);
      if (!origin || origin.length > 40) throw new TypeError('Invalid club origin.');
      const result = await rows('fhq_authority_clubs?on_conflict=pid&select=pid,state,revision,active_match,origin,updated_at', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ pid: owner, state, origin })
      });
      if (result.length) return clubFromRow(result[0]);
      const existing = await getClub(owner);
      if (!existing) throw new AuthorityStoreUnavailable();
      return existing;
    },
    async getMatch(owner, id) {
      const result = await rows(`fhq_authority_matches?owner=eq.${uuid(owner)}&id=eq.${uuid(id)}&select=id,owner,status,config,seed,issued_at,expires_at,metadata,result&limit=1`);
      return result.length ? matchFromRow(result[0]) : null;
    },
    async getMatchForParticipant(owner, id) {
      const result = await rows('rpc/fhq_authority_match_film', {
        method: 'POST',
        body: JSON.stringify({ requesting_owner: uuid(owner), match_id: uuid(id) })
      });
      return result.length ? matchFromRow(result[0]) : null;
    },
    async findOperation(owner, operationId) {
      const result = await rows(`fhq_authority_operations?owner=eq.${uuid(owner)}&operation_id=eq.${uuid(operationId)}&select=owner,operation_id,request_hash,response&limit=1`);
      if (!result.length) return null;
      const row = record(result[0]);
      return { owner: uuid(String(row.owner)), operationId: uuid(String(row.operation_id)), requestHash: String(row.request_hash), result: row.response };
    },
    async commit(command) {
      uuid(command.owner);
      uuid(command.operationId);
      integer(command.expectedRevision);
      if (!/^[0-9a-f]{64}$/.test(command.requestHash)) throw new TypeError('Invalid operation hash.');
      if (command.target) {
        uuid(command.target.owner);
        integer(command.target.expectedRevision);
      }
      if (command.match) {
        uuid(command.match.id);
        uuid(command.match.owner);
      }
      const result = record(await request('rpc/fhq_authority_commit', { method: 'POST', body: JSON.stringify({ command }) }));
      const club = result.club == null ? undefined : clubFromRow(result.club);
      if (result.ok === true && typeof result.duplicate === 'boolean' && club) return { ok: true, duplicate: result.duplicate, club, result: result.result };
      if (result.ok === false && ['revision_conflict', 'operation_conflict', 'not_found', 'match_conflict'].includes(String(result.code))) {
        return { ok: false, code: result.code as AuthorityCommitCode, ...(club ? { club } : {}) };
      }
      throw new AuthorityStoreUnavailable();
    },
    async listRivals(owner) {
      const result = await rows('rpc/fhq_authority_rivals', { method: 'POST', body: JSON.stringify({ requesting_owner: uuid(owner) }) });
      return result.map((value) => {
        const row = record(value);
        return { owner: uuid(String(row.owner)), name: String(row.name), stadiumLevel: integer(row.stadium_level), fans: integer(row.fans), trophies: integer(row.trophies), revision: integer(row.revision) };
      });
    },
    async getLeaderboard() {
      const result = await rows('rpc/fhq_authority_leaderboard', { method: 'POST', body: '{}' });
      return result.map((value) => {
        const row = record(value);
        return { owner: uuid(String(row.owner)), name: String(row.name), stadiumLevel: integer(row.stadium_level), fans: integer(row.fans), trophies: integer(row.trophies), revision: integer(row.revision) };
      });
    }
  };
}
