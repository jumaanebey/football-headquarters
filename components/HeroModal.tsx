
import React from 'react';
import { ResourceType, HeroState } from '../types';
import { HERO_DEFS, heroLevelMult, heroStarMult, heroUpgradeCost, heroMaxLevel } from '../battle';
import { ROLL_COST_GEMS, STAR_UP_COSTS, MAX_STARS, RollResult } from '../gacha';
import { Star, ArrowUpCircle, Coins, Dumbbell, Swords, Lock, Crown, Sparkles } from 'lucide-react';
import { Sheet, HowTo } from './ui';

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

// Every hero's two-pose rig: clean body (idle sway + wind-up) and an action pose that
// swaps in on the beat (fhq-qb-body/body2 keyframes — generic despite the name).
// Missing files degrade: body falls back to the flat card art, action/ball just hide.
const HERO_RIG: Record<string, { body: string; action: string; ball?: { left: string; top: string; anim?: string } }> = {
  // QB throws with the viewer-LEFT hand — ball spawns there and flies up-left (mirrored flight).
  qb:        { body: '/assets/heroes/franchise-rig/body.png', action: '/assets/heroes/franchise-rig/body-followthrough.png', ball: { left: '10%', top: '18%', anim: 'fhq-ball-left' } },
  enforcer:  { body: '/assets/heroes/rig/enforcer-body.png',  action: '/assets/heroes/rig/enforcer-action.png' },
  coach:     { body: '/assets/heroes/rig/coach-body.png',     action: '/assets/heroes/rig/coach-action.png' },
  kicker:    { body: '/assets/heroes/rig/kicker-body.png',    action: '/assets/heroes/rig/kicker-action.png', ball: { left: '44%', top: '48%' } },
  burner:    { body: '/assets/heroes/rig/burner-body.png',    action: '/assets/heroes/rig/burner-action.png' },
  medic:     { body: '/assets/heroes/rig/medic-body.png',     action: '/assets/heroes/rig/medic-action.png' },
  captain:   { body: '/assets/heroes/rig/captain-body.png',   action: '/assets/heroes/rig/captain-action.png' },
  playmaker: { body: '/assets/heroes/rig/playmaker-body.png', action: '/assets/heroes/rig/playmaker-action.png' },
  legend:    { body: '/assets/heroes/rig/legend-body.png',    action: '/assets/heroes/rig/legend-action.png' },
};

// Hue (0-360) of a hex color — used to hue-shift the golden flame ring (base hue ≈45°)
// to each hero's signature color without needing a ring sprite per hero.
const heroHue = (hex: string): number => {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 45; // gray heroes keep the golden ring
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
};

