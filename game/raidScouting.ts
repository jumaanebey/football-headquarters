import type { BattleBuildingDef, RoadChallenge } from '../battle';
import { raidEntryLanes } from './raidDeployment';
import { laneClear } from './combat/raidNavigation';

export const ROAD_CHALLENGES: Record<RoadChallenge, { name: string; description: string }> = {
  open: { name: 'Open', description: 'Lighter coverage · build momentum' },
  contested: { name: 'Contested', description: 'More equipment · earn a cleaner clear' },
  fortress: { name: 'Fortress', description: 'A stretch opponent · coordinate your attack' },
};

/** Visible snapshot only. Compares equipment covering the approach, not an invented
 * win probability. Blockers, guard spawns and later movement still change the fight. */
export function scoutRaid(buildings: BattleBuildingDef[]) {
  const obstacles = buildings.map(b => ({ ...b, maxHp: b.hp, dead: false, cooldown: 0 }));
  const equipment = buildings.filter(b => b.kind === 'defense');
  const lanes = raidEntryLanes(buildings).filter(l => l.point).map(lane => {
    const covered = new Set<string>();
    for (const fraction of [.3, .5, .7]) {
      const p = { x: lane.point!.x + (50 - lane.point!.x) * fraction, y: lane.point!.y + (50 - lane.point!.y) * fraction };
      for (const b of equipment) if (Math.hypot(p.x-b.x, p.y-b.y) <= (b.range ?? 0) && laneClear(b, p, obstacles)) covered.add(b.id);
    }
    return { label: lane.label, coverage: covered.size };
  });
  const least = Math.min(...lanes.map(l => l.coverage));
  return {
    equipment: equipment.length,
    powerMoves: equipment.filter(b => (b.level ?? 0) >= 10).length,
    lighterApproaches: lanes.filter(l => l.coverage === least).map(l => l.label),
    lanes,
  };
}
