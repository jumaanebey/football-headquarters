import {useEffect,useRef,useState} from 'react';
import type {UnitGroup} from '../types';
import {indoorPlayerColumn,keyIndoorMatte} from '../game/indoorPlayers';
import {teamKitFrame,type TeamKit} from '../game/teamKit';
import {useTeamKit} from './TeamKit';
import bounds from '../art/players/indoor-atlas-v1.json';
import squat from '../art/players/indoor-squat-v1.json';
import mobility from '../art/players/indoor-mobility-v1.json';
import recovery from '../art/players/indoor-recovery-v2.json';
import film from '../art/players/indoor-film-v1.json';
import type {WorkoutExercise} from '../game/campusActivities';

type Activity='practice'|'squat'|'mobility'|'recovery'|'film';
const atlases={
 practice:{src:new URL('../art/players/indoor-atlas-v1.webp',import.meta.url).href,bounds},
 squat:{src:new URL('../art/players/indoor-squat-v1.webp',import.meta.url).href,bounds:squat},
 mobility:{src:new URL('../art/players/indoor-mobility-v1.webp',import.meta.url).href,bounds:mobility},
 recovery:{src:new URL('../art/players/indoor-recovery-v2.webp',import.meta.url).href,bounds:recovery},
 film:{src:new URL('../art/players/indoor-film-v1.webp',import.meta.url).href,bounds:film},
};
const decoded=new Map<Activity,Promise<HTMLCanvasElement[][]>>();
function loadFrames(activity:Activity){
 const cached=decoded.get(activity);if(cached)return cached;
 const job=new Promise<HTMLCanvasElement[][]>((resolve,reject)=>{
  const image=new Image();let alpha=activity==='practice';
  image.onload=()=>{try{resolve(atlases[activity].bounds.map(poses=>poses.map(({x,y,w,h})=>{
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas unavailable');
   ctx.drawImage(image,x,y,w,h,0,0,w,h);const data=ctx.getImageData(0,0,w,h);if(!alpha)keyIndoorMatte(data.data);ctx.putImageData(data,0,0);return canvas;
  })));}catch(error){decoded.delete(activity);reject(error);}};
  image.onerror=()=>{if(alpha){alpha=false;image.src=atlases[activity].src;return;}decoded.delete(activity);reject(new Error('Player artwork unavailable'));};image.src=alpha?new URL('../art/players/indoor-atlas-v1.alpha.webp',import.meta.url).href:atlases[activity].src;
 });decoded.set(activity,job);return job;
}
/** Indoor practice art. No game state changes or outdoor/battle art requests. */
export function IndoorPlayer({unit,working=false,exercise='curl',activity:suppliedActivity,pose:staticPose=0,offset=0,kit:suppliedKit,label=''}:{unit:UnitGroup;working?:boolean;exercise?:WorkoutExercise;activity?:'recovery'|'film';pose?:number;offset?:number;kit?:TeamKit;label?:string}){
  const activity:Activity=suppliedActivity??(working&&exercise!=='curl'?exercise:'practice');
  const inheritedKit=useTeamKit(),kit=suppliedKit??inheritedKit;
  const canvas=useRef<HTMLCanvasElement>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let lastPose=-1;let alive=true,visible=true,frames:HTMLCanvasElement[]|undefined;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw=()=>{if(!alive||!visible||document.hidden||!frames)return;
      const animated=working&&!suppliedActivity;
      const pose=suppliedActivity?Math.min(staticPose,frames.length-1):animated?(activity==='practice'?1:0)+(reduced.matches?0:Math.floor(Date.now()/(exercise==='squat'?1150:900)+offset)%2):0;
      if(pose===lastPose)return;lastPose=pose;
      const source=frames[pose],target=canvas.current,ctx=target?.getContext('2d');if(!target||!ctx)return;
      target.width=source.width;target.height=source.height;target.dataset.pose=String(pose);
      ctx.drawImage(source,0,0);
      // The cold-plunge pose is shirtless. Preserve its skin, water and metal colors.
      if(kit&&!(activity==='recovery'&&pose===2))ctx.drawImage(teamKitFrame(source,kit),0,0);
    };
    const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;draw();});
    if(canvas.current)observer.observe(canvas.current);
    loadFrames(activity).then(all=>{if(alive){frames=all[indoorPlayerColumn[unit]];setFailed(false);draw();}},()=>{if(alive)setFailed(true);});
    const timer=working?window.setInterval(draw,180):undefined;
    const retry=()=>setAttempt(n=>n+1);window.addEventListener('online',retry);
    reduced.addEventListener('change',draw);document.addEventListener('visibilitychange',draw);
    return()=>{alive=false;observer.disconnect();clearInterval(timer);window.removeEventListener('online',retry);reduced.removeEventListener('change',draw);document.removeEventListener('visibilitychange',draw);};
  },[unit,working,exercise,activity,suppliedActivity,staticPose,offset,kit,attempt]);
  return <span className="fhq-indoor-player" data-working={working} data-activity={activity}>
    <canvas ref={canvas} role={label?'img':undefined} aria-label={label||undefined} aria-hidden={!label} data-indoor-unit={unit} data-team-kit={kit?.id}/>
    {failed&&<span className="fhq-indoor-player-fallback" role="status">Player art unavailable · reconnect or reopen to retry</span>}
  </span>;
}
