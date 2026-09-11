import {unitPower} from '../battle';
import {playerWork,journeyTime} from '../game/presentation/clubJourney';
import {indoorGroupName} from '../game/indoorPlayers';
import React,{useState} from 'react';
import {BuildingType,type Player,type UnitGroup,type GameState} from '../types';
import {TENDENCIES,type TendencyKey} from '../constants';
import {IndoorPlayer} from './IndoorPlayer';
import {Sheet} from './ui';
interface Props{
 roster:Player[];club:GameState;blocked:boolean;playerFilter:UnitGroup|null;
 onFilterChange:(unit:UnitGroup|null)=>void;onClose:()=>void;onCutPlayer?:(id:string)=>void;onScout?:()=>void;
 onOpenPractice?:(id?:string)=>void;onOpenWeightRoom:(playerId?:string)=>void;onOpenFacility?:(type:BuildingType,id?:string)=>void;
}
export const SquadModal:React.FC<Props>=({roster,club,blocked,playerFilter,onFilterChange,onClose,onCutPlayer,onScout,onOpenWeightRoom,onOpenFacility,onOpenPractice})=>{
 const[search,setSearch]=useState(''),[sort,setSort]=useState('power'),[release,setRelease]=useState<string|null>(null);
 const shown=roster.filter(p=>(!playerFilter||p.unit===playerFilter)&&`${p.name} ${p.role} ${p.rarity}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>(sort==='growth'?a.level-b.level:unitPower(b)-unitPower(a))||a.name.localeCompare(b.name));
 const mean=Math.round(roster.reduce((sum,p)=>sum+unitPower(p),0)/Math.max(1,roster.length));
 const openWork=(p:Player)=>{const work=playerWork(club,p.id);if(work.destination==='practice')onOpenPractice?.(p.id);else if(work.destination==='weights')onOpenWeightRoom(p.id);else onOpenFacility?.(work.destination==='film'?BuildingType.TACTICS_ROOM:BuildingType.MEDICAL_CENTER,p.id)};
 return <Sheet title="Your roster" subtitle={`${roster.length} athletes · ${mean} average Power`} onClose={onClose} maxWidth="max-w-6xl">
  <div className="fhq-roster-workspace">
   <header className="fhq-roster-intro"><div><small>BUILD YOUR TEAM</small><h3>Know your players. Grow their game.</h3><p>Choose an attribute to plan that athlete’s group session.</p></div><button onClick={onScout}>Scout a player ↗</button></header>
   <div className="fhq-roster-filters">
    <input aria-label="Find a player" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a player or position"/>
    <select aria-label="Player group" value={playerFilter??'all'} onChange={e=>onFilterChange(e.target.value==='all'?null:e.target.value as UnitGroup)}><option value="all">All positions</option>{Object.entries(indoorGroupName).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>
    <select aria-label="Sort roster" value={sort} onChange={e=>setSort(e.target.value)}><option value="power">Highest Power</option><option value="growth">Lowest level</option></select>
   </div>
   {blocked&&<p role="status">Confirming your club change…</p>}
   {!shown.length&&<div role="status">No matching players.<button onClick={()=>{setSearch('');onFilterChange(null);}}>Show all players</button></div>}
   <div className="fhq-roster-grid">{shown.map(p=>{
    const work=playerWork(club,p.id),trait=TENDENCIES[p.tendency as TendencyKey],busy=work.state!=='available';
    return <article key={p.id} className="fhq-athlete-card" aria-label={`${p.name}, ${p.role}, level ${p.level}`} data-player-id={p.id}>
     <div className="fhq-athlete-heading"><div className="fhq-athlete-art"><IndoorPlayer unit={p.unit} label={`${p.name} in club practice kit`}/></div><div><small>{p.role} · {p.rarity} · L{p.level}</small><h3>{p.name}</h3><span className="fhq-athlete-status" data-state={work.state}>{work.title}</span></div><div className="fhq-athlete-power"><strong>{unitPower(p)}</strong><small>Power</small></div></div>
     <div className="fhq-athlete-development" aria-label={`${p.name} development`}>
      <button aria-label={`Train ${p.name} Strength in Weight Room`} onClick={()=>onOpenWeightRoom(p.id)}><span>Strength</span><strong>{p.stats.strength}<small> / {p.maxStat}</small></strong><span>Weight Room ↗</span></button>
      <button aria-label={`Train ${p.name} Speed at Practice Field`} onClick={()=>onOpenPractice?.(p.id)}><span>Speed</span><strong>{p.stats.speed}<small> / {p.maxStat}</small></strong><span>Practice Field ↗</span></button>
      <button aria-label={`Train ${p.name} IQ in Film Room`} onClick={()=>onOpenFacility?.(BuildingType.TACTICS_ROOM,p.id)}><span>Football IQ</span><strong>{p.stats.iq}<small> / {p.maxStat}</small></strong><span>Film Room ↗</span></button>
     </div>
     {busy&&<button className="fhq-athlete-current" onClick={()=>openWork(p)}>{work.action} · {journeyTime(work.finishTime,Date.now())||work.detail} →</button>}
     <p className="fhq-athlete-trait">{trait?`${trait.label} · ${trait.desc}`:'Develop this player to strengthen your team.'}</p>
     {onCutPlayer&&roster.length>6&&<button className="fhq-athlete-release" disabled={blocked||busy} aria-label={`Release ${p.name}`} onClick={()=>setRelease(p.id)}>Release player…</button>}
     {release===p.id&&<div className="fhq-roster-release-confirm"><p>Release {p.name}? This frees one roster spot.</p><button disabled={blocked} onClick={()=>{onCutPlayer?.(p.id);setRelease(null);}}>Confirm release</button><button onClick={()=>setRelease(null)}>Keep player</button></div>}
    </article>;
   })}</div>
   <p className="fhq-roster-explainer">Power combines position, rarity, level and trained attributes. The numbers above show trained attributes and potential. Weight Room also raises player level, which improves role-based combat attributes.</p>
   <nav className="fhq-roster-destinations" aria-label="Player development rooms"><button onClick={()=>onOpenWeightRoom()}>Weight Room</button><button onClick={()=>onOpenFacility?.(BuildingType.MEDICAL_CENTER)}>Recovery</button><button onClick={()=>onOpenFacility?.(BuildingType.TACTICS_ROOM)}>Film Room</button><button onClick={()=>onOpenPractice?.()}>Practice Field</button></nav>
  </div>
 </Sheet>;
};
