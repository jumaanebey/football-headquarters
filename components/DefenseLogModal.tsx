import React from 'react';
import { DefenseLogEntry } from '../types';
import { Shield, Coins, Star } from 'lucide-react';
import { Sheet, Btn, HowTo } from './ui';
import { defenseHistoryLabel, isArchivedAiRaid } from '../game/defenseHistory';

interface Props {
  log: DefenseLogEntry[];
  onClose: () => void;
  onWatchLive: () => void;
  onRevenge: (entry: DefenseLogEntry) => void;
  onWatchReplay: (entry: DefenseLogEntry) => void;
}

const ago = (ts: number) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export const DefenseLogModal: React.FC<Props> = ({ log, onClose, onWatchLive, onRevenge, onWatchReplay }) => {
  // 🔥 FEUD: same rival hitting you 2+ times = a running score to settle (revenge pays 1.5×).
  const recorded = log.filter(entry => !isArchivedAiRaid(entry));
  const hitCount = (e: DefenseLogEntry) => isArchivedAiRaid(e) ? 0 : recorded.filter(x => (e.attackerPid ? x.attackerPid === e.attackerPid : x.attacker === e.attacker)).length;
  const held = recorded.filter(e => e.stars === 0).length;
  const totalLost = recorded.reduce((s, e) => s + e.coinsLost, 0);

  return (
    <Sheet
      title="Defense Log"
      icon={<Shield className="text-sky-400" size={22} />}
      subtitle="Recorded rival attacks and archived results."
      onClose={onClose}
      footer={
        <Btn size="lg" variant="secondary" onClick={onWatchLive} title="Simulates a fresh raid on your current layout — a practice rep, not a replay">
          <Shield size={17} /> Defense Scrimmage · Free AI practice
        </Btn>
      }
    >
        {/* Summary */}
        <div className="px-5 py-3 bg-slate-900/60 border-b border-slate-800 flex items-center gap-4 text-sm">
          <span className="text-slate-300"><span className="font-bold text-green-400">{held}</span> held</span>
          <span className="text-slate-300"><span className="font-bold text-red-400">{recorded.length - held}</span> broken</span>
          <span className="ml-auto flex items-center gap-1 text-slate-300"><Coins size={14} className="text-yellow-400" /> <span className="font-mono font-bold text-red-400">−{totalLost}</span> lost</span>
        </div>

        <div className="p-4 space-y-2">
          <HowTo id="defenselog-v2" lines={[
            'Received rival attacks appear here. Reopening never invents AI attacks. Recorded rival results can still affect your club.',
            '▶ Watch replays of live-rival attacks (their exact moves), then AVENGE to hit their real base back.',
            'Run a free Defense Scrimmage to practice against AI. Archived AI simulations remain labeled in your history.',
          ]} />
          {log.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              <Shield size={40} className="mx-auto mb-3 opacity-40" />
              No recorded raids yet. Try a free AI scrimmage to see how your defense holds.
            </div>
          ) : log.map(e => {
            const held = e.stars === 0;
            const archived = isArchivedAiRaid(e);
            return (
              <div key={e.id} className={`rounded-xl border p-3 flex items-center gap-3 ${held ? 'border-green-800/60 bg-green-950/30' : 'border-red-900/50 bg-red-950/20'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${held ? 'bg-green-900/60' : 'bg-red-900/50'}`}>
                  <span className="text-base leading-none">🏈</span>
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white truncate">
                    {e.attacker}
                    {hitCount(e) >= 2 && <span className="ml-1.5 text-[9px] font-black uppercase bg-red-600 text-white px-1.5 py-0.5 rounded align-middle animate-pulse">🔥 FEUD ·{hitCount(e)}</span>}
                  </div>
                  <div className="text-[11px] text-slate-400">{ago(e.at)} · {e.pct}% of base{hitCount(e) >= 2 && !e.avenged && <span className="text-orange-300 font-bold"> · revenge pays 1.5×</span>}</div>
                  <div className={`text-[11px] mt-1 ${archived ? 'text-amber-300' : 'text-sky-300'}`}>{defenseHistoryLabel(e)}</div>
                </div>
                <div className="ml-auto text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="flex items-center gap-0.5 justify-end">
                    {[0, 1, 2].map(i => <Star key={i} size={13} className={i < e.stars ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'} />)}
                  </div>
                  <div className={`text-xs font-bold ${held ? 'text-green-400' : 'text-red-400'}`}>
                    {held ? 'HELD' : `−${e.coinsLost}`}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(!!e.replay || !!e.authorityMatchId) && (
                      <button onClick={() => onWatchReplay(e)} title="Watch the actual attack, move for move"
                        className="text-[11px] font-bold px-2 py-1 rounded-lg bg-red-700 hover:bg-red-600 text-white flex items-center gap-1 transition-colors active:scale-95">
                        ▶ Watch
                      </button>
                    )}
                    {!archived && !held && (e.avenged ? (
                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><span className="text-[11px] leading-none">🏈</span> Avenged</span>
                    ) : (
                      <button onClick={() => onRevenge(e)} className="text-[11px] font-bold px-2 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white flex items-center gap-1 transition-colors active:scale-95">
                        <span className="text-xs leading-none">🏈</span> Revenge
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

    </Sheet>
  );
};
