import {progressClubDaily} from './dailyProgress';
import {todayKey} from '../dailies';
import {BuildingType,PlayerRarity,PlayerRole,PlayerState,UnitGroup,type GameState,type Player} from '../types';
import {RARITY_CONFIG,RECRUIT_FIRST_NAMES,RECRUIT_LAST_NAMES,ROLE_UNIT,UNIT_COLOR,TENDENCY_KEYS} from '../constants';
import {rosterCap} from '../recruiting';
export const SCOUTING_TRIPS={
 local:{name:'Local Friday nights',level:1,seconds:120,coins:120,rarity:PlayerRarity.RARE,stats:21,description:'Find a standout from the local circuit.'},
 regional:{name:'Regional showcase',level:3,seconds:600,coins:400,rarity:PlayerRarity.EPIC,stats:28,description:'Meet an elite athlete at a regional camp.'},
 national:{name:'National all-star camp',level:5,seconds:1800,coins:1000,rarity:PlayerRarity.LEGENDARY,stats:36,description:'Build a relationship with a national blue-chip athlete.'},
} as const;
export type ScoutingTier=keyof typeof SCOUTING_TRIPS;
export const RECRUITING_CONTACTS={
 call:{name:'Call the athlete',seconds:90,interest:20,description:'Talk about their role and what they want from a team.'},
 praise:{name:'Praise their film',seconds:60,interest:15,description:'Review their best play and send specific feedback.'},
 visit:{name:'Visit their school',seconds:240,interest:30,description:'Watch them practice and meet their coaches.'},
 tour:{name:'Host a campus visit',seconds:360,interest:35,description:'Introduce the team and show where they will develop.'},
} as const;
export type RecruitingContact=keyof typeof RECRUITING_CONTACTS;
export interface ProspectRelationship {player:Player;source:'academy'|'agent';interest:number;completed:RecruitingContact[];job:null|{id:string;contact:RecruitingContact;startTime:number;finishTime:number};}
export interface ScoutingState {trip:null|{id:string;tier:ScoutingTier;source:'academy'|'agent';startTime:number;finishTime:number;player:Player};prospects:ProspectRelationship[];lastReport?:{name:string;tier:ScoutingTier;at:number};}
export const emptyScouting=():ScoutingState=>({trip:null,prospects:[]});
export function advanceScouting(club:GameState,now:number,utc=false):GameState{
 if(!club.scouting)return club;let scouting=club.scouting,changed=false,reportAt:number|undefined;
 if(scouting.trip&&scouting.trip.finishTime<=now){const trip=scouting.trip;reportAt=trip.finishTime;scouting={...scouting,trip:null,prospects:[...scouting.prospects,{player:trip.player,source:trip.source,interest:trip.source==='agent'?100:0,completed:[],job:null}],lastReport:{name:trip.player.name,tier:trip.tier,at:trip.finishTime}};changed=true;}
 const prospects=scouting.prospects.map(p=>{if(!p.job||p.job.finishTime>now)return p;changed=true;return {...p,interest:Math.min(100,p.interest+RECRUITING_CONTACTS[p.job.contact].interest),completed:[...p.completed,p.job.contact],job:null};});
 const next=changed?{...club,scouting:{...scouting,prospects}}:club;
 return reportAt&&(utc?new Date(reportAt).toISOString().slice(0,10):todayKey(reportAt))===next.dailies.date?progressClubDaily(next,'scout'):next;
}
export type ScoutingAction={type:'scouting.search';tier:ScoutingTier;pace:'time'|'coins'}|{type:'scouting.contact';playerId:string;contact:RecruitingContact}|{type:'scouting.rush';playerId:string;jobId:string}|{type:'scouting.sign';playerId:string}|{type:'scouting.dismiss';playerId:string};
export function scoutingRushCost(seconds:number){return Math.max(1,Math.ceil(seconds/3));}
export function applyScouting(club:GameState,action:ScoutingAction,now:number,random:()=>number):GameState|string{
 const scouting=club.scouting??emptyScouting(),level=club.buildings.find(b=>b.type===BuildingType.YOUTH_ACADEMY)?.level??1;
 if(action.type==='scouting.search'){
  const trip=SCOUTING_TRIPS[action.tier];if(scouting.trip)return 'Your scout is already on a trip.';
  if(scouting.prospects.length>=6)return 'Sign a prospect before adding another to your six-player shortlist.';
  if(level<trip.level)return `Upgrade the Scouting Department to Level ${trip.level} for this trip.`;
  const cost=action.pace==='coins'?trip.coins:0;if(club.resources.COINS<cost)return 'Not enough Coins for an express scouting trip.';
  const pick=<T,>(values:readonly T[])=>values[Math.floor(random()*values.length)];
  const role=pick(Object.values(PlayerRole)),unit=ROLE_UNIT[role],id=`prospect_${now}_${Math.floor(random()*1e9)}`;
  const source=action.pace==='coins'?'agent':'academy';
  const stat=()=>trip.stats+(source==='agent'?6:0)+Math.floor(random()*7);
  const player:Player={id,name:`${pick(RECRUIT_FIRST_NAMES)} ${pick(RECRUIT_LAST_NAMES)}`,role,unit,rarity:trip.rarity,level:1,stats:{strength:stat(),speed:stat(),iq:stat()},maxStat:RARITY_CONFIG[trip.rarity].maxStat+(source==='academy'?15:0),worldPos:{x:60,y:12,z:0},targetPos:{x:60,y:12,z:0},state:PlayerState.IDLE,avatarColor:UNIT_COLOR[unit],tendency:pick(TENDENCY_KEYS)};
  return {...club,resources:{...club.resources,COINS:club.resources.COINS-cost},scouting:{...scouting,trip:{id,tier:action.tier,source,startTime:now,finishTime:now+(action.pace==='coins'?15:trip.seconds)*1000,player}}};
 }
 const prospect=scouting.prospects.find(p=>p.player.id===action.playerId);if(!prospect)return 'That prospect is no longer on your shortlist.';
 if(action.type==='scouting.dismiss')return {...club,scouting:{...scouting,prospects:scouting.prospects.filter(p=>p!==prospect)}};
 if(action.type==='scouting.sign'){
  if(prospect.interest<100||prospect.job)return 'Finish building this athlete’s interest before signing.';
  if(club.roster.length>=rosterCap(level))return 'Your roster is full. Upgrade Scouting or release a player.';
  if(club.roster.some(p=>p.id===prospect.player.id))return 'This player has already signed.';
  return {...club,roster:[...club.roster,prospect.player],scouting:{...scouting,prospects:scouting.prospects.filter(p=>p!==prospect)}};
 }
 let updated:ProspectRelationship,cost=0;
 if(action.type==='scouting.contact'){
  if(prospect.job)return 'Finish this recruiting activity first.';
  if(prospect.completed.includes(action.contact))return 'You have already completed this activity with this athlete.';
  const contact=RECRUITING_CONTACTS[action.contact];updated={...prospect,job:{id:`contact_${now}_${action.contact}`,contact:action.contact,startTime:now,finishTime:now+Math.round(contact.seconds/(1+(level-1)*.1))*1000}};
 }else{
  if(!prospect.job||prospect.job.id!==action.jobId)return 'This recruiting activity is already finished.';
  cost=scoutingRushCost((prospect.job.finishTime-now)/1000);if(club.resources.COINS<cost)return 'Not enough Coins to finish this activity now.';
  updated={...prospect,job:{...prospect.job,finishTime:now}};
 }
 return advanceScouting({...club,resources:{...club.resources,COINS:club.resources.COINS-cost},scouting:{...scouting,prospects:scouting.prospects.map(p=>p===prospect?updated:p)}},now);
}
export function validScouting(input:unknown):input is ScoutingState{
 if(!input||typeof input!=='object')return false;const s=input as ScoutingState;
 const time=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
 const player=(p:Player)=>p&&typeof p.id==='string'&&typeof p.name==='string'&&Object.values(PlayerRole).includes(p.role)&&Object.values(UnitGroup).includes(p.unit)&&Object.values(PlayerRarity).includes(p.rarity)&&time(p.level)&&time(p.maxStat)&&p.stats&&Object.values(p.stats).length===3&&['strength','speed','iq'].every(k=>time(p.stats[k as keyof Player['stats']]))&&p.worldPos&&p.targetPos&&['x','y','z'].every(k=>Number.isFinite(p.worldPos[k as 'x'])&&Number.isFinite(p.targetPos[k as 'x']));
 return Array.isArray(s.prospects)&&s.prospects.length<=6&&new Set(s.prospects.map(p=>p?.player?.id)).size===s.prospects.length&&s.prospects.every(p=>p&&['academy','agent'].includes(p.source)&&player(p.player)&&time(p.interest)&&p.interest<=100&&Array.isArray(p.completed)&&new Set(p.completed).size===p.completed.length&&p.completed.every(c=>Object.prototype.hasOwnProperty.call(RECRUITING_CONTACTS,c))&&(p.job===null||(p.job&&typeof p.job.id==='string'&&Object.prototype.hasOwnProperty.call(RECRUITING_CONTACTS,p.job.contact)&&time(p.job.startTime)&&time(p.job.finishTime)&&p.job.finishTime>=p.job.startTime)))&&(s.trip===null||(s.trip&&['academy','agent'].includes(s.trip.source)&&typeof s.trip.id==='string'&&Object.prototype.hasOwnProperty.call(SCOUTING_TRIPS,s.trip.tier)&&time(s.trip.startTime)&&time(s.trip.finishTime)&&s.trip.finishTime>s.trip.startTime&&player(s.trip.player)));
}
