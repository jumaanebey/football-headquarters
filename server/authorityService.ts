// server/authorityService.ts
import type { GameState, DefenseLogEntry } from '../types';
import type { BattleResult } from '../game/combat/contracts';
import { canonicalJson } from '../game/combat/canonical';
import { MatchRuleError, parseMatchChoice, authorityRoadTargets, issueMatch, verifyMatch, settleMatchRewards, cancelReservation } from '../game/authority/matches';
import { applyClubAction, settleClubState } from '../game/authority/clubActions';
import { admitClub } from './authorityAdmission';
import type { AuthorityClub, AuthorityCommit, AuthorityCommitCode, AuthorityCommitMatch, AuthorityMatch, AuthorityRival, AuthorityStore } from './authorityStore';

export interface AuthorityIdentity {
  owner: string;
  createdAt: number;
}

interface AuthorityOperationRequest {
  operationId: string;
  expectedRevision: number;
}

/** The request shapes the service accepts. Input is validated at runtime, so the service
 *  itself takes `unknown`; this union documents what a well-formed client sends. */
export type AuthorityRequest =
  | { kind: 'bootstrap'; legacy?: unknown }
  | { kind: 'status' }
  | { kind: 'leaderboard' }
  | { kind: 'film'; matchId: string }
  | (AuthorityOperationRequest & { kind: 'action'; action: unknown })
  | (AuthorityOperationRequest & { kind: 'match.reserve'; choice: unknown })
  | (AuthorityOperationRequest & { kind: 'match.begin'; matchId: string })
  | (AuthorityOperationRequest & { kind: 'match.cancel'; matchId: string })
  | (AuthorityOperationRequest & { kind: 'match.finish'; matchId: string; submission: unknown });

export interface AuthoritySuccess {
  ok: true;
  club: AuthorityClub | null;
  serverNow: number;
  match?: AuthorityMatch | null;
  result?: unknown;
  rivals?: AuthorityRival[];
  roadTargets?: ReturnType<typeof authorityRoadTargets>;
  leaderboard?: AuthorityRival[];
}

export interface AuthorityFailure {
  ok: false;
  code: string;
  message: string;
  serverNow: number;
  club?: AuthorityClub;
}

export type AuthorityResponse = AuthoritySuccess | AuthorityFailure;

export type AuthorityService = (identity: AuthorityIdentity, input: unknown) => Promise<AuthorityResponse>;

export interface AuthorityServiceOptions {
  now?: () => number;
  randomUint32?: () => number;
  uuid?: () => string;
}

/** A defense-log entry written by the server for a rival raid: the shared entry plus the
 *  authority match it came from and the defense layout that was attacked. */
interface AuthorityDefenseLogEntry extends DefenseLogEntry {
  authorityMatchId: string;
  defenseLayoutId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const invalid = (): never => {
  throw new MatchRuleError('invalid_request', 'That club request is invalid.');
};
const keys = (v: Record<string, unknown>, allowed: string[]): void => {
  if (Object.keys(v).some((k) => !allowed.includes(k))) invalid();
};
const messages: Record<AuthorityCommitCode, string> = {
  revision_conflict: 'Your club changed on another device. The latest progress has been loaded; review it before trying again.',
  operation_conflict: 'That request identifier was already used for another action.',
  match_conflict: 'This game has already changed. Refresh to continue from its saved status.',
  not_found: 'Your protected club could not be found.'
};
const hashRequest = async (value: unknown): Promise<string> => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value))))).map((n) => n.toString(16).padStart(2, '0')).join('');
const uint32 = (): number => crypto.getRandomValues(new Uint32Array(1))[0];
const issued = (match: AuthorityMatch) => ({ ...match, cost: Number(match.metadata.cost), choice: parseMatchChoice(match.metadata.choice) });
const visibleMatch = (match: AuthorityMatch | null): AuthorityMatch | null => (match ? { ...match, metadata: { choice: match.metadata.choice, cost: match.metadata.cost } } : null);

