import { CAMPAIGN_STAGES } from '../campaign';
import type { CampaignProgress } from '../types';

/** Keep completed seasons useful: recover missed balls before replaying the final. */
export function nextSeasonMatch(progress: CampaignProgress) {
  const unlocked = Math.max(1, Math.min(progress.unlocked, CAMPAIGN_STAGES.length));
  const available = CAMPAIGN_STAGES.slice(0, unlocked);
  const uncleared = available.find(stage => !progress.claimed.includes(stage.stage));
  if (uncleared) return { stage: uncleared, label: 'Your next matchup', detail: 'Prepare your squad and earn this matchup’s first-clear rewards.' };
  const unfinished = available.find(stage => (progress.stars[stage.stage] ?? 0) < 3);
  if (unfinished) return { stage: unfinished, label: 'Chase the missing Game Balls', detail: `${progress.stars[unfinished.stage] ?? 0}/3 Game Balls earned. Replay to improve your best finish; first-clear rewards are already collected.` };
  return { stage: available[available.length - 1], label: 'Season complete', detail: 'Every available Game Ball earned. Replay the final or choose Away games for a new opponent.' };
}
