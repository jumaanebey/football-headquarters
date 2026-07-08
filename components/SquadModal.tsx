
import React, { useState } from 'react';
import { Player, UnitGroup, ResourceType, HeroState, UpgradeJob } from '../types';
import { DRILLS, TENDENCIES, TendencyKey } from '../constants';
import { unitSprite, unitPlayerSprite } from '../assets';
import { HERO_DEFS, heroUpgradeCost, heroMaxLevel } from '../battle';
import { Shield, Target, Users, Zap, Dumbbell, Play, Star, ChevronRight } from 'lucide-react';
import { Sheet, HowTo } from './ui';

interface Props {
  roster: Player[];
  resources: Record<ResourceType, number>;
  heroes?: HeroState[];
  upgrades?: UpgradeJob[];
  stadiumLevel?: number;
  onClose: () => void;
  onTrainGroup: (unit: UnitGroup, drillId: string) => void;
  onTrainHero?: (key: string, cost: number) => void;
  onCutPlayer?: (id: string) => void;
  onOpenHeroes?: () => void;
}

const fmtDur = (s: number) => s < 60 ? `${Math.ceil(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;

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

export const SquadModal: React.FC<Props> = ({ roster, resources, heroes = [], upgrades = [], stadiumLevel = 1, onClose, onTrainGroup, onTrainHero, onCutPlayer, onOpenHeroes }) => {
  const [selectedUnit, setSelectedUnit] = useState<UnitGroup | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [cutArmed, setCutArmed] = useState<string | null>(null); // two-tap confirm
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  const unlockedHeroes = heroes.filter(h => h.unlocked !== false);

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
    >
      <div className="p-4 sm:p-5 space-y-4">
        <HowTo id="coach" lines={[
          'Run drills to build READINESS — at 100% your squad is FIRED UP and the next raid hits +15% harder.',
          'Drills cost ⚡ Energy and pay Coins. Each position group trains on its own.',
          'Heroes train below — longer sessions, real power. Recruit new players at the Scouting Dept on the board.',
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
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[11px] text-slate-400">L{p.level}</span>
                      {onCutPlayer && (roster.length > 6 ? (
                        cutArmed === p.id ? (
                          <button onClick={() => { onCutPlayer(p.id); setCutArmed(null); }}
                            className="text-[10px] font-black uppercase px-2 py-1 rounded-lg bg-red-600 text-white animate-pulse">Sure?</button>
                        ) : (
                          <button onClick={() => setCutArmed(p.id)} title="Release this player to free a roster spot"
                            className="text-[10px] font-bold px-2 py-1 rounded-lg border border-red-900 text-red-400 hover:bg-red-950/50">✂️ Cut</button>
                        )
                      ) : (
                        <span className="text-[9px] text-slate-600" title="Squad floor — you can't cut below 6 players">min 6</span>
                      ))}
                    </div>
                  </div>
                ))}
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
          const canAfford = resources.ENERGY >= sc.costEnergy;
          return (
            <button onClick={() => onTrainGroup(UnitGroup.OFFENSE_LINE, 'scrimmage')} disabled={!canAfford}
              className={`w-full flex items-center justify-between gap-2 p-3 rounded-2xl border-2 transition-all text-left active:scale-[0.98]
                ${canAfford ? 'bg-purple-950/40 border-purple-700 hover:border-purple-400' : 'bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-black rounded-xl flex items-center justify-center border border-purple-800 shrink-0 text-lg">🏈</div>
                <div className="min-w-0">
                  <div className="font-bold text-white leading-tight">Full Scrimmage <span className="ml-1 text-[9px] font-black uppercase bg-purple-600 text-white px-1.5 py-0.5 rounded align-middle">whole team</span></div>
                  <div className="flex gap-2.5 text-[11px] text-slate-400 mt-0.5">
                    <span className="text-green-400 font-bold">+{sc.readinessGain}% ready</span>
                    <span>⚡{sc.costEnergy}</span>
                    <span>{sc.durationSeconds}s</span>
                    <span className="text-yellow-500">+{sc.rewardCoins}🪙</span>
                  </div>
                </div>
              </div>
              <div className={`shrink-0 flex items-center gap-1 px-3.5 py-2.5 rounded-xl font-bold text-sm ${canAfford ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                <Play size={14} fill="currentColor" /> {canAfford ? 'Run it' : 'Low ⚡'}
              </div>
            </button>
          );
        })()}

        {/* ⭐ HEROES train here too — longer sessions (a player getting better is a grind,
            not a construction job). Row shows hero + role + level; tap to open training. */}
        <div>
          <div className="text-[12px] uppercase tracking-widest font-bold text-slate-400 mb-2">⭐ Hero Training</div>
          {unlockedHeroes.length === 0 ? (
            <button onClick={onOpenHeroes} className="w-full flex items-center justify-between px-3 py-3 rounded-xl border border-yellow-800/60 bg-yellow-950/20 text-left">
              <span className="text-sm text-yellow-200 font-bold">No heroes on the squad yet</span>
              <span className="text-[11px] text-yellow-400 font-bold flex items-center gap-1">Visit Heroes <ChevronRight size={13} /></span>
            </button>
          ) : (
            <div className="space-y-1.5">
              {unlockedHeroes.map(h => {
                const def = HERO_DEFS.find(d => d.key === h.key);
                if (!def) return null;
                const open = selectedHero === h.key;
                const job = upgrades.find(u => u.kind === 'hero' && u.key === h.key);
                const maxed = h.level >= heroMaxLevel(stadiumLevel);
                const cost = heroUpgradeCost(h.level);
                const remaining = job ? Math.max(0, (job.finishTime - Date.now()) / 1000) : 0;
                return (
                  <div key={h.key} className={`rounded-xl border transition-colors ${open ? 'border-yellow-600/70 bg-slate-800/70' : 'border-slate-700 bg-slate-800/40'}`}>
                    <button onClick={() => setSelectedHero(open ? null : h.key)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
                      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 relative flex items-center justify-center" style={{ background: `radial-gradient(circle at 50% 35%, ${def.color}cc, #0f172a 90%)`, border: '2px solid #fde047' }}>
                        <span className="absolute text-base">{def.emoji}</span>
                        <img src={def.art} alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="relative w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-white text-sm truncate">{def.name} {job && <span className="text-[10px] text-amber-300 font-bold">🏋️ training…</span>}</div>
                        <div className="text-[11px] text-slate-400">{def.role} · <span className="text-yellow-300 font-bold">Lv{h.level}</span> · {'★'.repeat(h.stars)}</div>
                      </div>
                      <ChevronRight size={15} className={`text-slate-600 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                    </button>
                    {open && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-800/70 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-400 min-w-0">
                          <div className="text-slate-300 font-bold">{def.abilityName} — {def.abilityDesc}</div>
                          {job ? <div className="text-amber-300 font-bold mt-0.5">Session ends in {fmtDur(remaining)}</div>
                            : maxed ? <div className="text-slate-500 mt-0.5">At the cap — upgrade your Stadium to train further</div>
                            : <div className="mt-0.5">Next: <b className="text-white">Lv{h.level + 1}</b> · takes a long session (heroes grind)</div>}
                        </div>
                        {job ? <span className="shrink-0 text-[11px] font-bold text-amber-300">🏋️</span>
                          : maxed ? <span className="shrink-0 text-[11px] font-bold text-green-400">MAX</span>
                          : (
                          <button onClick={() => onTrainHero?.(h.key, cost)} disabled={resources.COINS < cost}
                            className={`shrink-0 px-3.5 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 ${resources.COINS >= cost ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                            Train · {cost >= 1000 ? `${(cost / 1000).toFixed(1)}k` : cost}🪙
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="text-[11px] text-slate-500 text-center pt-0.5">Unlocks, star-ups, and Scout Searches live in the <button onClick={onOpenHeroes} className="text-yellow-400 font-bold underline">Heroes</button> tab</div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
};
