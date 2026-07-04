// --- DAILY QUESTS: the day-in-day-out reward drip (Castle Clash "daily rewards" spine). ---
// Three curated quests per day (deterministic from the date), each paying Crowns — the same
// currency Scout Searches burn — plus a Daily Sweep bonus for clearing all three. This gives
// every session a reason to open the game and feeds the gacha→shards→star-up loop.

export interface DailyQuestDef {
  id: string;
  text: string;
  emoji: string;
  target: number;
  reward: { gems?: number; coins?: number };
}

export interface DailiesState {
  date: string;                     // YYYY-MM-DD the quests belong to
  progress: Record<string, number>; // questId -> progress
  claimed: string[];                // questIds claimed today
  sweepClaimed: boolean;            // all-three bonus taken
}

export const ALL_QUESTS: DailyQuestDef[] = [
  { id: 'win_attack', text: 'Win an attack (Season or Raid)', emoji: '⚔️', target: 1,    reward: { gems: 8 } },
  { id: 'game_balls', text: 'Earn 5 Game Balls on offense',   emoji: '🏈', target: 5,    reward: { gems: 6 } },
  { id: 'drills',     text: 'Collect 3 finished drills',      emoji: '🏋️', target: 3,    reward: { gems: 5 } },
  { id: 'bank_coins', text: 'Bank 1,200 Stadium coins',       emoji: '🪙', target: 1200, reward: { gems: 4 } },
  { id: 'train_hero', text: 'Train a hero',                   emoji: '⭐', target: 1,    reward: { gems: 4 } },
  { id: 'scout',      text: 'Run a Scout Search',             emoji: '🎰', target: 1,    reward: { gems: 5 } },
];

export const SWEEP_BONUS_GEMS = 6;

export const todayKey = () => new Date().toISOString().slice(0, 10);

/** The 3 quests for a given date — seeded by the date so everyone gets the same slate. */
export const questsForDate = (dateKey: string): DailyQuestDef[] => {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  const pool = [...ALL_QUESTS];
  const picks: DailyQuestDef[] = [];
  for (let k = 0; k < 3 && pool.length; k++) {
    h = (h * 1103515245 + 12345) >>> 0;
    picks.push(pool.splice(h % pool.length, 1)[0]);
  }
  return picks;
};

export const freshDailies = (): DailiesState => ({ date: todayKey(), progress: {}, claimed: [], sweepClaimed: false });
