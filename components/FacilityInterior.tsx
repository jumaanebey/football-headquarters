import {useState,type ReactNode} from 'react';
import {BuildingType} from '../types';

const rooms:Partial<Record<BuildingType,{src:string;alt:string}>>={
  [BuildingType.STADIUM]:{src:new URL('../art/rooms/stadium-interior-v1.webp',import.meta.url).href,alt:'Inside the home Stadium: team tunnel, helmet lockers and ticket desk opening onto the field'},
  [BuildingType.TACTICS_ROOM]:{src:new URL('../art/rooms/film-room-interior-v1.webp',import.meta.url).href,alt:'Inside the Film Room: football screen, chalkboard, projector and team seats'},
  [BuildingType.MEDICAL_CENTER]:{src:new URL('../art/rooms/rehab-room-interior-v2.webp',import.meta.url).href,alt:'Inside the Rehab Center: covered cold-plunge station, padded treatment bench and recovery equipment'},
  [BuildingType.YOUTH_ACADEMY]:{src:new URL('../art/rooms/scouting-room-interior-v1.webp',import.meta.url).href,alt:'Inside the Scouting Department: prospect board, scouting desk and player meeting area'},
};
export function FacilityInterior({type,children}:{type:BuildingType;children?:ReactNode}) {
  const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  const room=rooms[type];if(!room)return null;
  return <div className="fhq-department-art">
    <img key={`${type}:${attempt}`} src={room.src} alt={room.alt} width={1536} height={1024} onLoad={()=>setFailed(false)} onError={()=>setFailed(true)}/>
    {!failed&&children}{!failed&&type===BuildingType.MEDICAL_CENTER&&<img className="fhq-recovery-canopy-front" src={room.src} alt="" aria-hidden="true"/>}
    {failed&&<div className="fhq-department-art-error" role="status">Room artwork couldn’t load.<button onClick={()=>setAttempt(n=>n+1)}>Retry artwork</button></div>}
  </div>;
}
