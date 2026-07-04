import { GameState } from './types';
import { OPPONENTS } from './constants';

export interface StandingRow {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  played: number;
  wins: number;
  losses: number;
  pf: number; // points for
  pa: number; // points against
}

/**
 * Builds a 6-team league table. The player's row is derived from real match
 * history; each opponent's record is a deterministic function of its rating and
 * the number of weeks played, so standings stay stable per render but evolve as
 * the season progresses.
 */
export function computeStandings(state: GameState): StandingRow[] {
  const played = state.matchHistory.length;

  // Points-for/against use the SAME model for every team (derived from W/L) so the
  // player's totals accumulate consistently with the AI teams. (Raid "stars" are a
  // per-attack metric, not league points, so they no longer feed PF/PA.)
  const pWins = state.matchHistory.filter(m => m.won).length;
  const pLoss = played - pWins;
  const player: StandingRow = {
    id: 'you', name: 'Your Team', color: '#fbbf24', isPlayer: true,
    played, wins: pWins, losses: pLoss,
    pf: pWins * 28 + pLoss * 17,
    pa: pLoss * 28 + pWins * 17,
  };

  const opponents: StandingRow[] = OPPONENTS.map(o => {
    const strength = (o.offenseRating + o.defenseRating) / 2;
    const winRate = Math.min(0.9, Math.max(0.1, (strength - 30) / 65));
    const wins = Math.round(winRate * played);
    const losses = played - wins;
    return {
      id: o.id, name: o.name, color: o.primaryColor, isPlayer: false,
      played, wins, losses,
      pf: wins * 28 + losses * 17,
      pa: losses * 28 + wins * 17,
    };
  });

  return [player, ...opponents].sort(
    (a, b) => b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf
  );
}
