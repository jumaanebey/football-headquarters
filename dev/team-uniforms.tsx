import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AnimatedHero} from '../components/AnimatedHero';
import {KitLayer} from '../components/TeamKit';
import {CLUB_STYLES} from '../game/clubStyle';
import {teamKitCacheStats} from '../game/teamKit';
import {MODERN_HEROES} from '../game/heroAnimation';
import {UnitGroup} from '../types';
import {unitPlayerSprite} from '../assets';
import {openCampusArt} from '../game/artGate';
import '../tailwind.css';import '../game-theme.css';
function Gallery(){const[index,setIndex]=useState(0),[mode,setMode]=useState<'idle'|'walk'|'attack'>('idle'),[stats,setStats]=useState('');const measure=()=>{const samples:number[]=[];let last=performance.now(),start=last;const frame=(now:number)=>{samples.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(frame);else{samples.sort((a,b)=>a-b);setStats(JSON.stringify({...teamKitCacheStats(),samples:samples.length,p95ms:samples[Math.floor(samples.length*.95)],over50:samples.filter(n=>n>50).length}));}};requestAnimationFrame(frame);};const kit=CLUB_STYLES[index];return <main className="min-h-screen bg-slate-950 p-4 text-white"><h1 className="text-xl font-bold">Team uniform review</h1><div>{CLUB_STYLES.map((s,i)=><button key={s.id} className="m-2 rounded p-2" style={{background:s.primary,color:s.secondary}} onClick={()=>setIndex(i)}>{s.name}</button>)}</div><div>{(['idle','walk','attack'] as const).map(m=><button key={m} className="m-2 rounded border p-2" onClick={()=>setMode(m)}>{m}</button>)}<button onClick={()=>setStats(JSON.stringify(teamKitCacheStats()))}>Cache stats</button><button onClick={measure}>Measure 5 seconds</button><p style={{overflowWrap:'anywhere'}}>{stats}</p></div><div className="grid grid-cols-3 gap-2">{MODERN_HEROES.map(heroKey=><article key={heroKey} className="rounded border border-slate-700"><h2>{heroKey} · {kit.name}</h2><div className="relative" style={{height:144}}><AnimatedHero heroKey={heroKey} kit={kit} mode={mode}/></div></article>)}</div><div className="mt-3" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))'}}>{Object.values(UnitGroup).map(unit=><div key={unit} className="relative" style={{height:112}}><KitLayer src={unitPlayerSprite(unit)} kit={kit}/></div>)}</div></main>}
if(import.meta.env.DEV){openCampusArt();createRoot(document.getElementById('root')!).render(<Gallery/>)}
