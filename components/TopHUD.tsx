import React from 'react';
import { GameState } from '../types';
import { RALLY_CONFIG } from '../constants';
import { RESOURCE_ICON } from '../assets';
import { rankFor, clubPower } from '../ranks';
import { Crown, Users, Megaphone } from 'lucide-react';

interface Props {
  gameState: GameState;
  onRally?: () => void;
  onOpenRanks?: () => void; // tap the club identity → the Ranks ladder
}

// Big numbers stay scannable: 98,785 → 98.8k
const fmtNum = (n: number) => n >= 100000 ? `${Math.round(n / 1000)}k` : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();

export const TopHUD: React.FC<Props> = ({ gameState, onRally, onOpenRanks }) => {
  const { resources } = gameState;
  const { rank } = rankFor(gameState.trophies ?? 0);
  const power = clubPower(gameState);

  const canRally = resources.ENERGY < 100 && resources.FANS >= RALLY_CONFIG.fanCost;

  return (
    <div className="fixed top-0 left-0 w-full z-40 pointer-events-none p-2 flex flex-col gap-2 bg-gradient-to-b from-black/80 to-transparent pb-12">

      {/* Top Row: Club identity & Currency */}
      <div className="flex justify-between items-start w-full max-w-4xl mx-auto">

        {/* YOUR CLUB — crest, name, rank, trophies, Club Power. Tap it → the Ranks ladder
            (where you are, what's next, and how far). */}
        <button onClick={onOpenRanks} className="flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-slate-700 hover:border-orange-400 rounded-full p-1 pr-4 pointer-events-auto shadow-lg text-left transition-colors active:scale-95"
          title="Your club — tap to see the rank ladder and Club Power">
          <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center border-2 border-orange-500 bg-[#111827] relative shrink-0">
            <span className="text-lg">🏈</span>
            <img src="/assets/brand/app-icon.png" alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <div className="flex flex-col max-w-[150px]">
            <span className="text-xs font-bold text-white leading-tight truncate">
              {gameState.teamName}
              {gameState.campaign?.claimed?.includes(12) && <span title="League Champion — conquered the full Season"> 💍</span>}
            </span>
            <span className="text-[11px] font-bold flex items-center gap-1.5 leading-tight" style={{ color: rank.color }}>
              {rank.emoji} {rank.name}
              <span className="font-mono text-amber-300">🏆 {gameState.trophies}</span>
              <span className="font-mono text-orange-300" title="Club Power — every upgrade adds to it">⚡{power >= 1000 ? `${(power / 1000).toFixed(1)}k` : power}</span>
            </span>
          </div>
        </button>

        {/* Resources — compress + wrap on phones, leave room for the settings gear */}
        <div className="flex gap-1.5 sm:gap-2 items-center flex-wrap justify-end mr-8 sm:mr-0 max-w-[60vw] sm:max-w-none">
          {/* Energy (+ Rally button when affordable) */}
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-blue-500 px-2 sm:px-3 py-1 rounded-lg pointer-events-auto shadow-lg" title="Energy — powers training drills and away games (⚡12 per game). Regens over time; the Rehab Center speeds it up.">
            <img src={RESOURCE_ICON.energy} alt="Energy" className="w-4 h-4 object-contain" draggable={false} />
            <span className="font-display font-bold text-base sm:text-lg">{resources.ENERGY}</span>
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
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-yellow-500 px-2 sm:px-3 py-1 rounded-lg pointer-events-auto shadow-lg" title="Coins — gate revenue. Spend on upgrades, equipment, heroes, and the Parking Lot.">
            <img src={RESOURCE_ICON.coins} alt="Coins" className="w-4 h-4 object-contain" draggable={false} />
            <span className="font-display font-bold text-base sm:text-lg" title={resources.COINS.toLocaleString()}>{fmtNum(resources.COINS)}</span>
          </div>

          {/* Fans */}
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-rose-500 px-2 sm:px-3 py-1 rounded-lg pointer-events-auto shadow-lg" title="Fans — your crowd. They rally your Energy, fill the Fan Mob, boost home-crowd defense, and ERUPT to stall enemy drives.">
            <Users size={16} className="text-rose-400 fill-rose-400" />
            <span className="font-display font-bold text-base sm:text-lg" title={resources.FANS.toLocaleString()}>{fmtNum(resources.FANS)}</span>
          </div>

          {/* Gems */}
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-purple-500 px-2 sm:px-3 py-1 rounded-lg pointer-events-auto shadow-lg" title="Crowns — earned from raids & dailies; spent on Scout Searches, finishing timers, and builders">
            <Crown size={16} className="text-purple-400 fill-purple-400" />
            <span className="font-display font-bold text-base sm:text-lg">{resources.GEMS}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
