import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AnimatedHero} from '../components/AnimatedHero';
import {loadHeroMotion} from '../components/loadHeroMotion';
import {heroMotionColumns} from '../game/heroMotion';
import {MODERN_HEROES} from '../game/heroAnimation';
import '../tailwind.css';
import '../game-motion.css';
function Review(){
 const [hero,setHero]=useState('coach'),[frames,setFrames]=useState<HTMLCanvasElement[]>([]),[stats,setStats]=useState('Warming up…');
 useEffect(()=>{let gone=false;loadHeroMotion(hero).then(f=>{if(!gone)setFrames(f)});return()=>{gone=true}},[hero]);
 useEffect(()=>{let raf=0,start=0,previous=0;const intervals:number[]=[];
  const tick=(now:number)=>{if(!start){start=now;previous=now;}if(now-start>5000)intervals.push(now-previous);previous=now;
   if(now-start<65000)raf=requestAnimationFrame(tick);else{const sorted=[...intervals].sort((a,b)=>a-b);setStats(JSON.stringify({seconds:60,frames:intervals.length,p50ms:sorted[Math.floor(sorted.length*.5)],p95ms:sorted[Math.floor(sorted.length*.95)],over50ms:intervals.filter(n=>n>50).length,estimatedFrameCacheMiB:441*256*256*4/1048576}));}};
  raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
 },[]);
 return <main style={{padding:16,background:'#14251f',color:'white',minHeight:'100vh',fontFamily:'system-ui'}}><h1>27 animated heroes · full roster stress review</h1><output>{stats}</output>
 <div style={{display:'grid',gridTemplateColumns:'repeat(9,104px)',gap:4}}>{Array.from({length:27},(_,i)=><div key={i} style={{width:104,height:104,position:'relative'}}><AnimatedHero heroKey={MODERN_HEROES[i%9]} mode="walk" facing={i%2?1:-1} loadSignatureArt label={`runner ${i+1}`}/></div>)}</div>
 <label>Hero <select value={hero} onChange={e=>setHero(e.target.value)} style={{color:'black'}}>{MODERN_HEROES.map(k=><option key={k}>{k}</option>)}</select></label>
 <div style={{display:'grid',gridTemplateColumns:`repeat(${heroMotionColumns(hero)},104px)`,gap:4}}>{frames.map((frame,i)=><div key={`${hero}:${i}`}><canvas width={104} height={104} ref={canvas=>{canvas?.getContext('2d')?.drawImage(frame,0,0,104,104)}}/><span>{i}</span></div>)}</div></main>
}
createRoot(document.getElementById('root')!).render(<Review/>);
