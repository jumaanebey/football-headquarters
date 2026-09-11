import {useEffect,useRef,useState} from 'react';
import type {UnitGroup} from '../types';
import {indoorPlayerColumn,keyIndoorMatte} from '../game/indoorPlayers';
import {teamKitFrame,type TeamKit} from '../game/teamKit';
import {useTeamKit} from './TeamKit';
import bounds from '../art/players/indoor-atlas-v1.json';

const src=new URL('../art/players/indoor-atlas-v1.webp',import.meta.url).href;
let decoded:Promise<HTMLCanvasElement[][]>|undefined;
function loadFrames(){
  if(decoded)return decoded;
  decoded=new Promise<HTMLCanvasElement[][]>((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{try{
      const frames=bounds.map(poses=>poses.map(({x,y,w,h})=>{
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas unavailable');
        ctx.drawImage(image,x,y,w,h,0,0,w,h);
        const data=ctx.getImageData(0,0,w,h);keyIndoorMatte(data.data);ctx.putImageData(data,0,0);return canvas;
      }));resolve(frames);
    }catch(error){decoded=undefined;reject(error);}};
    image.onerror=()=>{decoded=undefined;reject(new Error('Player artwork unavailable'));};image.src=src;
  });return decoded;
}
/** Indoor practice art. No game state changes or outdoor/battle art requests. */
export function IndoorPlayer({unit,working=false,offset=0,kit:suppliedKit,label=''}:{unit:UnitGroup;working?:boolean;offset?:number;kit?:TeamKit;label?:string}){
  const inheritedKit=useTeamKit(),kit=suppliedKit??inheritedKit;
  const canvas=useRef<HTMLCanvasElement>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let lastPose=-1;let alive=true,visible=true,frames:HTMLCanvasElement[]|undefined;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw=()=>{if(!alive||!visible||document.hidden||!frames)return;
      const pose=working?(reduced.matches?2:1+(Math.floor(Date.now()/900+offset)%2)):0;
      if(pose===lastPose)return;lastPose=pose;
      const source=frames[pose],target=canvas.current,ctx=target?.getContext('2d');if(!target||!ctx)return;
      target.width=source.width;target.height=source.height;target.dataset.pose=String(pose);
      ctx.drawImage(kit?teamKitFrame(source,kit):source,0,0);
    };
    const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;draw();});
    if(canvas.current)observer.observe(canvas.current);
    loadFrames().then(all=>{if(alive){frames=all[indoorPlayerColumn[unit]];setFailed(false);draw();}},()=>{if(alive)setFailed(true);});
    const timer=working?window.setInterval(draw,180):undefined;
    const retry=()=>setAttempt(n=>n+1);window.addEventListener('online',retry);
    reduced.addEventListener('change',draw);document.addEventListener('visibilitychange',draw);
    return()=>{alive=false;observer.disconnect();clearInterval(timer);window.removeEventListener('online',retry);reduced.removeEventListener('change',draw);document.removeEventListener('visibilitychange',draw);};
  },[unit,working,offset,kit,attempt]);
  return <span className="fhq-indoor-player" data-working={working}>
    <canvas ref={canvas} role={label?'img':undefined} aria-label={label||undefined} aria-hidden={!label} data-indoor-unit={unit} data-team-kit={kit?.id}/>
    {failed&&<span className="fhq-indoor-player-fallback" role="status">Player art unavailable · reconnect or reopen to retry</span>}
  </span>;
}
