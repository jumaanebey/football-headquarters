import { unitPower } from '../battle';
import { playerGrowth, drillEffects } from '../game/progression/playerGrowth';

import React, { useState } from 'react';
import { Player, UnitGroup, ResourceType, BuildingInstance, BuildingType, DrillState, GameState } from '../types';
import { DRILLS, TENDENCIES, TendencyKey, trainingYieldMult, warRoomReadinessMult } from '../constants';
import { unitSprite, unitPlayerSprite } from '../assets';
import { candidateOvr } from '../recruiting';
import { Shield, Target, Users, Zap, Dumbbell, Play, Star, ChevronRight } from 'lucide-react';
import { Sheet, HowTo } from './ui';

interface Props {
  initialView?: 'players' | 'training';
  roster: Player[];
  resources: Record<ResourceType, number>;
  club: GameState;
  blocked: boolean;
  playerFilter: UnitGroup | null;
  onFilterChange: (unit: UnitGroup | null) => void;
  onCollect: (building: BuildingInstance) => void;
  onClose: () => void;
  onTrainGroup: (unit: UnitGroup, drillId: string) => void;
  onCutPlayer?: (id: string) => void;
  onOpenHeroes?: () => void;
  onScout?: () => void;
}


// ─── COACH — mobile-first ──────────────────────────────────────────────────────
// One column, one flow: all four position groups in a compact grid, and the drill
// list opens DIRECTLY under the grid the moment you pick a group. No desktop
// two-pane split, no Offense/Defense toggle hiding half the squad.

const GROUPS: { unit: UnitGroup; title: string; subtitle: string; icon: React.ReactNode; ring: string }[] = [
  { unit: UnitGroup.OFFENSE_LINE,      title: 'The Trenches',    subtitle: 'OL',        icon: <Shield size={13} />, ring: '#ef4444' },
  { unit: UnitGroup.OFFENSE_SKILL,     title: 'Skill Positions', subtitle: 'QB·WR·RB',  icon: <Zap size={13} />,    ring: '#f97316' },
  { unit: UnitGroup.DEFENSE_LINE,      title: 'Front Seven',     subtitle: 'DL·LB',     icon: <Dumbbell size={13} />, ring: '#3b82f6' },
  { unit: UnitGroup.DEFENSE_SECONDARY, title: 'No Fly Zone',     subtitle: 'CB·S',      icon: <Target size={13} />, ring: '#6366f1' },
];

