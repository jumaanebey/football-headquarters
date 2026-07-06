
import React, { useEffect, useState } from 'react';
import { GameState } from '../types';
import { computeStandings } from '../league';
import { rankFor, RANKS, clubPower, clubPowerBreakdown } from '../ranks';
import { pvpEnabled, fetchLeaderboard, playerId, LeaderRow } from '../pvp';
import { Trophy, TrendingUp, TrendingDown, Dumbbell, Zap } from 'lucide-react';
import { Sheet, Btn, HowTo } from './ui';

interface Props {
  gameState: GameState;
  onClose: () => void;
  onPlay: () => void;
  initialTab?: 'live' | 'league' | 'ladder';
}

export const StandingsModal: React.FC<Props> = ({ gameState, onClose, onPlay, initialTab }) => {
  const rows = computeStandings(gameState);
  const played = gameState.matchHistory.length;
  const myRank = rows.findIndex(r => r.isPlayer) + 1;
  const recent = gameState.matchHistory.slice(0, 5); // newest first
  const ready = gameState.teamReadiness >= 100;

  // LIVE leaderboard — real coaches only, ranked by trophies. The competitive spine.
  const live = pvpEnabled();
  const [tab, setTab] = useState<'live' | 'league' | 'ladder'>(initialTab ?? (live ? 'live' : 'ladder'));
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [copied, setCopied] = useState(false);
  const myPid = playerId();
  useEffect(() => {
    if (!live) return;
    fetchLeaderboard(20).then(rows => {
      // My trophy count may be fresher locally than my last published snapshot.
      const mine = rows.find(r => r.pid === myPid);
      if (mine) mine.trophies = Math.max(mine.trophies, gameState.trophies);
      setBoard(rows.sort((a, b) => b.trophies - a.trophies));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const myLiveRank = board ? board.findIndex(r => r.pid === myPid) + 1 : 0;

  return (
    <Sheet
      title="Standings"
      icon={<Trophy className="text-yellow-500" size={22} />}
      subtitle={tab === 'live'
        ? (myLiveRank > 0 ? <>You’re <span className="text-fuchsia-300 font-bold">#{myLiveRank}</span> of {board?.length ?? '…'} real coaches</> : 'Real coaches, ranked by trophies')
        : <>Practice circuit vs bot squads<span className="text-slate-600"> • </span>{played} games played<span className="text-slate-600"> • </span>You’re <span className="text-yellow-400 font-bold">#{myRank}</span> of {rows.length}</>}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] text-slate-400 flex items-center gap-2 min-w-0">
            {ready
              ? <><span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0"><Trophy size={13} className="text-white" /></span> Squad FIRED UP — your next raid hits <span className="text-green-400 font-bold">+15%</span> harder!</>
              : <><Dumbbell size={14} className="text-sky-400 shrink-0" /> <span className="truncate">Readiness {gameState.teamReadiness}% — reach 100% for a +15% raid bonus</span></>}
          </div>
          <Btn onClick={onPlay} variant="primary" className={ready ? 'ring-2 ring-green-400/50' : ''}>
            <Zap size={16} /> Raid{ready ? ' (+15%)' : ''}
          </Btn>
        </div>
      }
    >
        {/* Tabs — LIVE board = real competition; Ladder = your climb; league = practice bots */}
        <div className="flex gap-2 px-5 pt-3 pb-1">
          {live && (
            <button onClick={() => setTab('live')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${tab === 'live' ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              ⚡ Live
            </button>
          )}
          <button onClick={() => setTab('ladder')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${tab === 'ladder' ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            🎖 Ranks
          </button>
          <button onClick={() => setTab('league')} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${tab === 'league' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            🤖 Scrimmage
          </button>
        </div>

        <div>
          {tab === 'ladder' ? (
            <div className="p-5 pt-3 space-y-4">
              <HowTo id="ranks" lines={[
                'TROPHIES come from winning raids — and getting stormed at home costs you some.',
                'Your RANK tier is pure trophies. The bar shows exactly how far to the next tier.',
                'CLUB POWER grows with every upgrade you make anywhere — facilities, defenses, heroes, training, grounds.',
              ]} />
              {/* Club Power — the number EVERY upgrade moves */}
              {(() => {
                const power = clubPower(gameState);
                const parts = clubPowerBreakdown(gameState);
                return (
                  <div className="rounded-2xl border border-orange-800/60 bg-orange-950/20 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] uppercase tracking-widest font-bold text-orange-300">Club Power</span>
                      <span className="font-display font-black text-3xl text-orange-300">{power.toLocaleString()}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {parts.map(p => (
                        <span key={p.label} className="text-[11px] text-slate-400">{p.emoji} {p.label} <b className="text-slate-200 font-mono">{p.pts.toLocaleString()}</b></span>
                      ))}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-2">Every upgrade adds power — facilities, defenses, heroes, training, grounds.</div>
                  </div>
                );
              })()}

              {/* The trophy-rank ladder: where you stand and exactly how far to the next tier */}
              {(() => {
                const { rank, next, index } = rankFor(gameState.trophies);
                return (
                  <div className="space-y-1.5">
                    {RANKS.map((r, i) => {
                      const here = i === index;
                      const reached = gameState.trophies >= r.min;
                      const toGo = r.min - gameState.trophies;
                      const nextMin = RANKS[i + 1]?.min ?? null;
                      return (
                        <div key={r.name} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${here ? 'border-yellow-500 bg-yellow-950/30' : reached ? 'border-slate-700 bg-slate-800/40' : 'border-slate-800 bg-slate-900/40'}`}>
                          <span className="text-xl w-7 text-center" style={{ filter: reached ? 'none' : 'grayscale(1) opacity(0.6)' }}>{r.emoji}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold" style={{ color: reached ? r.color : '#64748b' }}>{r.name}</span>
                              {here && <span className="text-[9px] font-bold uppercase bg-yellow-500 text-black px-1.5 rounded">You</span>}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {r.min.toLocaleString()}🏆{nextMin ? ` – ${(nextMin - 1).toLocaleString()}🏆` : '+'}
                              {here && next && <span className="text-yellow-300 font-bold"> · {(next.min - gameState.trophies).toLocaleString()} more to {next.name}</span>}
                              {here && !next && <span className="text-yellow-300 font-bold"> · top of the mountain</span>}
                              {!reached && !here && <span> · {toGo.toLocaleString()} away</span>}
                            </div>
                            {here && next && (
                              <div className="mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((gameState.trophies - rank.min) / (next.min - rank.min)) * 100)}%`, background: r.color }} />
                              </div>
                            )}
                          </div>
                          {reached && !here && <span className="text-green-500 text-sm font-bold shrink-0">✓</span>}
                        </div>
                      );
                    })}
                    <div className="text-[11px] text-slate-500 text-center pt-1">Win raids to earn trophies · getting stormed at home costs them</div>
                  </div>
                );
              })()}
            </div>
          ) : tab === 'live' ? (
            <div className="p-5 pt-3">
              {!board && <div className="text-center text-slate-500 italic py-10">Loading the ladder…</div>}
              {board && board.length === 0 && <div className="text-center text-slate-500 italic py-10">No published rivals yet — raid to plant your flag.</div>}
              {board && board.length > 0 && (
                <div className="space-y-1.5">
                  {board.map((r, i) => {
                    const me = r.pid === myPid;
                    const rk = rankFor(r.trophies).rank;
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                    return (
                      <div key={r.pid} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${me ? 'border-fuchsia-500 bg-fuchsia-950/40' : 'border-slate-800 bg-slate-900/60'}`}>
                        <span className={`w-8 text-center font-mono font-bold ${i < 3 ? 'text-lg' : 'text-slate-500'}`}>{medal ?? i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className={`font-bold truncate ${me ? 'text-fuchsia-200' : 'text-white'}`}>
                            {r.name} {me && <span className="text-[9px] font-bold uppercase bg-fuchsia-500 text-white px-1.5 rounded align-middle">You</span>}
                          </div>
                          <div className="text-[10px] font-bold" style={{ color: rk.color }}>{rk.emoji} {rk.name}</div>
                        </div>
                        <span className="font-mono font-bold text-amber-300 shrink-0">🏆 {r.trophies}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="text-[12px] text-slate-500 mt-3 text-center">Every coach on this board is a real player. Win raids to climb.</div>
              {board && board.length > 0 && board.length < 8 && (
                <div className="mt-3 rounded-xl border border-fuchsia-900/60 bg-fuchsia-950/20 p-3 text-center">
                  <div className="text-[12px] text-fuchsia-200 font-bold mb-2">Only {board.length} coach{board.length === 1 ? '' : 'es'} in the league so far — every visitor becomes one.</div>
                  <button
                    onClick={() => { navigator.clipboard?.writeText('https://football-headquarters.vercel.app').then(() => setCopied(true)); }}
                    className="px-4 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-sm font-bold transition-colors active:scale-95">
                    {copied ? '✓ Link copied — send it to a rival' : '📋 Copy the game link'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Practice-bot league table (kept for W/L flavor — clearly labeled, not real people) */}
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
                  No games played yet. Raid a rival to put your first result on the board.
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
                          <span className="text-slate-300 text-sm">Game {m.week} vs <span className="font-bold">{m.opponent}</span></span>
                        </div>
                        {/* ourScore holds Game Balls (0-3) — show them AS game balls, never as a fake football score */}
                        <span className="flex items-center gap-1">
                          {[0, 1, 2].map(i => <span key={i} className="text-sm" style={{ opacity: i < m.ourScore ? 1 : 0.2, filter: i < m.ourScore ? 'none' : 'grayscale(1)' }}>🏈</span>)}
                          <span className={`ml-1 text-[11px] font-bold uppercase ${m.won ? 'text-green-400' : 'text-red-400'}`}>{m.won ? 'Won' : 'Lost'}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

    </Sheet>
  );
};
