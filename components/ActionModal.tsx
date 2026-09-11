import React, { useState } from 'react';
import { BuildingArt } from './BuildingArt';
import { Sheet } from './ui';
import { BuildingInstance, BuildingType, DrillState, GameState, ResourceType, UpgradeJob } from '../types';
import { BUILDING_INFO, UPGRADE_CONFIG, upgradeDurationSecs, skipGemCost, builderHireCost, MAX_BUILDERS, buildingEffect, collectorCap, collectorRate } from '../constants';
import { BUILDING_ART_LEVELS, BUILDING_ERAS } from '../assets';

interface Props {
  building: BuildingInstance | null;
  club?: GameState;
  blocked?: boolean;
  onDefense?: () => void;
  resources: Record<ResourceType, number>;
  stadiumLevel: number;
  upgrades: UpgradeJob[];
  builders: number;
  onCollect?: (building: BuildingInstance) => void;
  onVisit?: () => void;
  visitLabel?: string;
  onClose: () => void;
  onUpgrade: (buildingId: string, cost: number) => void;
  onFinishNow: (jobId: string) => void;
  onHireBuilder: () => void;
}


const fmt = (secs: number) => { const s=Math.max(0,Math.ceil(secs)); return s<60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`; };
export const ActionModal: React.FC<Props> = ({ building, resources, stadiumLevel, upgrades, builders, onClose, onUpgrade, onFinishNow, onHireBuilder, onVisit, visitLabel, onCollect, club, onDefense, blocked=false }) => {
  const [era,setEra]=useState<number|null>(null);
  if(!building) return null;
  const info=BUILDING_INFO[building.type], level=building.level;
  const cost=Math.floor(UPGRADE_CONFIG.baseCost*Math.pow(UPGRADE_CONFIG.costMultiplier,level-1));
  const job=upgrades.find(u=>u.kind==='building'&&u.key===building.id);
  const remaining=job ? Math.max(0,(job.finishTime-Date.now())/1000) : 0;
  const gated=building.type!==BuildingType.STADIUM&&level>=stadiumLevel;
  const free=builders-upgrades.length, hire=builderHireCost(builders);
  const current=buildingEffect(building.type,level), next=buildingEffect(building.type,level+1);
  const tiers=BUILDING_ART_LEVELS(building.type), chosen=era??([...tiers].filter(l=>l<=level).pop()??tiers[0]);
  const collect=building.state===DrillState.COMPLETED||(building.accrued??0)>=30;
  const status=building.type===BuildingType.STADIUM
    ? `${Math.floor(building.accrued??0)} / ${collectorCap(building.type,level)} Coins stored · ${Math.round(collectorRate(building.type,level)*60)} Coins/min`
    : building.type===BuildingType.MEDICAL_CENTER ? `${club?.resources.ENERGY??resources.ENERGY}/100 Energy · recovery continues while away`
    : building.type===BuildingType.YOUTH_ACADEMY ? (club?.recruitSlot ? `Recruit ${Date.now()>=club.recruitSlot.finishTime?'ready to sign':`arrives in ${fmt((club.recruitSlot.finishTime-Date.now())/1000)}`}` : 'Compare prospects, then scout with Coins')
    : building.state===DrillState.ACTIVE ? `Training · ${fmt(((building.finishTime??Date.now())-Date.now())/1000)} remaining`
    : building.state===DrillState.COMPLETED ? 'Training complete · collect your squad’s progress' : `Team readiness ${club?.teamReadiness??0}/100`;
  return <Sheet title={info.name} subtitle={`Level ${level} · ${resources.COINS.toLocaleString()} Coins available`} onClose={onClose} maxWidth="max-w-3xl">
    <div className="fhq-facility-panel">

      <div className="fhq-facility-content">
        <div className="fhq-facility-art"><BuildingArt type={building.type} level={era??level} label={info.name} className="w-full h-full" /></div>
        <div className="fhq-facility-detail">
          {blocked && <p role="status" className="text-blue-300">Confirming club change…</p>}
          <section className="fhq-facility-overview">
            <h3>{current.label}: {current.value}</h3><p>{status}</p>
            {onCollect&&collect&&<button disabled={blocked} className="fhq-facility-primary" onClick={()=>onCollect(building)}>{building.state===DrillState.COMPLETED?'Collect training':`Collect ${Math.floor(building.accrued??0)} Coins`}</button>}
            {onVisit&&<button onClick={onVisit} className="fhq-facility-primary">{visitLabel} →</button>}
            {onDefense&&building.type===BuildingType.STADIUM&&<button onClick={onDefense}>Home defense · equipment & schemes</button>}
          </section>
          <section className="fhq-facility-upgrade" aria-label="Building upgrade">
            <h3>Upgrade to level {level+1}</h3><p className="fhq-facility-comparison">{current.value} → <strong>{next.value}</strong></p>
            {job ? <><p>Level {job.toLevel} · {fmt(remaining)} remaining</p><button disabled={blocked||resources.GEMS<skipGemCost(remaining)} onClick={()=>onFinishNow(job.id)}>Finish now · {skipGemCost(remaining)} Crowns</button></>
              : gated ? <p>Requires Stadium level {level+1}</p>
              : <><button className="fhq-facility-primary" disabled={blocked||resources.COINS<cost||free<=0} onClick={()=>onUpgrade(building.id,cost)}>{free<=0?'Builders busy':resources.COINS<cost?'Need Coins':'Upgrade'} · {cost.toLocaleString()} Coins</button><p>Takes {fmt(upgradeDurationSecs(level+1))} · {free}/{builders} builders free</p></>}
            {free<=0&&builders<MAX_BUILDERS&&<button disabled={blocked||resources.GEMS<hire} onClick={onHireBuilder}>Hire builder · {hire} Crowns</button>}
          </section>
          <details className="fhq-facility-styles"><summary>Building appearances</summary><div>
            <h3>{BUILDING_ERAS[building.type]?.[tiers.indexOf(chosen)]??info.name}</h3><p>Level {chosen} appearance · {chosen<=level?'Unlocked':'Reach this level to unlock'}</p>
            <div className="fhq-facility-eras" role="group" aria-label="Building appearances">{tiers.map(l=><button key={l} aria-pressed={chosen===l} onClick={()=>setEra(l)}>L{l}</button>)}</div>
            <p>Appearance changes with building level. Upgrades improve {current.label.toLowerCase()}.</p>
          </div></details>
        </div>
      </div>
    </div>
  </Sheet>;
};
