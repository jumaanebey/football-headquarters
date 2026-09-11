import {FootballPlayView} from './FootballPlayView';
import type {FootballPlay} from '../game/development';
import {BuildingType,type GameState} from '../types';
import {campusActivities} from '../game/campusActivities';
import {IndoorPlayer} from './IndoorPlayer';

const RECOVERY_LABELS=['Foam rolling','Hydration break','Cold plunge'];
export function DepartmentLife({club,type,playing=true,play='slants'}:{club:GameState;type:BuildingType;playing?:boolean;play?:FootballPlay}){
 const attendance=campusActivities(club),players=type===BuildingType.MEDICAL_CENTER?attendance.recovery:type===BuildingType.TACTICS_ROOM?attendance.film:attendance.stadium;
 const spots=type===BuildingType.MEDICAL_CENTER?[{x:48,y:82,h:29,w:24},{x:71,y:91,h:30,w:22},{x:22,y:65,h:32,w:27}]:type===BuildingType.TACTICS_ROOM?[{x:40,y:74,h:34,w:22},{x:52,y:82,h:34,w:22},{x:63,y:90,h:34,w:22}]:[{x:46,y:78,h:32,w:18},{x:65,y:88,h:34,w:18}];
 return <>{type===BuildingType.TACTICS_ROOM&&<div className="fhq-film-screen"><FootballPlayView play={play} playing={playing} compact/></div>}{players.slice(0,spots.length).map((p,i)=>{const spot=spots[i];return <div key={p.id} className="fhq-department-player" data-player-id={p.id} data-room={type} style={{left:`${spot.x}%`,top:`${spot.y}%`,height:`${spot.h}%`,width:`${spot.w}%`}}>
  <IndoorPlayer unit={p.unit} activity={type===BuildingType.MEDICAL_CENTER?'recovery':type===BuildingType.TACTICS_ROOM?'film':undefined} pose={i} label={`${p.name} · ${type===BuildingType.MEDICAL_CENTER?RECOVERY_LABELS[i]:type===BuildingType.TACTICS_ROOM?'Watching practice film':'Getting ready for Game Day'}`}/>
 </div>;})}</>;
}
