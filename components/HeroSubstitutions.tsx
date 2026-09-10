import React, { useEffect, useRef, useState } from 'react';
import { AnimatedHero } from './AnimatedHero';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';
type Departure={id:string;key:string;x:number;y:number;dead:boolean};
export function HeroSubstitutions({actors,reduced}:{actors:Departure[];reduced:boolean}) {
 const seen=useRef(new Set<string>());const [departures,setDepartures]=useState<Departure[]>([]);
 const timers=useRef<ReturnType<typeof setTimeout>[]>([]);
 useEffect(()=>{for(const actor of actors){if(!actor.dead||seen.current.has(actor.id))continue;seen.current.add(actor.id);if(reduced)continue;setDepartures(previous=>[...previous,actor]);timers.current.push(setTimeout(()=>setDepartures(previous=>previous.filter(item=>item.id!==actor.id)),900));}},[actors,reduced]);
 useEffect(()=>()=>timers.current.forEach(clearTimeout),[]);
 if(reduced)return null;
 return <>{departures.map(actor=><div key={actor.id} data-hero-substitution={actor.key} className="absolute pointer-events-none" style={{left:`${actor.x}%`,top:`${actor.y}%`,width:'12%',minWidth:64,maxWidth:104,transform:'translate(-50%,-96%)',zIndex:150}}><div className="relative aspect-square" style={{animation:'fhq-substitution 900ms ease-out both'}}><AnimatedHero heroKey={actor.key} motionFrame={HERO_MOTION_BOUNDS[actor.key]?7:undefined} mode="idle"/><span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white bg-slate-950/90 px-1 rounded">SUB</span></div></div>)}</>;
}
