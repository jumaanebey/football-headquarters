import type { EnemyBase } from '../battle';
import { crestForTeam } from '../campaign';
import { ROAD_CHALLENGES, scoutRaid } from '../game/raidScouting';
import { FORMATIONS, type FormationKey } from '../fixedBase';

export function RoadTargetCard({ base, choice, onChoose }: { base: EnemyBase; choice: number; onChoose: () => void }) {
  const challenge = base.challenge ?? (['open', 'contested', 'fortress'] as const)[choice];
  const label = ROAD_CHALLENGES[challenge];
  const scouting = scoutRaid(base.buildings);
  const formation = FORMATIONS[base.buildings.find(b => b.kind === 'hq')?.formation as FormationKey];
  return <button onClick={onChoose} aria-label={`Prepare ${base.name} · ${label.name} raid`}
    className="w-full rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left transition-colors hover:border-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400">
    <span className="flex items-center gap-3">
      <img src={crestForTeam(base.name)} alt="" width="40" height="40" className="h-10 w-10 shrink-0 object-contain"/>
      <span className="min-w-0 flex-1"><strong className="block text-base text-white">{base.name}</strong><span className={`text-xs font-bold uppercase tracking-wider ${challenge === 'fortress' ? 'text-rose-300' : challenge === 'contested' ? 'text-amber-200' : 'text-emerald-300'}`}>{label.name}</span></span>
      <span aria-hidden="true" className="text-xl text-orange-300">→</span>
    </span>
    <span className="mt-2 block text-sm text-slate-200">{label.description}</span>
    <span className="mt-1 block text-xs text-slate-400">{scouting.equipment} defenses · {formation?.name ?? 'Open formation'}{scouting.powerMoves > 0 ? ` · ${scouting.powerMoves} power moves` : ''}</span>
    <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-700 pt-3 text-sm font-bold"><span className="text-yellow-300">Up to {base.reward.coins.toLocaleString()} Coins</span><span className="text-sky-200">{base.reward.fans} Fans</span></span>
  </button>;
}
