import { LEGACY_COMBAT_RULES, supportsCombatRules } from '../combat/defenseCounters';
import { ResourceType, type GameState, type UnitGroup } from '../../types';
import { RAID_ENERGY } from '../../constants';
import {
  GAME_PLANS, GAUNTLET_MAX_TIER, armyFromRoster, armyStrength, gauntletReward, gauntletWaves, generateRaidTargets, heroesForBattle, mulberry32, specialsForBattle,
  type EnemyBase, type ReplayAction, type ReplayData,
} from '../../battle';
import { CAMPAIGN_STAGES, campaignBase, coachForBase, coachForStage } from '../../campaign';
import { trophiesForRaid } from '../../ranks';
import { COMBAT_RULES_VERSION } from '../combat/actions';
import { createBattleEngine, replayMatch } from '../combat/engine';
import { validateReplay } from '../combat/replay';
import { rosterPreparation } from '../combat/roster';
import type { BattleConfig, BattleResult } from '../combat/contracts';
import { nextFanMilestone } from '../fanProgress';
import { createDefenseSnapshot, defenseBattleFields } from '../defenseSnapshot';
import { progressClubDaily, settleClubState } from './clubActions';

export type MatchChoice = (
  | { kind: 'campaign'; stage: number }
  | { kind: 'road'; choice: number }
  | { kind: 'rival'; target: string }
  | { kind: 'gauntlet' }) & { rules?: string };

export interface IssuedMatch {
  id: string;
  owner: string;
  seed: number;
  issuedAt: number;
  expiresAt: number;
  cost: number;
  choice: MatchChoice;
  config: BattleConfig;
}

/** The film a client submits to close a reserved match: exactly these four keys. */
export interface MatchSubmission {
  plan: string;
  script: ReplayAction[];
  ticks: number;
  finalHash: string;
}

export class MatchRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MatchRuleError';
  }
}

const fail = (code: string, message: string): never => {
  throw new MatchRuleError(code, message);
};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function parseMatchChoice(value: unknown): MatchChoice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('invalid_choice', 'Choose a game.');
  const v = value as Record<string, unknown>;
  if(v.rules!==undefined&&!supportsCombatRules(v.rules))return fail('invalid_choice','Update the app to play these rules.');
  const keys = Object.keys(v).filter(k=>k!=='rules').sort().join(',');
  if (v.kind === 'campaign' && keys === 'kind,stage' && Number.isInteger(v.stage) && Number(v.stage) >= 1 && Number(v.stage) <= CAMPAIGN_STAGES.length) return v as MatchChoice;
  if (v.kind === 'road' && keys === 'choice,kind' && Number.isInteger(v.choice) && Number(v.choice) >= 0 && Number(v.choice) <= 2) return v as MatchChoice;
  if (v.kind === 'rival' && keys === 'kind,target' && uuid(v.target)) return v as MatchChoice;
  if (v.kind === 'gauntlet' && keys === 'kind') return v as MatchChoice;
  return fail('invalid_choice', 'That game choice is unavailable.');
}

