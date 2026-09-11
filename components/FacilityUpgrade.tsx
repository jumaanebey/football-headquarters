import {roomTier} from '../game/development';
import {BuildingArt} from './BuildingArt';
import {buildingEffect,UPGRADE_CONFIG,upgradeDurationSecs,skipGemCost,builderHireCost,MAX_BUILDERS} from '../constants';
import {buildingMilestone,buildingRoadmap} from '../game/buildingProgression';
import {BuildingType,type BuildingInstance,type GameState} from '../types';

export const roomTime=(secs:number)=>{const n=Math.max(0,Math.ceil(secs));return n<60?`${n}s`:`${Math.floor(n/60)}m ${n%60}s`};
export function FacilityUpgrade({club,building,blocked,onUpgrade,onFinishNow,onHireBuilder}:{club:GameState;building:BuildingInstance;blocked:boolean;onUpgrade:(id:string,cost:number)=>void;onFinishNow?:(id:string)=>void;onHireBuilder?:()=>void}) {
  const level=building.level,stadium=club.buildings.find(b=>b.type===BuildingType.STADIUM)?.level??1;
  const job=club.upgrades.find(j=>j.kind==='building'&&j.key===building.id),free=club.builders-club.upgrades.length;
  const cost=Math.floor(UPGRADE_CONFIG.baseCost*Math.pow(UPGRADE_CONFIG.costMultiplier,level-1)),gated=building.type!==BuildingType.STADIUM&&level>=stadium;
  const remaining=job?Math.max(0,(job.finishTime-Date.now())/1000):0;
  const current=buildingEffect(building.type,level),next=buildingEffect(building.type,level+1);
  return <section className="fhq-room-upgrade" aria-label="Building upgrade">
    <div><h3>{job?`Building level ${job.toLevel}`:`Grow to level ${level+1}`}</h3><p>{current.label}: {current.value} → <strong>{next.value}</strong></p></div>
    <small>{level<3&&level+1===3?'New interior renovation · ':''}{building.type===BuildingType.MEDICAL_CENTER?`Active rehab +${12+4*(roomTier(level)-1)} → +${12+4*(roomTier(level+1)-1)} Energy`:building.type===BuildingType.YOUTH_ACADEMY?level<3?'Regional prospects at L3 · national prospects at L5':'National prospects at L5':building.type===BuildingType.TACTICS_ROOM?'IQ +1 · mastery +1 per study · faster sessions each level':building.type===BuildingType.TRAINING_PITCH?'Strength +2 · level +1 · faster sessions each level':level<3?'Expanded grandstand and tunnel at L3':'Expanded grandstand unlocked'}</small>
    {job?<><p role="status">{roomTime(remaining)} remaining</p>{onFinishNow&&<button disabled={blocked||club.resources.GEMS<skipGemCost(remaining)} onClick={()=>onFinishNow(job.id)}>Finish · {skipGemCost(remaining)} Crowns</button>}</>
      :<><button disabled={blocked||gated||free<=0||club.resources.COINS<cost} onClick={()=>onUpgrade(building.id,cost)}>{gated?`Requires Stadium L${level+1}`:free<=0?'Builders busy':`Upgrade · ${cost.toLocaleString()} Coins`}</button><small>{roomTime(upgradeDurationSecs(level+1))} build · {free}/{club.builders} builders free{!gated&&club.resources.COINS<cost?` · Need ${(cost-club.resources.COINS).toLocaleString()} more Coins`:''}</small></>}
    {free<=0&&club.builders<MAX_BUILDERS&&onHireBuilder&&<button disabled={blocked||club.resources.GEMS<builderHireCost(club.builders)} onClick={onHireBuilder}>Hire builder · {builderHireCost(club.builders)} Crowns</button>}
  </section>;
}
export function FacilityGoals({building}:{building:BuildingInstance}) {
  return <section className="fhq-room-goals" aria-label="Building progression"><h3>Your building’s future</h3><div>{buildingRoadmap(building.type,building.level).map(level=>{const m=buildingMilestone(building.type,level);return <article key={level} data-current={level===building.level} aria-label={`Level ${level}: ${m.name}`}>
    <BuildingArt type={building.type} level={level} label={`${m.name}, level ${level}`} className="fhq-room-goal-art"/>
    <strong>L{level} · {buildingEffect(building.type,level).value}</strong><small>{m.name}</small>{!m.newAppearance&&<small>Look from L{m.artLevel}</small>}
  </article>})}</div></section>;
}
