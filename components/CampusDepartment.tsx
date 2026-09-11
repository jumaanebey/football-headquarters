import {useState} from 'react';
import {DepartmentLife} from './DepartmentLife';
import {campusActivities} from '../game/campusActivities';
import {Sheet} from './ui';
import {FacilityInterior} from './FacilityInterior';
import {FacilityGoals,FacilityUpgrade,roomTime} from './FacilityUpgrade';
import {FACILITY_INFO} from '../game/facilityPresentation';
import {BuildingType,type BuildingInstance,type GameState} from '../types';
import {collectorCap,collectorRate,energyIntervalMs,warRoomReadinessMult} from '../constants';
import {CAMPAIGN_STAGES} from '../campaign';

export function CampusDepartment({club,building,blocked,onClose,onUpgrade,onCollect,onFinishNow,onHireBuilder,onDefense,onProgram,onGameDay,onWeightRoom,onRoster,onFilmArchive}:{
  club:GameState;building:BuildingInstance;blocked:boolean;onClose:()=>void;onUpgrade:(id:string,cost:number)=>void;
  onCollect?:(building:BuildingInstance)=>void;onFinishNow?: (id:string)=>void;onHireBuilder?:()=>void;
  onDefense?:()=>void;onProgram?:()=>void;onGameDay?:()=>void;onWeightRoom?:()=>void;onRoster?:()=>void;onFilmArchive?:()=>void;
}) {
  const [playing,setPlaying]=useState(true);
  const attendance=campusActivities(club);
  const type=building.type,energy=Math.min(100,club.resources.ENERGY),interval=energyIntervalMs(building.level);
  const toFull=Math.max(0,((100-energy)*interval-(club.energyProgressMs??0))/1000);
  const stored=Math.floor(building.accrued??0),cap=collectorCap(type,building.level);
  const nextStage=CAMPAIGN_STAGES.find(s=>!club.campaign.claimed.includes(s.stage));
  return <Sheet title={FACILITY_INFO[type].name} subtitle={`Inside · Level ${building.level} · ${club.resources.COINS.toLocaleString()} Coins`} onClose={onClose} maxWidth="max-w-6xl">
    <div className="fhq-department">
      <div className="fhq-department-scene"><FacilityInterior type={type}><DepartmentLife club={club} type={type} playing={playing}/></FacilityInterior>
       <div className="fhq-room-residents">{type===BuildingType.TACTICS_ROOM?<><button className="fhq-film-control" aria-pressed={!playing} onClick={()=>setPlaying(p=>!p)}>{playing?'Pause film':'Play film'}</button><strong>Now showing · crossing route</strong><p>{attendance.film.length?attendance.film.map(p=>p.name).join(' · ')+' are watching.':'The team is busy in other rooms. Practice film is ready.'} Practice footage; your recorded home games are in Defense replays.</p></>:type===BuildingType.MEDICAL_CENTER?<><strong>Recovery lounge</strong><p>{attendance.recovery.length?attendance.recovery.map((p,i)=>`${p.name} · ${['foam rolling','hydrating','cold plunge'][i]}`).join(' / '):'The team is working out. Recovery stations are ready.'} Energy belongs to the whole club.</p></>:<><strong>Getting ready for Game Day</strong><p>{attendance.stadium.length?attendance.stadium.map(p=>p.name).join(' · '):'Your teammates are in training, recovery or film study.'}</p></>}</div>
       <nav className="fhq-player-room-nav" aria-label="Continue with your players"><button onClick={onRoster}>Your roster</button>{type===BuildingType.TACTICS_ROOM&&<button onClick={onFilmArchive}>Defense replays</button>}</nav>
      </div>
      <div className="fhq-department-controls">
        {blocked&&<p role="status">Confirming your club change…</p>}
        {type===BuildingType.STADIUM&&<section className="fhq-room-activity"><h3>{club.teamName} · home field</h3>
          <div className="fhq-room-stats"><div><strong>{stored.toLocaleString()}</strong><small>Coins ready / {cap.toLocaleString()}</small></div><div><strong>{Math.round(collectorRate(type,building.level)*60)}/min</strong><small>Gate income</small></div><div><strong>{club.resources.FANS}</strong><small>Home Fans</small></div></div>
          <div className="fhq-room-actions"><button disabled={blocked||stored<30} onClick={()=>onCollect?.(building)}>{stored<30?'Collect at 30 Coins':`Collect ${stored.toLocaleString()} Coins`}</button><button onClick={onGameDay}>Game Day</button><button onClick={onDefense}>Home defense</button><button onClick={onProgram}>Your program</button></div>
        </section>}
        {type===BuildingType.TACTICS_ROOM&&<section className="fhq-room-activity"><h3>Build your game plan</h3>
          <div className="fhq-room-stats"><div><strong>{Math.round(club.teamReadiness)}/100</strong><small>Team readiness</small></div><div><strong>+{Math.round((warRoomReadinessMult(building.level)-1)*100)}%</strong><small>Readiness per workout</small></div></div>
          <progress aria-label="Team readiness" max={100} value={club.teamReadiness}/><p>Workouts build readiness. This room makes each session count more.</p>
          <p className="fhq-room-next">{nextStage?`Season goal · ${nextStage.name}`:'Season cleared · test your team against rivals'}</p>
          <div className="fhq-room-actions"><button onClick={onWeightRoom}>Build readiness · work out</button><button onClick={onGameDay}>Prepare for Game Day</button></div>
        </section>}
        {type===BuildingType.MEDICAL_CENTER&&<section className="fhq-room-activity"><h3>{energy>=100?'Your team is recharged':'Recovery in progress'}</h3>
          <div className="fhq-room-stats"><div><strong>{energy}/100</strong><small>Energy</small></div><div><strong>{(60000/interval).toFixed(1)}/min</strong><small>Recovery rate</small></div><div><strong>{energy>=100?'Ready':roomTime(toFull)}</strong><small>{energy>=100?'Fully charged':'Until full · estimate'}</small></div></div>
          <progress aria-label="Recovered Energy" max={100} value={energy}/><p>Energy recovers automatically, including while you’re away. Upgrading this room speeds it up.</p>
          <div className="fhq-room-actions"><button onClick={onWeightRoom}>Back to the Weight Room</button><button onClick={onGameDay}>Game Day</button></div>
        </section>}
        <FacilityUpgrade club={club} building={building} blocked={blocked} onUpgrade={onUpgrade} onFinishNow={onFinishNow} onHireBuilder={onHireBuilder}/>
      </div>
      <FacilityGoals building={building}/>
    </div>
  </Sheet>;
}
