import type { GameState } from '../types';
import { skipGemCost } from '../constants';
import { advanceCampus } from './campus';
import { advanceEconomy } from './economy';

/** Settle time at the old facility level before purchasing an early completion.
 * Using the ordinary completion boundary preserves collector-rate attribution
 * and the fraction of Rehab regeneration already earned. */
export function finishUpgradeNow(previous: GameState, jobId: string, now: number): GameState {
  if (!Number.isFinite(now) || now < previous.lastTick) return previous;
  const current = advanceCampus(previous, now);
  const job = current.upgrades.find(upgrade => upgrade.id === jobId);
  if (!job) return current;
  // A restored job that is already due costs nothing, including at lastTick.
  const cost = job.finishTime <= now ? 0 : skipGemCost((job.finishTime - now) / 1000);
  if (current.resources.GEMS < cost) return current;
  const purchased: GameState = {
    ...current,
    resources: { ...current.resources, GEMS: current.resources.GEMS - cost },
    upgrades: current.upgrades.map(upgrade => upgrade.id === jobId ? { ...upgrade, finishTime: now } : upgrade),
  };
  return { ...purchased, ...advanceEconomy(purchased, now) };
}
