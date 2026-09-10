import React from 'react';
import type { GameState } from '../types';
import { equipmentModel } from '../game/progression/equipmentModel';
export function EquipmentDetails({club,slotId}:{club:GameState;slotId:string}) {
  const model=equipmentModel(club,slotId);
  if(!model)return null;
  const b=model.behaviour;
  return <details className="mt-3 rounded-xl border border-slate-700 p-3 text-sm text-slate-300">
    <summary className="min-h-7 cursor-pointer font-bold text-white">Range {b.range} · fires every {b.cooldownSeconds}s · Details</summary>
    <p className="mt-2">{b.correctedDescription}</p>
    <p className="mt-2">Column {model.location.gridX+1}, row {model.location.gridY+1} · {model.fielded ? 'Installed in your saved defense' : 'Preview — not installed'}</p>
    {model.current && <p className="mt-2">Equipment Grit {Math.round(model.current.durability)}{model.next ? ` → ${Math.round(model.next.stats.durability)}` : ''} · Damage {Math.round(model.current.damage)}{model.next ? ` → ${Math.round(model.next.stats.damage)}` : ''}{model.next ? ` at level ${model.next.toLevel}` : ' at maximum level'}. Before squad and formation bonuses.</p>}
    {model.currentBoosted && <p className="mt-2">With your current squad and formation: {Math.round(model.currentBoosted.durability)} Grit · {Math.round(model.currentBoosted.damage)} damage.</p>}
    <p className="mt-2 text-amber-200">Level {b.signature.unlockLevel}: {b.signature.name} · every {b.signature.everySeconds}s. {b.signature.effect}</p>
    {model.next?.blockers.map(reason=><p key={reason.code} className="mt-2 text-amber-200">{reason.message}</p>)}
  </details>;
}
