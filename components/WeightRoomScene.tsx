import {useState} from 'react';
import type {Player} from '../types';
import {stationExercise,EXERCISE_LABELS} from '../game/campusActivities';
import {IndoorPlayer} from './IndoorPlayer';

const interior = new URL('../art/rooms/weight-room-interior-v3.webp', import.meta.url).href;
// Feet sit on the illustrated floor, in front of the equipment. Back row paints first.
const SPOTS = [
  {x:36,y:63,height:29}, {x:55,y:68,height:29}, {x:75,y:73,height:29},
  {x:27,y:77,height:32}, {x:48,y:84,height:32}, {x:68,y:92,height:32},
];
export function WeightRoomScene({participants,selected,working,ready,onSelect}:{
  participants:Player[];selected:string;working:boolean;ready:boolean;onSelect:(id:string)=>void;
}) {
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  // Keep the followed teammate in view for a whole-team session.
  const visible=participants.slice(0,6);
  const focus=participants.find(p=>p.id===selected);
  if(focus&&!visible.includes(focus))visible[visible.length-1]=focus;
  return <div className="fhq-weight-interior" data-working={working} data-ready={ready}>
    <img key={attempt} className="fhq-weight-interior-art" src={interior} width={1536} height={1024}
      alt="Inside the campus Weight Room: timber beams, orange trim, black padded benches, dumbbell racks and a turf lane"
      onError={()=>setFailed(true)}/>
    {!failed&&visible.map((p,i)=>{
      const spot=SPOTS[visible.length<=3?i+3:i],exercise=stationExercise(participants.indexOf(p));
      return <button type="button" key={p.id} className="fhq-weight-room-player" aria-pressed={selected===p.id}
        aria-label={`Follow ${p.name}, ${p.role}, level ${p.level}${working?', '+EXERCISE_LABELS[exercise]:ready?', workout complete':''}`}
        onClick={()=>onSelect(p.id)} style={{left:`${spot.x}%`,top:`${spot.y}%`,height:`${spot.height}%`}}>
        <IndoorPlayer unit={p.unit} working={working} exercise={exercise} offset={i*.37}/>
        <span className="fhq-room-player-label">{selected===p.id?p.name:p.role}<small>L{p.level}{working?' · '+EXERCISE_LABELS[exercise]:ready?' · Ready':''}</small></span>
      </button>;
    })}
    {participants.length>6&&<div className="fhq-weight-room-overflow">+{participants.length-6} teammates in this session · choose a player below to follow them</div>}
    {failed&&<div className="fhq-weight-art-error" role="status">The room artwork could not load.<button onClick={()=>{setFailed(false);setAttempt(n=>n+1)}}>Retry room artwork</button></div>}
  </div>;
}
