import {useEffect,useRef,useState} from 'react';
import type {StadiumFootballGame} from '../game/stadiumFootball';
import {stadiumPerformance} from '../game/presentation/stadiumPerformance';
import {StadiumPlayer} from './StadiumPlayer';
const sx=(x:number)=>80+x*8,sy=(y:number)=>65+y*8;
export function StadiumSequence({game,level=1,onPlayback}:{game:StadiumFootballGame;level?:number;onPlayback?:(playing:boolean)=>void}){
 const [t,setT]=useState(1),[replay,setReplay]=useState(0),stop=useRef(false);
 const last=game.events.at(-1),eventKey=`${game.id}:${last?.turn??'ready'}`;
 useEffect(()=>{
  stop.current=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(!last||last.startYard===undefined||last.endYard===undefined||last.action==='concede'||reduced.matches){setT(1);onPlayback?.(false);return;}
  setT(0);onPlayback?.(true);let raf=0,previous=0,elapsed=0;
  const tick=(now:number)=>{if(stop.current||reduced.matches){setT(1);onPlayback?.(false);return;}
   if(previous&&!document.hidden)elapsed+=Math.min(60,now-previous);previous=now;
   const p=Math.min(1,elapsed/5200);setT(p);if(p<1)raf=requestAnimationFrame(tick);else onPlayback?.(false);
  };
  raf=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(raf);onPlayback?.(false);};
 },[eventKey,replay,onPlayback]);
 const scene=stadiumPerformance(game,t),focusX=Math.max(-5,Math.min(685,sx(scene.focus.x)-125)),focusY=Math.max(15,Math.min(235,sy(scene.focus.y)-115));
 return <div className="fhq-stadium-sequence fhq-stadium-performance" data-playback={t<1?'playing':'complete'}>
  <svg viewBox={`${focusX} ${focusY} 355 310`} role="img" aria-label={t<1?scene.beat:last?`${last.title}. ${scene.beat}`:'Players lined up, awaiting your call'}>
   <rect x="-15" y="0" width="1060" height="570" fill="#192d36"/>
   {Array.from({length:level>=3?4:2},(_,row)=>Array.from({length:75},(_,i)=><g key={`${row}-${i}`} fill={i%4?'#7b9ba1':'#ddb45e'}><circle cx={i*14} cy={10+row*9+(t>.9&&last?.scored?-(i%3)*2:0)} r="2.6"/><rect x={i*14-3} y={13+row*9} width="6" height="4"/></g>))}
   <rect x="0" y="65" width="960" height={53.333*8} fill="#255b3c" stroke="#e4edd4" strokeWidth="2"/>
   <rect x="0" y="65" width="80" height={53.333*8} fill="#915f2a"/><rect x="880" y="65" width="80" height={53.333*8} fill="#305979"/>
   <text x="40" y="280" transform="rotate(-90 40 280)" fill="#fff2c9" textAnchor="middle" fontSize="20" fontWeight="800">HOME</text><text x="920" y="280" transform="rotate(90 920 280)" fill="#e3f3ff" textAnchor="middle" fontSize="20" fontWeight="800">AWAY</text>
   {Array.from({length:21},(_,i)=><g key={i}><line x1={sx(i*5)} x2={sx(i*5)} y1="65" y2={sy(53.333)} stroke="#e5ebd6" opacity={i%2?.22:.7}/>{i%2===0&&i>0&&i<20&&[105,460].map(y=><text key={y} x={sx(i*5)} y={y} textAnchor="middle" fontSize="13" fill="#e6ecd8">{Math.min(i*5,100-i*5)}</text>)}</g>)}
   {Array.from({length:99},(_,i)=>[23.583,29.75].map(y=><line key={`${i}-${y}`} x1={sx(i+1)} x2={sx(i+1)} y1={sy(y)} y2={sy(y)+4} stroke="#dbe6d2" opacity=".7"/>))}
   <line x1={sx(last?.startYard??game.yardLine)} x2={sx(last?.startYard??game.yardLine)} y1="65" y2={sy(53.333)} stroke="#ffd975" strokeDasharray="4 5" opacity=".5"/>
   {[-10,110].map(x=><g key={x}><path d={`M${sx(x)} 233v38m-16-38v-20m32 20v-20m-32 20h32`} stroke="#f5c44d" strokeWidth="3" fill="none"/></g>)}
   {[...scene.actors].sort((a,b)=>a.y-b.y).map(a=><StadiumPlayer key={a.id} {...a} x={sx(a.x)} y={sy(a.y)}/>)}
   {scene.ball.visible&&<ellipse cx={sx(scene.ball.x)} cy={sy(scene.ball.y)-12} rx="5" ry="3" fill="#b17140" stroke="#fff1c2"/>}
   {Array.from({length:14},(_,i)=><g key={i}><rect x={i*65+15} y="530" width="38" height="5" fill="#9da9a3"/><circle cx={i*65+20} cy="512" r="3.5" fill="#bf9e7d"/><path d={`M${i*65+16} 517h8v10h-8z`} fill={i%2?'#d9e4e1':'#475f70'}/></g>)}
  </svg>
  <div className="fhq-performance-caption"><p aria-live="polite">{scene.beat}</p>{scene.animated&&(t<1?<button onClick={()=>{stop.current=true;setT(1);onPlayback?.(false);}}>Skip animation</button>:<button onClick={()=>setReplay(r=>r+1)}>Replay play</button>)}</div>
 </div>;
}
