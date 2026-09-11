import {BuildingType,DrillState,type GameState,type Player} from '../types';
import {DRILLS} from '../constants';
export type WorkoutExercise='curl'|'squat'|'mobility';
export const WORKOUT_EXERCISES:WorkoutExercise[]=['curl','squat','mobility'];
export const EXERCISE_LABELS:Record<WorkoutExercise,string>={curl:'Dumbbell curls',squat:'Goblet squats',mobility:'Lateral lunges'};
export const stationExercise=(index:number):WorkoutExercise=>WORKOUT_EXERCISES[Math.max(0,index)%WORKOUT_EXERCISES.length];
export function trainingParticipants(club:GameState):Player[]{
 const gym=club.buildings.find(b=>b.type===BuildingType.TRAINING_PITCH);
 const drill=gym?.activeDrillId?DRILLS[gym.activeDrillId]:undefined;
 if(!gym||gym.state===DrillState.IDLE||!drill)return [];
 return club.roster.filter(p=>drill.targetUnit==='ALL'||p.unit===gym.targetUnit);
}
/** Ambient room attendance, derived from the same roster everywhere. Only training
 * is a timed player job. Recovery remains club-wide; no per-player injury is invented. */
export function campusActivities(club:GameState){
 const training=trainingParticipants(club),ids=new Set(training.map(p=>p.id));
 const available=club.roster.filter(p=>!ids.has(p.id));
 const recovery=available.slice(0,Math.min(3,Math.ceil(available.length/3)));
 const film=available.slice(recovery.length,recovery.length+3);
 const stadium=available.slice(recovery.length+film.length,recovery.length+film.length+2);
 return {training,recovery,film,stadium};
}
export function playerCampusActivity(club:GameState,id:string){
 const rooms=campusActivities(club),trainingIndex=rooms.training.findIndex(p=>p.id===id);
 if(trainingIndex>=0){const ready=club.buildings.find(b=>b.type===BuildingType.TRAINING_PITCH)?.state===DrillState.COMPLETED;return {building:BuildingType.TRAINING_PITCH,label:ready?'Growth ready':EXERCISE_LABELS[stationExercise(trainingIndex)]};}
 if(rooms.recovery.some(p=>p.id===id))return {building:BuildingType.MEDICAL_CENTER,label:club.resources.ENERGY<100?'Recovery lounge':'Cooldown & mobility'};
 if(rooms.film.some(p=>p.id===id))return {building:BuildingType.TACTICS_ROOM,label:'Watching practice film'};
 return {building:BuildingType.STADIUM,label:'Ready for Game Day'};
}
