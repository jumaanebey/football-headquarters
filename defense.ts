import { Player, BuildingInstance, BuildingType } from './types';
import { TENDENCIES, TendencyKey } from './constants';
import { planPath, BBuilding } from './battle';

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
// Attackers PATHFIND now (battle.ts planPath), so wall value is PLACEMENT, not count:
// probe 8 approach lanes with the same pathfinder the AI uses and score how many
// actually force a smash. Scattered sleds ≈ 0; a sealed ring around the Stadium ≈ 1.
const sealScore = (buildings: BuildingInstance[], walls: { gridX: number; gridY: number }[]): number => {
  const stadium = buildings.find(b => b.type === BuildingType.STADIUM);
  if (!stadium || !walls.length) return 0;
  const hq: BBuilding = { id: 'hq', kind: 'hq', x: stadium.gridX * 10, y: stadium.gridY * 10, hp: 1, maxHp: 1, size: 8, dead: false, cooldown: 0 };
  const wallBs: BBuilding[] = walls.map((w, i) => ({ id: `w${i}`, kind: 'wall', x: w.gridX * 10, y: w.gridY * 10, hp: 1, maxHp: 1, size: 4, dead: false, cooldown: 0 }));
  const lanes: [number, number][] = [[0, 0], [90, 0], [0, 90], [90, 90], [45, 0], [0, 45], [90, 45], [45, 90]];
  let sealed = 0;
  for (const [x, y] of lanes) if (planPath(x, y, hq, [hq, ...wallBs]).targetWallId) sealed++;
  return sealed / lanes.length;
};

export const computeDefenseRating = (
  buildings: BuildingInstance[],
  walls: { gridX: number; gridY: number }[],
  roster: Player[],
  fans = 0,
  defenseCount = 0,
  parkingLot = 0,
): DefenseRating => {
  // Mostly seal quality (can attackers walk in for free?), a little mass (spare walls to rebuild depth).
  const wallScore = sealScore(buildings, walls) * 0.7 + Math.min(1, walls.length / 12) * 0.3;
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
  // Placed equipment (JUGS/sleds/towers) — up to +12 for a full arsenal.
  const equipment = Math.min(12, defenseCount * 3);
  // 🅿️ Parking Lot territory — raiders spend longer under fire (+2/level).
  const apron = Math.min(6, parkingLot * 2);

  const base = Math.round((wallScore * 0.35 + structScore * 0.30 + defScore * 0.35) * 100);
  const score = Math.min(100, base + crowd + equipment + apron);
  const grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : score >= 25 ? 'D' : 'F';

  const factors: [string, number][] = [
    ['Seal the wall ring — attackers walk through gaps', wallScore],
    ['Upgrade your buildings', structScore],
    ['Recruit defenders (Anchor / Iron Wall)', defScore],
    ['Place defensive equipment (Design → shop)', Math.min(1, defenseCount / 3)],
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
