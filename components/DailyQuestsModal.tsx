import React from 'react';
import { DailiesState, questsForDate, SWEEP_BONUS_GEMS } from '../dailies';
import { X, Gift, Crown, Coins, Check } from 'lucide-react';

interface Props {
  dailies: DailiesState;
  onClaim: (questId: string) => void;
  onClose: () => void;
}

export const DailyQuestsModal: React.FC<Props> = ({ dailies, onClaim, onClose }) => {
  const quests = questsForDate(dailies.date);
  const allClaimed = quests.every(q => dailies.claimed.includes(q.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="bg-slate-950 w-full max-w-md rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-display font-bold text-white uppercase tracking-tight flex items-center gap-2">
              <Gift className="text-rose-400" size={24} /> Daily Practice
            </h2>
            <p className="text-slate-400 text-sm">Three drills a day. Clear all three for the Daily Sweep bonus.</p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-2.5">
          {quests.map(q => {
            const prog = Math.min(q.target, dailies.progress[q.id] || 0);
            const done = prog >= q.target;
            const claimed = dailies.claimed.includes(q.id);
            return (
              <div key={q.id} className={`rounded-xl border p-3 flex items-center gap-3 ${claimed ? 'border-green-900/60 bg-green-950/20 opacity-70' : done ? 'border-amber-600 bg-amber-950/20' : 'border-slate-800 bg-slate-900/60'}`}>
                <span className="text-2xl shrink-0">{q.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white leading-tight">{q.text}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                      <div className={`h-full ${done ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${(prog / q.target) * 100}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{prog}/{q.target}</span>
                  </div>
                </div>
                {claimed ? (
                  <span className="shrink-0 text-green-400 flex items-center gap-1 text-xs font-bold"><Check size={14} /> DONE</span>
                ) : (
                  <button onClick={() => onClaim(q.id)} disabled={!done}
                    className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-all active:scale-95
                      ${done ? 'bg-amber-500 hover:bg-amber-400 text-black animate-pulse' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                    {q.reward.gems ? <><Crown size={12} className="fill-current" /> {q.reward.gems}</> : <><Coins size={12} /> {q.reward.coins}</>}
                  </button>
                )}
              </div>
            );
          })}

          {/* Daily Sweep */}
          <div className={`rounded-xl border p-3 flex items-center gap-3 ${dailies.sweepClaimed ? 'border-green-900/60 bg-green-950/20 opacity-70' : allClaimed ? 'border-fuchsia-600 bg-fuchsia-950/30' : 'border-slate-800 bg-slate-900/40'}`}>
            <span className="text-2xl shrink-0">🧹</span>
            <div className="flex-1">
              <div className="text-sm font-bold text-white">Daily Sweep — clear all three</div>
              <div className="text-[11px] text-slate-400">Bonus pays out automatically on your last claim</div>
            </div>
            <span className={`shrink-0 flex items-center gap-1 text-xs font-bold ${dailies.sweepClaimed ? 'text-green-400' : 'text-fuchsia-300'}`}>
              {dailies.sweepClaimed ? <><Check size={14} /> DONE</> : <><Crown size={12} className="fill-current" /> {SWEEP_BONUS_GEMS}</>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
