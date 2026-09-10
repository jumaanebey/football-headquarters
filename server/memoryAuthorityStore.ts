// In-memory AuthorityStore with the same commit semantics as the fhq_authority_commit SQL
// function (supabase/migrations/20260910004731_authoritative_clubs_and_matches.sql). Tests
// and local tooling use it to exercise the authority service without a database. Keep the
// branch order aligned with the SQL: operation replay → revision checks → match transition.
import type { GameState } from '../types';
import { canonicalJson } from '../game/combat/canonical';
import type { AuthorityClub, AuthorityCommit, AuthorityCommitResult, AuthorityConfiguration, AuthorityMatch, AuthorityOperation, AuthorityRival, AuthorityStore } from './authorityStore';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const stadiumLevel = (state: GameState) => Math.max(1, ...state.buildings.filter(b => b.type === 'STADIUM').map(b => b.level));
const rival = (club: AuthorityClub): AuthorityRival => ({
  owner: club.owner, name: (club.state.teamName || 'Football Club').slice(0, 32), stadiumLevel: stadiumLevel(club.state),
  fans: Math.max(0, club.state.peakFans ?? 0), trophies: Math.max(0, club.state.trophies), revision: club.revision,
});

export interface MemoryAuthorityStoreOptions { activationAt: number; now?: () => number }

export class MemoryAuthorityStore implements AuthorityStore {
  readonly clubs = new Map<string, AuthorityClub>();
  readonly matches = new Map<string, AuthorityMatch>();
  readonly operations = new Map<string, AuthorityOperation>();
  commits = 0;
  constructor(private options: MemoryAuthorityStoreOptions) {}
  private now() { return this.options.now?.() ?? Date.now(); }
  async getConfiguration(): Promise<AuthorityConfiguration> { return { activationAt: this.options.activationAt }; }
  async getClub(owner: string): Promise<AuthorityClub | null> { const club = this.clubs.get(owner); return club ? clone(club) : null; }
  async createClub(owner: string, state: GameState, origin: string): Promise<AuthorityClub> {
    if (!this.clubs.has(owner)) this.clubs.set(owner, { owner, state: clone(state), revision: 0, activeMatch: null, origin, updatedAt: this.now() });
    return clone(this.clubs.get(owner)!);
  }
  async getMatch(owner: string, id: string): Promise<AuthorityMatch | null> {
    const match = this.matches.get(id);
    return match && match.owner === owner ? clone(match) : null;
  }
  /** Mirrors fhq_authority_match_film: the owner always, the target only once settled; metadata stripped. */
  async getMatchForParticipant(owner: string, id: string): Promise<AuthorityMatch | null> {
    const match = this.matches.get(id);
    if (!match) return null;
    if (match.owner !== owner && !(match.status === 'settled' && match.metadata.targetOwner === owner)) return null;
    const result = match.result as { replay?: unknown; battleResult?: unknown } | null | undefined;
    return clone({ ...match, metadata: {}, result: result == null ? null : { replay: result.replay, battleResult: result.battleResult } });
  }
  async findOperation(owner: string, operationId: string): Promise<AuthorityOperation | null> {
    const op = this.operations.get(`${owner}:${operationId}`);
    return op ? clone(op) : null;
  }
  async commit(command: AuthorityCommit): Promise<AuthorityCommitResult> {
    this.commits++;
    const current = this.clubs.get(command.owner);
    if (!current) return { ok: false, code: 'not_found' };
    const previous = this.operations.get(`${command.owner}:${command.operationId}`);
    if (previous) {
      if (previous.requestHash !== command.requestHash) return { ok: false, code: 'operation_conflict', club: clone(current) };
      return { ok: true, duplicate: true, club: clone(current), result: clone(previous.result) };
    }
    if (current.revision !== command.expectedRevision) return { ok: false, code: 'revision_conflict', club: clone(current) };
    let target: AuthorityClub | undefined;
    if (command.target) {
      target = this.clubs.get(command.target.owner);
      if (!target) return { ok: false, code: 'not_found', club: clone(current) };
      if (target.revision !== command.target.expectedRevision) return { ok: false, code: 'revision_conflict', club: clone(current) };
    }
    let nextActive = current.activeMatch;
    if (command.activeMatch !== undefined) {
      nextActive = command.activeMatch;
      if (!command.match && nextActive !== current.activeMatch) return { ok: false, code: 'match_conflict', club: clone(current) };
    }
    const match = command.match;
    if (match) {
      if (match.owner !== command.owner) return { ok: false, code: 'match_conflict', club: clone(current) };
      const existing = this.matches.get(match.id);
      if (existing && existing.owner !== command.owner) return { ok: false, code: 'match_conflict', club: clone(current) };
      if (existing) {
        const same = existing.status === match.expectedStatus && canonicalJson(existing.config) === canonicalJson(match.config)
          && canonicalJson(existing.metadata) === canonicalJson(match.metadata ?? {}) && existing.seed === match.seed
          && existing.issuedAt === match.issuedAt && existing.expiresAt === match.expiresAt && current.activeMatch === match.id;
        const transition = (existing.status === 'reserved' && ['started', 'cancelled'].includes(match.status))
          || (existing.status === 'started' && ['settled', 'cancelled'].includes(match.status));
        if (!same || !transition) return { ok: false, code: 'match_conflict', club: clone(current) };
      } else if (match.expectedStatus !== undefined || !['reserved', 'started'].includes(match.status) || current.activeMatch !== null) {
        return { ok: false, code: 'match_conflict', club: clone(current) };
      }
      nextActive = ['reserved', 'started'].includes(match.status) ? match.id : null;
      if (command.activeMatch !== undefined && command.activeMatch !== nextActive) return { ok: false, code: 'match_conflict', club: clone(current) };
      if (!existing) this.matches.set(match.id, clone({ id: match.id, owner: match.owner, status: match.status, config: match.config, seed: match.seed, issuedAt: match.issuedAt, expiresAt: match.expiresAt, metadata: match.metadata ?? {}, result: match.result ?? null }));
      else this.matches.set(match.id, clone({ ...existing, status: match.status, metadata: match.metadata ?? {}, result: match.result ?? null }));
    }
    const updated: AuthorityClub = { ...current, state: clone(command.nextState), revision: current.revision + 1, activeMatch: nextActive, updatedAt: this.now() };
    this.clubs.set(command.owner, updated);
    if (target && command.target) this.clubs.set(target.owner, { ...target, state: clone(command.target.nextState), revision: target.revision + 1, updatedAt: this.now() });
    this.operations.set(`${command.owner}:${command.operationId}`, { owner: command.owner, operationId: command.operationId, requestHash: command.requestHash, result: clone(command.result) });
    return { ok: true, duplicate: false, club: clone(updated), result: clone(command.result) };
  }
  async listRivals(owner: string): Promise<AuthorityRival[]> {
    const now = this.now();
    return [...this.clubs.values()]
      .filter(c => c.owner !== owner && c.activeMatch === null && (c.state.currentMatch ?? 1) >= 3 && (c.state.shieldUntil ?? 0) <= now)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.owner.localeCompare(b.owner)).slice(0, 30).map(rival);
  }
  async getLeaderboard(): Promise<AuthorityRival[]> {
    return [...this.clubs.values()].sort((a, b) => Math.max(0, b.state.trophies) - Math.max(0, a.state.trophies) || a.owner.localeCompare(b.owner)).slice(0, 50).map(rival);
  }
}
