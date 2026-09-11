import {describe,it,expect} from 'vitest';
import {createInitialState} from '../game/initialState';
import {applyClubAction,settleClubState} from '../game/authority/clubActions';
import {campusActivities,playerCampusActivity,stationExercise} from '../game/campusActivities';
import {BuildingType,UnitGroup} from '../types';

describe('connected campus attendance',()=>{
 it('keeps real training participants out of ambient rooms until growth is collected',()=>{
  const club=createInitialState(),now=Date.now();club.resources.ENERGY=100;
  const active=applyClubAction(club,{type:'training.start',unit:UnitGroup.OFFENSE_LINE,drillId:'sled_push'},{now,random:()=>.4});expect(active.ok).toBe(true);
  for(const state of [active.state,settleClubState(active.state,now+100000)]){
   const rooms=campusActivities(state),ids=Object.values(rooms).flat().map(p=>p.id);
   expect(new Set(ids).size).toBe(ids.length);expect(rooms.training).toHaveLength(3);
   expect(new Set(rooms.training.map((_,i)=>stationExercise(i))).size).toBe(3);
   for(const p of rooms.training)expect(playerCampusActivity(state,p.id).building).toBe(BuildingType.TRAINING_PITCH);
  }
  const gym=active.state.buildings.find(b=>b.type===BuildingType.TRAINING_PITCH)!;
  const collected=applyClubAction(settleClubState(active.state,now+100000),{type:'training.collect',buildingId:gym.id},{now:now+100000,random:()=>.4});expect(collected.ok).toBe(true);expect(campusActivities(collected.state).training).toHaveLength(0);
 });
 it('leaves other rooms empty during a whole-team session and does not mutate the club',()=>{
  const club=createInitialState(),now=Date.now();club.resources.ENERGY=100;club.buildings=club.buildings.map(b=>({...b,level:5}));
  const result=applyClubAction(club,{type:'training.start',unit:UnitGroup.OFFENSE_LINE,drillId:'scrimmage'},{now,random:()=>.4});expect(result.ok).toBe(true);
  const before=JSON.stringify(result.state),rooms=campusActivities(result.state);expect(rooms.training).toHaveLength(club.roster.length);expect([...rooms.recovery,...rooms.film,...rooms.stadium]).toHaveLength(0);expect(JSON.stringify(result.state)).toBe(before);
 });
});
