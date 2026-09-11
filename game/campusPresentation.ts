import { BuildingType, type BuildingInstance } from '../types';

/** Home-only presentation. Never used by combat, authority, or saved defense geometry. */
export const CAMPUS_ANCHORS: Record<BuildingType, {gridX:number;gridY:number}> = {
  [BuildingType.STADIUM]: {gridX:0,gridY:0},
  [BuildingType.TACTICS_ROOM]: {gridX:1,gridY:3.5},
  [BuildingType.YOUTH_ACADEMY]: {gridX:3.9,gridY:1.4},
  [BuildingType.MEDICAL_CENTER]: {gridX:6.8,gridY:9.3},
  [BuildingType.TRAINING_PITCH]: {gridX:10.5,gridY:8},
};
export const CAMPUS_LANDSCAPE_ANCHORS: Record<BuildingType, {gridX:number;gridY:number}> = {
  [BuildingType.STADIUM]: {gridX:0,gridY:0},
  [BuildingType.TACTICS_ROOM]: {gridX:-2.2,gridY:3.2},
  [BuildingType.YOUTH_ACADEMY]: {gridX:3.2,gridY:-2.2},
  [BuildingType.MEDICAL_CENTER]: {gridX:1.2,gridY:9},
  [BuildingType.TRAINING_PITCH]: {gridX:9,gridY:1.2},
};
export const CAMPUS_FIELD = {x1:3.4,y1:3.4,x2:7.4,y2:7.4};
export const ARRIVAL = {x1:10.2,y1:9.3,x2:13.1,y2:11.3,busX:11.6,busY:10.4};
export function campusBuildingWidth(type: BuildingType, custom = false) {
  return 118 * (custom ? 1.35 : type === BuildingType.STADIUM ? 3.05 : 2.3);
}
export function campusDisplayBuildings(buildings: BuildingInstance[], custom: boolean, landscape = false) {
  return buildings.map(b=> custom ? b : {...b,...(landscape ? CAMPUS_LANDSCAPE_ANCHORS : CAMPUS_ANCHORS)[b.type]});
}
/** A custom defense may occupy the central lawn. Don't paint a field through it. */
export function campusFieldClear(buildings: BuildingInstance[]) {
  return !buildings.some(b=>b.gridX<CAMPUS_FIELD.x2 && b.gridX+2>CAMPUS_FIELD.x1 && b.gridY<CAMPUS_FIELD.y2 && b.gridY+2>CAMPUS_FIELD.y1);
}
