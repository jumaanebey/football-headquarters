import {useEffect,useRef} from 'react';
import {BuildingType,UnitGroup,type GameState} from '../types';
import {campusActivities} from '../game/campusActivities';
import {unitPlayerSprite} from '../assets';
import {IndoorPlayer} from './IndoorPlayer';

/** A clearly labelled coaching loop, separate from the saved match archive. */
export function PracticeFilm({playing}:{playing:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),elapsed=useRef(0),playingRef=useRef(playing);playingRef.current=playing;
 useEffect(()=>{
  let alive=true,visible=true;const target=canvas.current,ctx=target?.getContext('2d');if(!target||!ctx)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),images=new Map<string,HTMLImageElement>();
  const draw=()=>{if(!alive||!visible||document.hidden)return;const t=(elapsed.current%7000)/7000;
   ctx.fillStyle='#285c39';ctx.fillRect(0,0,400,260);
   for(let x=0;x<400;x+=40){ctx.fillStyle=x%80?'#346b41':'#2d613d';ctx.fillRect(x,0,40,260);ctx.strokeStyle='#d7e8c7';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,260);ctx.stroke();}
   for(let x=10;x<400;x+=8)for(const y of [28,90,170,232]){ctx.fillStyle='#dce8d2';ctx.fillRect(x,y,2,5);}
   ctx.fillStyle='#13291ddd';ctx.fillRect(0,0,400,23);ctx.fillStyle='#fff';ctx.font='bold 12px sans-serif';ctx.fillText('PRACTICE FILM · CROSSING ROUTE',10,16);
   const progress=Math.min(1,Math.max(0,(t-.12)/.65)),runner={x:126+progress*174,y:200-progress*135};
   ctx.setLineDash([5,4]);ctx.strokeStyle='#fbc65b';ctx.beginPath();ctx.moveTo(126,200);ctx.lineTo(300,65);ctx.stroke();ctx.setLineDash([]);
   const actor=(key:string,x:number,y:number)=>{const img=images.get(key);ctx.fillStyle='#071d1580';ctx.beginPath();ctx.ellipse(x,y+5,10,4,0,0,Math.PI*2);ctx.fill();if(img)ctx.drawImage(img,x-15,y-30,30,36);else{ctx.fillStyle=key===UnitGroup.DEFENSE_SECONDARY?'#e2e8f0':'#ffbd56';ctx.fillRect(x-5,y-14,10,18);}};
   for(const y of [78,112,146]){actor(UnitGroup.OFFENSE_LINE,140+Math.min(progress,.35)*15,y);actor(UnitGroup.DEFENSE_LINE,170-Math.min(progress,.35)*15,y);}
   actor(UnitGroup.OFFENSE_SKILL,96,128);actor(UnitGroup.OFFENSE_SKILL,runner.x,runner.y);actor(UnitGroup.DEFENSE_SECONDARY,runner.x+30,runner.y+12);
   const pass=Math.max(0,Math.min(1,(t-.4)/.26)),bx=96+(runner.x-96)*pass,by=118+(runner.y-125)*pass-Math.sin(pass*Math.PI)*35;
   if(t>.4){ctx.fillStyle='#8b431e';ctx.strokeStyle='#fff1d0';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(bx,by,6,3,-.45,0,Math.PI*2);ctx.fill();ctx.stroke();}
   target.dataset.filmFrame=String(Math.floor(t*100));
  };
  for(const unit of [UnitGroup.OFFENSE_LINE,UnitGroup.OFFENSE_SKILL,UnitGroup.DEFENSE_LINE,UnitGroup.DEFENSE_SECONDARY]){const img=new Image();img.onload=()=>{if(alive){images.set(unit,img);draw();}};img.src=unitPlayerSprite(unit);}
  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;draw();});observer.observe(target);
  draw();const timer=window.setInterval(()=>{if(playingRef.current&&!reduced.matches&&visible&&!document.hidden){elapsed.current+=80;draw();}},80);
  document.addEventListener('visibilitychange',draw);reduced.addEventListener('change',draw);
  return()=>{alive=false;clearInterval(timer);observer.disconnect();document.removeEventListener('visibilitychange',draw);reduced.removeEventListener('change',draw);};
 },[]);
 return <canvas className="fhq-film-screen" ref={canvas} width={400} height={260} role="img" aria-label="Practice film: a receiver runs a crossing route and catches a pass"/>;
}
const RECOVERY_LABELS=['Foam rolling','Hydration break','Cold plunge'];
export function DepartmentLife({club,type,playing=true}:{club:GameState;type:BuildingType;playing?:boolean}){
 const attendance=campusActivities(club),players=type===BuildingType.MEDICAL_CENTER?attendance.recovery:type===BuildingType.TACTICS_ROOM?attendance.film:attendance.stadium;
 const spots=type===BuildingType.MEDICAL_CENTER?[{x:48,y:82,h:29,w:24},{x:71,y:91,h:30,w:22},{x:22,y:65,h:32,w:27}]:type===BuildingType.TACTICS_ROOM?[{x:40,y:74,h:34,w:22},{x:52,y:82,h:34,w:22},{x:63,y:90,h:34,w:22}]:[{x:46,y:78,h:32,w:18},{x:65,y:88,h:34,w:18}];
 return <>{type===BuildingType.TACTICS_ROOM&&<PracticeFilm playing={playing}/>}{players.map((p,i)=>{const spot=spots[i];return <div key={p.id} className="fhq-department-player" data-player-id={p.id} data-room={type} style={{left:`${spot.x}%`,top:`${spot.y}%`,height:`${spot.h}%`,width:`${spot.w}%`}}>
  <IndoorPlayer unit={p.unit} activity={type===BuildingType.MEDICAL_CENTER?'recovery':type===BuildingType.TACTICS_ROOM?'film':undefined} pose={i} label={`${p.name} · ${type===BuildingType.MEDICAL_CENTER?RECOVERY_LABELS[i]:type===BuildingType.TACTICS_ROOM?'Watching practice film':'Getting ready for Game Day'}`}/>
 </div>;})}</>;
}
