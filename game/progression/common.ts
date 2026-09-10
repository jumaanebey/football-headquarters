// Shared, pure helpers for the progression read models. Nothing here mutates state or
// re-implements a balance formula — these only resolve where the live rule inputs live.
import { BuildingType, type GameState, type UpgradeJob } from '../../types';

/** A reason an action would be refused, using the same code and message the authority returns
 *  (game/authority/clubActions.ts). The UI can show the message verbatim. */
export interface Blocker {
  code: 'locked' | 'busy' | 'insufficient_resources' | 'limit_reached' | 'not_found' | 'already_claimed' | 'not_ready' | 'invalid_command';
  message: string;
}

/** A timed job as the UI needs it: identity preserved from the state, remaining time from `now`. */
export interface JobView {
  jobId: string;
  toLevel: number;
  startTime: number;
  finishTime: number;
  /** Seconds left, never negative; 0 once the finish time has passed. */
  remainingSeconds: number;
  /** 0..1 elapsed fraction (1 once complete). */
  progress: number;
  /** finishTime <= now: the job is due but the state still lists it (settlement pending). */
  complete: boolean;
}

/** Stadium level read the way clubActions.ts reads it (missing stadium → 1). */
export const stadiumLevelOf = (state: Pick<GameState, 'buildings'>): number =>
  (state.buildings ?? []).find(b => b.type === BuildingType.STADIUM)?.level ?? 1;

/** Old saves may lack `upgrades` entirely; treat that as no jobs. */
export const upgradeJobsOf = (state: Partial<Pick<GameState, 'upgrades'>>): UpgradeJob[] =>
  Array.isArray(state.upgrades) ? state.upgrades : [];

export const jobView = (job: UpgradeJob, now: number): JobView => {
  const total = Math.max(1, job.finishTime - job.startTime);
  const remainingMs = Math.max(0, job.finishTime - now);
  return {
    jobId: job.id, toLevel: job.toLevel, startTime: job.startTime, finishTime: job.finishTime,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    progress: Math.max(0, Math.min(1, (now - job.startTime) / total)),
    complete: job.finishTime <= now,
  };
};

/** Coins/gems affordability without rounding surprises: shortfall is 0 when affordable. */
export const shortfall = (have: number, cost: number): number => Math.max(0, cost - (Number.isFinite(have) ? have : 0));
