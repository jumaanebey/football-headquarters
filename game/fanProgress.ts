import type { GameState } from '../types';
import { RALLY_CONFIG } from '../constants';

/** Campus unlocks use the largest fanbase the save has recorded. */
export const fanMilestoneTotal = (state: Pick<GameState, 'resources' | 'peakFans'>): number =>
  Math.max(state.peakFans ?? 0, state.resources.FANS);

export function rallyPreview(state: Pick<GameState, 'resources'>) {
  const energyGain = Math.max(0, Math.min(RALLY_CONFIG.energyGain, 100 - state.resources.ENERGY));
  return { fanCost: RALLY_CONFIG.fanCost, energyGain, canRally: energyGain > 0 && state.resources.FANS >= RALLY_CONFIG.fanCost };
}

/** A rally consumes the displayed balance, never the already earned campus stage. */
export function rallyFans(state: GameState): GameState {
  const preview = rallyPreview(state);
  if (!preview.canRally) return state;
  const energy = state.resources.ENERGY + preview.energyGain;
  return { ...state, peakFans: fanMilestoneTotal(state), energyProgressMs: energy >= 100 ? 0 : state.energyProgressMs ?? 0, resources: {
    ...state.resources, FANS: state.resources.FANS - preview.fanCost, ENERGY: energy,
  } };
}

export const nextFanMilestone = (state: Pick<GameState, 'resources' | 'peakFans'>, gain: number): number =>
  Math.max(fanMilestoneTotal(state), state.resources.FANS + gain);
