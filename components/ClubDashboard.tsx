import {clubNextStep,type JourneyDestination} from '../game/presentation/clubJourney';
import {STATIONS} from '../game/development';
import {STADIUM_OPPONENTS} from '../game/stadiumFootball';
import React from 'react';
import { Users, Shield, Goal, Trophy, Activity } from 'lucide-react';
import { GameState, BuildingType } from '../types';
import { Sheet, RankCrest } from './ui';
import { clubPower, clubPowerBreakdown, rankFor } from '../ranks';
import { GROWTH_TIERS, collectorRate } from '../constants';
import { buildingSprite, BUILDING_ERAS, BUILDING_ART_LEVELS } from '../assets';
import {unitPower} from '../battle';
import { formationDef } from '../fixedBase';
import { fanMilestoneTotal } from '../game/fanProgress';
import { isArchivedAiRaid } from '../game/defenseHistory';

const number = (n: number) => Math.floor(n).toLocaleString();
function Progress({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <div className="fhq-progress" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${percent}%` }} /></div>;
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="fhq-stat-row"><span>{label}</span><strong>{value}</strong></div>;
}
interface Props { onOpen?:(destination:JourneyDestination)=>void;gs: GameState; onClose: () => void; onRoster: () => void; onGameDay: () => void; onDefense: () => void; }

export function ClubDashboard({ onOpen, gs, onClose, onRoster, onGameDay, onDefense }: Props) {
  const next=clubNextStep(gs);
  const reports=gs.development?.reports.slice(0,4)??[];
  const games=gs.stadiumFootball?.history.slice(0,3)??[];
  const fans = gs.resources.FANS;
  const peakFans = fanMilestoneTotal(gs);
  const tierIndex = GROWTH_TIERS.filter(t => peakFans >= t.fans).length;
  const tier = GROWTH_TIERS[tierIndex - 1], nextTier = GROWTH_TIERS[tierIndex];
  const floor = tier?.fans ?? 0;
  const stadium = gs.buildings.find(b => b.type === BuildingType.STADIUM);
  const level = stadium?.level ?? 1;
  const artIndex = Math.max(0, BUILDING_ART_LEVELS(BuildingType.STADIUM).filter(l => l <= level).length - 1);
  const rank = rankFor(gs.trophies);
  const power = clubPower(gs), parts = clubPowerBreakdown(gs);
  const seasonBalls = Object.values(gs.campaign?.stars ?? {}).reduce((sum, n) => sum + n, 0);
  const average = gs.roster.length ? Math.round(gs.roster.reduce((sum, p) => sum + unitPower(p), 0) / gs.roster.length) : 0;
  const log = (gs.defenseLog ?? []).filter(entry => !isArchivedAiRaid(entry)), held = log.filter(r => r.stars === 0).length;
  return <Sheet title="Your program" icon={<Activity size={23} />} subtitle={gs.teamName} onClose={onClose} maxWidth="max-w-3xl">
    <div className="fhq-dashboard">
      <section className="fhq-program-next"><small>YOUR NEXT STEP</small><h3>{next.title}</h3><p>{next.detail}</p><button onClick={()=>onOpen?.(next.destination)}>{next.action} →</button></section>
      <div className="fhq-program-readiness"><div><strong>{gs.teamReadiness}<small>/100</small></strong><span>Team readiness</span></div><div><strong>{gs.resources.ENERGY}<small>/100</small></strong><span>Club Energy</span></div><p>Film and field practice build readiness. At 100, your next raid gains its 15% preparation bonus.</p></div>
      <section className="fhq-program-progress"><h3>Recent development</h3>{reports.length?reports.map(r=><article key={r.id}><strong>{STATIONS[r.station].name}</strong><p>{r.players.length?r.players.slice(0,2).map(p=>`${p.name}: ${p.stat} ${p.before} → ${p.after}`).join(' · '):`${r.energy} Energy restored`}{r.players.length>2?` · +${r.players.length-2} teammates`:''}</p><button onClick={()=>onOpen?.(r.station)}>Open {STATIONS[r.station].name} →</button></article>):<p>Your first completed session will appear here with each player’s gains.</p>}</section>
      <section className="fhq-program-progress"><h3>Stadium football results</h3>{games.length?games.map(g=><article key={g.id}><strong>{g.home>g.away?'Win':g.home===g.away?'Tie':'Loss'} · {g.home}–{g.away} vs {STADIUM_OPPONENTS[g.opponent].name}</strong><p>{g.reward} Coins collected</p></article>):<p>No collected Stadium games yet. Each game gives both teams one possession.</p>}</section>
      <section className="fhq-dashboard-banner" style={level >= 9 ? { backgroundImage: 'linear-gradient(90deg, #07101855, #071018ee), url(/assets/gpt/campus-vision.png)', backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <img src={buildingSprite(BuildingType.STADIUM, level)} alt={`${BUILDING_ERAS[BuildingType.STADIUM][artIndex]} stadium`} width="245" height="190" />
        <div><span className="fhq-eyebrow">Home field · Level {level}</span><h3>{BUILDING_ERAS[BuildingType.STADIUM][artIndex]}</h3><p>{tier?.name ?? 'Quiet campus'}<br />{number(fans)} fans behind your program.</p></div>
      </section>
      <div className="fhq-dashboard-actions">
        <button onClick={onRoster}><Users size={22} />Manage roster</button>
        <button onClick={onGameDay}><Goal size={22} />Game Day</button>
        <button onClick={onDefense}><Shield size={22} />Set defense</button>
      </div>
      <div className="fhq-dashboard-grid">
        <section className="fhq-stat-card"><h3>Club investment</h3><p>Combined progress across your facilities, heroes and roster.</p><div className="fhq-big-stat">{number(power)}</div>
          {parts.map(part => <Stat key={part.label} label={part.label} value={number(part.pts)} />)}
        </section>
        <section className="fhq-stat-card"><h3>Your standing</h3>
          <div className="flex items-center gap-3"><RankCrest rank={rank.rank} size={54} /><div><span className="fhq-big-stat">{number(gs.trophies)}</span><div className="text-sm text-amber-300">{rank.rank.name}</div></div></div>
          <Progress value={rank.progress} label="Progress to next rank" />
          <p>{rank.next ? `${number(rank.next.min - gs.trophies)} trophies to ${rank.next.name}` : 'You have reached the top rank.'}</p>
          <Stat label="Season stage reached" value={`${gs.campaign?.unlocked ?? 1} / 12`} /><Stat label="Season game balls" value={`${seasonBalls} / 36`} />
        </section>
        <section className="fhq-stat-card"><h3>Campus growth</h3><div className="fhq-big-stat">{number(peakFans)} <span className="text-base font-normal text-slate-300">record fanbase</span></div>
          <Progress value={nextTier ? (peakFans - floor) / (nextTier.fans - floor) : 1} label="Progress to next campus stage" />
          <p>{nextTier ? `Reach ${number(nextTier.fans)} Fans to unlock ${nextTier.name}.` : 'Your tailgate city is fully unlocked.'} Earned campus stages stay unlocked when you rally.</p>
          <Stat label="Available Fans" value={number(fans)} />
          <Stat label="Gate receipts" value={`${number(collectorRate(BuildingType.STADIUM, level) * 60)} / min`} />
          <Stat label="Builders working" value={`${gs.upgrades.length} / ${gs.builders}`} />
        </section>
        <section className="fhq-stat-card"><h3>Roster & home defense</h3>
          <Stat label="Roster" value={`${gs.roster.length} players`} /><Stat label="Average player Power" value={number(average)} />
          <Stat label="Energy" value={`${number(gs.resources.ENERGY)} / 100`} />
          <Stat label="Defensive scheme" value={formationDef(gs.formation).name} />
          <Stat label="Home defense reports" value={log.length ? `${held} held · ${log.length - held} stormed` : 'No games yet'} />
        </section>
      </div>
    </div>
  </Sheet>;
}
