import React from 'react';
import { GameState } from '../types';
import { getObjectives, IconKey, GoalId } from '../objectives';
import { Coins, CheckCircle2, Trophy, Clock, Zap, Dumbbell, Shield, ArrowUpCircle, Users, ChevronRight } from 'lucide-react';

interface Props {
  gameState: GameState;
  onGoal: (id: GoalId) => void;
  /** Daily Practice lives INSIDE the Goals panel — one "what do I do now" surface
   *  (the floating gift button doubled this panel and explained nothing). */
  dailyClaimable?: number;
  onOpenDailies?: () => void;
}

const ICONS: Record<IconKey, React.ReactNode> = {
  coins: <Coins size={16} />,
  check: <CheckCircle2 size={16} />,
  trophy: <Trophy size={16} />,
  clock: <Clock size={16} />,
  zap: <Zap size={16} />,
  dumbbell: <Dumbbell size={16} />,
  shield: <Shield size={16} />,
  arrowUp: <ArrowUpCircle size={16} />,
  swords: <span className="text-base leading-none">🏈</span>,
  users: <Users size={16} />,
};

export const ObjectiveBanner: React.FC<Props> = ({ gameState, onGoal, dailyClaimable = 0, onOpenDailies }) => {
  const goals = getObjectives(gameState);
  const contentId = React.useId();
  // Docked top-left (off the board) and collapsible; the tuck preference persists.
  // PHONES default COLLAPSED — the panel was eating a third of the screen (Phase C).
  const [collapsed, setCollapsed] = React.useState(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem('fhq_goals_collapsed'); } catch { /* private browsing */ }
    if (stored !== null) return stored === '1';
    return true;
  });
  const toggle = () => setCollapsed(c => { try { localStorage.setItem('fhq_goals_collapsed', c ? '0' : '1'); } catch { /* optional preference */ } return !c; });

  return (
    <div className="fhq-objectives fixed z-30 w-[min(72vw,290px)]">
      <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
        <button type="button" aria-expanded={!collapsed} aria-controls={contentId} onClick={toggle} className="min-h-11 w-full flex items-center gap-1.5 px-3 py-2 text-left">
          <span className="text-[12px] uppercase tracking-widest text-slate-400 font-bold">Coach’s checklist</span>
          <span className="text-[12px] font-mono text-slate-400">({goals.length})</span>
          {collapsed && dailyClaimable > 0 && (
            <span className="ml-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[12px] font-bold text-white inline-flex items-center justify-center leading-none">🎁{dailyClaimable}</span>
          )}
          <ChevronRight size={13} className={`ml-auto text-slate-400 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        </button>
        {!collapsed && onOpenDailies && (
          <button type="button" onClick={onOpenDailies}
            className="min-h-11 w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-slate-800/50 border-b border-slate-800/60">
            <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${dailyClaimable > 0 ? 'bg-rose-600 animate-pulse' : 'bg-slate-700'}`}>🎁</span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold leading-tight text-slate-200">Daily Practice</div>
              <div className="text-[12px] text-slate-400">{dailyClaimable > 0 ? <span className="text-rose-300 font-bold">{dailyClaimable} reward{dailyClaimable > 1 ? 's' : ''} ready to claim</span> : "today's three drills for Crowns"}</div>
            </div>
            <ChevronRight size={15} className="text-slate-600 shrink-0" />
          </button>
        )}
        {!collapsed && (
        <div id={contentId} className="pb-1.5 overflow-y-auto overscroll-contain" style={{ maxHeight: '34dvh' }}>{/* phones: the open panel must never bury the base */}
          {goals.map((g, i) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onGoal(g.id)}
              className={`min-h-11 w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors active:scale-[0.99] ${i === 0 ? 'text-white' : 'text-slate-300 hover:bg-slate-800/50'}`}
            >
              <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${i === 0 ? 'bg-blue-600 animate-pulse' : 'bg-slate-700'}`}>
                {ICONS[g.iconKey]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold leading-snug">{g.text}</div>
                {g.progress && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
                      <div className={`h-full ${g.progress.cur >= g.progress.max ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, (g.progress.cur / g.progress.max) * 100)}%` }} />
                    </div>
                    <span className="text-[12px] font-mono text-slate-400 shrink-0">{g.progress.cur}/{g.progress.max}</span>
                  </div>
                )}
              </div>
              <ChevronRight size={15} className="text-slate-600 shrink-0" />
            </button>
          ))}
        </div>
        )}
      </div>
    </div>
  );
};
