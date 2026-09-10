import { useMemo, useState } from 'react';
import type { GameState } from '../types';
import type { CampusLayout } from '../game/campusLayout';
import { createDefenseSnapshot } from '../game/defenseSnapshot';
import { GAME_PLANS } from '../battle';
import { formationDef } from '../fixedBase';

export function DefenseDraftPreview({ state, layout }: { state: GameState; layout: CampusLayout }) {
  const [ranges, setRanges] = useState(true);
  const snapshot = useMemo(() => createDefenseSnapshot({ ...state, formation: layout.formation, campusLayout: layout }), [state, layout]);
  const formation = formationDef(layout.formation);
  const planNames = (keys: string[]) => GAME_PLANS.filter(p => keys.includes(p.key)).map(p => p.name).join(', ');
  return <section aria-label="Draft defense strategy" className="space-y-3 rounded-xl border border-slate-600 bg-slate-900 p-3 text-sm text-slate-300">
    <h3 className="font-bold text-white">Tactical preview · top-down</h3>
    <p>This draft’s battle positions include your Parking Lot spacing. Only owned, unlocked equipment appears.</p>
    <button type="button" aria-pressed={ranges} onClick={() => setRanges(value => !value)} className="min-h-11 rounded-lg border border-slate-500 px-3 text-white">{ranges ? 'Hide' : 'Show'} coverage guides</button>
    <svg viewBox="-5 -5 110 110" role="img" aria-label="Draft defense positions with equipment range guides" className="mx-auto max-h-80 w-full rounded-lg bg-emerald-950">
      <rect x="0" y="0" width="100" height="100" fill="#164e32" stroke="#bbf7d0" strokeWidth=".5" />
      {ranges && snapshot.buildings.filter(b => b.kind === 'defense' && b.range).map(b => <circle key={`range-${b.id}`} cx={b.x} cy={b.y} r={b.range} fill="#38bdf8" fillOpacity=".12" stroke="#7dd3fc" strokeWidth=".5" />)}
      {snapshot.buildings.map(b => <g key={b.id}>
        {b.kind === 'wall' ? <rect x={b.x-1.5} y={b.y-1.5} width="3" height="3" fill="#cbd5e1" /> : <>
          <circle cx={b.x} cy={b.y} r={b.kind === 'hq' ? 5 : 3.5} fill={b.kind === 'hq' ? '#fbbf24' : b.kind === 'defense' ? '#38bdf8' : '#f8fafc'} stroke="#0f172a" strokeWidth=".5" />
          <text x={b.x} y={b.y+1.2} textAnchor="middle" fill="#0f172a" fontSize="3">{b.kind === 'hq' ? 'HQ' : b.kind === 'defense' ? 'D' : 'F'}</text>
        </>}
      </g>)}
    </svg>
    <p>Gold: Stadium · Blue: defense · White: facilities · Gray: walls. Range guides show reach; walls and movement still affect the actual fight.</p>
    <p><strong className="text-white">{formation.name}</strong> counters {planNames(formation.counter.strongVs)}; vulnerable to {planNames(formation.counter.weakTo)}.</p>
    <div><h4 className="font-bold text-white">Gate assignments in this draft</h4>
      <ul className="mt-1 space-y-1">{snapshot.campus.gates.map(gate => <li key={gate.id}>{gate.label}: {snapshot.assignedHeroes.find(hero => hero.gateId === gate.id)?.guard.name ?? 'No hero assigned'}</li>)}</ul>
    </div>
    <p>Apply the layout, then use Test saved defense to check the actual drive. Inspect one placement change at a time.</p>
  </section>;
}
