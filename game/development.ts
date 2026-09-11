import {progressClubDaily} from './dailyProgress';
import {todayKey} from '../dailies';
import {BuildingType,DrillState,ResourceType,UnitGroup,type GameState,type Player} from '../types';

export const FOOTBALL_PLAYS = {
  verticals:{name:'Four verticals',concept:'Four eligible receivers attack deep lanes. The quarterback reads the safeties and throws to the best vertical matchup.',beats:'Attacks single-high man coverage',counter:'Deep safety help',stat:'speed'},
  slants: {name:'Quick slants', concept:'The outside receivers cut inside at five yards. The quarterback reads the underneath linebacker.', beats:'Beats an outside blitz', counter:'Inside zone coverage', stat:'iq'},
  flood: {name:'Flood right', concept:'A go route clears the sideline. A deep out and a flat route give the quarterback three levels to read.', beats:'Stretches zone coverage', counter:'Man coverage with safety help', stat:'iq'},
  power: {name:'Power run', concept:'The guard pulls through the hole. The running back follows the lead block while the line seals the edge.', beats:'Punishes light pass defense', counter:'A stacked defensive front', stat:'strength'},
} as const;
export type FootballPlay = keyof typeof FOOTBALL_PLAYS;
export type DevelopmentStation = 'weights'|'rehab'|'film'|'practice';
export const STATIONS:Record<DevelopmentStation,{name:string;building:BuildingType;seconds:number;energy:number;description:string}> = {
 weights:{name:'Weight Room',building:BuildingType.TRAINING_PITCH,seconds:60,energy:8,description:'Strength +2 · player level +1'},
 rehab:{name:'Rehab Center',building:BuildingType.MEDICAL_CENTER,seconds:90,energy:0,description:'Restore club Energy · no workout cost'},
 film:{name:'Film Room',building:BuildingType.TACTICS_ROOM,seconds:75,energy:5,description:'Football IQ +1 · readiness · play mastery'},
 practice:{name:'Practice Field',building:BuildingType.TRAINING_PITCH,seconds:60,energy:8,description:'Speed +2 · readiness · route repetitions'},
};
export interface DevelopmentStep {station:DevelopmentStation;play:FootballPlay;}
export interface DevelopmentBlock extends DevelopmentStep {id:string;startTime:number;finishTime:number;level:number;}
export interface DevelopmentReport {id:string;station:DevelopmentStation;play:FootballPlay;at:number;players:{id:string;name:string;stat:string;before:number;after:number}[];energy:number;readiness:number;read:boolean;}
export interface TeamSchedule {id:string;unit:UnitGroup|'ALL';playerIds:string[];blocks:DevelopmentBlock[];completed:number;energyPaid:number;}
export interface DevelopmentState {schedule:TeamSchedule|null;reports:DevelopmentReport[];mastery:Partial<Record<FootballPlay,number>>;}
export const emptyDevelopment=():DevelopmentState=>({schedule:null,reports:[],mastery:{}});
export const roomTier=(level:number):1|2|3=>level>=5?3:level>=3?2:1;
export function developmentQuote(club:GameState,steps:DevelopmentStep[]){
 return steps.map(step=>{const level=club.buildings.find(b=>b.type===STATIONS[step.station].building)?.level??1;return {...step,level,seconds:Math.max(20,Math.round(STATIONS[step.station].seconds/(1+(level-1)*.12))),energy:STATIONS[step.station].energy};});
}
export function currentDevelopmentBlock(club:GameState){const s=club.development?.schedule;return s?.blocks[s.completed]??null;}
export function scheduledPlayers(club:GameState):Player[]{const s=club.development?.schedule;return s?club.roster.filter(p=>s.playerIds.includes(p.id)):[];}
export function startDevelopment(club:GameState,unit:UnitGroup|'ALL',steps:DevelopmentStep[],now:number):GameState|string{
 if(club.development?.schedule)return 'Finish the current team schedule first.';
 if(club.buildings.some(b=>b.type===BuildingType.TRAINING_PITCH&&b.state!==DrillState.IDLE))return 'Collect the current workout before starting a schedule.';
 const players=club.roster.filter(p=>unit==='ALL'||p.unit===unit);if(!players.length)return 'Choose a group with players.';
 const quote=developmentQuote(club,steps),energy=quote.reduce((n,s)=>n+s.energy,0);
 if(club.resources.ENERGY<energy)return `This schedule needs ${energy} Energy up front. Choose fewer sessions or recover first.`;
 let cursor=now;const id=`schedule_${now}`;
 const blocks=quote.map((step,i)=>{const startTime=cursor;cursor+=step.seconds*1000;return {station:step.station,play:step.play,level:step.level,id:`${id}_${i}`,startTime,finishTime:cursor};});
 return {...club,resources:{...club.resources,ENERGY:club.resources.ENERGY-energy},development:{...(club.development??emptyDevelopment()),schedule:{id,unit,playerIds:players.map(p=>p.id),blocks,completed:0,energyPaid:energy}}};
}
/** Finite prepaid schedule, settled from timestamps exactly once. No games or raids run here. */
export function advanceDevelopment(club:GameState,now:number,utc=false):GameState{
 const original=club.development?.schedule;if(!original)return club;
 let next=club;let development={...club.development!};let completed=original.completed;
 for(;completed<original.blocks.length&&original.blocks[completed].finishTime<=now;completed++){
  const block=original.blocks[completed],station=block.station,tier=roomTier(block.level);
  const energy=station==='rehab'?Math.min(100-next.resources.ENERGY,12+4*(tier-1)):0;
  const readiness=Math.min(100-next.teamReadiness,station==='film'?10+2*tier:station==='practice'?5+tier:0);
  const stat=station==='weights'?'strength':station==='practice'?'speed':station==='film'?'iq':null;
  const changes:DevelopmentReport['players']=[];
  const roster=next.roster.map(p=>{
   if(!original.playerIds.includes(p.id)||!stat)return p;
   const before=p.stats[stat],after=Math.max(before,Math.min(p.maxStat,before+(station==='film'?1:2)));
   changes.push({id:p.id,name:p.name,stat,before,after});
   return {...p,level:p.level+(station==='weights'&&after>before?1:0),stats:{...p.stats,[stat]:after}};
  });
  const report:DevelopmentReport={id:block.id,station,play:block.play,at:block.finishTime,players:changes,energy,readiness,read:false};
  development={...development,reports:[report,...development.reports].slice(0,24),mastery:station==='film'?{...development.mastery,[block.play]:Math.min(20,(development.mastery[block.play]??0)+1)}:development.mastery};
  next={...next,roster,teamReadiness:next.teamReadiness+readiness,resources:{...next.resources,[ResourceType.ENERGY]:next.resources.ENERGY+energy}};
  if((utc?new Date(block.finishTime).toISOString().slice(0,10):todayKey(block.finishTime))===next.dailies.date)next=progressClubDaily(next,'drills');
 }
 if(completed===original.completed)return club;
 return {...next,development:{...development,schedule:completed===original.blocks.length?null:{...original,completed}}};
}
export function isDevelopmentSteps(input:unknown):input is DevelopmentStep[]{
 return Array.isArray(input)&&input.length>=1&&input.length<=6&&input.every(s=>s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).length===2&&Object.prototype.hasOwnProperty.call(STATIONS,s.station)&&Object.prototype.hasOwnProperty.call(FOOTBALL_PLAYS,s.play));
}
export function validDevelopment(input:unknown):input is DevelopmentState{
 if(!input||typeof input!=='object')return false;const d=input as DevelopmentState;
 const finite=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 if(!d.mastery||Object.entries(d.mastery).some(([k,v])=>!Object.prototype.hasOwnProperty.call(FOOTBALL_PLAYS,k)||!finite(v)||v!>20)||!Array.isArray(d.reports)||d.reports.length>24)return false;
 if(d.reports.some(r=>!r||typeof r.id!=='string'||!Object.prototype.hasOwnProperty.call(STATIONS,r.station)||!Object.prototype.hasOwnProperty.call(FOOTBALL_PLAYS,r.play)||!finite(r.at)||!finite(r.energy)||r.energy>100||typeof r.read!=='boolean'||!Number.isFinite(r.readiness)||r.readiness<0||r.readiness>100||!Array.isArray(r.players)||r.players.some(p=>typeof p.id!=='string'||typeof p.name!=='string'||!['strength','speed','iq'].includes(p.stat)||!finite(p.before)||!finite(p.after))))return false;
 if(d.schedule===null)return true;const s=d.schedule;
 return !!s&&typeof s.id==='string'&&(s.unit==='ALL'||Object.values(UnitGroup).includes(s.unit))&&Array.isArray(s.playerIds)&&s.playerIds.length>0&&s.playerIds.length<=150&&s.playerIds.every(id=>typeof id==='string')&&new Set(s.playerIds).size===s.playerIds.length&&Array.isArray(s.blocks)&&s.blocks.length>0&&s.blocks.length<=6&&finite(s.completed)&&s.completed<s.blocks.length&&finite(s.energyPaid)&&s.energyPaid<=100&&s.blocks.every((b,i)=>b&&typeof b.id==='string'&&Object.prototype.hasOwnProperty.call(STATIONS,b.station)&&Object.prototype.hasOwnProperty.call(FOOTBALL_PLAYS,b.play)&&finite(b.level)&&b.level>=1&&finite(b.startTime)&&finite(b.finishTime)&&b.finishTime>b.startTime&&(i===0||b.startTime===s.blocks[i-1].finishTime));
}
