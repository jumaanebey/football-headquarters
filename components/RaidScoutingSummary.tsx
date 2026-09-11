import type { BattleConfig } from '../game/combat/contracts';
import { ROAD_CHALLENGES, scoutRaid } from '../game/raidScouting';

export function RaidScoutingSummary({config}: {config: BattleConfig}) {
  const report = scoutRaid(config.buildings);
  if (!report.equipment) return null;
  return <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm" aria-label="Raid scouting report">
    <strong className="block text-white">{config.roadChallenge ? `${ROAD_CHALLENGES[config.roadChallenge].name} raid · ` : ''}Read the approach</strong>
    <p className="mt-1 text-slate-300">{report.lighterApproaches.length === report.lanes.length ? 'Similar equipment coverage on all four approaches.' : `${report.lighterApproaches.join(' / ')} has lighter equipment coverage.`}</p>
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">{report.lanes.map(l => <span key={l.label} className="rounded-md bg-slate-800 px-2 py-1">{l.label} · {l.coverage} covering</span>)}</div>
    {report.powerMoves > 0 && <p className="mt-2 font-semibold text-amber-200">Power moves active · Spread out. Rally clear of yellow marks.</p>}
    <p className="mt-2 text-xs text-slate-400">Initial equipment reach; walls and defenders still matter.</p>
  </div>;
}
