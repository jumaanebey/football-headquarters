import {useEffect,useState} from 'react';
import type {GameState} from '../types';
import {clubNextStep,journeyTime,type JourneyDestination} from '../game/presentation/clubJourney';

export function CampusToday({club,onOpen,onProgram}:{club:GameState;onOpen:(destination:JourneyDestination)=>void;onProgram:()=>void}) {
 const[now,setNow]=useState(Date.now());useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);
 const next=clubNextStep(club);
 return <aside className="fhq-campus-today" aria-label="Today at your club" data-state={next.state}>
  <button className="fhq-today-next" onClick={()=>onOpen(next.destination)}><small>YOUR CLUB TODAY</small><strong>{next.title}</strong><span>{journeyTime(next.finishTime,now)||next.action} <b aria-hidden="true">→</b></span></button>
  <button className="fhq-today-program" onClick={onProgram}>Your<br/>program <span aria-hidden="true">↗</span></button>
 </aside>;
}
