import { heroMovementStyle } from '../game/heroMovementStyle';
import { heroProgression } from '../game/progression/heroProgression';
import type { GameState } from '../types';
import { HeroArt } from './HeroArt';
import { HeroTrainingPreview } from './HeroTrainingPreview';


import React, { useState, useRef, useEffect } from 'react';
import { ResourceType, HeroState, UpgradeJob } from '../types';
import { HERO_DEFS, heroLevelMult, heroStarMult, heroUpgradeCost, heroMaxLevel } from '../battle';
import { ROLL_COST_GEMS, STAR_UP_COSTS, MAX_STARS, RollResult } from '../gacha';
import { Star, ArrowUpCircle, Coins, Dumbbell, Lock, Crown, Sparkles } from 'lucide-react';
import { Sheet, HowTo } from './ui';
import { sfx } from '../sound';
import { upgradeDurationSecs } from '../constants';

interface Props {
  club: GameState;
  initialHero?: string;
  onPractice?: (key: string) => void;
  heroes: HeroState[];
  upgrades?: UpgradeJob[];
  blocked?: boolean;
  resources: Record<ResourceType, number>;
  stadiumLevel: number;
  lastRoll: RollResult | null;
  onClose: () => void;
  onUpgrade: (key: string, cost: number) => void;
  onUnlock: (key: string) => void;
  onRoll: () => void;
  onStarUp: (key: string) => void;
}

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

