import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {createInitialState} from '../game/initialState';import {applyClubAction,settleClubState,type ClubAction} from '../game/authority/clubActions';
import {openCampusArt} from '../game/artGate';import {BuildingType} from '../types';
import {CampusDepartment} from '../components/CampusDepartment';import {ScoutingModal} from '../components/ScoutingModal';import {WeightRoom} from '../components/WeightRoom';import {GateAssignments} from '../components/GateAssignments';import {Sheet} from '../components/ui';
import '../tailwind.css';import '../game-theme.css';import '../game-motion.css';
function Fixture(){
 const [club,setClub]=useState(()=>{const s=createInitialState();s.teamName='Department Preview';s.resources.COINS=5000;s.resources.GEMS=100;s.resources.ENERGY=43;s.buildings=s.buildings.map(b=>({...b,level:b.type===BuildingType.STADIUM?3:1,accrued:b.type===BuildingType.STADIUM?300:b.accrued}));return applyClubAction(s,{type:'recruit.refresh'},{now:Date.now(),random:()=>.4}).state});
 const [view,setView]=useState(new URLSearchParams(location.search).get('room')??'STADIUM'),[notice,setNotice]=useState('');
 useEffect(()=>{const id=setInterval(()=>setClub(s=>settleClubState(s,Date.now())),500);return()=>clearInterval(id)},[]);
 const action=(command:ClubAction)=>setClub(s=>{const r=applyClubAction(s,command,{now:Date.now(),random:()=>.4});setNotice(r.ok?`${command.type} confirmed`:r.message);return r.state});
 const building=club.buildings.find(b=>b.type===view),academy=club.buildings.find(b=>b.type===BuildingType.YOUTH_ACADEMY)!;
 const upgrade=(buildingId:string)=>action({type:'facility.upgrade',buildingId}),close=()=>setView(''),finish=(jobId:string)=>action({type:'facility.rush',jobId});
 return <main className="bg-slate-950 min-h-screen p-4 text-white"><nav className="flex flex-wrap gap-4">{Object.values(BuildingType).map(t=><button key={t} onClick={()=>setView(t)}>{t}</button>)}<button onClick={()=>setView('gates')}>Gates</button></nav><p role="status">{notice}</p><p>{club.resources.COINS} Coins · {club.resources.GEMS} Crowns · {club.roster.length} players · {JSON.stringify(club.heroGates)}</p>
 {view===BuildingType.YOUTH_ACADEMY?<ScoutingModal club={club} resources={club.resources} roster={club.roster} recruitSlot={club.recruitSlot} academy={academy} stadiumLevel={3} onClose={close} onUpgrade={upgrade} onFinishNow={finish} onStartRecruit={p=>action({type:'recruit.start',candidateId:p.id})} onRush={()=>action({type:'recruit.rush'})} onSign={()=>action({type:'recruit.sign'})} board={club.recruitBoard?.candidates??[]} onRefreshBoard={()=>action({type:'recruit.refresh'})} onRoster={()=>{setNotice('Roster opened');close()}}/>
 :view===BuildingType.TRAINING_PITCH?<WeightRoom club={club} blocked={false} onClose={close} onStart={(unit,drillId)=>action({type:'training.start',unit,drillId})} onCollect={b=>action({type:'training.collect',buildingId:b.id})} onUpgrade={upgrade} onGameDay={()=>{setNotice('Game Day opened');close()}}/>
 :view==='gates'?<Sheet title="Home defense" onClose={close}><div className="p-4"><GateAssignments club={club} blocked={false} onAssign={(postId,heroKey)=>action({type:'gate.assign',postId,heroKey})}/></div></Sheet>
 :building&&<CampusDepartment club={club} building={building} blocked={false} onClose={close} onUpgrade={upgrade} onFinishNow={finish} onCollect={b=>action({type:'facility.collect',buildingId:b.id})} onDefense={()=>setView('gates')} onProgram={()=>{setNotice('Your program opened');close()}} onGameDay={()=>{setNotice('Game Day opened');close()}} onWeightRoom={()=>setView(BuildingType.TRAINING_PITCH)}/>}
 </main>
}
if(import.meta.env.DEV){openCampusArt();createRoot(document.getElementById('root')!).render(<Fixture/>)}
