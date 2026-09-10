import React from 'react';
/** Only JUGS uses a football. Water and sleds stay connected to their equipment. */
export function DefenseShot({flavor,u,sx,sy,tx,ty,rotation}:{flavor?:string;u:number;sx:number;sy:number;tx:number;ty:number;rotation:number}) {
  if(u<0||u>1) return null;
  const x=sx+(tx-sx)*u, y=sy+(ty-sy)*u;
  if(flavor==='cooler') return <svg data-defense-effect="water-spray" aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" style={{zIndex:95,overflow:'visible'}}>
    <path d={`M ${sx} ${sy} Q ${(sx+tx)/2} ${Math.min(sy,ty)-3} ${x} ${y}`} fill="none" stroke="#67e8f9" strokeWidth=".7" opacity=".8" strokeLinecap="round" />
    <ellipse cx={x} cy={y} rx="1.3" ry=".6" fill="#a5f3fc" opacity={1-u*.6}/>
  </svg>;
  if(flavor==='sled') return <svg data-defense-effect="sled-impact" aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" style={{zIndex:95}}><path d={`M ${sx} ${sy} L ${tx} ${ty}`} stroke="#fbbf24" strokeWidth="1" strokeDasharray="1 1" opacity={1-u}/><ellipse cx={tx} cy={ty} rx={1+u*2} ry={.5+u} fill="none" stroke="#fbbf24" strokeWidth=".5" opacity={1-u}/></svg>;
  const arc=y-Math.sin(Math.PI*u)*7;
  return <div data-defense-effect={flavor==='ref'?'penalty-flag':flavor==='tshirt'?'shirt-burst':'football'} className="absolute pointer-events-none" style={{left:`${x}%`,top:`${arc}%`,width:'max(18px,3vmin)',height:'max(18px,3vmin)',zIndex:95,transform:`translate(-50%,-50%) rotate(${rotation+u*360}deg)`}}>
    {flavor==='ref'?<svg viewBox="0 0 24 24"><path d="M5 22V2M5 3L20 6L14 12L5 10" stroke="#fde047" fill="#facc15" strokeWidth="2"/></svg>:flavor==='tshirt'?<svg viewBox="0 0 24 24"><path d="M8 3L3 6L1 11L6 13V22H18V13L23 11L21 6L16 3Q12 8 8 3Z" fill="#f472b6" stroke="#fff" strokeWidth="1"/></svg>:<img src="/assets/battle/football-proj.webp" alt="" className="w-full h-full object-contain"/>}
  </div>;
}