export const SquadModal: React.FC<Props> = ({ initialView = 'players', roster, resources, club, blocked, playerFilter, onFilterChange: setPlayerFilter, onCollect, onClose, onTrainGroup, onCutPlayer, onOpenHeroes, onScout }) => {
  const [view, setView] = useState<'players' | 'training'>(initialView);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitGroup | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('power');
  const [cutArmed, setCutArmed] = useState<string | null>(null); // two-tap confirm

  const pitch = club.buildings.find(b => b.type === BuildingType.TRAINING_PITCH);
  const film = club.buildings.find(b => b.type === BuildingType.TACTICS_ROOM);
  const activeDrill = pitch?.activeDrillId ? DRILLS[pitch.activeDrillId] : null;
  const trainingBusy = !pitch || pitch.state !== DrillState.IDLE;
  const payout = (coins: number) => Math.round(coins * trainingYieldMult(pitch?.level ?? 1));
  const readiness = (amount: number) => Math.round(amount * warRoomReadinessMult(film?.level ?? 1) * 10) / 10;

  const groupStats = (unit: UnitGroup) => {
    const players = roster.filter(p => p.unit === unit);
    if (players.length === 0) return { ovr: 0, count: 0 };
    const avg = players.reduce((acc, p) => acc + (p.stats.strength + p.stats.speed + p.stats.iq) / 3, 0) / players.length;
    return { ovr: Math.floor(avg), count: players.length };
  };

  // Group drills here; the whole-team scrimmage has its own card below.
  const drills = selectedUnit
    ? Object.values(DRILLS).filter(d => d.targetUnit === selectedUnit)
    : [];
  const unitPlayers = selectedUnit ? roster.filter(p => p.unit === selectedUnit) : [];

  const shownPlayers = roster.filter(p => (!playerFilter || p.unit === playerFilter) && `${p.name} ${p.role} ${p.rarity}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b) => (sort === 'power' ? unitPower(b)-unitPower(a) : sort === 'growth' ? a.level-b.level : candidateOvr(b)-candidateOvr(a)) || a.name.localeCompare(b.name));

  return (
    <Sheet
      title="Your roster"
      icon={<Users className="text-sky-400" size={22} />}
      subtitle={`${roster.length} players · ${Math.round(roster.reduce((sum, p) => sum + candidateOvr(p), 0) / Math.max(1, roster.length))} team OVR`}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="p-4 border-b border-slate-700 flex gap-2">
        {(['players','training'] as const).map(tab => <button key={tab} aria-pressed={view === tab} onClick={() => setView(tab)} className={`flex-1 rounded-xl px-4 py-3 font-bold capitalize ${view === tab ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-300'}`}>{tab}</button>)}
        <button onClick={onScout} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Scout</button>
      </div>
      {blocked && <p role="status" className="mx-4 mt-3 rounded-xl bg-blue-950 p-3 text-sm text-blue-200">Confirming your club change…</p>}
      {activeDrill && pitch && <section aria-label="Current training" className="mx-4 mt-3 rounded-xl border border-blue-700 bg-blue-950/30 p-4 text-sm text-blue-100">
        <strong>{activeDrill.name}</strong>
        <p className="mt-1">{pitch.state === DrillState.COMPLETED ? 'Ready to collect' : `${Math.max(0, Math.ceil(((pitch.finishTime ?? Date.now()) - Date.now()) / 1000))}s remaining`} · {payout(activeDrill.rewardCoins)} Coins · +{readiness(activeDrill.readinessGain)} readiness</p>
        {pitch.state === DrillState.COMPLETED && <button disabled={blocked} onClick={() => onCollect(pitch)} className="mt-3 min-h-11 w-full rounded-lg bg-amber-400 px-3 font-bold text-slate-950 disabled:opacity-50">Collect training & player growth</button>}
      </section>}
      {view === 'players' ? <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-300">Find a player<input aria-label="Find a player" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, role or rarity" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-white" /></label><label className="text-xs text-slate-300">Sort roster<select aria-label="Sort roster" value={sort} onChange={e=>setSort(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-white"><option value="power">Battle power</option><option value="ovr">Overall rating</option><option value="growth">Lowest level</option></select></label></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => setPlayerFilter(null)} aria-pressed={playerFilter === null} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-white">All players</button>{GROUPS.map(g => <button key={g.unit} aria-pressed={playerFilter === g.unit} onClick={() => setPlayerFilter(g.unit)} className={`rounded-lg border px-3 py-2 text-sm ${playerFilter === g.unit ? 'border-orange-400 bg-orange-500/20 text-orange-200' : 'border-slate-700 text-slate-300'}`}>{g.title}</button>)}</div>
        <p className="text-xs text-slate-400">{shownPlayers.length} of {roster.length} players · Battle power includes role, rarity and training.</p>
        {shownPlayers.length === 0 && <div role="status" className="rounded-xl border border-slate-700 p-4 text-sm text-slate-300">No players match this view.<button onClick={()=>{setSearch('');setPlayerFilter(null);}} className="mt-2 block min-h-11 text-sky-300 font-bold">Show all players</button></div>}
        <div className="grid gap-3 sm:grid-cols-2">{shownPlayers.map(p => <article key={p.id} className="rounded-2xl border border-slate-700 bg-slate-800/60 overflow-hidden">
          <button aria-expanded={selectedPlayer === p.id} onClick={() => {setSelectedPlayer(selectedPlayer === p.id ? null : p.id);setCutArmed(null);}} className="w-full flex items-center gap-3 p-4 text-left">
            <img src={unitPlayerSprite(p.unit)} alt="" className="w-14 h-16 object-contain" />
            <span className="flex-1 min-w-0"><strong className="block text-white">{p.name}</strong><span className="block text-sm text-slate-300">{p.role} · Level {p.level}</span><span className="block text-xs text-slate-400">{p.rarity} · Power {Math.round(unitPower(p))}</span><span className="text-xs text-orange-300">{selectedPlayer === p.id ? 'Close player ↑' : 'Stats & growth →'}</span></span>
            <span className="text-center text-2xl font-bold text-amber-300">{candidateOvr(p)}<small className="block text-xs text-slate-400">OVR</small></span>
          </button>
          {selectedPlayer === p.id && <div className="border-t border-slate-700 p-4 space-y-3">
            <dl className="grid grid-cols-3 gap-2 text-center">{[['Strength',p.stats.strength],['Speed',p.stats.speed],['IQ',p.stats.iq]].map(([label,value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="text-lg font-bold text-white">{value}</dd></div>)}</dl>
            {TENDENCIES[p.tendency as TendencyKey] && <p className="text-sm text-slate-300">Trait · {TENDENCIES[p.tendency as TendencyKey].label}: {TENDENCIES[p.tendency as TendencyKey].desc}</p>}
            {(() => {const growth=playerGrowth(club,p.id,Date.now());return growth && <section className="rounded-xl bg-slate-900 p-3 text-sm text-slate-300"><strong className="text-white">On the field</strong><p className="mt-1">Power {Math.round(growth.combat.power)} → {Math.round(growth.nextStep.after.combat.power)} after the next collected drill.</p><p className="mt-1">Grit {Math.round(growth.combat.statline.hp)} → {Math.round(growth.nextStep.after.combat.statline.hp)} · Yardage {Math.round(growth.combat.statline.dps)} → {Math.round(growth.nextStep.after.combat.statline.dps)}</p><p className="mt-2">Growth is earned when you collect training. There is no separate XP meter.</p></section>;})()}
            <p className="text-sm text-blue-200">Collecting a completed drill for this group adds 1 level and +1 Strength, Speed and IQ to each participating player.</p>
            <button onClick={() => {setSelectedUnit(p.unit);setView('training');}} className="w-full rounded-lg bg-blue-600 p-3 font-bold text-white">Train this position group</button>
            {onCutPlayer && roster.length > 6 && (cutArmed === p.id ? <div className="space-y-2"><p className="text-sm text-red-200">Release {p.name}? This frees one roster spot.</p><div className="flex gap-2"><button disabled={blocked} onClick={() => {onCutPlayer(p.id);setCutArmed(null);}} className="rounded-lg bg-red-700 px-3 py-3 text-white">Confirm release</button><button onClick={() => setCutArmed(null)} className="p-3 text-white">Keep player</button></div></div> : <button disabled={blocked} onClick={() => setCutArmed(p.id)} className="min-h-11 text-sm text-red-300">Release player</button>)}
          </div>}
        </article>)}</div>
      </div> : <div className="p-4 sm:p-5 space-y-4">
        <HowTo id="coach" lines={[
          'Run drills to build READINESS — at 100% your squad is FIRED UP and the next raid hits +15% harder.',
          'Drills cost ⚡ Energy and pay Coins. Each position group trains on its own.',
          'Hero levels and stars are managed in Heroes. Use Scout to recruit more squad players.',
        ]} />

        {/* All four groups, always visible — compact 2×2 grid, thumb-sized targets */}
        <div className="grid grid-cols-2 gap-2.5">
          {GROUPS.map(g => {
            const { ovr, count } = groupStats(g.unit);
            const sel = selectedUnit === g.unit;
            return (
              <button
                key={g.unit}
                onClick={() => { setSelectedUnit(sel ? null : g.unit); setRosterOpen(false); }}
                className={`relative rounded-2xl border-2 p-3 text-left transition-all active:scale-95 overflow-hidden
                  ${sel ? 'bg-slate-800' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}
                style={sel ? { borderColor: g.ring, boxShadow: `0 0 0 2px ${g.ring}55` } : undefined}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-b from-emerald-700/40 to-slate-900 border border-slate-700 overflow-hidden flex items-end justify-center shrink-0">
                    <img src={unitPlayerSprite(g.unit)} alt="" draggable={false}
                      onError={e => { (e.currentTarget as HTMLImageElement).src = unitSprite(g.unit, 'idle'); }}
                      className="w-[95%] max-w-none h-auto object-contain -mb-0.5 select-none" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[13px] uppercase leading-tight text-white truncate">{g.title}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{g.subtitle} · {count}</div>
                    <div className={`text-[12px] font-mono font-bold mt-0.5 ${ovr > 80 ? 'text-yellow-400' : 'text-slate-200'}`}>OVR {ovr}</div>
                  </div>
                </div>
                {sel && <span className="absolute top-1.5 right-1.5 text-[9px] font-black uppercase text-black px-1.5 py-0.5 rounded" style={{ background: g.ring }}>✓</span>}
              </button>
            );
          })}
        </div>

        {/* Drills for the selected group — right here, no second pane to find */}
        {selectedUnit && (
          <div className="animate-fade-in space-y-2">
            <div className="text-[12px] uppercase tracking-widest font-bold text-slate-400">
              Drills · <span className="text-sky-300">{GROUPS.find(g => g.unit === selectedUnit)?.title}</span>
            </div>
            {drills.map(drill => {
              const effect = drillEffects(club, selectedUnit).find(d => d.drillId === drill.id)!;
              const canAfford = resources.ENERGY >= drill.costEnergy;
              const teamWide = drill.targetUnit === 'ALL';
              return (
                <button
                  key={drill.id}
                  onClick={() => onTrainGroup(selectedUnit, drill.id)}
                  disabled={blocked || !effect.canStart}
                  className={`w-full flex items-center justify-between gap-2 p-3 rounded-2xl border-2 transition-all text-left active:scale-[0.98]
                    ${canAfford ? 'bg-slate-800 border-slate-700 hover:border-sky-400' : 'bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 bg-black rounded-xl flex items-center justify-center border border-slate-700 shrink-0">
                      <Dumbbell size={20} className={canAfford ? 'text-sky-400' : 'text-slate-600'} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white leading-tight truncate">{drill.name}{teamWide && <span className="ml-1.5 text-[9px] font-black uppercase bg-purple-600 text-white px-1.5 py-0.5 rounded align-middle">whole team</span>}</div>
                      <div className="flex flex-wrap gap-x-2.5 text-[11px] text-slate-400 mt-0.5">
                        <span className="text-green-400 font-bold">+{readiness(drill.readinessGain)}% ready</span>
                        <span>⚡{drill.costEnergy}</span>
                        <span>{drill.durationSeconds}s</span>
                        <span className="text-yellow-500">+{payout(drill.rewardCoins)}🪙</span>
                      </div>
                    </div>
                  </div>
                  <div className={`shrink-0 flex items-center gap-1 px-3.5 py-2.5 rounded-xl font-bold text-sm ${canAfford ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                    <Play size={14} fill="currentColor" /> {!effect.unlocked ? `Field L${effect.levelReq}` : trainingBusy ? 'Busy' : effect.playersAffected === 0 ? 'No players' : canAfford ? 'Train' : 'Low ⚡'}
                  </div>
                </button>
              );
            })}

            {/* Unit roster — tucked behind one tap, not a page of rows */}
            <button onClick={() => setRosterOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/60 text-[12px] font-bold text-slate-300">
              <span>👥 Unit roster ({unitPlayers.length})</span>
              <ChevronRight size={14} className={`transition-transform ${rosterOpen ? 'rotate-90' : ''}`} />
            </button>
            {rosterOpen && (
              <div className="space-y-1.5">
                {unitPlayers.map(p => {
                  // Cut decisions need numbers: same OVR the Scouting cards show + the three raw stats.
                  const ovr = candidateOvr(p);
                  return (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-slate-900/50 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-white shrink-0" style={{ backgroundColor: p.avatarColor }}>{p.role}</div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-200 text-sm leading-tight truncate">{p.name}</div>
                        <div className="flex items-center gap-1.5 leading-tight">
                          {(() => { const t = TENDENCIES[p.tendency as TendencyKey]; return t ? (
                            <span className="text-[10px] font-bold shrink-0" style={{ color: t.color }} title={t.desc}>{t.emoji} {t.label}</span>
                          ) : null; })()}
                          <span className="font-mono text-[10px] text-slate-500 truncate" title="Strength · Speed · IQ">STR {p.stats.strength} · SPD {p.stats.speed} · IQ {p.stats.iq}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-mono text-[11px] font-bold ${ovr >= 80 ? 'text-yellow-400' : ovr >= 60 ? 'text-slate-200' : 'text-slate-400'}`} title="Overall — average of Strength, Speed, and IQ">OVR {ovr}</span>
                      <span className="font-mono text-[11px] text-slate-500">L{p.level}</span>
                      <button onClick={()=>{setPlayerFilter(p.unit);setSearch('');setSelectedPlayer(p.id);setCutArmed(null);setView('players');}} className="min-h-11 rounded-lg border border-slate-600 px-3 text-xs text-sky-200">View player</button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!selectedUnit && (
          <div className="text-center text-[12px] text-slate-500 py-2">Readiness fires up your next raid (+15% at 100%) — drills build it.</div>
        )}

        {/* 🏈 FULL SCRIMMAGE — the whole squad trains at once (big energy, big payoff) */}
        {(() => {
          const sc = DRILLS['scrimmage'];
          if (!sc) return null;
          const effect = drillEffects(club, UnitGroup.OFFENSE_LINE).find(d => d.drillId === sc.id)!;
          const canAfford = resources.ENERGY >= sc.costEnergy;
          return (
            <button onClick={() => onTrainGroup(UnitGroup.OFFENSE_LINE, 'scrimmage')} disabled={blocked || !effect.canStart}
              className={`w-full flex items-center justify-between gap-2 p-3 rounded-2xl border-2 transition-all text-left active:scale-[0.98]
                ${canAfford ? 'bg-purple-950/40 border-purple-700 hover:border-purple-400' : 'bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-black rounded-xl flex items-center justify-center border border-purple-800 shrink-0 text-lg">🏈</div>
                <div className="min-w-0">
                  <div className="font-bold text-white leading-tight">Full Scrimmage <span className="ml-1 text-[9px] font-black uppercase bg-purple-600 text-white px-1.5 py-0.5 rounded align-middle">whole team</span></div>
                  <div className="flex flex-wrap gap-x-2.5 text-[11px] text-slate-400 mt-0.5">
                    <span className="text-green-400 font-bold">+{readiness(sc.readinessGain)}% ready</span>
                    <span>⚡{sc.costEnergy}</span>
                    <span>{sc.durationSeconds}s</span>
                    <span className="text-yellow-500">+{payout(sc.rewardCoins)}🪙</span>
                  </div>
                </div>
              </div>
              <div className={`shrink-0 flex items-center gap-1 px-3.5 py-2.5 rounded-xl font-bold text-sm ${canAfford ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                <Play size={14} fill="currentColor" /> {!effect.unlocked ? `Field L${effect.levelReq}` : trainingBusy ? 'Busy' : effect.playersAffected === 0 ? 'No players' : canAfford ? 'Run it' : 'Low ⚡'}
              </div>
            </button>
          );
        })()}

        <button onClick={onOpenHeroes} className="w-full rounded-xl border border-amber-700 bg-amber-950/20 p-4 text-left text-amber-200"><strong className="block">Hero growth & signature practice →</strong><span className="text-sm">Compare level and star upgrades in Heroes.</span></button>
      </div>}
    </Sheet>
  );
};
