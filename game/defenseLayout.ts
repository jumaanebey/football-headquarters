import { BuildingInstance, BuildingType, Player } from '../types';
import { defenseLayoutFromBase } from '../battle';
import { defenseTroopBoost } from '../defense';
import { FormationKey, slotsFor, wallsFor, masteryDefMult, busTileFor, wallHpFor } from '../fixedBase';

export const layoutFromFixedBase = (
  buildings: BuildingInstance[],
  roster: Player[],
  defenseSlots: Record<string, number>,
  parkingLot: number,
  formation: FormationKey,
  mastery = 0, // holds in THIS formation → +3%/tier on the whole defense
): ReturnType<typeof defenseLayoutFromBase> => {
  const sl = buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
  const emplacements = slotsFor(formation)
    .filter(s => (defenseSlots[s.id] ?? 0) > 0)
    .map(s => ({ id: s.id, kind: s.kind, gridX: s.gridX, gridY: s.gridY, level: defenseSlots[s.id] }));
  return defenseLayoutFromBase(buildings, wallsFor(formation, sl), defenseTroopBoost(roster) * masteryDefMult(mastery), emplacements, busTileFor(formation), parkingLot, wallHpFor(sl), formation);
};

