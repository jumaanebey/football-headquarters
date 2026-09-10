import React from 'react';
import { BuildingType, DrillState, type BuildingInstance, type GameState } from '../types';
import { collectorCap, collectorRate, DRILLS, energyIntervalMs } from '../constants';
export function FacilityOverview({ building, club }: { building: BuildingInstance; club: GameState }) {
  if (building.type === BuildingType.STADIUM) {
    const stored = Math.floor(building.accrued ?? 0), cap = collectorCap(building.type, building.level);
    return <section className="mb-4 rounded-xl border border-amber-800 bg-amber-950/20 p-4 text-sm text-slate-300"><h3 className="font-bold text-white">Ticket office</h3><p className="mt-2">{stored.toLocaleString()} / {cap.toLocaleString()} Coins stored · {Math.round(collectorRate(building.type, building.level)*60)} per minute</p><progress aria-label="Ticket office storage" value={stored} max={Math.max(1,cap)} className="mt-2 w-full" /><p className="mt-2">Collect receipts before storage fills to keep earning. Your stadium also sets facility and equipment upgrade limits.</p></section>;
  }
  if (building.type === BuildingType.MEDICAL_CENTER) {
    const remaining = Math.max(0, ((100-club.resources.ENERGY)*energyIntervalMs(building.level)-(club.energyProgressMs ?? 0))/1000);
    return <section className="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/20 p-4 text-sm text-slate-300"><h3 className="font-bold text-white">Recovery room</h3><p className="mt-2">Energy {club.resources.ENERGY}/100</p><progress aria-label="Squad energy" value={club.resources.ENERGY} max={100} className="mt-2 w-full" /><p className="mt-2">{remaining ? `About ${Math.ceil(remaining/60)} minutes to full energy at the current recovery rate.` : 'Your squad has full energy.'}</p><p className="mt-2">Energy pays for drills and away games. Recovery continues while you are away.</p></section>;
  }
  const drill = building.activeDrillId ? DRILLS[building.activeDrillId] : null;
  return <section className="mb-4 rounded-xl border border-blue-800 bg-blue-950/20 p-4 text-sm text-slate-300"><h3 className="font-bold text-white">{building.type === BuildingType.TRAINING_PITCH ? 'Training schedule' : 'Preparation report'}</h3><p className="mt-2">Team readiness {club.teamReadiness}/100</p><progress aria-label="Team readiness" value={club.teamReadiness} max={100} className="mt-2 w-full" /><p className="mt-2">{drill ? `${drill.name} · ${building.state === DrillState.COMPLETED ? 'Ready to collect' : 'In progress'}` : building.type === BuildingType.TRAINING_PITCH ? 'Choose a position group and drill in Roster to start a session.' : 'Film study increases the readiness earned from drills. Compare your plan with the opponent’s formation before kickoff.'}</p><p className="mt-2">At 100 readiness, your next raid gains the fired-up bonus.</p></section>;
}
