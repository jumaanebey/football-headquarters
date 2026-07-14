import React, { useState, useRef, useEffect } from 'react';

// Counter ROLLUP: numbers tick to their new value instead of snapping (ease-out cubic,
// ~550ms). Paired with a scale-pop on the digits (keyed remount replays the animation).
const useRollup = (target: number): number => {
  const [shown, setShown] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current; prev.current = target;
    if (from === target) return;
    const t0 = performance.now(); const dur = 550;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setShown(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
};
import { GameState } from '../types';
import { RALLY_CONFIG } from '../constants';
import { RESOURCE_ICON } from '../assets';
import { rankFor, clubPower } from '../ranks';
import { Crown, Users, Megaphone } from 'lucide-react';
import { RankCrest } from './ui';

interface Props {
  gameState: GameState;
  onRally?: () => void;
  onOpenRanks?: () => void; // tap the club identity → the Ranks ladder
}

// Big numbers stay scannable: 98,785 → 98.8k
const fmtNum = (n: number) => n >= 100000 ? `${Math.round(n / 1000)}k` : n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : n.toLocaleString();

export const TopHUD: React.FC<Props> = ({ gameState, onRally, onOpenRanks }) => {
  const { resources } = gameState;
  const { rank } = rankFor(gameState.trophies ?? 0);
  const power = clubPower(gameState);

  const coinsShown = useRollup(resources.COINS);
  const fansShown = useRollup(resources.FANS);
  const gemsShown = useRollup(resources.GEMS);

  const canRally = resources.ENERGY < 100 && resources.FANS >= RALLY_CONFIG.fanCost;

  return (
    <div className="fixed top-0 left-0 w-full z-40 pointer-events-none p-2 flex flex-col gap-2 bg-gradient-to-b from-black/80 to-transparent pb-12">

      {/* Top Row: Club identity & Currency */}
      <div className="flex justify-between items-start w-full max-w-4xl mx-auto">

        {/* YOUR CLUB — tap → the Ranks ladder. PHONES get a tight chip (crest + name +
            trophies); the full rank/power line is desktop-only so the bar never wraps. */}
        <button onClick={onOpenRanks} className="flex items-center gap-1.5 sm:gap-2 bg-slate-900/90 backdrop-blur border border-slate-700 hover:border-orange-400 rounded-full p-1 pr-2.5 sm:pr-4 pointer-events-auto shadow-lg text-left transition-colors active:scale-95 shrink-0"
          title="Your club — tap to see the rank ladder and Club Power">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden flex items-center justify-center border-2 border-orange-500 bg-[#111827] relative shrink-0">
            <span className="text-lg">🏈</span>
            <img src="/assets/brand/app-icon.webp" alt="" draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <div className="flex flex-col max-w-[76px] sm:max-w-[150px]">
            <span className="text-[11px] sm:text-xs font-bold text-white leading-tight truncate">
              {gameState.teamName}
              {gameState.campaign?.claimed?.includes(12) && <span title="League Champion — conquered the full Season"> 💍</span>}
            </span>
            <span className="text-[10px] sm:text-[11px] font-bold flex items-center gap-1 sm:gap-1.5 leading-tight" style={{ color: rank.color }}>
              <span className="hidden sm:inline-flex items-center gap-1"><RankCrest rank={rank} size={14} /> {rank.name}</span>
              <span className="sm:hidden inline-flex"><RankCrest rank={rank} size={13} /></span>
              <span className="font-mono text-amber-300">🏆{gameState.trophies}</span>
              <span className="font-mono text-orange-300 hidden sm:inline" title="Club Power — every upgrade adds to it">⚡{power >= 1000 ? `${(power / 1000).toFixed(1)}k` : power}</span>
            </span>
          </div>
        </button>

        {/* Resources — ONE tight row on phones (no wrapping into a jumble), roomier on desktop */}
        <div className="flex gap-0.5 sm:gap-2 items-center justify-end mr-6 sm:mr-0 min-w-0">
          {/* Energy (+ Rally button when affordable) */}
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-blue-500 px-1 sm:px-3 py-1 rounded-lg pointer-events-auto shadow-lg" title="Energy — powers training drills and away games (⚡12 per game). Regens over time; the Rehab Center speeds it up.">
            <img src={RESOURCE_ICON.energy} alt="Energy" className="w-4 h-4 object-contain" draggable={false} />
            <span className="font-display font-bold text-[13px] sm:text-lg">{resources.ENERGY}</span>
            <span className="text-[10px] text-slate-400 ml-1 hidden sm:inline">/ 100</span>
            {canRally && (
              <button
                onClick={onRally}
                data-tour="rally"
                title={`Rally the Fans — spend ${RALLY_CONFIG.fanCost} Fans to refill Energy`}
                className="ml-1 flex items-center gap-0.5 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors animate-pulse"
              >
                <Megaphone size={11} /><span className="hidden sm:inline"> Rally</span>
              </button>
            )}
          </div>

          {/* Coins */}
          <div id="hud-coins" className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-yellow-500 px-1 sm:px-3 py-1 rounded-lg pointer-events-auto shadow-lg" title="Coins — gate revenue. Spend on upgrades, equipment, heroes, and the Parking Lot.">
            <img src={RESOURCE_ICON.coins} alt="Coins" className="w-4 h-4 object-contain" draggable={false} />
            <span key={resources.COINS} className="inline-block font-display font-bold text-[13px] sm:text-lg" style={{ animation: 'fhq-counter-pop 0.4s ease-out' }} title={resources.COINS.toLocaleString()}>{fmtNum(coinsShown)}</span>
          </div>

          {/* Fans */}
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-rose-500 px-1 sm:px-3 py-1 rounded-lg pointer-events-auto shadow-lg" title="Fans — your crowd. They rally your Energy, fill the Fan Mob, boost home-crowd defense, and ERUPT to stall enemy drives.">
            <Users size={14} className="text-rose-400 fill-rose-400" />
            <span key={resources.FANS} className="inline-block font-display font-bold text-[13px] sm:text-lg" style={{ animation: 'fhq-counter-pop 0.4s ease-out' }} title={resources.FANS.toLocaleString()}>{fmtNum(fansShown)}</span>
          </div>

          {/* Gems */}
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur border-b-2 border-purple-500 px-1 sm:px-3 py-1 rounded-lg pointer-events-auto shadow-lg" title="Crowns — earned from raids & dailies; spent on Scout Searches, finishing timers, and builders">
            <Crown size={14} className="text-purple-400 fill-purple-400" />
            <span key={resources.GEMS} className="inline-block font-display font-bold text-[13px] sm:text-lg" style={{ animation: 'fhq-counter-pop 0.4s ease-out' }}>{gemsShown}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
