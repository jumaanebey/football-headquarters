import { HeroState } from './types';
import { HERO_DEFS } from './battle';

// --- SCOUT SEARCH (hero gacha) — the Castle Clash "roll" loop, football-flavored. ---
// Every search scouts one hero from the weighted pool. If you don't own them yet: NEW HERO
// (the jackpot). If you already do: their duplicate converts to SHARDS toward a star-up.

export const ROLL_COST_GEMS = 25;
export const MAX_STARS = 5;
// Shards needed to go FROM star N to N+1 (index by current stars).
export const STAR_UP_COSTS: Record<number, number> = { 1: 25, 2: 50, 3: 90, 4: 140 };

// Pool weights: starters common (dupes → shard engine), coin-unlocks uncommon, The Legend rare.
const rollWeight = (key: string): number => {
  const def = HERO_DEFS.find(d => d.key === key)!;
  if (def.starter) return 20;
  if (def.unlock?.gems) return 3; // The Legend — the chase pull
  return 10;                      // coin-unlock heroes
};

export interface RollResult {
  key: string;
  name: string;
  isNew: boolean;   // true = hero unlocked by this roll
  shards: number;   // shards granted when it was a duplicate (0 on a new unlock)
}

export const rollHero = (heroes: HeroState[]): RollResult => {
  const weights = HERO_DEFS.map(d => rollWeight(d.key));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  let idx = 0;
  for (; idx < weights.length; idx++) { r -= weights[idx]; if (r <= 0) break; }
  const def = HERO_DEFS[Math.min(idx, HERO_DEFS.length - 1)];
  const owned = heroes.find(h => h.key === def.key)?.unlocked ?? false;
  return owned
    ? { key: def.key, name: def.name, isNew: false, shards: 10 + Math.floor(Math.random() * 7) } // 10–16
    : { key: def.key, name: def.name, isNew: true, shards: 0 };
};
