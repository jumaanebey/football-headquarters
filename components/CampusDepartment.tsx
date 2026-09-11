import {DevelopmentPanel} from './DevelopmentPanel';
import {StadiumFootball} from './StadiumFootball';
import {FootballPlayView} from './FootballPlayView';
import {FOOTBALL_PLAYS,currentDevelopmentBlock,type FootballPlay} from '../game/development';
import type {ClubAction} from '../game/authority/clubActions';
import {useState,useEffect} from 'react';
import {DepartmentLife} from './DepartmentLife';
import {campusActivities} from '../game/campusActivities';
import {Sheet} from './ui';
import {FacilityInterior} from './FacilityInterior';
import {FacilityGoals,FacilityUpgrade,roomTime} from './FacilityUpgrade';
import {FACILITY_INFO} from '../game/facilityPresentation';
import {BuildingType,type BuildingInstance,type GameState} from '../types';
import {collectorCap,collectorRate,energyIntervalMs} from '../constants';

export function CampusDepartment({initialPlayer,club,building,blocked,onClose,onUpgrade,onCollect,onFinishNow,onHireBuilder,onDefense,onProgram,onGameDay,onWeightRoom,onRoster,onFilmArchive,onAction,onPractice}:{
  initialPlayer?:string;onAction?:(a:ClubAction)=>void;onPractice?:()=>void;
  club:GameState;building:BuildingInstance;blocked:boolean;onClose:()=>void;onUpgrade:(id:string,cost:number)=>void;
  onCollect?:(building:BuildingInstance)=>void;onFinishNow?: (id:string)=>void;onHireBuilder?:()=>void;
  onDefense?:()=>void;onProgram?:()=>void;onGameDay?:()=>void;onWeightRoom?:()=>void;onRoster?:()=>void;onFilmArchive?:()=>void;
}) {
  const [playing,setPlaying]=useState(true),[play,setPlay]=useState<FootballPlay>('slants');
  const activeFilm=currentDevelopmentBlock(club);
  useEffect(()=>{if(activeFilm?.station==='film')setPlay(activeFilm.play)},[activeFilm?.id]);
  const attendance=campusActivities(club);
  const followed=club.roster.find(p=>p.id===initialPlayer);
  const type=building.type,energy=Math.min(100,club.resources.ENERGY),interval=energyIntervalMs(building.level);
  const toFull=Math.max(0,((100-energy)*interval-(club.energyProgressMs??0))/1000);
  const stored=Math.floor(building.accrued??0),cap=collectorCap(type,building.level);
  if(type===BuildingType.STADIUM&&club.stadiumFootball?.game&&!club.stadiumFootball.game.collected)return <Sheet key="football-game" title="Stadium football" subtitle={`${club.teamName} · ${energy}/100 Energy`} onClose={onClose} maxWidth="max-w-6xl"><div className="fhq-football-workspace"><StadiumFootball club={club} blocked={blocked||!onAction} onAction={a=>onAction?.(a)}/></div></Sheet>;
  return <Sheet title={FACILITY_INFO[type].name} subtitle={`Inside · Level ${building.level} · ${club.resources.COINS.toLocaleString()} Coins`} onClose={onClose} maxWidth="max-w-6xl">
    <div className="fhq-department">
      <div className="fhq-department-scene"><FacilityInterior type={type} level={building.level}><DepartmentLife club={club} type={type} playing={playing} play={play}/></FacilityInterior>
       <div className="fhq-room-residents">{type===BuildingType.TACTICS_ROOM?<><button className="fhq-film-control" aria-pressed={!playing} onClick={()=>setPlaying(p=>!p)}>{playing?'Pause film':'Play film'}</button><strong>{activeFilm?.station==='film'?'Studying':'Preview'} · {FOOTBALL_PLAYS[play].name}</strong><p>{attendance.film.length?attendance.film.map(p=>p.name).join(' · ')+' are in the room.':'The team is busy in other rooms. Practice film is ready.'} {activeFilm?.station==='film'?'Scheduled study earns progress.':'No study session is running.'}</p></>:type===BuildingType.MEDICAL_CENTER?<><strong>Recovery lounge</strong><p>{attendance.recovery.length?attendance.recovery.map((p,i)=>`${p.name} · ${['foam rolling','hydrating','cold plunge'][i]}`).join(' / '):'The team is working out. Recovery stations are ready.'} Energy belongs to the whole club.</p></>:<><strong>Getting ready for Game Day</strong><p>{attendance.stadium.length?attendance.stadium.map(p=>p.name).join(' · '):'Your teammates are in training, recovery or film study.'}</p></>}</div>
       <nav className="fhq-player-room-nav" aria-label="Continue with your players"><button onClick={onRoster}>Your roster</button>{type===BuildingType.TACTICS_ROOM&&<button onClick={onFilmArchive}>Defense replays</button>}</nav>
      </div>
      <div className="fhq-department-controls">
        {blocked&&<p role="status">Confirming your club change…</p>}

        {type===BuildingType.TACTICS_ROOM&&<><div className="fhq-play-choices" aria-label="Choose a football play">{(Object.keys(FOOTBALL_PLAYS) as FootballPlay[]).map(key=><button key={key} aria-pressed={play===key} disabled={activeFilm?.station==='film'} onClick={()=>setPlay(key)}>{FOOTBALL_PLAYS[key].name}</button>)}</div><DevelopmentPanel afterAction={<FacilityUpgrade club={club} building={building} blocked={blocked} onUpgrade={onUpgrade} onFinishNow={onFinishNow} onHireBuilder={onHireBuilder}/>} key={followed?.id??"film"} initialUnit={followed?.unit??"ALL"} focusedPlayer={followed?.name} club={club} station="film" play={play} blocked={blocked||!onAction} onAction={a=>onAction?.(a)}/><FootballPlayView play={play} playing={playing}/></>}
        {type===BuildingType.MEDICAL_CENTER&&<><div className="fhq-room-stats"><div><strong>{energy}/100</strong><small>Club Energy</small></div><div><strong>{(60000/interval).toFixed(1)}/min</strong><small>Passive recovery</small></div></div><DevelopmentPanel afterAction={<FacilityUpgrade club={club} building={building} blocked={blocked} onUpgrade={onUpgrade} onFinishNow={onFinishNow} onHireBuilder={onHireBuilder}/>} key={followed?.id??"rehab"} initialUnit={followed?.unit??"ALL"} focusedPlayer={followed?.name} club={club} station="rehab" blocked={blocked||!onAction} onAction={a=>onAction?.(a)}/></>}
        {type===BuildingType.STADIUM&&<StadiumFootball club={club} blocked={blocked||!onAction} onAction={a=>onAction?.(a)}/>}
        {type===BuildingType.STADIUM&&<section className="fhq-room-activity"><h3>{club.teamName} · home field</h3>
          <div className="fhq-room-stats"><div><strong>{stored.toLocaleString()}</strong><small>Coins ready / {cap.toLocaleString()}</small></div><div><strong>{Math.round(collectorRate(type,building.level)*60)}/min</strong><small>Gate income</small></div><div><strong>{club.resources.FANS}</strong><small>Home Fans</small></div></div>
          <div className="fhq-room-actions"><button disabled={blocked||stored<30} onClick={()=>onCollect?.(building)}>{stored<30?'Collect at 30 Coins':`Collect ${stored.toLocaleString()} Coins`}</button><button onClick={onProgram}>Your program</button></div>
        </section>}
        {type===BuildingType.STADIUM&&<FacilityUpgrade club={club} building={building} blocked={blocked} onUpgrade={onUpgrade} onFinishNow={onFinishNow} onHireBuilder={onHireBuilder}/>}
        <nav className="fhq-player-room-nav"><button onClick={onPractice}>Practice Field</button><button onClick={onGameDay}>Base raids</button></nav>
      </div>
      <FacilityGoals building={building}/>
    </div>
  </Sheet>;
}
