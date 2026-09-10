// Separate Vite development entry. Not imported or emitted by the production build.
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BattleHeroSprite} from '../components/BattleHeroSprite';
import {HERO_DEFS} from '../battle';
import {heroMovementStyle} from '../game/heroMovementStyle';
import '../game-motion.css';
import '../tailwind.css';
function MotionLab(){
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[large,setLarge]=useState(false);
 useEffect(()=>{if(!playing)return;let frame=0,previous=performance.now();const tick=(now:number)=>{if(!document.hidden)setTime(t=>t+Math.min(.05,(now-previous)/1000)*speed);previous=now;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing,speed]);
 const t=time%7, moving=t<2 || t>=3&&t<5, attack=t>=5&&t<6;
 const progress=t<2?t/2:t<3?1:t<5?1-(t-3)/2:0;
 const actor={x:10+progress*20,y:40,moving,face:t<3?1:-1,strideSeconds:.58,stridePhase:(progress*5)%1,actionPoseT:attack?.32*(1-(t-5)):0,hitFlash:0};
 return <main style={{padding:12,fontFamily:'system-ui'}}><h1 style={{fontSize:22}}>Nine-hero motion comparison</h1><p>Same path · cosmetic profiles · no club or server state</p><div style={{display:'flex',gap:8,flexWrap:'wrap',padding:'12px 0'}}>
 <button onClick={()=>setPlaying(p=>!p)}>{playing?'Pause':'Play'}</button><button onClick={()=>{setPlaying(false);setTime(t=>t+.1);}}>Step 0.1s</button><button onClick={()=>{setPlaying(false);setTime(0);}}>Restart</button>
 <label>Speed <select style={{color:"black"}} value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label><button onClick={()=>setLarge(p=>!p)}>{large?'Phone scale':'Enlarge'}</button></div>
 <p role="status">{time.toFixed(1)}s · {moving?'Move':attack?'Attack':'Settle'} · {t<3?'Right':'Left'}</p>
 <div style={{display:'grid',gridTemplateColumns:large?'repeat(auto-fit,minmax(260px,1fr))':'repeat(3,minmax(0,1fr))',gap:8}}>{HERO_DEFS.map(hero=><article key={hero.key} style={{border:'1px solid #36533c',borderRadius:12,padding:6}}><strong style={{fontSize:12}}>{hero.name}</strong><div style={{height:large?250:130,position:'relative',overflow:'hidden',background:'linear-gradient(#122e1e,#1c402c)'}}><div className="fhq-unit" style={{position:'absolute',width:large?210:88,height:large?210:88,bottom:10,left:`calc(${progress*100}% - ${progress*((large?210:88)+8)-4}px)`}}><BattleHeroSprite heroKey={hero.key} actor={actor} fighting simulationTime={time}/></div><div style={{position:'absolute',bottom:8,width:'100%',borderTop:'1px solid #8b9d54'}}/></div><p style={{fontSize:10,minHeight:28}}>{heroMovementStyle(hero.key).identity}</p></article>)}</div>
 </main>;
}
if(import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<MotionLab/>);
