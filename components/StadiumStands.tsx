import React from 'react';
type Point = {x:number;y:number};
/** Built on the field's projection: terrace risers and seat banks, not editor-like dots. */
export function StadiumStands({project,takeover,homeColor,takeColor}:{project:(x:number,y:number)=>Point;takeover:number;homeColor:string;takeColor:string}) {
 const polygon=(points:number[][])=>points.map(([x,y])=>{const p=project(x,y);return `${p.x},${p.y}`;}).join(' ');
 const edge=(side:number,a:number,b:number):number[]=>side===0?[a,b]:side===1?[b,a]:side===2?[a,100-b]:[100-b,a];
 return <svg aria-hidden="true" className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
  {[0,1,2,3].map(side=><g key={side}>
   <polygon points={polygon([edge(side,9,-11),edge(side,91,-11),edge(side,91,-1),edge(side,9,-1)])} fill="#14251f" stroke="#77867d" strokeWidth=".35" />
   {[0,1,2].map(row=><g key={row}>
    <polygon points={polygon([edge(side,10,-3-row*2.6),edge(side,90,-3-row*2.6),edge(side,90,-4-row*2.6),edge(side,10,-4-row*2.6)])} fill="#52665b" />
    {Array.from({length:20},(_,i)=>{const a=11+i*3.95;const won=((i*7+row*3+side*5)%20)/20<takeover;return <polygon key={i} points={polygon([edge(side,a,-2.4-row*2.6),edge(side,a+2.8,-2.4-row*2.6),edge(side,a+2.8,-3.5-row*2.6),edge(side,a,-3.5-row*2.6)])} fill={won?takeColor:i%4===0?'#ddd6b8':homeColor} opacity={won?1:.45+.45*(1-takeover)} />;})}
   </g>)}
   {[30,50,70].map(a=><polygon key={a} points={polygon([edge(side,a,-10),edge(side,a+1.3,-10),edge(side,a+1.3,-1.5),edge(side,a,-1.5)])} fill="#8b9690" />)}
  </g>)}
 </svg>;
}
