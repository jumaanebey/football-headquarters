import {useState,type ReactNode} from 'react';
import {BuildingType} from '../types';

const rooms:Partial<Record<BuildingType,{src:string;alt:string}>>={
  [BuildingType.STADIUM]:{src:new URL('../art/rooms/stadium-interior-v1.webp',import.meta.url).href,alt:'Inside the home Stadium: team tunnel, helmet lockers and ticket desk opening onto the field'},
  [BuildingType.TACTICS_ROOM]:{src:new URL('../art/rooms/film-room-interior-v1.webp',import.meta.url).href,alt:'Inside the Film Room: football screen, chalkboard, projector and team seats'},
  [BuildingType.MEDICAL_CENTER]:{src:new URL('../art/rooms/rehab-room-interior-v2.webp',import.meta.url).href,alt:'Inside the Rehab Center: covered cold-plunge station, padded treatment bench and recovery equipment'},
  [BuildingType.YOUTH_ACADEMY]:{src:new URL('../art/rooms/scouting-room-interior-v1.webp',import.meta.url).href,alt:'Inside the Scouting Department: prospect board, scouting desk and player meeting area'},
};
const renovations:Partial<Record<BuildingType,string>>={
 [BuildingType.MEDICAL_CENTER]:new URL('../art/rooms/rehab-interior-level3.webp',import.meta.url).href,
 [BuildingType.TACTICS_ROOM]:new URL('../art/rooms/film-interior-level3.webp',import.meta.url).href,
 [BuildingType.YOUTH_ACADEMY]:new URL('../art/rooms/scouting-interior-level3.webp',import.meta.url).href,
 [BuildingType.STADIUM]:new URL('../art/rooms/stadium-interior-level3.webp',import.meta.url).href,
};
export function FacilityInterior({type,children,level=1}:{type:BuildingType;children?:ReactNode;level?:number}) {
  const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  const original=rooms[type];if(!original)return null;const room={...original,src:level>=3?renovations[type]??original.src:original.src};
  return <div className="fhq-department-art" data-interior-level={level>=3?3:1}>
    <img key={`${type}:${attempt}`} src={room.src} alt={room.alt} width={1536} height={1024} onLoad={()=>setFailed(false)} onError={()=>setFailed(true)}/>
    <span className="fhq-interior-level">{level>=3?'L3 renovation · upgraded equipment':'Starter interior · renovation at L3'}</span>
    {!failed&&children}{!failed&&type===BuildingType.MEDICAL_CENTER&&<img className="fhq-recovery-canopy-front" src={room.src} alt="" aria-hidden="true"/>}
    {failed&&<div className="fhq-department-art-error" role="status">Room artwork couldn’t load.<button onClick={()=>setAttempt(n=>n+1)}>Retry artwork</button></div>}
  </div>;
}