export function authorityRoadTargets(state: GameState, owner: string, now: number): EnemyBase[] {
  let seed = 2166136261;
  for (const char of `${owner}:${state.trophies}:${new Date(now).toISOString().slice(0, 10)}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return generateRaidTargets(state.trophies, mulberry32(seed));
}

export function issueMatch(input: { state: GameState; owner: string; id: string; seed: number; now: number; choice: MatchChoice; target?: GameState | null }): { state: GameState; match: IssuedMatch } {
  const { owner, id, seed, now, choice, target } = input;
  if (!uuid(owner) || !uuid(id) || !Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) return fail('invalid_identity', 'The match could not be issued.');
  let state = settleClubState(input.state, { now });
  const cost = choice.kind === 'gauntlet' ? 0 : RAID_ENERGY;
  if (state.resources.ENERGY < cost) return fail('energy', `This game needs ${cost} Energy.`);
  const power = armyStrength(state.roster);
  if (state.teamReadiness >= 100) for (const unit of Object.keys(power) as UnitGroup[]) power[unit] = Math.min(4.5, power[unit] * 1.15);
  const common = { attackerName: state.teamName, squad: structuredClone(state.roster), playerArmy: armyFromRoster(state.roster), power, preparation: rosterPreparation(state.roster, state.teamReadiness), heroes: heroesForBattle(state.heroes), specials: specialsForBattle(state.resources.FANS) };
  let config: BattleConfig;
  if (choice.kind === 'campaign') {
    if (choice.stage > state.campaign.unlocked) return fail('stage_locked', 'Win the previous game first.');
    const stage = CAMPAIGN_STAGES[choice.stage - 1], base = campaignBase(choice.stage);
    config = { ...common, mode: 'attack', title: `${stage.name} — ${stage.opponent}`, buildings: base.buildings, loot: base.reward, campaignStage: choice.stage, rival: coachForStage(choice.stage) };
  } else if (choice.kind === 'road') {
    const base = authorityRoadTargets(state, owner, now)[choice.choice];
    config = { ...common, mode: 'attack', title: `Attacking ${base.name}`, buildings: base.buildings, loot: base.reward, rival: coachForBase(base.name) };
  } else if (choice.kind === 'rival') {
    if (choice.target === owner) return fail('self_attack', 'Choose another club.');
    if (!target) return fail('target_missing', 'That club is unavailable.');
    if ((target.shieldUntil ?? 0) > now) return fail('shielded', 'That club is protected right now.');
    if (state.currentMatch < 3 || target.currentMatch < 3) return fail('beginner_protection', 'Play the first two Season games before live rival games.');
    const snapshot = createDefenseSnapshot(target);
    config = { ...common, ...defenseBattleFields(snapshot), mode: 'attack', title: `Raiding ${target.teamName}`, loot: { coins: 500 + Math.min(target.trophies, 1e4) * 3, fans: 25 }, pvpTarget: choice.target };
  } else {
    if (state.gauntlet.attempts <= 0) return fail('attempts', 'Your Gauntlet attempts return tomorrow.');
    const tier = Math.min(GAUNTLET_MAX_TIER, state.gauntlet.best + 1);
    config = { ...defenseBattleFields(createDefenseSnapshot(state)), mode: 'defense', title: `The Gauntlet — Night ${tier}`, gauntlet: { tier, waves: gauntletWaves(tier) }, loot: { coins: 0, fans: 0 } };
    state = { ...state, gauntlet: { ...state.gauntlet, attempts: state.gauntlet.attempts - 1 } };
  }
  const expiresAt = now + 15 * 6e4;
  config.authority = { matchId: id, seed, rules: choice.rules ?? LEGACY_COMBAT_RULES, issuedAt: now, expiresAt };
  state = { ...state, resources: { ...state.resources, ENERGY: state.resources.ENERGY - cost } };
  return { state, match: { id, owner, seed, issuedAt: now, expiresAt, cost, choice, config } };
}

export function verifyMatch(match: IssuedMatch, value: unknown, now: number): { result: BattleResult; replay: ReplayData } {
  if (now > match.expiresAt) return fail('expired', 'This match has expired.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('invalid_film', 'The match commands are missing.');
  const v = value as Record<keyof MatchSubmission, unknown>;
  if (Object.keys(v).sort().join(',') !== 'finalHash,plan,script,ticks' || !GAME_PLANS.some(p => p.key === v.plan)) return fail('invalid_film', 'The match commands are invalid.');
  if (!Number.isSafeInteger(v.ticks) || Number(v.ticks) < 0 || Number(v.ticks) > 1400 || Number(v.ticks) * 50 > now - match.issuedAt + 1e3) return fail('invalid_time', 'The match timing is invalid.');
  const template = createBattleEngine(match.config, match.seed, String(v.plan)).getReplay();
  const film = validateReplay({ ...template, script: v.script, ticks: v.ticks, finalHash: v.finalHash });
  if (!film) return fail('invalid_film', 'The match commands are invalid.');
  const checked = replayMatch(film);
  if (!checked.matches || !checked.result) return fail('simulation_mismatch', 'The match could not be verified. Your reserved game remains available.');
  // The film is returned separately and stored once under the match; the battle result that
  // travels in settlement answers and receipts never embeds it (item 16: bounded payloads).
  return { result: { ...checked.result, isReplay: false, defenseLayoutId: match.config.defenseLayoutId, defenseSnapshotId: match.config.defenseSnapshotId }, replay: film };
}

export function settleMatchRewards(input: GameState, result: BattleResult, now: number): GameState {
  let state = settleClubState(input, { now });
  if (result.isPractice || result.isReplay) return fail('non_progression', 'Practice and film do not award rewards.');
  if (result.mode === 'attack') {
    const stage = result.campaignStage ? CAMPAIGN_STAGES[result.campaignStage - 1] : null;
    const first = !!stage && result.won && !state.campaign.claimed.includes(stage.stage);
    const gems = stage ? 0 : result.stars >= 3 ? 5 : result.stars === 2 ? 2 : result.stars === 1 ? 1 : 0;
    const trophyDelta = stage ? 0 : trophiesForRaid(result.won, result.stars);
    state = {
      ...state,
      resources: { ...state.resources, COINS: state.resources.COINS + result.coins, FANS: state.resources.FANS + result.fans, GEMS: state.resources.GEMS + gems + (first ? stage.firstClear.gems : 0) },
      peakFans: nextFanMilestone(state, result.fans),
      heroes: first ? state.heroes.map(h => (h.key === stage.firstClear.shardHero ? { ...h, shards: h.shards + stage.firstClear.shards } : h)) : state.heroes,
      campaign: stage ? { unlocked: result.won ? Math.max(state.campaign.unlocked, Math.min(CAMPAIGN_STAGES.length, stage.stage + 1)) : state.campaign.unlocked, stars: { ...state.campaign.stars, [stage.stage]: Math.max(state.campaign.stars[stage.stage] ?? 0, result.stars) }, claimed: first ? [...state.campaign.claimed, stage.stage] : state.campaign.claimed } : state.campaign,
      matchHistory: [{ week: state.currentMatch, opponent: result.title, ourScore: result.stars, theirScore: 0, won: result.won, reward: result.coins }, ...state.matchHistory].slice(0, 50),
      currentMatch: state.currentMatch + 1,
      trophies: Math.max(0, state.trophies + trophyDelta),
      teamReadiness: Math.max(0, state.teamReadiness - 20),
      shieldUntil: 0,
    };
    if (result.won) state = progressClubDaily(state, 'win_attack', 1);
    if (result.stars > 0) state = progressClubDaily(state, 'game_balls', result.stars);
  } else if (result.gauntletTier !== undefined) {
    const pay = gauntletReward(result.gauntletTier, result.wavesHeld ?? 0, !!result.gauntletCleared);
    const first = !!result.gauntletCleared && result.gauntletTier > state.gauntlet.best;
    state = { ...state, resources: { ...state.resources, COINS: state.resources.COINS + pay.coins, FANS: state.resources.FANS + pay.fans, GEMS: state.resources.GEMS + (first ? 5 : 0) }, peakFans: nextFanMilestone(state, pay.fans), gauntlet: { ...state.gauntlet, best: result.gauntletCleared ? Math.max(state.gauntlet.best, result.gauntletTier) : state.gauntlet.best } };
  } else return fail('non_progression', 'Defense practice does not award rewards.');
  return state;
}

export function cancelReservation(state: GameState, match: IssuedMatch): GameState {
  if (match.choice.kind === 'gauntlet') return { ...state, gauntlet: { ...state.gauntlet, attempts: Math.min(3, state.gauntlet.attempts + 1) } };
  return { ...state, resources: { ...state.resources, [ResourceType.ENERGY]: Math.min(100, state.resources.ENERGY + match.cost) } };
}
