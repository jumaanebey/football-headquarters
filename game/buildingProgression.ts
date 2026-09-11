import {BuildingType} from '../types';
import {BUILDING_ART_LEVELS, BUILDING_ERAS} from '../assets';
import {buildingEffect, collectorCap, collectorRate, energyIntervalMs, UPGRADE_CONFIG, upgradeDurationSecs} from '../constants';

export function buildingMilestone(type: BuildingType, level: number) {
  const tiers=BUILDING_ART_LEVELS(type);
  const artLevel=[...tiers].reverse().find(l=>l<=level)??1;
  const effect=buildingEffect(type,level);
  const benefits=type===BuildingType.STADIUM
    ? [`${Math.round(collectorRate(type,level)*60)} Coins/min · stores ${collectorCap(type,level).toLocaleString()}`,`Departments can reach level ${level}`]
    : type===BuildingType.YOUTH_ACADEMY ? [`Room for ${effect.value} players`,'Build deeper lineups with more roster slots']
    : type===BuildingType.TRAINING_PITCH ? [`${effect.value} Coins from drills`,'Earn more from the same completed drill']
    : type===BuildingType.TACTICS_ROOM ? [`${effect.value} readiness from drills`,'Prepare the squad faster between games']
    : [`${effect.value.replace('/min','')} Energy/min`,level>=6?'Recovery cap reached · later levels add no regen':`1 Energy every ${energyIntervalMs(level)/1000}s, up to 100`];
  return {level,artLevel,name:BUILDING_ERAS[type][tiers.indexOf(artLevel)],benefits,
    cost:level>1?Math.floor(UPGRADE_CONFIG.baseCost*Math.pow(UPGRADE_CONFIG.costMultiplier,level-2)):0,
    seconds:level>1?upgradeDurationSecs(level):0,newAppearance:tiers.includes(level)};
}
export function buildingRoadmap(type: BuildingType,current: number) {
  return [...new Set(current<5?[1,2,3,4,5,...(type===BuildingType.MEDICAL_CENTER?[6]:[])]:[1,3,5,current,current+1])];
}
export function buildingGoalCost(type: BuildingType, current: number, target: number) {
  let total=0;
  for(let level=current+1;level<=target;level++)total+=buildingMilestone(type,level).cost;
  return total;
}
export const BUILDING_PURPOSE: Record<BuildingType,string> = {
  [BuildingType.STADIUM]:'Bank ticket revenue while you play or are away. Collect before storage fills; upgrade for more income and capacity.',
  [BuildingType.YOUTH_ACADEMY]:'Scout and sign players. Upgrade to make room for more positions and deeper lineups.',
  [BuildingType.TRAINING_PITCH]:'Run squad drills. Upgrades increase the Coins you collect when a drill finishes.',
  [BuildingType.TACTICS_ROOM]:'Turn drills into match preparation. Upgrades increase readiness gained from each completed drill.',
  [BuildingType.MEDICAL_CENTER]:'Recover Energy automatically, even while away, so you can return to drills and away games sooner.',
};
