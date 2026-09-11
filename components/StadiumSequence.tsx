import {useEffect,useState} from 'react';
import type {FootballEvent,StadiumFootballGame} from '../game/stadiumFootball';
import {driveDirection} from '../game/stadiumFootball';
import {unitPlayerSprite} from '../assets';
import {UnitGroup} from '../types';

// The drive is rendered from the event's own geometry: which side had the ball, which way it was
// going, and the yard lines it started and ended on. Nothing here infers position from the phase
// name or from fixed animation coordinates, so a touchdown lands in the endzone the event says it
// did and a 12-yard gain looks like twelve yards.
const FIELD_LEFT=95,FIELD_RIGHT=725,ENDZONE=59;
/** Absolute yard (0 = home endzone line, 100 = away endzone line) to a screen x. */
const xOfYard=(yard:number)=>FIELD_LEFT+Math.max(0,Math.min(100,yard))*(FIELD_RIGHT-FIELD_LEFT)/100;
/** Where a score is placed: inside the endzone the scoring side was attacking. */
const xOfScore=(possession:'home'|'away')=>possession==='home'?FIELD_RIGHT+ENDZONE/2:FIELD_LEFT-ENDZONE/2;

export function StadiumSequence({game,level=1}:{game:StadiumFootballGame;level?:number}){
 const [t,setT]=useState(0);
 const last=game.events.at(-1);
 useEffect(()=>{
  setT(0);
  if(!game.events.length)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){setT(1);return;}
  const started=Date.now();
  const timer=setInterval(()=>{const p=Math.min(1,(Date.now()-started)/900);setT(p);if(p>=1)clearInterval(timer);},1000/30);
  return ()=>clearInterval(timer);
 },[game.events.length]);

 const geometry=readGeometry(last,game);
 const p=last?t:0;
 const ballX=geometry.fromX+(geometry.toX-geometry.fromX)*p;
 const arc=geometry.kind==='field-goal'||geometry.kind==='conversion'?Math.sin(p*Math.PI)*130:geometry.kind==='pass'?Math.sin(p*Math.PI)*58:Math.sin(p*Math.PI)*12;
 const ballY=240-arc;
 // The possessing side always advances towards the endzone it attacks.
 const offenceUnit=geometry.possession==='home'?UnitGroup.OFFENSE_SKILL:UnitGroup.DEFENSE_SECONDARY;
 const defenceUnit=geometry.possession==='home'?UnitGroup.DEFENSE_LINE:UnitGroup.OFFENSE_LINE;
 const sprite=(x:number,y:number,unit:UnitGroup,index:number)=>
  <g key={`${unit}-${index}`} transform={`translate(${x},${y})`}>
   <ellipse cy="8" rx="13" ry="5" fill={unit===offenceUnit?'#fbc85888':'#b6ddff88'}/>
   <image href={unitPlayerSprite(unit)} x="-16" y="-34" width="32" height="42" style={{transform:geometry.direction<0?'scaleX(-1)':undefined,transformOrigin:'center'}}/>
  </g>;

 return <div className="fhq-stadium-sequence">
  <svg viewBox="0 0 820 460" role="img" aria-label={last?`${last.title}: ${last.detail}`:'Your Stadium, ready for kickoff'}>
   <rect width="820" height="460" fill="#10212c" rx="12"/>
   {Array.from({length:level>=3?5:3},(_,row)=>Array.from({length:45},(_,i)=>
    <g key={`${row}-${i}`} fill={i%3===0?'#e89533':'#47687c'}><rect x={53+i*16} y={12+row*11} width="12" height="8" rx="2"/></g>))}
   <rect x="35" y="49" width="750" height="362" fill="#235c36" stroke="#e4edd4" strokeWidth="3"/>
   {Array.from({length:11},(_,i)=><line key={i} x1={xOfYard(i*10)} y1="50" x2={xOfYard(i*10)} y2="410" stroke="#e4edd4" strokeWidth={i===5?3:1.5} opacity=".8"/>)}
   {Array.from({length:9},(_,i)=><text key={i} x={xOfYard((i+1)*10)} y="402" textAnchor="middle" fontSize="13" fill="#dfeee0" opacity=".75">{(i+1)*10<=50?(i+1)*10:100-(i+1)*10}</text>)}
   {/* Opposite endzones: the home club defends the left, attacks the right. */}
   <rect x={FIELD_LEFT-ENDZONE} y="50" width={ENDZONE} height="360" fill="#bc682c"/>
   <rect x={FIELD_RIGHT} y="50" width={ENDZONE} height="360" fill="#2c6abc"/>
   <text x={FIELD_LEFT-ENDZONE/2} y="230" transform={`rotate(-90 ${FIELD_LEFT-ENDZONE/2} 230)`} fill="#ffe5ab" textAnchor="middle" fontSize="18" fontWeight="bold">HOME</text>
   <text x={FIELD_RIGHT+ENDZONE/2} y="230" transform={`rotate(90 ${FIELD_RIGHT+ENDZONE/2} 230)`} fill="#d8ebff" textAnchor="middle" fontSize="18" fontWeight="bold">AWAY</text>
   {/* The line of scrimmage this play began on. */}
   <line x1={geometry.fromX} y1="56" x2={geometry.fromX} y2="404" stroke="#f9d04d" strokeWidth="2" strokeDasharray="7 6" opacity=".85"/>
   {Array.from({length:10},(_,i)=>{
    const y=110+(i%5)*56;
    const spread=Math.floor(i/5)*34*geometry.direction;
    return sprite(geometry.fromX-28*geometry.direction+spread+(ballX-geometry.fromX)*.82,y,offenceUnit,i);
   })}
   {Array.from({length:11},(_,i)=>{
    const y=100+(i%6)*55;
    const depth=(28+Math.floor(i/6)*48)*geometry.direction;
    return sprite(geometry.fromX+depth+(ballX-geometry.fromX)*.55,y,defenceUnit,i);
   })}
   <ellipse cx={ballX} cy={ballY-8} rx="7" ry="4" fill="#9b5128" stroke="#fff2c2" strokeWidth="1.5"/>
   <rect x="200" y="376" width="420" height="26" rx="8" fill="#0a201ade"/>
   <text x="410" y="394" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#fff0cb">{!last?'AWAITING YOUR CALL':t<1?last.title:geometry.caption}</text>
  </svg>
  <p>{geometry.possession==='home'?'Home possession':'Away possession'} · {last?`${geometry.caption}`:'Awaiting your call'} · {level>=3?'Expanded grandstand':'Home grandstand'}</p>
 </div>;
}

