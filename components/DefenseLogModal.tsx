import React from 'react';
import { DefenseLogEntry } from '../types';
import { Shield, Swords, Coins, Star, ShieldCheck } from 'lucide-react';
import { Sheet, Btn, HowTo } from './ui';

interface Props {
  log: DefenseLogEntry[];
  shieldUntil?: number;
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

export const DefenseLogModal: React.FC<Props> = ({ log, shieldUntil, onClose, onWatchLive, onRevenge, onWatchReplay }) => {
  const held = log.filter(e => e.stars === 0).length;
  const totalLost = log.reduce((s, e) => s + e.coinsLost, 0);
  const shieldMs = (shieldUntil || 0) - Date.now();
  const shielded = shieldMs > 0;
  const shieldLabel = shieldMs > 3600000 ? `${Math.ceil(shieldMs / 3600000)}h` : `${Math.ceil(shieldMs / 60000)}m`;

  return (
    <Sheet
      title="Defense Log"
      icon={<Shield className="text-sky-400" size={22} />}
      subtitle="Rival offenses that stormed your stadium while you were away."
      onClose={onClose}
      footer={
        <Btn size="lg" variant="secondary" onClick={onWatchLive} title="Simulates a fresh raid on your current layout — a practice rep, not a replay">
          <Shield size={17} /> Run a Defense Scrimmage
        </Btn>
      }
    >
        {/* Summary */}
        <div className="px-5 py-3 bg-slate-900/60 border-b border-slate-800 flex items-center gap-4 text-sm">
          <span className="text-slate-300"><span className="font-bold text-green-400">{held}</span> held</span>
          <span className="text-slate-300"><span className="font-bold text-red-400">{log.length - held}</span> broken</span>
          <span className="ml-auto flex items-center gap-1 text-slate-300"><Coins size={14} className="text-yellow-400" /> <span className="font-mono font-bold text-red-400">−{totalLost}</span> lost</span>
        </div>

        {/* Shield status */}
        {shielded && (
          <div className="px-5 py-2 bg-sky-950/50 border-b border-sky-900/60 flex items-center gap-2 text-sm text-sky-200">
            <ShieldCheck size={16} className="text-sky-400" />
            <span className="font-bold">Base shielded</span>
            <span className="text-sky-300/80">— no raids for {shieldLabel}</span>
            <span className="ml-auto text-[11px] text-sky-400/70">raiding ends it</span>
          </div>
        )}

        <div className="p-4 space-y-2">
          <HowTo id="defenselog" lines={[
            'Rivals can raid your stadium while you’re away — every hit lands here.',
            '▶ Watch replays of live-rival attacks (their exact moves), then AVENGE to hit their real base back.',
            'Get beaten badly and you earn a shield: no raids until it expires (or until you raid someone).',
          ]} />
          {log.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              <Shield size={40} className="mx-auto mb-3 opacity-40" />
              No raids yet. Rivals attack your base while you're away — check back later.
            </div>
          ) : log.map(e => {
            const held = e.stars === 0;
            return (
              <div key={e.id} className={`rounded-xl border p-3 flex items-center gap-3 ${held ? 'border-green-800/60 bg-green-950/30' : 'border-red-900/50 bg-red-950/20'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${held ? 'bg-green-900/60' : 'bg-red-900/50'}`}>
                  <Swords size={16} className={held ? 'text-green-300' : 'text-red-300'} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white truncate">{e.attacker}</div>
                  <div className="text-[11px] text-slate-400">{ago(e.at)} · {e.pct}% of base</div>
                </div>
                <div className="ml-auto text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="flex items-center gap-0.5 justify-end">
                    {[0, 1, 2].map(i => <Star key={i} size={13} className={i < e.stars ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'} />)}
                  </div>
                  <div className={`text-xs font-bold ${held ? 'text-green-400' : 'text-red-400'}`}>
                    {held ? 'HELD' : `−${e.coinsLost}`}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!!e.replay && (
                      <button onClick={() => onWatchReplay(e)} title="Watch the actual attack, move for move"
                        className="text-[11px] font-bold px-2 py-1 rounded-lg bg-red-700 hover:bg-red-600 text-white flex items-center gap-1 transition-colors active:scale-95">
                        ▶ Watch
                      </button>
                    )}
                    {!held && (e.avenged ? (
                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Swords size={11} /> Avenged</span>
                    ) : (
                      <button onClick={() => onRevenge(e)} className="text-[11px] font-bold px-2 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white flex items-center gap-1 transition-colors active:scale-95">
                        <Swords size={12} /> Revenge
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
