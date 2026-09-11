import {BuildingType, DrillState, type GameState} from '../../types';
import {currentDevelopmentBlock, STATIONS, type DevelopmentStation} from '../development';
import {trainingParticipants} from '../campusActivities';

export type JourneyDestination = DevelopmentStation | 'stadium' | 'scouting' | 'roster';
export interface JourneyStep {title:string; detail:string; action:string; destination:JourneyDestination; state:'active'|'ready'|'available'; finishTime?:number;}
export const stationDestination=(station:DevelopmentStation):JourneyDestination=>station;
export function playerWork(club:GameState, id:string):JourneyStep {
  const block=currentDevelopmentBlock(club);
  if(block&&club.development?.schedule?.playerIds.includes(id))return {title:STATIONS[block.station].name+' session',detail:'Assigned to your team schedule',action:'View session',destination:block.station,state:'active',finishTime:block.finishTime};
  const gym=club.buildings.find(b=>b.type===BuildingType.TRAINING_PITCH);
  if(gym&&trainingParticipants(club).some(p=>p.id===id))return {title:gym.state===DrillState.COMPLETED?'Workout completed':'Weight Room session',detail:'Assigned to a group workout',action:gym.state===DrillState.COMPLETED?'Collect growth':'View workout',destination:'weights',state:gym.state===DrillState.COMPLETED?'ready':'active',finishTime:gym.finishTime??undefined};
  return {title:'Available',detail:'No scheduled activity',action:'Plan development',destination:'weights',state:'available'};
}
/** Read confirmed club state only. A passed timer is never promoted to a reward here. */
export function clubNextStep(club:GameState):JourneyStep {
  const game=club.stadiumFootball?.game;
  if(game&&!game.collected)return {title:game.phase==='final'?'Your Stadium result is ready':'Your Stadium game is waiting',detail:`${game.home}–${game.away} · ${game.phase==='final'?'Review the result and collect':'Both possessions finish with you'}`,action:game.phase==='final'?'Review result':'Resume game',destination:'stadium',state:game.phase==='final'?'ready':'active'};
  const block=currentDevelopmentBlock(club);
  if(block)return {title:STATIONS[block.station].name+' in progress',detail:`${club.development!.schedule!.playerIds.length} athletes · step ${club.development!.schedule!.completed+1} of ${club.development!.schedule!.blocks.length}`,action:'View schedule',destination:block.station,state:'active',finishTime:block.finishTime};
  const report=club.development?.reports.find(r=>!r.read);
  if(report)return {title:STATIONS[report.station].name+' results',detail:report.players.length?`${report.players.filter(p=>p.after>p.before).length} athletes improved · review their gains`:`${report.energy} Energy restored`,action:'See progress',destination:report.station,state:'ready'};
  const gym=club.buildings.find(b=>b.type===BuildingType.TRAINING_PITCH&&b.state!==DrillState.IDLE);
  if(gym)return {title:gym.state===DrillState.COMPLETED?'Your workout is ready':'Team workout in progress',detail:'Return to the Weight Room',action:gym.state===DrillState.COMPLETED?'Collect growth':'View workout',destination:'weights',state:gym.state===DrillState.COMPLETED?'ready':'active',finishTime:gym.finishTime??undefined};
  const prospect=club.scouting?.prospects.find(p=>p.interest>=100&&!p.job);
  if(prospect)return {title:`${prospect.player.name} is ready to sign`,detail:`${prospect.player.role} · review your roster before signing`,action:'Meet prospect',destination:'scouting',state:'ready'};
  if(club.scouting?.trip)return {title:'Your scout is on the road',detail:'The report continues while you are away',action:'View scouting',destination:'scouting',state:'active',finishTime:club.scouting.trip.finishTime};
  if(club.scouting?.prospects.length)return {title:'Build your recruiting class',detail:`${club.scouting.prospects.length} prospects on your shortlist`,action:'Continue recruiting',destination:'scouting',state:'available'};
  if(club.resources.ENERGY<10)return {title:'Recover before taking the field',detail:`${club.resources.ENERGY}/100 Energy · a Stadium game needs 10`,action:'Open recovery',destination:'rehab',state:'available'};
  if(club.teamReadiness<100)return {title:'Prepare your next game',detail:`${club.teamReadiness}/100 readiness · study a play to build IQ and mastery`,action:'Plan film study',destination:'film',state:'available'};
  return {title:'Your team is ready',detail:'Choose your next Stadium opponent',action:'Go to Stadium',destination:'stadium',state:'available'};
}
export function journeyTime(finishTime:number|undefined,now:number) {
  if(finishTime===undefined)return '';
  const seconds=Math.ceil((finishTime-now)/1000);
  return seconds<=0?'Awaiting confirmation':seconds<60?`${seconds}s remaining`:`${Math.floor(seconds/60)}m ${seconds%60}s remaining`;
}
export function campusRoomStatus(club:GameState):Partial<Record<BuildingType,string>> {
 const result:Partial<Record<BuildingType,string>>={};
 for(const report of club.development?.reports??[])if(!report.read&&report.station!=='practice')result[STATIONS[report.station].building]='Progress ready';
 const active=currentDevelopmentBlock(club);
 if(active&&active.station!=='practice')result[STATIONS[active.station].building]=`${club.development!.schedule!.playerIds.length} in session`;
 if(club.scouting?.trip)result[BuildingType.YOUTH_ACADEMY]='Scout on the road';
 else if(club.scouting?.prospects.some(p=>p.interest>=100&&!p.job))result[BuildingType.YOUTH_ACADEMY]='Prospect ready';
 if(club.stadiumFootball?.game&&!club.stadiumFootball.game.collected)result[BuildingType.STADIUM]=club.stadiumFootball.game.phase==='final'?'Result ready':'Game in progress';
 return result;
}
