import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {returnPerformance} from '../game/presentation/returnPerformance';
import {unitPlayerSprite} from '../assets';
import {UnitGroup} from '../types';
function Study(){
 const [lane,setLane]=useState<'left'|'middle'|'right'>('left'),[end,setEnd]=useState(47),[run,setRun]=useState(0),[t,setT]=useState(0);
 useEffect(()=>{let raf=0,last=0,elapsed=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;setT(reduced?1:0);if(reduced)return;
 const frame=(now:number)=>{if(!document.hidden&&last)elapsed+=Math.min(50,now-last);last=now;setT(Math.min(1,elapsed/5500));if(elapsed<5500)raf=requestAnimationFrame(frame);};raf=requestAnimationFrame(frame);return()=>cancelAnimationFrame(raf);},[run,lane,end]);
 const scene=returnPerformance(20,end,lane,t),sx=(x:number)=>60+x*8,sy=(y:number)=>80+y*8;
 const focus=Math.max(-20,Math.min(620,sx(scene.ball.x)-120));
 const unit=(side:string,role:string)=>side==='cover'?UnitGroup.DEFENSE_SECONDARY:role==='Returner'?UnitGroup.OFFENSE_SKILL:UnitGroup.OFFENSE_LINE;
 return <main style={{maxWidth:1050,margin:'auto',fontFamily:'system-ui',padding:16}}><small>STADIUM MOVEMENT STUDY · NOT A SAVED GAME</small><h1 style={{fontSize:25}}>Read the lane. Make the cut.</h1><p>4/10 exaggeration · automatic execution · existing Practice Field artwork</p>
 <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:14}}>{(['left','middle','right'] as const).map(k=><button aria-pressed={lane===k} onClick={()=>setLane(k)} key={k}>{k} lane</button>)}<button onClick={()=>setEnd(end===47?100:47)}>{end===47?'Show breakaway':'Show contained return'}</button><button onClick={()=>setRun(run+1)}>Replay</button></div>
 <div style={{borderRadius:18,overflow:'hidden',border:'1px solid #60806c'}}><svg viewBox={`${focus} ${Math.max(45,Math.min(255,sy(scene.ball.y)-125))} 320 300`} style={{width:'100%',display:'block',background:'#152732'}} role="img" aria-label={`${scene.beat}. Returner and blockers execute against individual coverage players.`}>
 {Array.from({length:80},(_,i)=><g key={i} fill={i%4?'#5f7881':'#cc9443'}><circle cx={i*14} cy={25+(i%3)*8} r="4"/><path d={`M${i*14-4} 42h8v8h-8z`}/></g>)}
 <rect x="-20" y="80" width="960" height={53.333*8} fill="#245b3c" stroke="#f2f0d5" strokeWidth="2"/>
 <rect x="-20" y="80" width="80" height={53.333*8} fill="#97672c"/><rect x="860" y="80" width="80" height={53.333*8} fill="#315c79"/>
 {Array.from({length:21},(_,i)=><g key={i}><line x1={sx(i*5)} x2={sx(i*5)} y1="80" y2={sy(53.333)} stroke="#dce6cd" opacity={i%2?.22:.65}/>{i%2===0&&i>0&&i<20&&<text x={sx(i*5)} y="120" textAnchor="middle" fill="#e6ecd5" fontSize="15">{Math.min(i*5,100-i*5)}</text>}</g>)}
 {Array.from({length:99},(_,i)=>[23.583,29.75].map(y=><line key={`${i}-${y}`} x1={sx(i+1)} x2={sx(i+1)} y1={sy(y)} y2={sy(y)+4} stroke="#dce6cd" opacity=".65"/>))}
 {scene.actors.sort((a,b)=>a.y-b.y).map(a=><g key={a.id} transform={`translate(${sx(a.x)} ${sy(a.y)})`}><ellipse cy="2" rx="10" ry="4" fill="#071b1699"/><path d="M-9 6h18" stroke={a.side==='return'?'#ffc65a':'#83d6ff'} strokeWidth="2"/><image href={unitPlayerSprite(unit(a.side,a.role))} x="-18" y="-43" width="36" height="46" transform={`rotate(${a.moving?a.lean:0})`}/>{a.id==='returner'&&<text y="-44" textAnchor="middle" fill="#fff4c7" fontWeight="700" fontSize="11">RETURNER</text>}</g>)}
 <ellipse cx={sx(scene.ball.x)} cy={sy(scene.ball.y)-10} rx="5" ry="3" fill="#b46e39" stroke="#fff3d0"/>
 <g fill="#84959b">{Array.from({length:14},(_,i)=><g key={i}><rect x={i*65+20} y="543" width="35" height="6"/><circle cx={i*65+25} cy="525" r="4"/></g>)}</g>
 </svg></div><p role="status" style={{fontWeight:700}}>{scene.beat}</p><p style={{color:'#b9c7cb',fontSize:14}}>Movement and spacing prototype. Static source cutouts still need authored running, planting and contact poses. No club data, ratings or rewards are changed.</p></main>;
}
createRoot(document.getElementById('root')!).render(<Study/>);
