
import React from 'react';
import { GameState } from '../types';
import { computeStandings } from '../league';
import { Trophy, X, TrendingUp, TrendingDown, Lock, Dumbbell } from 'lucide-react';

interface Props {
  gameState: GameState;
  onClose: () => void;
  onPlay: () => void;
}

const SEASON_WEEKS = 17;

export const StandingsModal: React.FC<Props> = ({ gameState, onClose, onPlay }) => {
  const rows = computeStandings(gameState);
  const played = gameState.matchHistory.length;
  const myRank = rows.findIndex(r => r.isPlayer) + 1;
  const recent = gameState.matchHistory.slice(0, 5); // newest first
  const ready = gameState.teamReadiness >= 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="bg-slate-950 w-full max-w-2xl max-h-[88vh] rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-display font-bold text-white uppercase tracking-tight flex items-center gap-3">
              <Trophy className="text-yellow-500" size={26} /> League Standings
            </h2>
            <p className="text-slate-400 text-sm">
              Week {Math.min(gameState.currentMatch, SEASON_WEEKS)} of {SEASON_WEEKS}
              <span className="text-slate-600"> • </span>
              You’re <span className="text-yellow-400 font-bold">#{myRank}</span> of {rows.length}
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Table */}
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur text-slate-500 text-[10px] uppercase tracking-widest">
              <tr>
                <th className="text-left py-2 pl-5 w-8">#</th>
                <th className="text-left py-2">Team</th>
                <th className="text-center py-2 w-10">W</th>
                <th className="text-center py-2 w-10">L</th>
                <th className="text-center py-2 w-12">PF</th>
                <th className="text-center py-2 w-12">PA</th>
                <th className="text-center py-2 w-14 pr-5">Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const diff = r.pf - r.pa;
                return (
                  <tr key={r.id} className={`border-t border-slate-800/60 ${r.isPlayer ? 'bg-yellow-500/10' : 'hover:bg-slate-900/50'}`}>
                    <td className={`py-3 pl-5 font-mono font-bold ${i === 0 ? 'text-yellow-400' : 'text-slate-500'}`}>{i + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: r.color }} />
                        <span className={`font-bold ${r.isPlayer ? 'text-yellow-300' : 'text-slate-200'}`}>{r.name}</span>
                        {r.isPlayer && <span className="text-[9px] font-bold uppercase bg-yellow-500 text-black px-1.5 rounded">You</span>}
                      </div>
                    </td>
                    <td className="py-3 text-center font-mono text-green-400">{r.wins}</td>
                    <td className="py-3 text-center font-mono text-red-400">{r.losses}</td>
                    <td className="py-3 text-center font-mono text-slate-300">{r.pf}</td>
                    <td className="py-3 text-center font-mono text-slate-300">{r.pa}</td>
                    <td className={`py-3 text-center font-mono font-bold pr-5 ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {played === 0 && (
            <div className="text-center text-slate-500 italic py-8 px-5">
              No games played yet. Reach 100% Readiness and play your first match to climb the table.
            </div>
          )}

          {/* Recent results */}
          {recent.length > 0 && (
            <div className="p-5 border-t border-slate-800">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Recent Results</h3>
              <div className="space-y-2">
                {recent.map((m, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center ${m.won ? 'bg-green-600' : 'bg-red-600'}`}>
                        {m.won ? <TrendingUp size={13} className="text-white" /> : <TrendingDown size={13} className="text-white" />}
                      </span>
                      <span className="text-slate-300 text-sm">Wk {m.week} vs <span className="font-bold">{m.opponent}</span></span>
                    </div>
                    <span className={`font-mono font-bold ${m.won ? 'text-green-400' : 'text-red-400'}`}>{m.ourScore}–{m.theirScore}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-2 min-w-0">
            {ready
              ? <><span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0"><Trophy size={13} className="text-white" /></span> Team ready — play your next match!</>
              : <><Dumbbell size={14} className="text-blue-400 shrink-0" /> <span className="truncate">Readiness {gameState.teamReadiness}% — train to 100% to unlock</span></>}
          </div>
          <button
            onClick={onPlay}
            disabled={!ready}
            className={`shrink-0 py-3 px-5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95
              ${ready
                ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg ring-2 ring-green-400/50 animate-pulse'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
          >
            {ready ? <><Trophy size={16} /> Play Match</> : <><Lock size={15} /> Reach 100%</>}
          </button>
        </div>
      </div>
    </div>
  );
};
