import {useEffect,useState} from 'react';
import type {StadiumFootballGame} from '../game/stadiumFootball';
import {unitPlayerSprite} from '../assets';
import {UnitGroup} from '../types';
/** A finite presentation of the confirmed play, followed by a held frame for the next call. */
export function StadiumSequence({game,level=1}:{game:StadiumFootballGame;level?:number}){
 const [t,setT]=useState(0),last=game.events.at(-1),previous=game.events.at(-2);
 useEffect(()=>{setT(0);if(!game.events.length)return;const reduce=matchMedia('(prefers-reduced-motion: reduce)');if(reduce.matches){setT(1);return;}const started=Date.now();const timer=setInterval(()=>{const p=Math.min(1,(Date.now()-started)/2600);setT(p);if(p===1)clearInterval(timer)},50);return()=>clearInterval(timer)},[game.id,game.turn]);
 const phase=last?.phase??game.phase,away=['kickoff','defense','defend-finish'].includes(phase),scoreBefore=away?previous?.away??0:previous?.home??0,scoreAfter=away?last?.away??0:last?.home??0,scored=scoreAfter>scoreBefore;
 const kickoff=phase==='return'||phase==='kickoff',kick=(phase==='finish'&&last?.call==='field-goal')||(phase==='conversion'&&last?.call==='extra-point')||phase==='defend-finish',run=kickoff||last?.play==='power'||last?.call==='two-point'||last?.call==='goal-line';
 const start=kickoff?100:350,finish=kick?730:scored&&scoreAfter-scoreBefore>=6?720:Math.min(675,start+Math.max(20,last?.yards??0)*4),p=last?t:0;
 const lane=last?.call==='left'?145:last?.call==='right'?310:240,runner={x:start+(finish-start)*p,y:kickoff?lane:240+(run?Math.sin(p*Math.PI)*30:-Math.sin(p*Math.PI)*75)};
 const ball=kick?{x:335+410*p,y:240-Math.sin(p*Math.PI)*120+(scored?0:70)*p}:run?runner:{x:p<.45?310:310+(runner.x-310)*Math.min(1,(p-.45)/.4),y:p<.45?240:240+(runner.y-240)*Math.min(1,(p-.45)/.4)-Math.sin(Math.min(1,Math.max(0,(p-.45)/.4))*Math.PI)*40};
 const offense=away?UnitGroup.DEFENSE_SECONDARY:UnitGroup.OFFENSE_SKILL,defense=away?UnitGroup.OFFENSE_LINE:UnitGroup.DEFENSE_LINE;
 const sprite=(x:number,y:number,unit:UnitGroup,index:number)=> <g key={`${unit}-${index}`} transform={`translate(${x},${y})`}><ellipse cy="8" rx="13" ry="5" fill={unit===offense?'#fbc85888':'#b6ddff88'}/><image href={unitPlayerSprite(unit)} x="-16" y="-25" width="32" height="39"/></g>;
 return <div className="fhq-stadium-sequence"><svg viewBox="0 0 820 460" role="img" aria-label={last?`${last.title}: ${last.detail}`:'Your Stadium, ready for kickoff'}>
  <rect width="820" height="460" fill="#10212c" rx="12"/>{Array.from({length:level>=3?5:3},(_,row)=>Array.from({length:45},(_,i)=><g key={`${row}-${i}`} fill={i%3===0?'#e89533':'#47687c'}><rect x={53+i*16} y={6+row*7} width="11" height="4" rx="1"/><rect x={53+i*16} y={454-row*7} width="11" height="4" rx="1"/></g>))}
  <rect x="35" y="49" width="750" height="362" fill="#235c36" stroke="#e4edd4" strokeWidth="3"/>{Array.from({length:10},(_,i)=><g key={i}><rect x={95+i*63} y="50" width="31.5" height="360" fill="#2d693e"/><line x1={95+i*63} y1="50" x2={95+i*63} y2="410" stroke="#e1eed4" strokeOpacity=".7"/><text x={95+i*63} y="77" textAnchor="middle" fontSize="15" fill="#edf5db">{i<=5?i*10:(10-i)*10}</text></g>)}
  <rect x="36" y="50" width="59" height="360" fill="#bc682c"/><rect x="725" y="50" width="59" height="360" fill="#bc682c"/><text x="63" y="230" transform="rotate(-90 63 230)" fill="#ffe5ab" textAnchor="middle" fontSize="18" fontWeight="bold">HOME</text><text x="753" y="230" transform="rotate(90 753 230)" fill="#ffe5ab" textAnchor="middle" fontSize="18" fontWeight="bold">FOOTBALL HQ</text>
  <path d="M773 192V282M773 237H800M800 237V285" stroke="#f9d04d" strokeWidth="4" fill="none"/>
  {Array.from({length:10},(_,i)=>{const y=110+(i%5)*56,x=kickoff?150+Math.floor(i/5)*55:345+(i%2)*26;return sprite(Math.min(710,x+p*(run?Math.max(10,finish-start-25):30)),y+(kickoff?(lane-y)*p*.65:0),offense,i);})}
  {Array.from({length:11},(_,i)=>{const y=100+(i%6)*55,x=kickoff?390+Math.floor(i/6)*120:410+Math.floor(i/4)*70;return sprite(x+(runner.x-x)*p*(scored?.55:.85),y+(runner.y-y)*p*.65,defense,i);})}
  {sprite(kick?315:runner.x,kick?247:runner.y,offense,11)}<ellipse cx={ball.x} cy={ball.y-8} rx="7" ry="4" fill="#9b5128" stroke="#fff2c2" strokeWidth="1.5"/>
  <rect x="200" y="376" width="420" height="26" rx="8" fill="#0a201ade"/><text x="410" y="394" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#fff0cb">{!last?'CHOOSE YOUR KICKOFF RETURN':t<1?kick?'THE KICK':kickoff?'KICKOFF RETURN':run?'FOLLOW THE BLOCK':'READ · THROW · FINISH':last.title.toUpperCase()}</text>
 </svg><p>{away?'Away possession':'Home possession'} · {last?'Confirmed play':'Awaiting your call'} · {level>=3?'Expanded grandstand':'Home grandstand'}</p></div>;
}
