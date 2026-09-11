import {unitPower} from '../battle';
import {playerGrowth} from '../game/progression/playerGrowth';
import {playerCampusActivity} from '../game/campusActivities';
import {indoorGroupName} from '../game/indoorPlayers';
import React,{useState} from 'react';
import {BuildingType,type Player,type UnitGroup,type GameState} from '../types';
import {TENDENCIES,type TendencyKey} from '../constants';
import {IndoorPlayer} from './IndoorPlayer';
import {Sheet} from './ui';
interface Props{
 roster:Player[];club:GameState;blocked:boolean;playerFilter:UnitGroup|null;
 onFilterChange:(unit:UnitGroup|null)=>void;onClose:()=>void;onCutPlayer?:(id:string)=>void;onScout?:()=>void;
 onOpenWeightRoom:(playerId?:string)=>void;onOpenFacility?:(type:BuildingType)=>void;
}
export const SquadModal:React.FC<Props>=({roster,club,blocked,playerFilter,onFilterChange,onClose,onCutPlayer,onScout,onOpenWeightRoom,onOpenFacility})=>{
 const[search,setSearch]=useState(''),[sort,setSort]=useState('power'),[release,setRelease]=useState<string|null>(null);
 const shown=roster.filter(p=>(!playerFilter||p.unit===playerFilter)&&`${p.name} ${p.role} ${p.rarity}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>(sort==='growth'?a.level-b.level:unitPower(b)-unitPower(a))||a.name.localeCompare(b.name));
 const mean=Math.round(roster.reduce((sum,p)=>sum+unitPower(p),0)/Math.max(1,roster.length));
 return <Sheet title="Your roster" subtitle={`${roster.length} teammates · ${mean} average Power`} onClose={onClose} maxWidth="max-w-6xl">
  <div className="fhq-roster-workspace">
   <nav className="fhq-roster-destinations" aria-label="Player development rooms">
    <button onClick={()=>onOpenWeightRoom()}>Weight Room<small>Train & grow</small></button>
    <button onClick={()=>onOpenFacility?.(BuildingType.MEDICAL_CENTER)}>Recovery<small>Rest & recharge</small></button>
    <button onClick={()=>onOpenFacility?.(BuildingType.TACTICS_ROOM)}>Film Room<small>Study the game</small></button>
    <button onClick={onScout}>Scouting<small>Find a teammate</small></button>
   </nav>
   <div className="fhq-roster-filters">
    <input aria-label="Find a player" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a player or position"/>
    <select aria-label="Player group" value={playerFilter??'all'} onChange={e=>onFilterChange(e.target.value==='all'?null:e.target.value as UnitGroup)}><option value="all">All positions</option>{Object.entries(indoorGroupName).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>
    <select aria-label="Sort roster" value={sort} onChange={e=>setSort(e.target.value)}><option value="power">Highest Power</option><option value="growth">Lowest level</option></select>
   </div>
   <p className="fhq-roster-explainer">Power includes position, rarity and training. Next-level gains are shown on every card.</p>
   {blocked&&<p role="status">Confirming your club change…</p>}
   {!shown.length&&<div role="status">No matching players.<button onClick={()=>{setSearch('');onFilterChange(null);}}>Show all players</button></div>}
   <div className="fhq-roster-grid">{shown.map(p=>{
    const growth=playerGrowth(club,p.id,Date.now())!,activity=playerCampusActivity(club,p.id),trait=TENDENCIES[p.tendency as TendencyKey];
    return <article key={p.id} className="fhq-roster-card" aria-label={`${p.name}, ${p.role}, level ${p.level}`}>
     <div className="fhq-roster-portrait"><IndoorPlayer unit={p.unit} label={`${p.name} in club practice kit`}/><span>{p.role}</span></div>
     <div className="fhq-roster-identity"><p>{p.rarity} · Level {p.level}</p><h3>{p.name}</h3><button className="fhq-roster-location" onClick={()=>activity.building===BuildingType.TRAINING_PITCH?onOpenWeightRoom(p.id):onOpenFacility?.(activity.building)}>{activity.label} →</button></div>
     <div className="fhq-roster-power"><strong>{Math.round(unitPower(p))}</strong><small>POWER</small><span>→ {Math.round(growth.nextStep.after.combat.power)} next</span></div>
     <dl className="fhq-roster-stats">{[['Strength',p.stats.strength],['Speed',p.stats.speed],['IQ',p.stats.iq]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value} <span>→ {Number(value)+1}</span></dd></div>)}</dl>
     <p className="fhq-roster-trait">{trait?`${trait.label} · ${trait.desc}`:'Keep training to strengthen this position.'}</p>
     <div className="fhq-roster-card-actions"><button onClick={()=>onOpenWeightRoom(p.id)}>{growth.training.kind==='training'?(growth.training.collectable?'Collect growth':'View workout'):`Train ${p.name}`}<small>{growth.training.kind==='training'?'Current group session':`Next: Level ${p.level+1} · +1 to each stat`}</small></button>
      {onCutPlayer&&roster.length>6&&<button className="fhq-roster-release" disabled={blocked} aria-label={`Release ${p.name}`} onClick={()=>setRelease(p.id)}>Release</button>}</div>
     {release===p.id&&<div className="fhq-roster-release-confirm"><p>Release {p.name}? This frees one roster spot.</p><button disabled={blocked} onClick={()=>{onCutPlayer?.(p.id);setRelease(null);}}>Confirm release</button><button onClick={()=>setRelease(null)}>Keep player</button></div>}
    </article>;
   })}</div>
  </div>
 </Sheet>;
};
