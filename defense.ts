import { Player, BuildingInstance } from './types';
import { TENDENCIES, TendencyKey } from './constants';

export interface DefenseRating {
  score: number;    // 0..100
  grade: string;    // F..S
  walls: number;    // 0..100 subscore
  structure: number;
  defenders: number;
  crowd: number;    // bonus points from your fanbase (home-crowd advantage)
  weakness: string; // the biggest thing to improve
}

const ovr = (p: Player) => (p.stats.strength + p.stats.speed + p.stats.iq) / 3;

/** HP/damage multiplier your defensive-Tendency roster gives your stadium in battle (1.0–1.3). */
export const defenseTroopBoost = (roster: Player[]): number => {
  const defRaw = roster.reduce((s, p) => {
    const t = TENDENCIES[p.tendency as TendencyKey];
    if (!t) return s;
    const w = t.side === 'defense' ? 1 : t.side === 'balanced' ? 0.5 : 0;
    return s + ovr(p) * w;
  }, 0);
  return 1 + Math.min(0.3, (defRaw / 250) * 0.3);
};

/**
 * How tough your stadium is to raid — the number players optimize in Design mode.
 * Three levers, all in the player's control:
 *   • Walls      — Blocking Sled coverage (place them in Design)
 *   • Structure  — building levels (upgrade)
 *   • Defenders  — roster players with defensive Tendencies (recruit/train + keep)
 */
export const computeDefenseRating = (
  buildings: BuildingInstance[],
  walls: { gridX: number; gridY: number }[],
  roster: Player[],
  fans = 0,
): DefenseRating => {
  const wallScore = Math.min(1, walls.length / 12); // a solid ~12-sled ring = full marks
  const avgLvl = buildings.length ? buildings.reduce((s, b) => s + b.level, 0) / buildings.length : 1;
  const structScore = Math.min(1, avgLvl / 10);

  // Defensive-leaning players (Anchor/Iron Wall count full, balanced count half) weighted by OVR.
  const defRaw = roster.reduce((s, p) => {
    const t = TENDENCIES[p.tendency as TendencyKey];
    if (!t) return s;
    const w = t.side === 'defense' ? 1 : t.side === 'balanced' ? 0.5 : 0;
    return s + ovr(p) * w;
  }, 0);
  const defScore = Math.min(1, defRaw / 250); // ~5 strong defenders ≈ full marks

  // Home-crowd advantage: a bigger fanbase makes your stadium louder & tougher (up to +12).
  const crowd = Math.min(12, Math.floor(fans / 500));

  const base = Math.round((wallScore * 0.35 + structScore * 0.30 + defScore * 0.35) * 100);
  const score = Math.min(100, base + crowd);
  const grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : score >= 25 ? 'D' : 'F';

  const factors: [string, number][] = [
    ['Add Blocking Sleds to your ring', wallScore],
    ['Upgrade your buildings', structScore],
    ['Recruit defenders (Anchor / Iron Wall)', defScore],
  ];
  factors.sort((a, b) => a[1] - b[1]);
  const weakness = factors[0][1] >= 0.85 ? 'Your stadium is a fortress! 🏰' : factors[0][0];

  return {
    score, grade,
    walls: Math.round(wallScore * 100),
    structure: Math.round(structScore * 100),
    defenders: Math.round(defScore * 100),
    crowd,
    weakness,
  };
};
