import React, { useEffect, useState } from 'react';
import { HERO_DEFS } from '../battle';
import { HERO_PLAYBOOK } from '../game/heroPlaybook';
import { AnimatedHero } from './AnimatedHero';

/** An animation preview only: no currency, unlock or combat state is changed. */
export function HeroTrainingPreview({ initialHero = 'qb' }: { initialHero?: string }) {
  const [heroKey, setHeroKey] = useState(() => HERO_DEFS.some(h => h.key === initialHero) ? initialHero : 'qb');
  const [mode, setMode] = useState<'idle' | 'run' | 'signature' | 'celebrate'>('idle');
  const [take, setTake] = useState(0);
  const [facing, setFacing] = useState(-1);
  const hero = HERO_DEFS.find(h => h.key === heroKey)!;
  const guide = HERO_PLAYBOOK[heroKey];
  useEffect(() => {
    if (mode !== 'signature') return;
    const timer = window.setTimeout(() => setMode('idle'), 900);
    return () => window.clearTimeout(timer);
  }, [mode, take]);
  return <section aria-label="Hero film room" className="m-5 rounded-2xl border border-slate-700 overflow-hidden bg-slate-950">
    <div className="px-4 pt-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-display font-bold text-white">Hero Film Room</h2>
      <span className="text-sm text-slate-400">Free animation preview · all heroes</span>
    </div>
    <div className="p-4 grid sm:grid-cols-[190px_1fr] gap-5 items-center">
      <div className="relative h-52 rounded-xl flex items-end justify-center overflow-hidden" style={{ background: `radial-gradient(ellipse at 50% 70%, ${hero.color}44, #0f172a 75%)` }}>
        <div className="absolute bottom-3 rounded-[50%] w-24 h-4 bg-black/40" />
        <div key={heroKey} className="fhq-unit relative w-48 h-48">
          <img src={hero.art} alt={hero.name} className="fhq-flat absolute inset-0 w-full h-full object-contain" />
          <AnimatedHero heroKey={heroKey} mode={mode === 'run' ? 'walk' : mode === 'signature' ? 'attack' : mode} facing={facing} cycle={.58}
            elapsedSeconds={mode === 'signature' ? .2 : undefined} filter={`drop-shadow(0 0 ${mode === 'signature' ? 12 : 3}px ${hero.color})`} />
        </div>
      </div>
      <div className="min-w-0">
        <label htmlFor="film-room-hero" className="block text-sm text-slate-300 mb-1">Choose a hero</label>
        <select id="film-room-hero" value={heroKey} onChange={e => { setHeroKey(e.target.value); setMode('idle'); }} className="w-full rounded-lg bg-slate-800 border border-slate-600 p-2 text-base text-white">
          {HERO_DEFS.map(h => <option key={h.key} value={h.key}>{h.name} · {h.role}</option>)}
        </select>
        <p className="mt-3 font-bold text-white">{guide.identity}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-300"><strong style={{ color: hero.color }}>{hero.abilityName}:</strong> {hero.abilityDesc}</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Preview animation">
          {(['idle', 'run', 'signature', 'celebrate'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setTake(t => t + 1); }}
            className={`rounded-lg px-3 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-orange-400 ${mode === value ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
            {value === 'signature' ? 'Signature play' : value === 'run' ? 'Run' : value === 'celebrate' ? 'Celebrate' : 'Idle'}
          </button>)}
          <button type="button" onClick={() => setFacing(f => -f)} className="rounded-lg px-3 py-2 text-sm text-slate-300 border border-slate-700">Turn</button>
        </div>
        <p className="sr-only" role="status">{hero.name}: {mode === 'signature' ? hero.abilityName : mode}</p>
      </div>
    </div>
    <div className="border-t border-slate-800 px-4 py-3 text-sm leading-relaxed text-slate-300">
      <p><strong className="text-white">Call it when:</strong> {guide.timing}</p>
      <p className="mt-1"><strong className="text-white">Lineup tip:</strong> {guide.lineup}</p>
    </div>
  </section>;
}
