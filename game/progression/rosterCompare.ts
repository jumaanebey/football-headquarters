// Roster / scouting comparison read model. Pure functions over GameState.
// Prospect identity is always the id carried by the state's recruitBoard / recruitSlot —
// never regenerated here. Rules mirror recruit.* in game/authority/clubActions.ts.
import { RECRUIT_CONFIG } from '../../constants';
import { candidateOvr, recruitCost, recruitSeconds, rosterCap } from '../../recruiting';
import { unitPower } from '../../battle';
import { BuildingType, PlayerRarity, PlayerRole, type GameState, type Player, type PlayerStats, type UnitGroup } from '../../types';
import { shortfall, type Blocker } from './common';
import { playerGrowth } from './playerGrowth';

export interface ComparablePlayer {
  id: string;
  name: string;
  level: number;
  rarity: PlayerRarity;
  ovr: number;
  stats: PlayerStats;
  power: number;
  /** More than one current player shares the top OVR; `tiedIds` lists all of them (roster order). */
  tie: boolean;
  tiedIds: string[];
}

export interface ProspectComparison {
  /** Server-issued id, verbatim. */
  prospectId: string;
  name: string;
  role: PlayerRole;
  unit: UnitGroup;
  rarity: PlayerRarity;
  level: number;
  stats: PlayerStats;
  ovr: number;
  power: number;
  costCoins: number;
  scoutSeconds: number;
  depth: { atRole: number; inUnit: number; firstAtRole: boolean };
  /** Strongest current player at the same role (by candidateOvr); null when the role is empty. */
  comparable: ComparablePlayer | null;
  /** Fallback when the role is empty: strongest current player in the same unit group. */
  comparableInUnit: ComparablePlayer | null;
  /** Raw stat differences prospect − comparable (null when there is nobody to compare). */
  statDiff: (PlayerStats & { ovr: number; power: number }) | null;
  trainingImplications: {
    /** Every collected drill covering this unit: +1 level, +1 to each stat (training.collect). */
    perDrillCollect: { level: 1; stats: { strength: 1; speed: 1; iq: 1 } };
    drillIds: string[];
    /** Rarity multiplies role base stats in combat (RARITY_MULT); it never changes after signing. */
    rarityMultiplier: number;
    /** Signing adds a player; it never replaces the comparable. */
    replacesComparable: false;
  };
  /** recruit.start refusal reasons in the authority's order. */
  blockers: Blocker[];
  canScout: boolean;
}

export type BoardStaleReason = 'empty' | 'future-generated' | 'candidate-signed' | 'candidate-in-slot' | 'invalid-generated-at';

export interface ScoutingJobView {
  /** Server-issued candidate id, verbatim. */
  candidateId: string;
  name: string;
  role: PlayerRole;
  rarity: PlayerRarity;
  costCoins: number;
  finishTime: number;
  remainingSeconds: number;
  progress: number;
  ready: boolean;
  rush: { gemCost: number; canRush: boolean; blockers: Blocker[] };
  sign: { canSign: boolean; blockers: Blocker[] };
}

export interface ScoutingBoardModel {
  board:
    | { kind: 'none'; reason: string }
    | { kind: 'issued'; generatedAt: number; stale: boolean; staleReasons: BoardStaleReason[] };
  prospects: ProspectComparison[];
  roster: { cap: number; size: number; full: boolean; remaining: number; cutFloor: 6; canCut: boolean };
  job: ScoutingJobView | null;
  depthByRole: Record<PlayerRole, number>;
  emptyRoles: PlayerRole[];
  refresh: { blockers: Blocker[]; canRefresh: boolean };
}

const ROLES = Object.values(PlayerRole);

const comparable = (players: Player[]): ComparablePlayer | null => {
  if (!players.length) return null;
  const top = Math.max(...players.map(candidateOvr));
  const tied = players.filter(p => candidateOvr(p) === top);
  const best = tied[0];
  return {
    id: best.id, name: best.name, level: best.level, rarity: best.rarity ?? PlayerRarity.COMMON, ovr: top,
    stats: { ...best.stats }, power: unitPower({ ...best, rarity: best.rarity ?? PlayerRarity.COMMON }),
    tie: tied.length > 1, tiedIds: tied.map(p => p.id),
  };
};

const academyOf = (state: GameState) => (state.buildings ?? []).find(b => b.type === BuildingType.YOUTH_ACADEMY) ?? null;

