import {DevelopmentPanel} from './DevelopmentPanel';
import {currentDevelopmentBlock,scheduledPlayers} from '../game/development';
import type {ClubAction} from '../game/authority/clubActions';
import {WeightRoomScene} from './WeightRoomScene';
import React,{useEffect,useRef,useState} from 'react';
import {BuildingType,DrillState,type GameState,type BuildingInstance} from '../types';
import {DRILLS,trainingYieldMult,UPGRADE_CONFIG,upgradeDurationSecs} from '../constants';
import {playerGrowth,drillEffects} from '../game/progression/playerGrowth';
import {IndoorPlayer} from './IndoorPlayer';
import {indoorGroupName} from '../game/indoorPlayers';
import {Sheet} from './ui';

const WORKOUTS:Record<string,string>={sled_push:'Strength circuit',routes:'Explosive movement',tackle_dummy:'Power circuit',coverage:'Agility circuit',scrimmage:'Whole-team conditioning'};
export function WeightRoom({club,blocked,initialPlayer,onClose,onStart,onCollect,onUpgrade,onGameDay,onRoster,onOpenFacility,onAction,onPractice}:{onAction?:(a:ClubAction)=>void;onPractice?:()=>void;club:GameState;blocked:boolean;initialPlayer?:string;onClose:()=>void;onStart:(unit:GameState['roster'][number]['unit'],id:string)=>void;onCollect:(b:BuildingInstance)=>void;onUpgrade:(id:string,cost:number)=>void;onGameDay:()=>void;onRoster?:()=>void;onOpenFacility?:(type:BuildingType)=>void}){
 const [selected,setSelected]=useState(initialPlayer??club.roster[0]?.id);const[now,setNow]=useState(Date.now());
 const [celebrate,setCelebrate]=useState<{name:string;level:number;count:number}|null>(null);
 const previous=useRef(new Map(club.roster.map(p=>[p.id,p.level])));
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer)},[]);
 useEffect(()=>{const grown=club.roster.filter(p=>p.level>(previous.current.get(p.id)??p.level));if(grown.length){const focus=grown.find(p=>p.id===selected)??grown[0];setCelebrate({name:focus.name,level:focus.level,count:grown.length})}previous.current=new Map(club.roster.map(p=>[p.id,p.level]));},[club.roster,selected]);
 const building=club.buildings.find(b=>b.type===BuildingType.TRAINING_PITCH);
 const player=club.roster.find(p=>p.id===selected)??club.roster[0];
 if(!building||!player)return <Sheet title="Weight Room" onClose={onClose}><p className="p-5 text-white">Recruit your first player to begin working out.</p></Sheet>;
 const active=building.activeDrillId?DRILLS[building.activeDrillId]:null;
 const scheduled=currentDevelopmentBlock(club);const working=building.state===DrillState.ACTIVE||scheduled?.station==='weights';const ready=building.state===DrillState.COMPLETED;
 const participants=scheduled?(scheduled.station==='weights'?scheduledPlayers(club):[]):club.roster.filter(p=>active?(active.targetUnit==='ALL'||p.unit===building.targetUnit):p.unit===player.unit);
 const growth=playerGrowth(club,player.id,now)!;
 const effects=drillEffects(club,player.unit).filter(e=>e.targetUnit==='ALL'||e.targetUnit===player.unit);
 const progress=active?Math.min(1,Math.max(0,(now-(building.startTime??now))/(active.durationSeconds*1000))):0;
 const remaining=Math.max(0,Math.ceil(((building.finishTime??now)-now)/1000));
 const cost=Math.floor(UPGRADE_CONFIG.baseCost*Math.pow(UPGRADE_CONFIG.costMultiplier,building.level-1));
 const stadium=club.buildings.find(b=>b.type===BuildingType.STADIUM)?.level??1;
 const job=club.upgrades.find(j=>j.kind==='building'&&j.key===building.id);
 const upgradeBlocked=blocked||!!job||building.level>=stadium||club.upgrades.length>=club.builders||club.resources.COINS<cost;
 return <Sheet title="Weight Room" subtitle={`Level ${building.level} · ${club.resources.ENERGY} Energy · ${club.resources.COINS.toLocaleString()} Coins`} onClose={onClose} maxWidth="max-w-6xl">
 <div className="fhq-weight-room">
 <section className="fhq-weight-scene" aria-label="Inside your Weight Room">
 <div className="fhq-weight-room-sign"><small>{working?`${participants.length} teammates in this session`:ready?'Session complete · collect your growth':`${indoorGroupName[player.unit]} · ${participants.length} of ${club.roster.length} teammates`}</small></div>
 <WeightRoomScene level={building.level} participants={participants} selected={player.id} working={working} ready={ready} onSelect={setSelected}/>

 <div className={`fhq-weight-session ${active?'':'is-idle'}`} aria-live="polite">{active?<><strong>{WORKOUTS[active.id]??active.name}</strong><span>{ready?'Ready to collect':remaining?`${remaining}s remaining`:'Finishing your workout…'}</span><progress max="1" value={ready?1:progress}/><small>{participants.map(p=>p.name).join(' · ')}</small></>:<><strong>Your team’s home for growth</strong><span>Quick sessions. Permanent player improvements.</span></>}</div>
 <nav className="fhq-player-room-nav" aria-label="Continue with your players"><button onClick={onRoster}>Your roster</button><button onClick={()=>onOpenFacility?.(BuildingType.MEDICAL_CENTER)}>Recovery</button><button onClick={()=>onOpenFacility?.(BuildingType.TACTICS_ROOM)}>Film Room</button></nav>
 </section>
 <section className="fhq-weight-controls">
 <section className="fhq-weight-upgrade"><h3>Build a better room</h3><p>Level {building.level+1}: strength session {Math.max(20,Math.round(60/(1+(building.level-1)*.12)))}s → {Math.max(20,Math.round(60/(1+building.level*.12)))}s.</p><button disabled={upgradeBlocked} onClick={()=>onUpgrade(building.id,cost)}>{job?`Upgrading to L${job.toLevel}`:building.level>=stadium?`Requires Stadium L${building.level+1}`:`Upgrade room · ${cost.toLocaleString()} Coins`}</button><small>Level 3 renovates the room with performance equipment</small><small>{upgradeDurationSecs(building.level+1)}s build · {club.builders-club.upgrades.length} builders available</small></section>
 {!active&&<DevelopmentPanel key={player.unit} initialUnit={player.unit} club={club} station="weights" blocked={blocked||!onAction} onAction={a=>onAction?.(a)}/>}
 {celebrate&&active&&<div className="fhq-weight-earned" role="status"><strong>Level {celebrate.level} · {celebrate.name}</strong><p>{celebrate.count} teammates improved. +1 Strength, Speed and IQ each.</p><button onClick={onGameDay}>Take your stronger team to Game Day →</button></div>}
 {active&&<><div className="fhq-weight-player"><IndoorPlayer unit={player.unit}/><label className="fhq-weight-player-label">{active?'Follow a player · session group stays unchanged':'Choose a player to bring their group inside'}<select aria-label="Follow a player" value={player.id} onChange={e=>setSelected(e.target.value)}>{club.roster.map(p=><option key={p.id} value={p.id}>{p.name} · {p.role} · L{p.level}</option>)}</select></label></div>
 <div className="fhq-weight-growth">{[['Strength',player.stats.strength],['Speed',player.stats.speed],['IQ',player.stats.iq]].map(([name,value])=><div key={name}><small>{name}</small><strong>{value} <span>→ {Number(value)+1}</span></strong></div>)}</div>
 <p className="fhq-weight-impact">On the field: Grit {Math.round(growth.combat.statline.hp)} → <b>{Math.round(growth.nextStep.after.combat.statline.hp)}</b> · Yardage {Math.round(growth.combat.statline.dps)} → <b>{Math.round(growth.nextStep.after.combat.statline.dps)}</b></p>
 {blocked&&<p role="status" className="fhq-weight-notice">Waiting for club confirmation…</p>}
 {active?<button className="fhq-weight-primary" disabled={blocked||!ready} onClick={()=>onCollect(building)}>{ready?'Collect player growth':`Working out · ${remaining}s`} · +{Math.round(active.rewardCoins*trainingYieldMult(building.level))} Coins</button>:<div className="fhq-weight-workouts">{effects.map(effect=><button key={effect.drillId} disabled={blocked||!effect.canStart} onClick={()=>{setCelebrate(null);onStart(player.unit,effect.drillId)}}><strong>{WORKOUTS[effect.drillId]??effect.name}</strong><span>{effect.durationSeconds}s · {effect.energyCost} Energy · +{effect.coins} Coins</span><small>{effect.playersAffected} teammates grow · +{effect.readinessGain} readiness{!effect.unlocked?` · Room L${effect.levelReq} unlock` : !effect.canStart?' · '+(effect.blockers[0]?.message.replace(/Training Field/g,'Weight Room')??'Unavailable'):''}</small></button>)}</div>}
 </>}
 <nav className="fhq-player-room-nav"><button onClick={onPractice}>Practice Field</button></nav>


 </section></div></Sheet>
}
