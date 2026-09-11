import type { BBuilding, BTroop } from '../battle';
import type { UnitGroup } from '../types';
import { raidEntryLanes } from './raidDeployment';
import { footprint, raidRoute, type RaidPoint } from './combat/raidNavigation';

/** Don't offer a rally that strands this group. Check existing actors and future
 * sideline deployments before emitting a recorded command. Removing structures
 * later can only open these routes. This is a UI affordance, not a reward rule. */
export function reachableRally(point: RaidPoint, troops: BTroop[], buildings: BBuilding[], scope?: UnitGroup): boolean {
  if (buildings.some(b=>!b.dead&&Math.hypot(point.x-b.x,point.y-b.y)<footprint(b))) return false;
  const starts: RaidPoint[] = troops.filter(t=>!t.dead&&(!scope||(!t.isHero&&!t.special&&t.unit===scope)));
  starts.push(...raidEntryLanes(buildings).flatMap(lane=>lane.point?[lane.point]:[]));
  return starts.length>0&&starts.every(start=>raidRoute(start,point,buildings,2.5)!==null);
}