/** Compare one prospect (from the issued board, by id) against the current roster. */
export function prospectComparison(state: GameState, prospectId: string): ProspectComparison | null {
  const candidate = state.recruitBoard?.candidates.find(c => c.id === prospectId);
  if (!candidate) return null;
  const roster = state.roster ?? [];
  const rarity = candidate.rarity ?? PlayerRarity.COMMON;
  const atRole = roster.filter(p => p.role === candidate.role);
  const inUnit = roster.filter(p => p.unit === candidate.unit);
  const best = comparable(atRole);
  const ovr = candidateOvr(candidate);
  const power = unitPower({ ...candidate, rarity });
  const academy = academyOf(state);
  const coins = state.resources?.COINS ?? 0;
  const cost = recruitCost({ ...candidate, rarity });
  const blockers: Blocker[] = [];
  if (state.recruitSlot) blockers.push({ code: 'busy', message: 'A player is already being scouted.' });
  else if (!academy) blockers.push({ code: 'not_found', message: 'The Scouting Dept was not found.' });
  else if (roster.length >= rosterCap(academy.level)) blockers.push({ code: 'limit_reached', message: 'Your roster is full.' });
  else if (roster.some(p => p.id === candidate.id)) blockers.push({ code: 'not_found', message: 'Refresh the board and choose an available prospect.' });
  else if (shortfall(coins, cost) > 0) blockers.push({ code: 'insufficient_resources', message: 'Not enough coins.' });
  const growth = playerGrowth({ ...state, roster: [candidate] }, candidate.id, 0);
  return {
    prospectId: candidate.id, name: candidate.name, role: candidate.role, unit: candidate.unit, rarity, level: candidate.level,
    stats: { ...candidate.stats }, ovr, power, costCoins: cost, scoutSeconds: recruitSeconds({ ...candidate, rarity }),
    depth: { atRole: atRole.length, inUnit: inUnit.length, firstAtRole: atRole.length === 0 },
    comparable: best,
    comparableInUnit: atRole.length === 0 ? comparable(inUnit) : null,
    statDiff: best ? { strength: candidate.stats.strength - best.stats.strength, speed: candidate.stats.speed - best.stats.speed, iq: candidate.stats.iq - best.stats.iq, ovr: ovr - best.ovr, power: power - best.power } : null,
    trainingImplications: {
      perDrillCollect: { level: 1, stats: { strength: 1, speed: 1, iq: 1 } },
      drillIds: growth?.nextStep.drillIds ?? [],
      rarityMultiplier: growth?.rarityMultiplier ?? 1,
      replacesComparable: false,
    },
    blockers,
    canScout: blockers.length === 0,
  };
}

/** The whole scouting screen from live state. */
export function scoutingBoard(state: GameState, now: number): ScoutingBoardModel {
  const roster = state.roster ?? [];
  const academy = academyOf(state);
  const cap = academy ? rosterCap(academy.level) : 0;
  const depthByRole = Object.fromEntries(ROLES.map(role => [role, roster.filter(p => p.role === role).length])) as Record<PlayerRole, number>;
  const gems = state.resources?.GEMS ?? 0;

  let job: ScoutingJobView | null = null;
  if (state.recruitSlot) {
    const slot = state.recruitSlot;
    const candidate = slot.candidate;
    const total = Math.max(1, recruitSeconds(candidate) * 1000);
    const ready = slot.finishTime <= now;
    const rushBlockers: Blocker[] = [];
    if (ready) rushBlockers.push({ code: 'not_ready', message: 'This player is already ready to sign.' });
    else if (shortfall(gems, RECRUIT_CONFIG.rushGemCost) > 0) rushBlockers.push({ code: 'insufficient_resources', message: 'Not enough Crowns.' });
    const signBlockers: Blocker[] = [];
    if (!ready) signBlockers.push({ code: 'not_ready', message: 'The prospect is not ready to sign.' });
    else if (!academy || roster.length >= cap) signBlockers.push({ code: 'limit_reached', message: 'Your roster is full.' });
    else if (roster.some(p => p.id === candidate.id)) signBlockers.push({ code: 'already_claimed', message: 'This player is already signed.' });
    job = {
      candidateId: candidate.id, name: candidate.name, role: candidate.role, rarity: candidate.rarity ?? PlayerRarity.COMMON, costCoins: slot.cost,
      finishTime: slot.finishTime,
      remainingSeconds: Math.ceil(Math.max(0, slot.finishTime - now) / 1000),
      progress: Math.max(0, Math.min(1, 1 - Math.max(0, slot.finishTime - now) / total)),
      ready,
      rush: { gemCost: RECRUIT_CONFIG.rushGemCost, canRush: rushBlockers.length === 0, blockers: rushBlockers },
      sign: { canSign: signBlockers.length === 0, blockers: signBlockers },
    };
  }

  let board: ScoutingBoardModel['board'];
  if (!state.recruitBoard) board = { kind: 'none', reason: 'No server-issued board on this club (client-authoritative clubs roll prospects locally).' };
  else {
    const reasons: BoardStaleReason[] = [];
    const ids = new Set(roster.map(p => p.id));
    if (!Number.isFinite(state.recruitBoard.generatedAt)) reasons.push('invalid-generated-at');
    else if (state.recruitBoard.generatedAt > now) reasons.push('future-generated');
    if (!state.recruitBoard.candidates.length) reasons.push('empty');
    if (state.recruitBoard.candidates.some(c => ids.has(c.id))) reasons.push('candidate-signed');
    if (state.recruitSlot && state.recruitBoard.candidates.some(c => c.id === state.recruitSlot!.candidate.id)) reasons.push('candidate-in-slot');
    board = { kind: 'issued', generatedAt: state.recruitBoard.generatedAt, stale: reasons.length > 0, staleReasons: reasons };
  }

  const refreshBlockers: Blocker[] = state.recruitSlot ? [{ code: 'busy', message: 'Finish scouting your current player first.' }] : [];
  return {
    board,
    prospects: (state.recruitBoard?.candidates ?? []).map(c => prospectComparison(state, c.id)!).filter(Boolean),
    roster: { cap, size: roster.length, full: roster.length >= cap, remaining: Math.max(0, cap - roster.length), cutFloor: 6, canCut: roster.length > 6 },
    job,
    depthByRole,
    emptyRoles: ROLES.filter(role => depthByRole[role] === 0),
    refresh: { blockers: refreshBlockers, canRefresh: refreshBlockers.length === 0 },
  };
}
