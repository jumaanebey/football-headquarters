import {ScoutingActivities} from './ScoutingActivities';
import type {ClubAction} from '../game/authority/clubActions';
import React,{useEffect,useRef,useState} from 'react';
import {BuildingType,type GameState,type Player,type ResourceType,type BuildingInstance,type RecruitSlot,type UpgradeJob} from '../types';
import {RECRUIT_CONFIG} from '../constants';
import {rosterCap,rollBoard,recruitCost,recruitSeconds} from '../recruiting';
import {unitPower} from '../battle';
import {prospectComparison} from '../game/progression/rosterCompare';
import {IndoorPlayer} from './IndoorPlayer';
import {Sheet} from './ui';
import {FacilityInterior} from './FacilityInterior';
import {FacilityGoals,FacilityUpgrade,roomTime} from './FacilityUpgrade';
interface Props {
 onAction?:(action:ClubAction)=>void;
 club:GameState;resources:Record<ResourceType,number>;roster:Player[];recruitSlot:RecruitSlot|null;academy:BuildingInstance;stadiumLevel:number;upgradeJob?:UpgradeJob;
 onRoster?:()=>void;blocked?:boolean;onClose:()=>void;onStartRecruit:(candidate:Player,cost:number)=>void;onRush:()=>void;onSign:()=>void;onUpgrade:(id:string,cost:number)=>void;
 onFinishNow?:(id:string)=>void;onHireBuilder?:()=>void;board?:Player[];onRefreshBoard?:()=>void;
}
export const ScoutingModal:React.FC<Props>=({club,resources,roster,academy,onClose,onUpgrade,onFinishNow,onHireBuilder,onRoster,onAction,blocked=false})=>{
 const selected=club.scouting?.prospects[0]?.player??club.recruitSlot?.candidate;
 return <Sheet title="Scouting Department" subtitle={`Inside · Level ${academy.level} · ${resources.COINS.toLocaleString()} Coins`} onClose={onClose} maxWidth="max-w-6xl"><div className="fhq-department fhq-scout-room">
 <div className="fhq-department-scene"><FacilityInterior type={BuildingType.YOUTH_ACADEMY} level={academy.level}>{selected&&<div className="fhq-room-prospect"><IndoorPlayer unit={selected.unit} label={`${selected.name}, ${selected.role}, visiting campus`}/><span>{selected.name}<small>Prospect visiting campus</small></span></div>}</FacilityInterior><nav className="fhq-player-room-nav"><button onClick={onRoster}>Your roster · {roster.length}/{rosterCap(academy.level)}</button></nav></div>
 <div className="fhq-department-controls"><ScoutingActivities afterPrimary={<FacilityUpgrade club={club} building={academy} blocked={blocked} onUpgrade={onUpgrade} onFinishNow={onFinishNow} onHireBuilder={onHireBuilder}/>} club={club} blocked={blocked||!onAction} onAction={a=>onAction?.(a)}/></div><FacilityGoals building={academy}/></div></Sheet>;
};
