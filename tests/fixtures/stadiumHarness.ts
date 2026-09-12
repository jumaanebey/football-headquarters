// Deterministic driver for Stadium acceptance scenarios.
//
// A scenario is a club preset, the random value that starts the game (which fixes the coin toss
// and the seed the shown context derives from), and a list of (call, roll) steps. Replaying one
// produces the same game every time, so a fixture can state the score, the action of every event
// and the reward before the rules are asked anything.
//
// This drives the shipped rules through the real reducer. It never re-implements a rule, and it
// never chooses a call for you: a scenario names its calls.
import { createInitialState } from '../../game/initialState';
import { applyClubAction } from '../../game/authority/clubActions';
import type { GameState, Player } from '../../types';
import { footballCalls, type StadiumFootballGame, type StadiumOpponent } from '../../game/stadiumFootball';

export const SCENARIO_NOW = Date.parse('2026-09-12T12:00:00Z');

export type ClubPreset = 'starter' | 'strong' | 'weak';
/** Three clubs with the same roster shape and different quality, so a scenario can reach outcomes
 *  the starting club cannot. Only level and trained stats differ; roles and ids are identical. */
export function presetClub(preset: ClubPreset): GameState {
  const base = { ...createInitialState(SCENARIO_NOW), lastTick: SCENARIO_NOW };
  const tune = (player: Player, level: number, stat: number): Player => ({ ...player, level, stats: { strength: stat, speed: stat, iq: stat } });
  const roster = base.roster.map(p => preset === 'strong' ? tune(p, 26, 52) : preset === 'weak' ? tune(p, 1, 6) : p);
  return { ...base, roster, resources: { ...base.resources, ENERGY: 100 } };
}

export interface ScenarioStep { call: string; roll: number }
export interface ScenarioFrame {
  index: number;
  /** The game as it stood when this step's call was made. */
  before: StadiumFootballGame;
  /** The game after the call resolved. */
  after: StadiumFootballGame;
  step: ScenarioStep;
  /** The club state after the call, for persistence and reward checks. */
  state: GameState;
}
export interface ScenarioRun {
  start: GameState;
  frames: ScenarioFrame[];
  final: StadiumFootballGame;
  /** The state before collecting, so a test can confirm the reward transition itself. */
  beforeCollect: GameState;
}

const gameOf = (state: GameState): StadiumFootballGame => {
  const game = state.stadiumFootball?.game;
  if (!game) throw new Error('no Stadium game on this club');
  return game;
};

export function startScenario(preset: ClubPreset, opponent: StadiumOpponent, startRandom: number): GameState {
  const result = applyClubAction(presetClub(preset), { type: 'stadium.start', opponent }, { now: SCENARIO_NOW, random: () => startRandom });
  if (!result.ok) throw new Error(`stadium.start refused: ${result.message}`);
  // No format field: this is the original v2 client request, retained for compatibility.
  return result.state;
}

/** Replay a scenario's steps. Throws if a step names a call the rules do not offer at that point,
 *  so a fixture can never silently drift into a different decision. */
export function runScenario(input: { preset: ClubPreset; opponent: StadiumOpponent; startRandom: number; steps: readonly ScenarioStep[] }): ScenarioRun {
  let state = startScenario(input.preset, input.opponent, input.startRandom);
  const start = state;
  const frames: ScenarioFrame[] = [];
  input.steps.forEach((step, index) => {
    const before = gameOf(state);
    if (before.phase === 'final') throw new Error(`step ${index} (${step.call}) comes after the game ended`);
    const legal = footballCalls(before).map(c => c.key);
    if (!legal.includes(step.call)) throw new Error(`step ${index}: "${step.call}" is not offered in phase ${before.phase}; legal calls are ${legal.join(', ')}`);
    const result = applyClubAction(state, { type: 'stadium.call', gameId: before.id, turn: String(before.turn), call: step.call }, { now: SCENARIO_NOW, random: () => step.roll });
    if (!result.ok) throw new Error(`step ${index} (${step.call}) refused: ${result.message}`);
    state = result.state;
    frames.push({ index, before, after: gameOf(state), step, state });
  });
  return { start, frames, final: gameOf(state), beforeCollect: state };
}

/** Collect the finished game, returning the state and the coins actually paid. */
export function collectScenario(run: ScenarioRun): { state: GameState; paid: number } {
  const before = run.beforeCollect;
  const result = applyClubAction(before, { type: 'stadium.collect', gameId: run.final.id }, { now: SCENARIO_NOW, random: () => 0.5 });
  if (!result.ok) throw new Error(`collect refused: ${result.message}`);
  return { state: result.state, paid: result.state.resources.COINS - before.resources.COINS };
}
