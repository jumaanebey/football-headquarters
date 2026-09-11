import {useEffect,useId,useState} from 'react';
import {FOOTBALL_PLAYS,type FootballPlay} from '../game/development';
import {unitPlayerSprite} from '../assets';
import {UnitGroup} from '../types';
/** Coaching animation: legal seven-on-the-line alignment, four backs, eleven defenders.
 * The route progression is authored football teaching, not a saved match replay. */
export function FootballPlayView({play,playing=true,compact=false}:{play:FootballPlay;playing?:boolean;compact?:boolean}){
 const [t,setT]=useState(0),id=useId().replace(/:/g,'');
 useEffect(()=>{setT(0);if(!playing)return;const reduced=matchMedia('(prefers-reduced-motion: reduce)');const tick=setInterval(()=>{if(!document.hidden&&!reduced.matches)setT(x=>(x+.04)%1)},120);return()=>clearInterval(tick)},[play,playing]);
 const progress=Math.min(1,Math.max(0,(t-.15)/.62));
 const routes:Record<FootballPlay,[number,number][][]>={
  slants:[[[325,70],[390,70],[485,190]],[[315,130],[370,130],[465,230]],[[325,350],[390,350],[490,235]],[[315,290],[370,290],[465,190]]],
  flood:[[[325,70],[670,70]],[[315,130],[450,130],[480,310],[600,325]],[[325,350],[540,350]],[[315,290],[365,330],[480,365]]],
  power:[[[325,70],[390,100]],[[315,130],[380,150]],[[325,350],[390,325]],[[315,290],[365,250]]],
  verticals:[[[325,70],[700,70]],[[315,130],[650,135]],[[325,350],[700,350]],[[315,290],[650,285]]],
 };
 const interpolate=(points:[number,number][],p:number)=>{const f=p*(points.length-1),a=points[Math.floor(f)],b=points[Math.min(points.length-1,Math.floor(f)+1)];return [a[0]+(b[0]-a[0])*(f%1),a[1]+(b[1]-a[1])*(f%1)];};
 const actors=[...Array.from({length:5},(_,i)=>({x:325+progress*15,y:170+i*20,unit:UnitGroup.OFFENSE_LINE,role:['LT','LG','C','RG','RT'][i]})),{x:280-progress*20,y:210,unit:UnitGroup.OFFENSE_SKILL,role:'QB'},{x:play==='power'?245+progress*245:245,y:play==='power'?240-progress*10:240,unit:UnitGroup.OFFENSE_SKILL,role:'RB'},...routes[play].map((r,i)=>{const [x,y]=interpolate(r,progress);return {x,y,unit:UnitGroup.OFFENSE_SKILL,role:i===3?'TE':'WR'};}),...Array.from({length:4},(_,i)=>({x:355-progress*15,y:176+i*24,unit:UnitGroup.DEFENSE_LINE,role:'DL'})),...Array.from({length:3},(_,i)=>({x:410+progress*12,y:150+i*60,unit:UnitGroup.DEFENSE_SECONDARY,role:'LB'})),...[[420,70],[420,350],[550,145],[550,280]].map(([x,y],i)=>({x:x+progress*55,y,unit:UnitGroup.DEFENSE_SECONDARY,role:i<2?'CB':'S'}))];
 const receiver=interpolate(routes[play][0],progress),pass=Math.min(1,Math.max(0,(t-.45)/.28)),ball=play==='power'?[245+progress*245,233-progress*10]:[260+(receiver[0]-260)*pass,206+(receiver[1]-206)*pass];
 return <div className={`fhq-football-film ${compact?'is-compact':''}`}><svg viewBox="0 0 800 420" role="img" aria-label={`${FOOTBALL_PLAYS[play].name}: eleven offensive players execute their assignments against eleven defenders`}>
  <defs><marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#facc68"/></marker></defs>
  <rect width="800" height="420" fill="#285438"/>{Array.from({length:11},(_,i)=><g key={i}><rect x={i*70} y="0" width="35" height="420" fill="#346344"/><line x1={i*70+35} y1="22" x2={i*70+35} y2="398" stroke="#cfe4cc" strokeOpacity=".6"/><text x={i*70+20} y="28" fill="#e3efdd" fontSize="14">{Math.abs(50-i*10)}</text></g>)}<path d="M0 40H800M0 380H800" stroke="#f5f4df" strokeWidth="3"/>
  <line x1="335" x2="335" y1="40" y2="380" stroke="#7bd9ff" strokeDasharray="5 5"/>
  {routes[play].map((points,i)=><polyline key={i} points={points.map(p=>p.join(',')).join(' ')} fill="none" stroke="#facc68" strokeWidth="2.5" strokeDasharray="6 4" markerEnd={`url(#arrow-${id})`}/>)}
  {actors.map((a,i)=><g key={i} transform={`translate(${a.x} ${a.y})`}><ellipse cy="7" rx="12" ry="5" fill="#0b231acc"/><image href={unitPlayerSprite(a.unit)} x="-15" y="-25" width="30" height="37"/><text y="23" fill={i<11?'#fff0bf':'#e0efff'} textAnchor="middle" fontSize="10" fontWeight="bold">{a.role}</text></g>)}
  <ellipse cx={ball[0]} cy={ball[1]} rx="6" ry="3.5" fill="#9f592e" stroke="#fff5cc" strokeWidth="1.5"/>
 </svg>{!compact&&<div className="fhq-play-caption"><strong>{FOOTBALL_PLAYS[play].name}</strong><span>{t<.15?'Set · identify the front':t<.45?'Snap · routes and blocks':t<.75?play==='power'?'Follow the puller':'Read · release the ball':'Finish · reset for the next rep'}</span><p>{FOOTBALL_PLAYS[play].concept}</p></div>}</div>;
}
