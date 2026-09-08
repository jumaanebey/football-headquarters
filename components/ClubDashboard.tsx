import React from 'react';
import { Users, Shield, Goal, Trophy, Activity } from 'lucide-react';
import { GameState, BuildingType } from '../types';
import { Sheet, RankCrest } from './ui';
import { clubPower, clubPowerBreakdown, rankFor } from '../ranks';
import { GROWTH_TIERS, collectorRate } from '../constants';
import { buildingSprite, BUILDING_ERAS, BUILDING_ART_LEVELS } from '../assets';
import { candidateOvr } from '../recruiting';
import { formationDef } from '../fixedBase';

const number = (n: number) => Math.floor(n).toLocaleString();
function Progress({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <div className="fhq-progress" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${percent}%` }} /></div>;
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="fhq-stat-row"><span>{label}</span><strong>{value}</strong></div>;
}
interface Props { gs: GameState; onClose: () => void; onRoster: () => void; onGameDay: () => void; onDefense: () => void; }

export function ClubDashboard({ gs, onClose, onRoster, onGameDay, onDefense }: Props) {
  const fans = gs.resources.FANS;
  const tierIndex = GROWTH_TIERS.filter(t => fans >= t.fans).length;
  const tier = GROWTH_TIERS[tierIndex - 1], nextTier = GROWTH_TIERS[tierIndex];
  const floor = tier?.fans ?? 0;
  const stadium = gs.buildings.find(b => b.type === BuildingType.STADIUM);
  const level = stadium?.level ?? 1;
  const artIndex = Math.max(0, BUILDING_ART_LEVELS(BuildingType.STADIUM).filter(l => l <= level).length - 1);
  const rank = rankFor(gs.trophies);
  const power = clubPower(gs), parts = clubPowerBreakdown(gs);
  const seasonBalls = Object.values(gs.campaign?.stars ?? {}).reduce((sum, n) => sum + n, 0);
  const average = gs.roster.length ? Math.round(gs.roster.reduce((sum, p) => sum + candidateOvr(p), 0) / gs.roster.length) : 0;
  const log = gs.defenseLog ?? [], held = log.filter(r => r.stars === 0).length;
  return <Sheet title="Your program" icon={<Activity size={23} />} subtitle={gs.teamName} onClose={onClose} maxWidth="max-w-3xl">
    <div className="fhq-dashboard">
      <section className="fhq-dashboard-banner">
        <img src={buildingSprite(BuildingType.STADIUM, level)} alt={`${BUILDING_ERAS[BuildingType.STADIUM][artIndex]} stadium`} width="245" height="190" />
        <div><span className="fhq-eyebrow">Home field · Level {level}</span><h3>{BUILDING_ERAS[BuildingType.STADIUM][artIndex]}</h3><p>{tier?.name ?? 'Quiet campus'}<br />{number(fans)} fans behind your program.</p></div>
      </section>
      <div className="fhq-dashboard-actions">
        <button onClick={onRoster}><Users size={22} />Manage roster</button>
        <button onClick={onGameDay}><Goal size={22} />Game Day</button>
        <button onClick={onDefense}><Shield size={22} />Set defense</button>
      </div>
      <div className="fhq-dashboard-grid">
        <section className="fhq-stat-card"><h3>Club power</h3><div className="fhq-big-stat">{number(power)}</div>
          {parts.map(part => <Stat key={part.label} label={part.label} value={number(part.pts)} />)}
        </section>
        <section className="fhq-stat-card"><h3>Your standing</h3>
          <div className="flex items-center gap-3"><RankCrest rank={rank.rank} size={54} /><div><span className="fhq-big-stat">{number(gs.trophies)}</span><div className="text-sm text-amber-300">{rank.rank.name}</div></div></div>
          <Progress value={rank.progress} label="Progress to next rank" />
          <p>{rank.next ? `${number(rank.next.min - gs.trophies)} trophies to ${rank.next.name}` : 'You have reached the top rank.'}</p>
          <Stat label="Season stage reached" value={`${gs.campaign?.unlocked ?? 1} / 12`} /><Stat label="Season game balls" value={`${seasonBalls} / 36`} />
        </section>
        <section className="fhq-stat-card"><h3>Campus growth</h3><div className="fhq-big-stat">{number(fans)} <span className="text-base font-normal text-slate-300">fans</span></div>
          <Progress value={nextTier ? (fans - floor) / (nextTier.fans - floor) : 1} label="Progress to next campus stage" />
          <p>{nextTier ? `${number(nextTier.fans - fans)} more fans unlock ${nextTier.name}.` : 'Your tailgate city is fully unlocked.'}</p>
          <Stat label="Gate receipts" value={`${number(collectorRate(BuildingType.STADIUM, level) * 60)} / min`} />
          <Stat label="Builders working" value={`${gs.upgrades.length} / ${gs.builders}`} />
        </section>
        <section className="fhq-stat-card"><h3>Team readiness</h3>
          <Stat label="Roster" value={`${gs.roster.length} players`} /><Stat label="Average rating" value={`${average} OVR`} />
          <Stat label="Energy" value={`${number(gs.resources.ENERGY)} / 100`} />
          <Stat label="Defensive scheme" value={formationDef(gs.formation).name} />
          <Stat label="Recorded home games" value={log.length ? `${held} held · ${log.length - held} stormed` : 'No games yet'} />
        </section>
      </div>
    </div>
  </Sheet>;
}
