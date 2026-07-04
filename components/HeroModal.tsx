
import React from 'react';
import { ResourceType, HeroState } from '../types';
import { HERO_DEFS, heroLevelMult, heroStarMult, heroUpgradeCost, heroMaxLevel } from '../battle';
import { ROLL_COST_GEMS, STAR_UP_COSTS, MAX_STARS, RollResult } from '../gacha';
import { Star, X, ArrowUpCircle, Coins, Dumbbell, Swords, Lock, Crown, Sparkles } from 'lucide-react';

interface Props {
  heroes: HeroState[];
  resources: Record<ResourceType, number>;
  stadiumLevel: number;
  lastRoll: RollResult | null;
  onClose: () => void;
  onUpgrade: (key: string, cost: number) => void;
  onUnlock: (key: string) => void;
  onRoll: () => void;
  onStarUp: (key: string) => void;
}

export const HeroModal: React.FC<Props> = ({ heroes, resources, stadiumLevel, lastRoll, onClose, onUpgrade, onUnlock, onRoll, onStarUp }) => {
  const stateOf = (key: string) => heroes.find(h => h.key === key);
  const maxLevel = heroMaxLevel(stadiumLevel);
  const canRoll = resources.GEMS >= ROLL_COST_GEMS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="bg-slate-950 w-full max-w-3xl max-h-[88vh] rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-800 bg-slate-900 flex justify-between items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-display font-bold text-white uppercase tracking-tight flex items-center gap-2">
              <Star className="text-yellow-400 fill-yellow-400" size={24} /> Hall of Heroes
            </h2>
            <p className="text-slate-400 text-sm">Level with Coins. Scout Searches find new heroes — duplicates become shards for ⭐ star-ups.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onRoll} disabled={!canRoll}
              className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95
                ${canRoll ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
              <Sparkles size={16} /> Scout Search
              <span className="flex items-center gap-1 text-xs bg-black/25 px-1.5 py-0.5 rounded"><Crown size={11} className="fill-current" /> {ROLL_COST_GEMS}</span>
            </button>
            <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white"><X size={20} /></button>
          </div>
        </div>

        {/* Latest Scout Search result */}
        {lastRoll && (
          <div className={`px-5 py-2.5 border-b flex items-center gap-2 text-sm font-bold ${lastRoll.isNew ? 'bg-fuchsia-950/60 border-fuchsia-800 text-fuchsia-200' : 'bg-slate-900/80 border-slate-800 text-slate-200'}`}>
            <Sparkles size={15} className={lastRoll.isNew ? 'text-fuchsia-300' : 'text-purple-300'} />
            {lastRoll.isNew
              ? <>Scouted <span className="text-white">{lastRoll.name}</span> — NEW HERO UNLOCKED! 🎉</>
              : <>Scouted a duplicate <span className="text-white">{lastRoll.name}</span> → <span className="text-purple-300">+{lastRoll.shards} shards 🧩</span></>}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-4 content-start auto-rows-max">
          {HERO_DEFS.map(def => {
            const st = stateOf(def.key);
            const unlocked = st?.unlocked ?? !!def.starter;
            const lvl = st?.level ?? 1;
            const strs = st?.stars ?? 1;
            const shards = st?.shards ?? 0;
            const m = heroLevelMult(lvl) * heroStarMult(strs);
            const nextM = heroLevelMult(lvl + 1) * heroStarMult(strs);
            const hp = Math.round(def.baseHp * m);
            const dps = Math.round(def.baseDps * m);
            const cost = heroUpgradeCost(lvl);
            const capped = lvl >= maxLevel;
            const canAfford = resources.COINS >= cost;
            const starCost = STAR_UP_COSTS[strs]; // undefined at MAX_STARS
            const canStarUp = unlocked && strs < MAX_STARS && !!starCost && shards >= starCost;

            // Unlock affordability
            const uCoins = def.unlock?.coins ?? 0;
            const uGems = def.unlock?.gems ?? 0;
            const canUnlock = resources.COINS >= uCoins && resources.GEMS >= uGems;

            return (
              <div key={def.key} className={`rounded-2xl border-2 bg-slate-900 overflow-hidden flex flex-col ${unlocked ? 'border-slate-700' : 'border-slate-800'}`}>
                <div className="relative shrink-0 flex items-end justify-center h-44 overflow-hidden" style={{ background: `radial-gradient(circle at 50% 40%, ${def.color}44, #0f172a 70%)` }}>
                  {/* fallback: a glowing color medallion (covered by the portrait once its art lands) */}
                  <div className="absolute inset-0 flex items-center justify-center select-none" style={{ opacity: unlocked ? 1 : 0.6 }}>
                    <div className="rounded-full flex items-center justify-center" style={{ width: 94, height: 94, background: `radial-gradient(circle at 50% 36%, ${def.color}, #0f172a 92%)`, border: `3px solid ${def.color}`, boxShadow: `0 0 22px ${def.color}55` }}>
                      <span style={{ fontSize: '2.9rem', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}>{def.emoji}</span>
                    </div>
                  </div>
                  <img src={def.art} alt={def.name} draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className={`relative h-[112%] w-auto max-w-none object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)] select-none ${unlocked ? '' : 'grayscale opacity-50'}`} />
                  {unlocked ? (
                    <>
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                        <Star size={12} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-xs font-bold text-white">Lv {lvl}</span>
                      </div>
                      {/* Evolution stars */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-0.5 bg-black/55 rounded-full px-2 py-1">
                        {Array.from({ length: MAX_STARS }).map((_, i) => (
                          <Star key={i} size={13} className={i < strs ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Lock size={32} className="text-white/70" />
                    </div>
                  )}
                  {uGems > 0 && !unlocked && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-purple-900/70 rounded-full px-2 py-0.5">
                      <Crown size={11} className="text-purple-300 fill-purple-300" /><span className="text-[10px] font-bold text-purple-100">PREMIUM</span>
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div>
                    <div className="font-display font-bold text-lg text-white">{def.name}</div>
                    <div className="text-xs text-slate-400">{def.role} • Hero</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-2 py-1.5"><Dumbbell size={14} className="text-red-400" /><span className="text-slate-400 text-xs">HP</span><span className="ml-auto font-mono font-bold text-white">{hp}</span></div>
                    <div className="flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-2 py-1.5"><Swords size={14} className="text-orange-400" /><span className="text-slate-400 text-xs">DMG</span><span className="ml-auto font-mono font-bold text-white">{dps}</span></div>
                  </div>
                  <div className="text-xs bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700">
                    <span className="font-bold" style={{ color: def.color }}>{def.emoji} {def.abilityName}</span>
                    <span className="text-slate-400"> — {def.abilityDesc}</span>
                  </div>

                  {!unlocked ? (
                    <button onClick={() => onUnlock(def.key)} disabled={!canUnlock}
                      className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95
                        ${canUnlock ? (uGems > 0 ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white') : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                      <Lock size={15} /> Unlock
                      <span className="flex items-center gap-1 text-xs bg-black/20 px-2 py-0.5 rounded">
                        {uGems > 0 ? <><Crown size={12} className="fill-current" /> {uGems}</> : <><Coins size={12} /> {uCoins}</>}
                      </span>
                    </button>
                  ) : (
                    <>
                      {/* Shards → next star */}
                      {strs < MAX_STARS ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="flex justify-between text-[10px] font-bold mb-0.5">
                              <span className="text-purple-300">🧩 Shards</span>
                              <span className="text-slate-400 font-mono">{shards}/{starCost}</span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
                              <div className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-400" style={{ width: `${Math.min(100, (shards / starCost!) * 100)}%` }} />
                            </div>
                          </div>
                          <button onClick={() => onStarUp(def.key)} disabled={!canStarUp}
                            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all active:scale-95
                              ${canStarUp ? 'bg-amber-500 hover:bg-amber-400 text-black animate-pulse' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                            <Star size={12} className={canStarUp ? 'fill-black' : ''} /> Star Up
                          </button>
                        </div>
                      ) : (
                        <div className="text-center text-[11px] font-bold text-amber-400">★ MAX EVOLUTION ★</div>
                      )}

                      {capped ? (
                        <div className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 border border-slate-700">
                          <Lock size={15} /> Max level — upgrade Stadium
                        </div>
                      ) : (
                        <button onClick={() => onUpgrade(def.key, cost)} disabled={!canAfford}
                          className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95
                            ${canAfford ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                          <ArrowUpCircle size={16} /> Train to Lv {lvl + 1}
                          <span className="text-[11px] text-slate-300">(+{Math.round((nextM / m - 1) * 100)}%)</span>
                          <span className="flex items-center gap-0.5 text-xs bg-black/20 px-1.5 py-0.5 rounded"><Coins size={11} /> {cost}</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
