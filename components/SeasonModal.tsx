
import React, { useState, useEffect, useRef } from 'react';
import { GameState, SeasonPhase, Opponent, MatchResult, UnitGroup } from '../types';
import { OPPONENTS } from '../constants';
import { sfx } from '../sound';
import { Lock, Trophy, Shield, Sword, Play, ChevronRight, RefreshCw, X, Dumbbell } from 'lucide-react';

interface Props {
  gameState: GameState;
  onClose: () => void;
  onMatchComplete: (result: MatchResult) => void;
}

export const SeasonModal: React.FC<Props> = ({ gameState, onClose, onMatchComplete }) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [matchLog, setMatchLog] = useState<string[]>([]);
  const [matchTime, setMatchTime] = useState(60); // 60 minutes
  const [score, setScore] = useState({ us: 0, them: 0 });

  const isReady = gameState.teamReadiness >= 100;
  const opponent = OPPONENTS[(gameState.currentMatch - 1) % OPPONENTS.length];

  // Helper: Get Team Stats
  const getUnitOvr = (unit: UnitGroup) => {
    const players = gameState.roster.filter(p => p.unit === unit);
    if (!players.length) return 0;
    return players.reduce((sum, p) => sum + (p.stats.strength + p.stats.speed + p.stats.iq)/3, 0) / players.length;
  };

  const myOffense = (getUnitOvr(UnitGroup.OFFENSE_LINE) + getUnitOvr(UnitGroup.OFFENSE_SKILL)) / 2;
  const myDefense = (getUnitOvr(UnitGroup.DEFENSE_LINE) + getUnitOvr(UnitGroup.DEFENSE_SECONDARY)) / 2;

  // Play a cheer when we score, a groan when the opponent does (decoupled from the sim tick).
  const prevScore = useRef({ us: 0, them: 0 });
  useEffect(() => {
    if (score.us > prevScore.current.us) sfx.touchdown();
    else if (score.them > prevScore.current.them) sfx.concede();
    prevScore.current = { us: score.us, them: score.them };
  }, [score]);

  // SIMULATION ENGINE
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setMatchTime(prev => {
        if (prev <= 0) {
          clearInterval(interval);
          finishMatch();
          return 0;
        }

        // Simulation Tick (every 5 minutes of game time)
        const tickResult = simulateTick(prev, myOffense, myDefense, opponent);
        if (tickResult) {
           setMatchLog(logs => [tickResult.log, ...logs]);
           if (tickResult.pointsUs) setScore(s => ({ ...s, us: s.us + tickResult.pointsUs }));
           if (tickResult.pointsThem) setScore(s => ({ ...s, them: s.them + tickResult.pointsThem }));
        }

        return prev - 5;
      });
    }, 800); // Speed of sim

    return () => clearInterval(interval);
  }, [isSimulating]);

  const simulateTick = (timeRemaining: number, off: number, def: number, opp: Opponent) => {
    const quarter = Math.ceil((60 - timeRemaining) / 15) || 1;
    const isMyBall = Math.random() > 0.5;

    // Simple RNG logic based on ratings
    const momentum = Math.random() * 100;
    const diff = isMyBall ? (off - opp.defenseRating) : (opp.offenseRating - def);

    let log = '';
    let pointsUs = 0;
    let pointsThem = 0;

    if (isMyBall) {
      if (momentum + diff > 80) {
         log = `Q${quarter}: TOUCHDOWN! Your offense dominates the drive!`;
         pointsUs = 7;
      } else if (momentum + diff > 50) {
         log = `Q${quarter}: Solid drive results in a Field Goal.`;
         pointsUs = 3;
      } else if (momentum + diff < 20) {
         log = `Q${quarter}: INTERCEPTION! Opponent reads the play perfectly.`;
      } else {
         log = `Q${quarter}: Drive stalls. Punt.`;
      }
    } else {
       if (momentum + diff > 80) {
         log = `Q${quarter}: Opponent breaks free... Touchdown ${opponent.name}.`;
         pointsThem = 7;
      } else if (momentum + diff > 50) {
         log = `Q${quarter}: Defense bends but doesn't break. FG ${opponent.name}.`;
         pointsThem = 3;
      } else if (momentum + diff < 20) {
         log = `Q${quarter}: SACK! Your D-Line crushes the QB!`;
      } else {
         log = `Q${quarter}: Defense forces a 3-and-out.`;
      }
    }

    return { log, pointsUs, pointsThem };
  };

  const finishMatch = () => {
    setIsSimulating(false);
    const won = score.us > score.them;
    setTimeout(() => {
        onMatchComplete({
            week: gameState.currentMatch,
            opponent: opponent.name,
            ourScore: score.us,
            theirScore: score.them,
            won,
            reward: won ? 1000 : 250
        });
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">
        <button onClick={onClose} disabled={isSimulating} className="absolute top-3 right-3 z-20 p-2 bg-slate-800/90 hover:bg-slate-700 rounded-full text-white disabled:opacity-0 transition-colors"><X size={18} /></button>

        {/* SCOREBOARD */}
        <div className="bg-black p-6 border-b border-slate-800 flex justify-between items-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-800/50 to-transparent"></div>

          {/* HOME */}
          <div className="text-center relative z-10 w-1/3">
             <div className="text-4xl font-display font-black text-white">{isSimulating || score.us > 0 ? score.us : 0}</div>
             <div className="text-xs font-bold text-slate-400 tracking-widest">HOME</div>
          </div>

          {/* CLOCK */}
          <div className="text-center relative z-10 w-1/3">
             <div className="text-red-500 font-mono text-2xl font-bold bg-black/50 px-4 py-1 rounded border border-red-900/50 shadow-[0_0_15px_rgba(239,68,68,0.4)]">
               {isSimulating ? `Q${Math.ceil((60-matchTime)/15) || 1} ${matchTime % 15}:00` : 'VS'}
             </div>
             {isSimulating && <div className="text-[10px] text-red-400 mt-1 animate-pulse">LIVE SIMULATION</div>}
          </div>

          {/* AWAY */}
          <div className="text-center relative z-10 w-1/3">
             <div className="text-4xl font-display font-black text-white">{isSimulating || score.them > 0 ? score.them : 0}</div>
             <div className="text-xs font-bold text-slate-400 tracking-widest">{opponent.name.toUpperCase()}</div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-950/50">

          {!isReady ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4 text-center py-6">
               <Lock size={44} className="text-slate-600" />
               <h3 className="text-2xl font-bold text-slate-400">Not Match-Ready Yet</h3>
               <p className="text-slate-400 max-w-xs">Your team needs <span className="text-white font-bold">100% Readiness</span> to take the field. Run drills in the Coach panel to build it up.</p>
               <div className="w-full max-w-xs h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                  <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${gameState.teamReadiness}%` }}></div>
               </div>
               <span className="font-mono font-bold text-white">{gameState.teamReadiness}% <span className="text-slate-500">/ 100%</span></span>
               <button onClick={onClose} className="mt-2 py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-2 transition-colors active:scale-95">
                 <Dumbbell size={16} /> Go Train
               </button>
            </div>
          ) : !isSimulating && matchTime === 60 ? (
            // PRE-MATCH
             <div className="flex flex-col items-center space-y-8 animate-fade-in">
                <div className="grid grid-cols-2 gap-8 w-full">
                   <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-center">
                      <div className="text-sm text-slate-400 uppercase">My Offense</div>
                      <div className="text-3xl font-bold text-green-400">{Math.floor(myOffense)}</div>
                      <div className="text-xs text-slate-500 mt-1">VS Opp Defense {opponent.defenseRating}</div>
                   </div>
                   <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-center">
                      <div className="text-sm text-slate-400 uppercase">My Defense</div>
                      <div className="text-3xl font-bold text-blue-400">{Math.floor(myDefense)}</div>
                      <div className="text-xs text-slate-500 mt-1">VS Opp Offense {opponent.offenseRating}</div>
                   </div>
                </div>

                <div className="space-y-2 text-center">
                   <h2 className="text-2xl font-bold text-white">Week {gameState.currentMatch}</h2>
                   <p className="text-slate-400">vs {opponent.name}</p>
                </div>

                <button
                  onClick={() => { sfx.whistle(); setIsSimulating(true); }}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xl rounded-xl uppercase tracking-widest hover:scale-105 transition-transform shadow-xl flex items-center justify-center gap-2"
                >
                  <Play size={24} fill="currentColor" /> Kickoff
                </button>
             </div>
          ) : (
            // LIVE LOG
            <div className="space-y-3 font-mono text-sm">
               {matchLog.length === 0 ? (
                  <div className="text-center text-slate-500 italic mt-10">Coin toss... match starting...</div>
               ) : (
                  matchLog.map((log, i) => (
                    <div key={i} className={`p-3 rounded border-l-4 animate-slide-in ${log.includes('TOUCHDOWN') ? 'bg-green-900/30 border-green-500 text-green-200' : log.includes('INTERCEPTION') || log.includes('SACK') ? 'bg-red-900/30 border-red-500 text-red-200' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
                       {log}
                    </div>
                  ))
               )}
               {matchTime <= 0 && (
                   <div className="text-center py-8">
                      <div className="text-3xl font-bold text-white mb-2">{score.us > score.them ? 'VICTORY' : 'DEFEAT'}</div>
                      <div className="text-slate-400">Redirecting to locker room...</div>
                   </div>
               )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
