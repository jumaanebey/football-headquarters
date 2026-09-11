import { hashDefenseFlavor } from '../battle';
import React from 'react';
import type { BattleBuildingDef } from '../battle';
import { EQUIPMENT_COUNTERS, LEGACY_COMBAT_RULES, RAID_TACTICS_RULES, TACTICAL_WARNINGS } from '../game/combat/defenseCounters';
export function DefenseCounterGuide({buildings,rules}:{buildings:BattleBuildingDef[];rules?:string}) {
  const tactical=!rules||rules===RAID_TACTICS_RULES;
  const kinds=[...new Set(buildings.filter(b=>b.kind==='defense').map(b=>b.flavor??hashDefenseFlavor(b.id)??'jugs'))];
  if(!kinds.length)return null;
  if(rules===LEGACY_COMBAT_RULES)return <p className="text-xs text-slate-400">This saved game uses the previous equipment rules.</p>;
  return <details className="rounded-xl border border-slate-700 p-3 text-sm text-slate-300"><summary className="cursor-pointer font-bold text-white">Equipment matchups · {kinds.length} types</summary><p className="mt-2 text-xs">Yellow marks warn before impact. Area attacks hit the marked turf, so positioning matters.</p><div className="mt-3 space-y-3">{kinds.map(kind=>{const rule=EQUIPMENT_COUNTERS[kind],warning=tactical?TACTICAL_WARNINGS[kind]:rule.windup;return <div key={kind}><h4 className="font-bold text-white">{rule.name}</h4><p>{rule.counter}</p><p className="text-xs text-sky-200">{warning?`${warning}s warning · `:''}{rule.cooldown}s recovery{rule.duration?` · ${rule.duration}s base effect`:''}</p></div>})}</div></details>;
}