export const HeroModal: React.FC<Props> = ({ club, initialHero, onPractice, heroes, upgrades = [], blocked = false, resources, stadiumLevel, lastRoll, onClose, onUpgrade, onUnlock, onRoll, onStarUp }) => {
  const [selectedKey, setSelectedKey] = useState(initialHero ?? 'qb');
  const [heroTab, setHeroTab] = useState<'growth' | 'practice'>('growth');
  const stateOf = (key: string) => heroes.find(h => h.key === key);
  const scoutButton = useRef<HTMLButtonElement>(null);
  const revealButton = useRef<HTMLButtonElement>(null);

  // 🎰 SCOUT SEARCH REVEAL: the roll gets a suspense beat (spinning ring + shaking
  // mystery card) before the hero bursts out. Only fires on NEW rolls this session —
  // reopening the modal with an old lastRoll stays quiet.
  const [reveal, setReveal] = useState<'idle' | 'suspense' | 'shown'>('idle');
  const seenRoll = useRef(lastRoll);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dismissReveal = () => {
    revealTimers.current.forEach(clearTimeout);
    setReveal('idle');
  };
  useEffect(() => {
    if (lastRoll && lastRoll !== seenRoll.current) {
      seenRoll.current = lastRoll;
      setReveal('suspense');
      const ticks = [0, 350, 700, 1050].map(ms => setTimeout(() => sfx.tick(), ms));
      const t1 = setTimeout(() => { setReveal('shown'); (lastRoll.isNew ? sfx.sign : sfx.sting)(); }, 1400);
      const t2 = setTimeout(() => setReveal('idle'), 4200);
      revealTimers.current = [...ticks, t1, t2];
      return () => { revealTimers.current.forEach(clearTimeout); };
    }
  }, [lastRoll]);
  const revealDef = reveal !== 'idle' && lastRoll ? HERO_DEFS.find(d => d.key === lastRoll.key) : null;
  useEffect(() => {
    if (reveal === 'idle') return;
    revealButton.current?.focus();
    return () => {
      const scout = scoutButton.current;
      const focusTarget = scout?.disabled ? scout.closest<HTMLElement>('[role="dialog"]') : scout;
      focusTarget?.focus();
    };
  }, [reveal]);
  const maxLevel = heroMaxLevel(stadiumLevel);
  const canRoll = resources.GEMS >= ROLL_COST_GEMS;

  return (
    <Sheet
      title="Hall of Heroes"
      icon={<Star className="text-yellow-400 fill-yellow-400" size={22} />}
      subtitle="Try every hero for free. Build your roster with unlocks, training and Scout Searches."
      onClose={onClose}
      maxWidth="max-w-3xl"
      actions={
        <button ref={scoutButton} type="button" onClick={onRoll} disabled={blocked || !canRoll || reveal !== 'idle'}
          className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95
            ${canRoll ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
          <Sparkles size={16} /> Scout Search
          <span className="flex items-center gap-1 text-[12px] bg-black/25 px-1.5 py-0.5 rounded"><Crown size={11} className="fill-current" /> {ROLL_COST_GEMS}</span>
        </button>
      }
    >
        {/* 🎰 Scout Search reveal overlay */}
        {revealDef && lastRoll && (
          <button ref={revealButton} type="button" aria-label={reveal === 'suspense' ? 'Scouting. Skip reveal' : `${lastRoll.name}. ${lastRoll.isNew ? 'New hero unlocked' : `${lastRoll.shards} shards added`}. Continue`}
            className="absolute inset-0 z-50 w-full flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm animate-fade-in cursor-pointer" onClick={dismissReveal}>
            <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
              <img src="/assets/heroes/franchise-rig/aura-ring.webp" alt="" draggable={false} className="absolute select-none"
                style={{ width: 230, height: 230, animation: `fhq-aura ${reveal === 'suspense' ? '0.9s' : '6s'} linear infinite`, opacity: 0.95,
                  filter: reveal === 'shown' ? `hue-rotate(${heroHue(revealDef.color) - 45}deg) saturate(1.2) drop-shadow(0 0 14px ${revealDef.color})` : 'drop-shadow(0 0 10px #f97316aa)' }} />
              {reveal === 'suspense' ? (
                <div className="relative rounded-2xl border-2 border-yellow-400/70 bg-slate-900 flex items-center justify-center shadow-2xl"
                  style={{ width: 120, height: 160, animation: 'fhq-reveal-pulse 0.5s ease-in-out infinite' }}>
                  <span className="text-6xl font-black text-yellow-400/90">?</span>
                </div>
              ) : (
                <>
                  <div className="absolute rounded-full border-4 pointer-events-none" style={{ width: 200, height: 200, borderColor: revealDef.color, animation: 'fhq-reveal-burst 0.7s ease-out forwards' }} />
                  <HeroArt heroKey={revealDef.key} art={revealDef.art} label={revealDef.name} mode="celebrate" className="h-60 w-60" />
                </>
              )}
            </div>
            <div className="mt-5 text-center" style={{ minHeight: 60 }}>
              {reveal === 'suspense' ? (
                <div className="text-sm font-black uppercase tracking-[0.3em] text-yellow-300 animate-pulse">Scouting…</div>
              ) : (
                <div className="animate-fade-in">
                  <div className="text-2xl font-display font-black text-white drop-shadow">{lastRoll.name}</div>
                  {lastRoll.isNew
                    ? <div className="text-sm font-black uppercase tracking-widest mt-1" style={{ color: revealDef.color }}>🎉 New hero unlocked!</div>
                    : <div className="text-sm font-bold text-purple-300 mt-1">Duplicate → +{lastRoll.shards} 🧩 shards</div>}
                  <div className="text-xs text-slate-300 mt-2">Tap or press Enter to continue</div>
                </div>
              )}
            </div>
          </button>
        )}

        <div inert={revealDef ? true : undefined}>
        {/* Latest Scout Search result */}
        {lastRoll && (
          <div className={`px-5 py-2.5 border-b flex items-center gap-2 text-sm font-bold ${lastRoll.isNew ? 'bg-fuchsia-950/60 border-fuchsia-800 text-fuchsia-200' : 'bg-slate-900/80 border-slate-800 text-slate-200'}`}>
            <Sparkles size={15} className={lastRoll.isNew ? 'text-fuchsia-300' : 'text-purple-300'} />
            {lastRoll.isNew
              ? <>Scouted <span className="text-white">{lastRoll.name}</span> — NEW HERO UNLOCKED! 🎉</>
              : <>Scouted a duplicate <span className="text-white">{lastRoll.name}</span> → <span className="text-purple-300">+{lastRoll.shards} shards 🧩</span></>}
          </div>
        )}

        <div className="p-4 border-b border-slate-700 space-y-3">
          <div className="flex gap-2">{(['growth','practice'] as const).map(tab => <button key={tab} aria-pressed={heroTab === tab} onClick={() => setHeroTab(tab)} className={`flex-1 rounded-xl p-3 font-bold capitalize ${heroTab === tab ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-300'}`}>{tab === 'growth' ? 'Your heroes & growth' : 'Film Room & practice'}</button>)}</div>
          <label htmlFor="growth-hero" className="block text-sm text-slate-300">Choose your hero</label>
          <select id="growth-hero" value={selectedKey} onChange={e => setSelectedKey(e.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-white">{HERO_DEFS.map(def => <option key={def.key} value={def.key}>{def.name} · {def.role} · {(stateOf(def.key)?.unlocked ?? !!def.starter) ? `Level ${stateOf(def.key)?.level ?? 1}` : 'Locked'}</option>)}</select>
        </div>
        {heroTab === 'practice' && <HeroTrainingPreview showHeroPicker={false} key={selectedKey} initialHero={selectedKey} onPractice={onPractice} />}
        {heroTab === 'growth' && <>
        <div className="px-5 pt-4">
          <HowTo defaultCollapsed id="heroes" lines={[
            'Practice any hero for free, including locked heroes. Send them in, then call their signature when it is ready.',
            'Unlock a hero to take them into road games. Free practice does not unlock or level your roster.',
            'Unlock new heroes with Coins/Crowns or find them in Scout Searches — duplicates become 🧩 shards.',
            'Shards buy ⭐ star-ups. Train with Coins here, or find team training in Roster.',
            'Heroes guard your GATES on defense — assign who holds which gate in the Front Office.',
          ]} />
        </div>
        <div className="p-5 grid grid-cols-1 gap-4 content-start auto-rows-max">
          {HERO_DEFS.filter(def => def.key === selectedKey).map(def => {
            const model = heroProgression(club, def.key, Date.now())!;
            const st = stateOf(def.key);
            const unlocked = st?.unlocked ?? !!def.starter;
            const lvl = st?.level ?? 1;
            const strs = st?.stars ?? 1;
            const shards = st?.shards ?? 0;
            const m = heroLevelMult(lvl) * heroStarMult(strs);
            const nextM = heroLevelMult(lvl + 1) * heroStarMult(strs);
            const hp = model.current.grit;
            const dps = Math.round(model.current.yardage);
            const cost = model.nextLevel?.costCoins ?? heroUpgradeCost(lvl);
            const capped = lvl >= maxLevel;
            const training = upgrades.find(job => job.kind === 'hero' && job.key === def.key);
            const canAfford = !blocked && model.canTrain;
            const starCost = STAR_UP_COSTS[strs]; // undefined at MAX_STARS
            const canStarUp = !blocked && model.canStarUp;

            // Unlock affordability
            const uCoins = def.unlock?.coins ?? 0;
            const uGems = def.unlock?.gems ?? 0;
            const canUnlock = !blocked && model.canUnlock;

            return (
              <article key={def.key} aria-label={`${def.name} · ${unlocked ? 'On your roster' : 'Locked'}`} className={`rounded-2xl border-2 bg-slate-900 overflow-hidden flex flex-col ${unlocked ? 'border-slate-700' : 'border-slate-800'}`}>
                <div className="fhq-modern-card relative shrink-0 flex items-end justify-center h-52 overflow-hidden" style={{ background: `radial-gradient(circle at 50% 40%, ${def.color}44, #0f172a 70%)` }}>
                  {/* CARD FLOURISH (unlocked heroes only): the REAL flame-ring sprite
                      (franchise-rig #38) spinning behind the art, hue-shifted from its
                      golden base to each hero's signature color. Glow breathes behind it. */}
                  {unlocked && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                      <img src="/assets/heroes/franchise-rig/aura-ring.webp" alt="" draggable={false}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        style={{ width: 152, height: 152, animation: 'fhq-aura 9s linear infinite', opacity: 0.92,
                          filter: `hue-rotate(${heroHue(def.color) - 45}deg) saturate(1.15) drop-shadow(0 0 8px ${def.color}66)` }} />
                    </div>
                  )}
                  {unlocked && (
                    <img src="/assets/fx/window-glow.webp" alt="" draggable={false}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
                      style={{ width: 150, mixBlendMode: 'screen', animation: 'fhq-glow 3s ease-in-out infinite' }} />
                  )}
                  <HeroArt heroKey={def.key} art={def.art} label={def.name} mode={unlocked ? 'showcase' : 'idle'} className={`h-52 w-52 ${unlocked ? '' : 'grayscale opacity-60'}`} />
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
                    <div className="text-sm text-slate-300">{def.role} · Level {lvl} · {strs}/{MAX_STARS} stars</div><p className="mt-2 text-sm text-slate-400">Speed {model.current.speed} · Range {model.current.range}. Levels and stars improve Grit and Yardage; speed and range stay fixed.</p><p className="mt-2 text-sm text-orange-200">{heroMovementStyle(def.key).identity}</p>
                  </div>
                  <details className="rounded-xl border border-slate-700 p-3 text-sm text-slate-300"><summary className="cursor-pointer min-h-7 font-bold text-white">Signature & growth details</summary><p className="mt-2">{model.ability.implementation}</p><p className="mt-2">Signature cooldown: {model.ability.cooldownSeconds}s. {model.ability.scalesWith === 'yardage' ? 'More Yardage strengthens the signature’s damage.' : model.ability.scalesWith === 'grit' ? 'Recovery depends on maximum Grit.' : 'The signature’s fixed effects do not increase with levels or stars.'}</p>{model.stadiumGate.atMax && <p className="mt-2 text-amber-200">Upgrade Stadium to level {model.stadiumGate.nextStadiumLevel} to unlock more hero levels.</p>}</details>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-2 py-1.5"><Dumbbell size={14} className="text-red-400" /><span className="text-slate-400 text-xs">GRIT</span><span className="ml-auto font-mono font-bold text-white">{hp}</span></div>
                    <div className="flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-2 py-1.5"><span className="text-sm leading-none">🏈</span><span className="text-slate-400 text-xs">YDS</span><span className="ml-auto font-mono font-bold text-white">{dps}</span></div>
                  </div>
                  <div className="text-xs bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700">
                    <span className="font-bold" style={{ color: def.color }}>{def.emoji} {def.abilityName}</span>
                    <span className="text-slate-400"> — {def.abilityDesc}</span>
                  </div>

                  {onPractice && <button type="button" onClick={() => onPractice(def.key)} aria-label={`Practice with ${def.name} for free`}
                    className="min-h-11 w-full rounded-xl border border-orange-500/60 bg-orange-950/40 px-3 py-2 text-sm font-bold text-orange-200 hover:bg-orange-900/50">
                    Practice signature · Free
                  </button>}

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

                      {strs < MAX_STARS && <p className="text-xs text-slate-300">Next star · {starCost} shards: Grit {hp} → {Math.round(def.baseHp * heroLevelMult(lvl) * heroStarMult(strs + 1))}; Yardage {dps} → {Math.round(def.baseDps * heroLevelMult(lvl) * heroStarMult(strs + 1))}.</p>}
                      {training ? <p role="status" className="rounded-xl border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">Training to level {training.toLevel} · {Math.max(0, Math.ceil((training.finishTime - Date.now()) / 1000))}s remaining. The new stats apply when training completes.</p> : !capped && <div className="rounded-xl border border-slate-700 p-3 text-sm text-slate-300">
                        <p className="font-bold text-white">Next level: {lvl} → {lvl + 1}</p>
                        <p>Grit {hp} → {Math.round(def.baseHp * nextM)} · Yardage {dps} → {Math.round(def.baseDps * nextM)}</p>
                        <p className="mt-1">{cost.toLocaleString()} Coins · {Math.round(upgradeDurationSecs(lvl + 1) * 3)}s training · No builder needed.</p>
                        {resources.COINS < cost && <p className="mt-1 text-amber-300">Need {(cost - resources.COINS).toLocaleString()} more Coins.</p>}
                      </div>}
                      {capped ? (
                        <div className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 border border-slate-700">
                          <Lock size={15} /> Max level — upgrade Stadium
                        </div>
                      ) : (
                        <button onClick={() => onUpgrade(def.key, cost)} disabled={!canAfford}
                          className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95
                            ${canAfford ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                          <ArrowUpCircle size={16} /> {training ? 'Training in progress' : `Train to Lv ${lvl + 1}`}
                          <span className="text-[11px] text-slate-300">(+{Math.round((nextM / m - 1) * 100)}%)</span>
                          <span className="flex items-center gap-0.5 text-xs bg-black/20 px-1.5 py-0.5 rounded"><Coins size={11} /> {cost}</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        </>}
        </div>
    </Sheet>
  );
};
