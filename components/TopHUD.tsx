import React from 'react';
import { GameState } from '../types';
import { RALLY_CONFIG } from '../constants';
import { RESOURCE_ICON } from '../assets';
import { rankFor } from '../ranks';
import { Crown, Users, Megaphone } from 'lucide-react';

interface Props {
  gameState: GameState;
  onRally?: () => void;
}

// Big numbers stay scannable: 98,785 → 98.8k
const fmtNum = (n: number) => n >= 100000 ? `${Math.round(n / 1000)}k` : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();

export const TopHUD: React.FC<Props> = ({ gameState, onRally }) => {
  const { resources, level, xp, xpToNextLevel } = gameState;
  const xpPercent = (xp / xpToNextLevel) * 100;
  const { rank } = rankFor(gameState.trophies ?? 0);

  const canRally = resources.ENERGY < 100 && resources.FANS >= RALLY_CONFIG.fanCost;

  return (
    <div className="fixed top-0 left-0 w-full z-40 pointer-events-none p-2 flex flex-col gap-2 bg-gradient-to-b from-black/80 to-transparent pb-12">

      {/* Top Row: Profile & Currency */}
      <div className="flex justify-between items-start w-full max-w-4xl mx-auto">

        {/* Profile / Level */}
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-full p-1 pr-4 pointer-events-auto shadow-lg">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full flex items-center justify-center border-2 border-white relative" title={`Coach level ${level} — earn XP from training drills`}>
            <span className="font-display font-bold text-lg">{level}</span>
            <div className="absolute -bottom-1 -right-1 bg-yellow-500 text-[8px] font-bold text-black px-1 rounded">COACH</div>
          </div>
          <div className="flex flex-col w-24">
            <span className="text-xs font-bold flex items-center gap-1 leading-tight" style={{ color: rank.color }}>{rank.emoji} {rank.name}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-amber-300 shrink-0">🏆 {gameState.trophies}</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-400" style={{ width: `${xpPercent}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Resources */}
        <div className="flex gap-2 items-center">
          {/* Energy (+ Rally button when affordable) */}
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-blue-500 px-3 py-1 rounded-lg pointer-events-auto shadow-lg">
            <img src={RESOURCE_ICON.energy} alt="Energy" className="w-4 h-4 object-contain" draggable={false} />
            <span className="font-display font-bold text-lg">{resources.ENERGY}</span>
            <span className="text-[10px] text-slate-400 ml-1">/ 100</span>
            {canRally && (
              <button
                onClick={onRally}
                data-tour="rally"
                title={`Rally the Fans — spend ${RALLY_CONFIG.fanCost} Fans to refill Energy`}
                className="ml-1 flex items-center gap-0.5 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors animate-pulse"
              >
                <Megaphone size={11} /> Rally
              </button>
            )}
          </div>

          {/* Coins */}
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-yellow-500 px-3 py-1 rounded-lg pointer-events-auto shadow-lg">
            <img src={RESOURCE_ICON.coins} alt="Coins" className="w-4 h-4 object-contain" draggable={false} />
            <span className="font-display font-bold text-lg" title={resources.COINS.toLocaleString()}>{fmtNum(resources.COINS)}</span>
          </div>

          {/* Fans */}
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-rose-500 px-3 py-1 rounded-lg pointer-events-auto shadow-lg">
            <Users size={16} className="text-rose-400 fill-rose-400" />
            <span className="font-display font-bold text-lg" title={resources.FANS.toLocaleString()}>{fmtNum(resources.FANS)}</span>
          </div>

          {/* Gems */}
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-purple-500 px-3 py-1 rounded-lg pointer-events-auto shadow-lg" title="Crowns — earned from raids & dailies; spent on Scout Searches, finishing timers, and builders">
            <Crown size={16} className="text-purple-400 fill-purple-400" />
            <span className="font-display font-bold text-lg">{resources.GEMS}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
