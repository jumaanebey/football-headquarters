import React from 'react';
import { GameState } from '../types';
import { getObjectives, IconKey, GoalId } from '../objectives';
import { Coins, CheckCircle2, Trophy, Clock, Zap, Dumbbell, Shield, ArrowUpCircle, Swords, Users, ChevronRight } from 'lucide-react';

interface Props {
  gameState: GameState;
  onGoal: (id: GoalId) => void;
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
  swords: <Swords size={16} />,
  users: <Users size={16} />,
};

export const ObjectiveBanner: React.FC<Props> = ({ gameState, onGoal }) => {
  const goals = getObjectives(gameState);

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 w-[min(92vw,520px)]">
      <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-4 pt-2 pb-1 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Goals</div>
        <div className="pb-1.5">
          {goals.map((g, i) => (
            <button
              key={g.id}
              onClick={() => onGoal(g.id)}
              className={`w-full flex items-center gap-2.5 px-4 py-1.5 text-left transition-colors active:scale-[0.99] ${i === 0 ? 'text-white' : 'text-slate-300 hover:bg-slate-800/50'}`}
            >
              <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${i === 0 ? 'bg-blue-600 animate-pulse' : 'bg-slate-700'}`}>
                {ICONS[g.iconKey]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold leading-tight truncate">{g.text}</div>
                {g.progress && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
                      <div className={`h-full ${g.progress.cur >= g.progress.max ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, (g.progress.cur / g.progress.max) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{g.progress.cur}/{g.progress.max}</span>
                  </div>
                )}
              </div>
              <ChevronRight size={15} className="text-slate-600 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
