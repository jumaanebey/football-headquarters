import {useState} from 'react';
import type {Player} from '../types';
import {unitPlayerSprite} from '../assets';

const interior = new URL('../art/rooms/weight-room-interior-v3.webp', import.meta.url).href;
// Feet sit on the illustrated floor, in front of the equipment. Back row paints first.
const SPOTS = [
  {x:39,y:61,height:30}, {x:59,y:66,height:30}, {x:78,y:72,height:30},
  {x:26,y:76,height:35}, {x:47,y:84,height:35}, {x:68,y:92,height:35},
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
      const spot=SPOTS[visible.length<=3?i+3:i];
      return <button type="button" key={p.id} className="fhq-weight-room-player" aria-pressed={selected===p.id}
        aria-label={`Follow ${p.name}, ${p.role}, level ${p.level}${working?', working out':ready?', workout complete':''}`}
        onClick={()=>onSelect(p.id)} style={{left:`${spot.x}%`,top:`${spot.y}%`,height:`${spot.height}%`}}>
        <img src={unitPlayerSprite(p.unit)} alt="" draggable={false}/>
        <span>{p.name}<small>L{p.level}{working?' · In session':ready?' · Ready':''}</small></span>
      </button>;
    })}
    {participants.length>6&&<div className="fhq-weight-room-overflow">+{participants.length-6} teammates in this session · choose a player below to follow them</div>}
    {failed&&<div className="fhq-weight-art-error" role="status">The room artwork could not load.<button onClick={()=>{setFailed(false);setAttempt(n=>n+1)}}>Retry room artwork</button></div>}
  </div>;
}
