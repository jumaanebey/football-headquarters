import type {BBuilding} from '../battle';
export interface RaidEntryLane {key:string;label:string;point:{x:number;y:number}|null;}
/** Large entry controls select legal existing deploy coordinates; all movement and
 * battle rules still run through the recorded combat input path. */
export function raidEntryLanes(buildings:(Pick<BBuilding,'x'|'y'>&{dead?:boolean})[]):RaidEntryLane[]{
 return [
  {key:'west',label:'West',spots:[{x:4,y:50},{x:4,y:30},{x:4,y:70}]},
  {key:'north',label:'North',spots:[{x:50,y:4},{x:30,y:4},{x:70,y:4}]},
  {key:'east',label:'East',spots:[{x:96,y:50},{x:96,y:30},{x:96,y:70}]},
  {key:'south',label:'South',spots:[{x:50,y:96},{x:30,y:96},{x:70,y:96}]},
 ].map(lane=>({key:lane.key,label:lane.label,point:lane.spots.find(p=>!buildings.some(b=>!b.dead&&Math.hypot(p.x-b.x,p.y-b.y)<14))??null}));
}