export const HeroModal: React.FC<Props> = ({ heroes, resources, stadiumLevel, lastRoll, onClose, onUpgrade, onUnlock, onRoll, onStarUp }) => {
  const stateOf = (key: string) => heroes.find(h => h.key === key);
  const maxLevel = heroMaxLevel(stadiumLevel);
  const canRoll = resources.GEMS >= ROLL_COST_GEMS;

  return (
    <Sheet
      title="Hall of Heroes"
      icon={<Star className="text-yellow-400 fill-yellow-400" size={22} />}
      subtitle="Level with Coins. Scout Searches find new heroes — duplicates become shards for ⭐ star-ups."
      onClose={onClose}
      maxWidth="max-w-3xl"
      actions={
        <button onClick={onRoll} disabled={!canRoll}
          className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95
            ${canRoll ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
          <Sparkles size={16} /> Scout Search
          <span className="flex items-center gap-1 text-[12px] bg-black/25 px-1.5 py-0.5 rounded"><Crown size={11} className="fill-current" /> {ROLL_COST_GEMS}</span>
        </button>
      }
    >
        {/* Latest Scout Search result */}
        {lastRoll && (
          <div className={`px-5 py-2.5 border-b flex items-center gap-2 text-sm font-bold ${lastRoll.isNew ? 'bg-fuchsia-950/60 border-fuchsia-800 text-fuchsia-200' : 'bg-slate-900/80 border-slate-800 text-slate-200'}`}>
            <Sparkles size={15} className={lastRoll.isNew ? 'text-fuchsia-300' : 'text-purple-300'} />
            {lastRoll.isNew
              ? <>Scouted <span className="text-white">{lastRoll.name}</span> — NEW HERO UNLOCKED! 🎉</>
              : <>Scouted a duplicate <span className="text-white">{lastRoll.name}</span> → <span className="text-purple-300">+{lastRoll.shards} shards 🧩</span></>}
          </div>
        )}

        <div className="px-5 pt-4">
          <HowTo id="heroes" lines={[
            'Heroes are your stars — deploy them in raids and fire their signature abilities mid-drive.',
            'Unlock new heroes with Coins/Crowns or find them in Scout Searches — duplicates become 🧩 shards.',
            'Shards buy ⭐ star-ups (big power spikes). Level training happens in the COACH tab and takes time.',
            'Heroes guard your GATES on defense — assign who holds which gate in the Front Office.',
          ]} />
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 content-start auto-rows-max">
          {HERO_DEFS.map((def, heroIdx) => {
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
                  {/* CARD FLOURISH (unlocked heroes only): the REAL flame-ring sprite
                      (franchise-rig #38) spinning behind the art, hue-shifted from its
                      golden base to each hero's signature color. Glow breathes behind it. */}
                  {unlocked && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                      <img src="/assets/heroes/franchise-rig/aura-ring.png" alt="" draggable={false}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        style={{ width: 152, height: 152, animation: 'fhq-aura 9s linear infinite', opacity: 0.92,
                          filter: `hue-rotate(${heroHue(def.color) - 45}deg) saturate(1.15) drop-shadow(0 0 8px ${def.color}66)` }} />
                    </div>
                  )}
                  {unlocked && (
                    <img src="/assets/fx/window-glow.png" alt="" draggable={false}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
                      style={{ width: 150, mixBlendMode: 'screen', animation: 'fhq-glow 3s ease-in-out infinite' }} />
                  )}
                  {/* fallback: a glowing color medallion (covered by the portrait once its art lands) */}
                  <div className="absolute inset-0 flex items-center justify-center select-none" style={{ opacity: unlocked ? 1 : 0.6 }}>
                    <div className="rounded-full flex items-center justify-center" style={{ width: 94, height: 94, background: `radial-gradient(circle at 50% 36%, ${def.color}, #0f172a 92%)`, border: `3px solid ${def.color}`, boxShadow: `0 0 22px ${def.color}55` }}>
                      <span style={{ fontSize: '2.9rem', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}>{def.emoji}</span>
                    </div>
                  </div>
                  {HERO_RIG[def.key] && unlocked ? (
                    /* TWO-POSE RIG: body sways/winds up, action pose snaps in on the beat,
                       optional projectile launches. Staggered per hero so cards don't sync. */
                    (() => { /* 5.5s cycle: the action beat lands every ~5s instead of hiding in a 7s idle */
                    const rig = HERO_RIG[def.key]; const dly = `-${(heroIdx * 1.45) % 5.5}s`; return (
                    <div className="relative h-[112%] select-none" style={{ aspectRatio: '1' }}>
                      <img src={rig.body} alt={def.name} draggable={false}
                        onLoad={e => { const med = e.currentTarget.parentElement?.previousElementSibling as HTMLElement | null; if (med) med.style.visibility = 'hidden'; }}
                        onError={e => { (e.currentTarget as HTMLImageElement).src = def.art; (e.currentTarget as HTMLImageElement).onerror = null; }}
                        className="absolute inset-0 w-full h-full object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
                        style={{ animation: `fhq-qb-body 5.5s ease-in-out ${dly} infinite`, transformOrigin: '50% 100%' }} />
                      <img src={rig.action} alt="" draggable={false}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        className="absolute inset-0 w-full h-full object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)] pointer-events-none"
                        style={{ animation: `fhq-qb-body2 5.5s ease-in-out ${dly} infinite`, transformOrigin: '50% 100%', opacity: 0 }} />
                      {rig.ball && (
                        <img src="/assets/heroes/franchise-rig/ball.png" alt="" draggable={false}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          className="absolute pointer-events-none"
                          style={{ width: '34%', left: rig.ball.left, top: rig.ball.top, animation: `${rig.ball.anim ?? 'fhq-qb-ball'} 5.5s ease-in-out ${dly} infinite`, opacity: 0 }} />
                      )}
                    </div>
                    ); })()
                  ) : (
                  <img src={def.art} alt={def.name} draggable={false} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    style={unlocked ? { animation: `fhq-hero-idle ${5.2 + (heroIdx % 3) * 0.6}s ease-in-out ${-(heroIdx * 1.7)}s infinite`, transformOrigin: '50% 100%' } : undefined}
                    className={`relative h-[112%] w-auto max-w-none object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)] select-none ${unlocked ? '' : 'grayscale opacity-50'}`} />
                  )}
                  {unlocked ? (
                    <>
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                        <Star size={12} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-xs font-bold text-white">Lv {lvl}</span>
                      </div>
                      {/* Evolution stars — hover sweeps a shine across the row */}
                      <div className="fhq-shine absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-0.5 bg-black/55 rounded-full px-2 py-1">
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
    </Sheet>
  );
};
