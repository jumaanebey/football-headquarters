// Trophy-based rank ladder — the "one more level" progression hook. You gain trophies for
// winning raids and lose them when your stadium gets stormed; your rank is your standing.
export interface Rank { name: string; min: number; color: string; emoji: string; }

export const RANKS: Rank[] = [
  { name: 'Sandlot',      min: 0,    color: '#94a3b8', emoji: '🏈' },
  { name: 'JV',           min: 100,  color: '#22c55e', emoji: '🌱' },
  { name: 'Varsity',      min: 250,  color: '#38bdf8', emoji: '⭐' },
  { name: 'Pro',          min: 500,  color: '#a855f7', emoji: '💪' },
  { name: 'All-Pro',      min: 900,  color: '#f59e0b', emoji: '🏆' },
  { name: 'Hall of Fame', min: 1400, color: '#ef4444', emoji: '🔥' },
  { name: 'G.O.A.T.',     min: 2100, color: '#fde047', emoji: '👑' },
];

export const rankFor = (trophies: number): { rank: Rank; next: Rank | null; progress: number; index: number } => {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (trophies >= RANKS[i].min) idx = i;
  const rank = RANKS[idx];
  const next = RANKS[idx + 1] ?? null;
  const progress = next ? (trophies - rank.min) / (next.min - rank.min) : 1;
  return { rank, next, progress, index: idx };
};

// Trophies gained for a raid win (by stars) / lost for a loss.
export const trophiesForRaid = (won: boolean, stars: number): number =>
  won ? 6 + stars * 7 : -8; // 1★=+13, 2★=+20, 3★=+27 ; failed raid = −8

// Trophies lost when an offline raid breaks your stadium (scaled by how badly).
export const trophiesLostOnDefense = (pct: number): number => (pct >= 50 ? -Math.round(4 + pct / 8) : 0);
