import React,{useEffect,useRef,useState} from 'react';
import {BuildingType,type GameState,type Player,type ResourceType,type BuildingInstance,type RecruitSlot,type UpgradeJob} from '../types';
import {RECRUIT_CONFIG} from '../constants';
import {rosterCap,rollBoard,candidateOvr,recruitCost,recruitSeconds} from '../recruiting';
import {prospectComparison} from '../game/progression/rosterCompare';
import {IndoorPlayer} from './IndoorPlayer';
import {Sheet} from './ui';
import {FacilityInterior} from './FacilityInterior';
import {FacilityGoals,FacilityUpgrade,roomTime} from './FacilityUpgrade';
interface Props {
 club:GameState;resources:Record<ResourceType,number>;roster:Player[];recruitSlot:RecruitSlot|null;academy:BuildingInstance;stadiumLevel:number;upgradeJob?:UpgradeJob;
 onRoster?:()=>void;blocked?:boolean;onClose:()=>void;onStartRecruit:(candidate:Player,cost:number)=>void;onRush:()=>void;onSign:()=>void;onUpgrade:(id:string,cost:number)=>void;
 onFinishNow?:(id:string)=>void;onHireBuilder?:()=>void;board?:Player[];onRefreshBoard?:()=>void;
}
export const ScoutingModal:React.FC<Props>=({club,resources,roster,recruitSlot,academy,onClose,onStartRecruit,onRush,onSign,onUpgrade,onFinishNow,onHireBuilder,board:issuedBoard,onRefreshBoard,onRoster,blocked=false})=>{
 const [localBoard,setLocalBoard]=useState<Player[]>(()=>issuedBoard?[]:rollBoard()),[selectedId,setSelectedId]=useState<string|null>(null);
 const board=issuedBoard??localBoard,selected=recruitSlot?.candidate??board.find(p=>p.id===selectedId)??board[0];
 const prevSlot=useRef(recruitSlot);
 useEffect(()=>{if(prevSlot.current&&!recruitSlot&&!issuedBoard)setLocalBoard(rollBoard());prevSlot.current=recruitSlot},[recruitSlot,issuedBoard]);
 const boardRequested=useRef(false);
 useEffect(()=>{if(issuedBoard?.length)boardRequested.current=false;else if(issuedBoard&&!recruitSlot&&!blocked&&!boardRequested.current){boardRequested.current=true;onRefreshBoard?.()}},[issuedBoard,recruitSlot,blocked,onRefreshBoard]);
 const cap=rosterCap(academy.level),full=roster.length>=cap,now=Date.now(),ready=!!recruitSlot&&now>=recruitSlot.finishTime;
 const comparison=selected?prospectComparison({...club,recruitBoard:{candidates:[selected],generatedAt:now}},selected.id):null;
 const best=comparison?.comparable;
 return <Sheet title="Scouting Dept" subtitle={`Inside · Level ${academy.level} · Roster ${roster.length}/${cap} · ${resources.COINS.toLocaleString()} Coins`} onClose={onClose} maxWidth="max-w-6xl">
  <div className="fhq-department fhq-scout-room">
   <div className="fhq-department-scene"><FacilityInterior type={BuildingType.YOUTH_ACADEMY}>{selected&&<div className="fhq-room-prospect"><IndoorPlayer unit={selected.unit} label={`${selected.name}, ${selected.role}, in practice clothes`}/><span>{selected.name}<small>{recruitSlot?(ready?'Ready to sign':'Scouting in progress'):'Prospect · not yet signed'}</small></span></div>}</FacilityInterior></div>
   <div className="fhq-department-controls">
    {blocked&&<p role="status">Confirming your club change…</p>}
    <section className="fhq-room-activity">
     {!recruitSlot&&<div className="fhq-scout-selector"><label>Prospect report<select aria-label="Prospect report" value={selected?.id??''} onChange={e=>setSelectedId(e.target.value)}>{board.map(p=><option key={p.id} value={p.id}>{p.name} · {p.role} · OVR {candidateOvr(p)} · {recruitCost(p)} Coins</option>)}</select></label><button disabled={blocked} onClick={()=>issuedBoard?onRefreshBoard?.():setLocalBoard(rollBoard())}>New prospects</button></div>}
     {!selected&&<p role="status">No prospects loaded. Choose New prospects to try again.</p>}
     {selected&&comparison&&<>
      <header className="fhq-scout-name"><h3>{selected.name}</h3><span>{selected.role} · {selected.rarity} · OVR {candidateOvr(selected)}</span></header>
      <div className="fhq-room-stats">{(['strength','speed','iq'] as const).map(stat=><div key={stat}><strong>{best&&<span>{best.stats[stat]} → </span>}{selected.stats[stat]}</strong><small>{stat==='iq'?'IQ':stat[0].toUpperCase()+stat.slice(1)}</small></div>)}</div>
      <p>{best?`Compared with ${best.name} · ${comparison.ovr-best.ovr>0?'+':''}${comparison.ovr-best.ovr} OVR`:`Your first ${selected.role} player`} · {comparison.depth.atRole} currently at this position.</p>
      <p className="fhq-scout-note">Signing adds a teammate. Workouts then grow their level and stats.</p>
      {full&&<p role="status" className="fhq-room-warning">Roster full · upgrade this department or make room in your roster.</p>}
      <div className="fhq-scout-decision">{recruitSlot?<div className="fhq-room-recruit-job">
       <strong>{ready?'Report complete · ready to sign':`Scouting · ${roomTime((recruitSlot.finishTime-now)/1000)}`}</strong>
       <progress aria-label="Scouting progress" max={1} value={Math.max(0,Math.min(1,1-(recruitSlot.finishTime-now)/1000/recruitSeconds(selected)))}/>
       <button disabled={blocked|| (ready?full:resources.GEMS<RECRUIT_CONFIG.rushGemCost)} onClick={ready?onSign:onRush}>{ready?'Sign player':`Rush report · ${RECRUIT_CONFIG.rushGemCost} Crowns`}</button>
      </div>:<button className="fhq-room-primary" disabled={blocked||!comparison.canScout} onClick={()=>onStartRecruit(selected,recruitCost(selected))}>{full?'Roster full':`Scout · ${recruitCost(selected).toLocaleString()} Coins · ${roomTime(recruitSeconds(selected))}`}</button>}<button className="fhq-room-roster" onClick={onRoster}>Roster · {roster.length}/{cap}</button></div>
      {!recruitSlot&&!full&&resources.COINS<recruitCost(selected)&&<p role="status">Need {(recruitCost(selected)-resources.COINS).toLocaleString()} more Coins.</p>}
     </>}
     {!selected&&<button className="fhq-room-roster" onClick={onRoster}>Roster · {roster.length}/{cap}</button>}
    </section>
    <FacilityUpgrade club={club} building={academy} blocked={blocked} onUpgrade={onUpgrade} onFinishNow={onFinishNow} onHireBuilder={onHireBuilder}/>
   </div>
   <FacilityGoals building={academy}/>
  </div>
 </Sheet>;
};