interface Geometry {possession:'home'|'away';direction:1|-1;fromX:number;toX:number;kind:string;caption:string}
/** Read the event's persisted geometry. Pre-rewrite events carry none: those hold a still frame at
 *  the current spot rather than animating a position the event never recorded. */
function readGeometry(last:FootballEvent|undefined,game:StadiumFootballGame):Geometry{
 const possession=(last?.possession??game.possession??'home') as 'home'|'away';
 const direction=last?.direction??driveDirection(possession);
 if(!last||last.startYard===undefined||last.endYard===undefined){
  const x=xOfYard(game.yardLine);
  return {possession,direction,fromX:x,toX:x,kind:last?.action??'stop',caption:last?`${last.title}`:'Awaiting your call'};
 }
 const scored=(last.scored??0)>=6;
 const toX=scored?xOfScore(possession):last.action==='field-goal'?xOfScore(possession):xOfYard(last.endYard);
 const yards=Math.abs(last.endYard-last.startYard);
 const caption=scored?'Touchdown'
  :last.action==='field-goal'?(last.scored===3?'Field goal is good':'Field goal missed')
  :last.action==='conversion'?(last.scored?'Conversion good':'Conversion no good')
  :last.action==='stop'?(yards?`${yards} yards`:'No gain')
  :`${yards} yards`;
 return {possession,direction,fromX:xOfYard(last.startYard),toX,kind:last.action??'stop',caption};
}
