import {ScenerySprite} from './ScenerySprite';
import type {BattleBuildingDef} from '../battle';
import {buildingSprite, defenseSprite} from '../assets';
import {BuildingType} from '../types';
const point=(x:number,y:number)=>({x:200+(x-y)*1.65,y:28+(x+y)*.92});
/** Uses the supplied match snapshot, never a decorative substitute layout. */
export function MatchScoutBoard({buildings}:{buildings:BattleBuildingDef[]}){
 const corners=[[0,0],[100,0],[100,100],[0,100]].map(([x,y])=>{const p=point(x,y);return `${p.x},${p.y}`}).join(' ');
 return <figure className="fhq-scout-board"><svg viewBox="0 0 400 240" role="img" aria-label="Opponent layout: gold Stadium, red defense coverage, gray blocking walls">
 <polygon points={corners} fill="#174b35" stroke="#97b697" strokeWidth="2"/>
 {buildings.filter(b=>b.kind==='defense').map(b=>{const p=point(b.x,b.y);return <ellipse key={`range-${b.id}`} cx={p.x} cy={p.y} rx={(b.range??0)*2.33} ry={(b.range??0)*1.3} fill="#ef4444" fillOpacity=".09" stroke="#fb7185" strokeOpacity=".4"/>})}
 {[...buildings].sort((a,b)=>a.x+a.y-b.x-b.y).map(b=>{const p=point(b.x,b.y);const size=b.kind==='hq'?100:b.kind==='wall'?9:60;return <g key={b.id}><title>{b.kind==='hq'?'Stadium':b.kind==='defense'?`${b.flavor??'jugs'} defense`:b.kind==='wall'?'Blocking wall':'Facility'}</title>{b.kind==='wall'?<rect x={p.x-4} y={p.y-3} width="8" height="6" rx="1" fill="#9ca3af"/>:<><foreignObject x={p.x-size/2} y={p.y-size*.8} width={size} height={size}><ScenerySprite src={b.art??(b.kind==='defense'?defenseSprite(b.flavor??'jugs',b.level??1):buildingSprite(b.kind==='hq'?BuildingType.STADIUM:BuildingType.TRAINING_PITCH,b.level??1))} style={{width:'100%',height:'100%',objectFit:'contain'}}/></foreignObject>{b.kind==='hq'&&<text x={p.x} y={p.y+14} textAnchor="middle" fill="#fde68a" fontSize="10" fontWeight="bold">STADIUM</text>}{b.kind==='defense'&&<circle cx={p.x} cy={p.y+5} r="3" fill="#fb7185"/>}</>}</g>})}
 <text x="200" y="233" textAnchor="middle" fill="#d1fae5" fontSize="10">DEPLOY ALONG THE OUTSIDE SIDELINES</text>
 </svg><figcaption>Red = defense reach · Gold = Stadium · Gray = blockers</figcaption></figure>
}
