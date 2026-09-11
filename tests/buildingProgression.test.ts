import {describe,it,expect} from 'vitest';
import {BuildingType} from '../types';
import {buildingMilestone,buildingRoadmap,buildingGoalCost} from '../game/buildingProgression';
import {collectorCap,collectorRate,energyIntervalMs,UPGRADE_CONFIG} from '../constants';
import {rosterCap} from '../recruiting';
describe('building goals match playable upgrades',()=>{
 it('shows income, storage and roster capacity from game rules',()=>{
  for(const level of [1,2,5,8]){
   const stadium=buildingMilestone(BuildingType.STADIUM,level);
   expect(stadium.benefits[0]).toBe(`${Math.round(collectorRate(BuildingType.STADIUM,level)*60)} Coins/min · stores ${collectorCap(BuildingType.STADIUM,level).toLocaleString()}`);
   expect(buildingMilestone(BuildingType.YOUTH_ACADEMY,level).benefits[0]).toBe(`Room for ${rosterCap(level)} players`);
  }
 });
 it('does not invent new art or recovery beyond their caps',()=>{
  expect(buildingMilestone(BuildingType.TACTICS_ROOM,2)).toMatchObject({artLevel:1,newAppearance:false});
  expect(buildingMilestone(BuildingType.STADIUM,6)).toMatchObject({artLevel:5,newAppearance:false});
  expect(energyIntervalMs(6)).toBe(energyIntervalMs(12));
  expect(buildingMilestone(BuildingType.MEDICAL_CENTER,12).benefits).toEqual(['15.0 Energy/min','Recovery cap reached · later levels add no regen']);
 });
 it('totals sequential prices rather than advertising the last step as the whole goal',()=>{
  const expected=[1,2,3,4].reduce((sum,l)=>sum+Math.floor(UPGRADE_CONFIG.baseCost*Math.pow(UPGRADE_CONFIG.costMultiplier,l-1)),0);
  expect(buildingGoalCost(BuildingType.STADIUM,1,5)).toBe(expected);
  expect(buildingGoalCost(BuildingType.STADIUM,5,3)).toBe(0);
 });
 it('keeps next steps available after the last authored appearance',()=>{
  expect(buildingRoadmap(BuildingType.STADIUM,8)).toContain(9);
  expect(buildingRoadmap(BuildingType.MEDICAL_CENTER,1)).toContain(6);
 });
});
