
import React, { useState } from 'react';
import { Player, UnitGroup, ResourceType } from '../types';
import { DRILLS, TENDENCIES, TendencyKey } from '../constants';
import { unitSprite, unitPlayerSprite } from '../assets';
import { Shield, Target, Users, Zap, Dumbbell, Play, Star, ChevronRight } from 'lucide-react';
import { Sheet } from './ui';

interface Props {
  roster: Player[];
  resources: Record<ResourceType, number>;
  onClose: () => void;
  onTrainGroup: (unit: UnitGroup, drillId: string) => void;
  onOpenHeroes?: () => void;
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

export const SquadModal: React.FC<Props> = ({ roster, resources, onClose, onTrainGroup, onOpenHeroes }) => {
  const [selectedUnit, setSelectedUnit] = useState<UnitGroup | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);

  const groupStats = (unit: UnitGroup) => {
    const players = roster.filter(p => p.unit === unit);
    if (players.length === 0) return { ovr: 0, count: 0 };
    const avg = players.reduce((acc, p) => acc + (p.stats.strength + p.stats.speed + p.stats.iq) / 3, 0) / players.length;
    return { ovr: Math.floor(avg), count: players.length };
  };

  // Per-group drills only (the 'ALL' scrimmage needs its own handler path — parked).
  const drills = selectedUnit
    ? Object.values(DRILLS).filter(d => d.targetUnit === selectedUnit)
    : [];
  const unitPlayers = selectedUnit ? roster.filter(p => p.unit === selectedUnit) : [];

  return (
    <Sheet
      title="Coach"
      icon={<Users className="text-sky-400" size={22} />}
      subtitle={selectedUnit ? 'Pick a drill — training builds Readiness for game day.' : 'Tap a position group to run a drill.'}
      onClose={onClose}
      maxWidth="max-w-lg"
      actions={
        <button onClick={onOpenHeroes} className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 rounded-full text-black font-bold flex items-center gap-1.5 transition-colors text-sm">
          <Star size={15} className="fill-current" /> Heroes
        </button>
      }
    >
      <div className="p-4 sm:p-5 space-y-4">

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
              const canAfford = resources.ENERGY >= drill.costEnergy;
              const teamWide = drill.targetUnit === 'ALL';
              return (
                <button
                  key={drill.id}
                  onClick={() => onTrainGroup(selectedUnit, drill.id)}
                  disabled={!canAfford}
                  className={`w-full flex items-center justify-between gap-2 p-3 rounded-2xl border-2 transition-all text-left active:scale-[0.98]
                    ${canAfford ? 'bg-slate-800 border-slate-700 hover:border-sky-400' : 'bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 bg-black rounded-xl flex items-center justify-center border border-slate-700 shrink-0">
                      <Dumbbell size={20} className={canAfford ? 'text-sky-400' : 'text-slate-600'} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white leading-tight truncate">{drill.name}{teamWide && <span className="ml-1.5 text-[9px] font-black uppercase bg-purple-600 text-white px-1.5 py-0.5 rounded align-middle">whole team</span>}</div>
                      <div className="flex gap-2.5 text-[11px] text-slate-400 mt-0.5">
                        <span className="text-green-400 font-bold">+{drill.readinessGain}% ready</span>
                        <span>⚡{drill.costEnergy}</span>
                        <span>{drill.durationSeconds}s</span>
                        <span className="text-yellow-500">+{drill.rewardCoins}🪙</span>
                      </div>
                    </div>
                  </div>
                  <div className={`shrink-0 flex items-center gap-1 px-3.5 py-2.5 rounded-xl font-bold text-sm ${canAfford ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                    <Play size={14} fill="currentColor" /> {canAfford ? 'Train' : 'Low ⚡'}
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
                {unitPlayers.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-slate-900/50 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-white shrink-0" style={{ backgroundColor: p.avatarColor }}>{p.role}</div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-200 text-sm leading-tight truncate">{p.name}</div>
                        {(() => { const t = TENDENCIES[p.tendency as TendencyKey]; return t ? (
                          <span className="text-[10px] font-bold" style={{ color: t.color }} title={t.desc}>{t.emoji} {t.label}</span>
                        ) : null; })()}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">L{p.level}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!selectedUnit && (
          <div className="text-center text-[12px] text-slate-500 py-2">Readiness fires up your next raid (+15% at 100%) — drills build it.</div>
        )}
      </div>
    </Sheet>
  );
};
