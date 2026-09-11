import {useEffect,useState} from 'react';
import {unitPlayerSprite} from '../assets';
import {UnitGroup} from '../types';
const atlas=new URL('../art/players/stadium/poses-v1.webp',import.meta.url).href;
let awayAtlas:Promise<string>|undefined;
/** Recolor saturated orange cloth only; preserve white pants, skin, leather and outlines. */
function awayArt(){return awayAtlas??=new Promise<string>((resolve,reject)=>{const image=new Image();image.onload=()=>{try{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);const p=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<p.data.length;i+=4){const [r,g,b]=p.data.slice(i,i+3);if(r>175&&g>45&&g<170&&b<65&&r>g*1.4){const shade=.45+.55*r/255;p.data[i]=Math.round(49*shade);p.data[i+1]=Math.round(146*shade);p.data[i+2]=Math.round(210*shade);}}ctx.putImageData(p,0,0);resolve(c.toDataURL());}catch(e){awayAtlas=undefined;reject(e);}};image.onerror=()=>{awayAtlas=undefined;reject(Error('Stadium atlas unavailable'));};image.src=atlas;});}
export function StadiumPlayer({x,y,pose=12,facing=1,away=false,large=false,label}:{x:number;y:number;pose?:number;facing?:1|-1;away?:boolean;large?:boolean;label?:string}){
 const [src,setSrc]=useState(atlas),[failed,setFailed]=useState(false);
 useEffect(()=>{let alive=true;setFailed(false);setSrc(atlas);if(away)awayArt().then(s=>{if(alive)setSrc(s);},()=>{});return()=>{alive=false};},[away]);
 const frame=Math.max(0,Math.min(31,Math.floor(pose))),size=large?52:46;
 return <g transform={`translate(${x},${y})`}>
  <ellipse cy="1" rx={large?12:10} ry="3.5" fill="#081d19aa"/>
  <path d="M-10 5H10" stroke={away?'#8ddcff':'#ffd579'} strokeWidth="2"/>
  <g transform={`scale(${facing},1)`}>{failed?<image href={unitPlayerSprite(large?UnitGroup.OFFENSE_LINE:UnitGroup.OFFENSE_SKILL)} x={-size/2} y={-size} width={size} height={size}/>:<svg x={-size/2} y={-size*154/128} width={size} height={size*160/128} viewBox={`${frame%8*128} ${Math.floor(frame/8)*160} 128 160`} overflow="hidden"><image href={src} width="1024" height="640" onError={()=>setFailed(true)}/></svg>}</g>
  {label&&<text y={-size-8} fill={away?'#c7edff':'#fff1c8'} textAnchor="middle" fontSize="9" fontWeight="700" stroke="#142821" strokeWidth="2.5" paintOrder="stroke">{label}</text>}
 </g>;
}