export function createAuthorityService(store: AuthorityStore, options: AuthorityServiceOptions = {}): AuthorityService {
  const clock = options.now ?? Date.now, random = options.randomUint32 ?? uint32, newId = options.uuid ?? (() => crypto.randomUUID());
  return async (identity, input) => {
    const now = clock();
    try {
      if (!Number.isSafeInteger(now) || now < 0 || now > 864e13 || !UUID.test(identity.owner) || !Number.isSafeInteger(identity.createdAt) || identity.createdAt < 0 || identity.createdAt > now || !object(input) || !Object.prototype.hasOwnProperty.call(input, 'kind') || typeof input.kind !== 'string' || JSON.stringify(input).length > 45e4) return invalid();
      const owner = identity.owner;
      let club = await store.getClub(owner);
      if (input.kind === 'bootstrap') {
        keys(input, ['kind', 'legacy']);
        if (!club) {
          const config = await store.getConfiguration();
          const admitted = admitClub(input.legacy, identity.createdAt, config.activationAt, now);
          club = await store.createClub(owner, admitted.state, admitted.origin);
        }
        return { ok: true, club, serverNow: now, match: visibleMatch(club.activeMatch ? await store.getMatch(owner, club.activeMatch) : null) };
      }
      if (input.kind === 'status') {
        keys(input, ['kind']);
        return { ok: true, club, serverNow: now, match: visibleMatch(club?.activeMatch ? await store.getMatch(owner, club.activeMatch) : null), rivals: club ? await store.listRivals(owner) : [], roadTargets: club ? authorityRoadTargets(club.state, owner, now) : [] };
      }
      if (input.kind === 'leaderboard') {
        keys(input, ['kind']);
        return { ok: true, club, serverNow: now, leaderboard: await store.getLeaderboard() };
      }
      if (!club) throw new MatchRuleError('not_found', messages.not_found);
      if (input.kind === 'film') {
        keys(input, ['kind', 'matchId']);
        if (typeof input.matchId !== 'string' || !UUID.test(input.matchId)) return invalid();
        const film = await store.getMatchForParticipant(owner, input.matchId);
        if (!film || film.status !== 'settled') throw new MatchRuleError('film_unavailable', 'That film is unavailable.');
        return { ok: true, club, serverNow: now, result: film.result };
      }
      if (typeof input.operationId !== 'string' || !UUID.test(input.operationId) || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) return invalid();
      const common = ['kind', 'operationId', 'expectedRevision'];
      const allowed: Record<string, string[]> = { action: [...common, 'action'], 'match.reserve': [...common, 'choice'], 'match.begin': [...common, 'matchId'], 'match.cancel': [...common, 'matchId'], 'match.finish': [...common, 'matchId', 'submission'] };
      if (!Object.prototype.hasOwnProperty.call(allowed, input.kind)) return invalid();
      keys(input, allowed[input.kind]);
      const requestHash = await hashRequest(input);
      const previous = await store.findOperation(owner, input.operationId);
      if (previous) {
        if (previous.requestHash !== requestHash) throw new MatchRuleError('operation_conflict', messages.operation_conflict);
        const latest = await store.getClub(owner);
        return { ok: true, club: latest, serverNow: now, result: previous.result, match: visibleMatch(latest?.activeMatch ? await store.getMatch(owner, latest.activeMatch) : null) };
      }
      if (club.revision !== input.expectedRevision) return { ok: false, code: 'revision_conflict', message: messages.revision_conflict, club, serverNow: now };
      const commit: AuthorityCommit = { owner, expectedRevision: club.revision, operationId: input.operationId, requestHash, nextState: club.state, result: null };
      if (input.kind === 'action') {
        if (club.activeMatch) throw new MatchRuleError('active_match', 'Finish or cancel your reserved game before changing the club.');
        const outcome = applyClubAction(club.state, input.action, { now, random: () => random() / 4294967296 });
        if (!outcome.ok) throw new MatchRuleError(outcome.code, outcome.message);
        commit.nextState = outcome.state;
        commit.result = outcome.result;
      } else if (input.kind === 'match.reserve') {
        if (club.activeMatch) throw new MatchRuleError('active_match', 'Continue or cancel your existing game first.');
        const choice = parseMatchChoice(input.choice);
        const target = choice.kind === 'rival' ? await store.getClub(choice.target) : null;
        if (target?.activeMatch) throw new MatchRuleError('target_busy', 'That club is playing a game. Choose another rival.');
        const created = issueMatch({ state: club.state, owner, id: newId(), seed: random(), now, choice, target: target?.state });
        const match: AuthorityCommitMatch = { ...created.match, status: 'reserved', metadata: { choice, cost: created.match.cost, targetOwner: target?.owner, defenseFormation: target?.state.formation } };
        commit.nextState = created.state;
        commit.match = match;
        commit.result = { type: 'match.reserve', matchId: match.id };
        if (target) commit.target = { owner: target.owner, expectedRevision: target.revision, nextState: target.state };
      } else {
        if (typeof input.matchId !== 'string' || !UUID.test(input.matchId)) return invalid();
        const match = await store.getMatch(owner, input.matchId);
        if (!match || club.activeMatch !== match.id) throw new MatchRuleError('match_conflict', messages.match_conflict);
        if (input.kind === 'match.begin') {
          if (match.status !== 'reserved') throw new MatchRuleError('match_conflict', messages.match_conflict);
          if (now > match.expiresAt) throw new MatchRuleError('expired', 'This game expired. Cancel it to release the reservation.');
          if (match.config.mode === 'attack') commit.nextState = { ...club.state, shieldUntil: 0 };
          commit.match = { ...match, status: 'started', expectedStatus: 'reserved' };
          commit.result = { type: 'match.begin', matchId: match.id };
        } else if (input.kind === 'match.cancel') {
          if (!['reserved', 'started'].includes(match.status)) throw new MatchRuleError('match_conflict', messages.match_conflict);
          commit.nextState = match.status === 'reserved' ? cancelReservation(settleClubState(club.state, { now }), issued(match)) : settleClubState(club.state, { now });
          commit.match = { ...match, status: 'cancelled', expectedStatus: match.status };
          commit.result = { type: 'match.cancel', matchId: match.id, refunded: match.status === 'reserved' };
        } else {
          if (match.status !== 'started') throw new MatchRuleError('match_not_started', 'Start your issued game before submitting its film.');
          const verified = verifyMatch(issued(match), input.submission, now);
          commit.nextState = settleMatchRewards(club.state, verified.result, now);
          commit.match = { ...match, status: 'settled', expectedStatus: 'started', result: { replay: verified.replay, battleResult: verified.result } };
          commit.result = { type: 'match.finish', matchId: match.id, battleResult: verified.result };
          if (typeof match.metadata.targetOwner === 'string') {
            const target = await store.getClub(match.metadata.targetOwner);
            if (target) {
              const state = settleClubState(target.state, { now });
              const result: BattleResult = verified.result;
              const lost = Math.min(result.coins, Math.floor(state.resources.COINS * 0.12));
              const formation = String(match.metadata.defenseFormation);
              const nextState: GameState = {
                ...state,
                resources: { ...state.resources, COINS: state.resources.COINS - lost },
                trophies: Math.max(0, state.trophies - (result.won ? Math.max(1, result.stars) * 3 : 0)),
                shieldUntil: result.won ? Math.max(state.shieldUntil ?? 0, now + 2 * 36e5) : state.shieldUntil,
                formationMastery: result.stars === 0 ? { ...state.formationMastery, [formation]: (state.formationMastery[formation] ?? 0) + 1 } : state.formationMastery,
                defenseLog: [{ id: match.id, attacker: match.config.attackerName ?? 'Rival Club', attackerPid: owner, at: now, stars: result.stars, pct: result.pct, coinsLost: lost, seen: false, authorityMatchId: match.id, defenseLayoutId: match.config.defenseLayoutId } as AuthorityDefenseLogEntry, ...state.defenseLog].slice(0, 30)
              };
              commit.target = { owner: target.owner, expectedRevision: target.revision, nextState };
            }
          }
        }
      }
      const result = await store.commit(commit);
      if (!result.ok) return { ...result, message: messages[result.code], serverNow: now };
      return { ok: true, club: result.club, result: result.result, serverNow: now, match: visibleMatch(result.club.activeMatch ? await store.getMatch(owner, result.club.activeMatch) : null) };
    } catch (error) {
      if (error instanceof MatchRuleError) return { ok: false, code: error.code, message: error.message, serverNow: now };
      return { ok: false, code: 'unavailable', message: 'Online protection is temporarily unavailable. Your club has been kept. Retry to check whether the request completed.', serverNow: now };
    }
  };
}
