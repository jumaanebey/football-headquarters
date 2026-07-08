// Trophy-based rank ladder — the "one more level" progression hook. You gain trophies for
// winning raids and lose them when your stadium gets stormed; your rank is your standing.
export interface Rank { name: string; min: number; color: string; emoji: string; art: string; }

// `art` = crest PNG (Round 6); the emoji stays as the loading/fallback glyph so ranks
// whose crest hasn't landed yet (or fails to load) degrade gracefully.
export const RANKS: Rank[] = [
  { name: 'Sandlot',      min: 0,    color: '#94a3b8', emoji: '🏈', art: '/assets/ranks/sandlot.png' },
  { name: 'JV',           min: 100,  color: '#22c55e', emoji: '🌱', art: '/assets/ranks/jv.png' },
  { name: 'Varsity',      min: 250,  color: '#38bdf8', emoji: '⭐', art: '/assets/ranks/varsity.png' },
  { name: 'Pro',          min: 500,  color: '#a855f7', emoji: '💪', art: '/assets/ranks/pro.png' },
  { name: 'All-Pro',      min: 900,  color: '#f59e0b', emoji: '🏆', art: '/assets/ranks/allpro.png' },
  { name: 'Hall of Fame', min: 1400, color: '#ef4444', emoji: '🔥', art: '/assets/ranks/halloffame.png' },
  { name: 'G.O.A.T.',     min: 2100, color: '#fde047', emoji: '👑', art: '/assets/ranks/goat.png' },
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

// ─── CLUB POWER ────────────────────────────────────────────────────────────────
// One number that EVERY upgrade moves: facilities, defense emplacements, heroes,
// roster training, parking, crown slots. Trophies measure how you're competing;
// Club Power measures what you've built. Shown in the HUD + the Ranks ladder.
import type { GameState } from './types';

export interface PowerBreakdown { label: string; emoji: string; pts: number; }
export const clubPowerBreakdown = (gs: GameState): PowerBreakdown[] => [
  { label: 'Facilities', emoji: '🏟', pts: gs.buildings.reduce((s, b) => s + b.level, 0) * 12 },
  { label: 'Defenses', emoji: '🛡', pts: Object.values(gs.defenseSlots ?? {}).reduce((s, l) => s + l, 0) * 10 },
  {
    label: 'Heroes', emoji: '⭐',
    pts: gs.heroes.filter(h => h.unlocked !== false).reduce((s, h) => s + h.level * 4 + (h.stars - 1) * 15, 0),
  },
  {
    label: 'Roster', emoji: '👥',
    // Scaled so a deep trained roster ROUGHLY matches a leveled base — no single
    // category should drown the others (a maxed player ≈ 13 pts, a facility level = 12).
    pts: Math.round(gs.roster.reduce((s, p) => s + p.level + (p.stats.strength + p.stats.speed + p.stats.iq) / 25, 0)),
  },
  { label: 'Grounds', emoji: '🅿️', pts: gs.parkingLot * 25 + gs.bonusDefSlots * 20 },
];
export const clubPower = (gs: GameState): number =>
  clubPowerBreakdown(gs).reduce((s, x) => s + x.pts, 0);
