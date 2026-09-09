import React from 'react';
import type { BTroop, RaidHero } from '../battle';
import { HeroArt } from './HeroArt';

/** Pinned hero commands never disappear into the reserve-unit tray. */
export function HeroCommandBar({ heroes, troops, selected, onSelect, onAbility }: {
  heroes: RaidHero[]; troops: BTroop[]; selected?: string;
  onSelect: (hero: RaidHero) => void; onAbility: (key: string) => void;
}) {
  if (!heroes.length) return null;
  return <div role="group" aria-label="Hero commands" className="fhq-hero-commands" style={{ '--fhq-hero-columns': Math.min(5, heroes.length) } as React.CSSProperties}>
    {heroes.map(hero => {
      const actor = troops.find(t => t.heroKey === hero.key);
      const cooldown = Math.ceil(actor?.abilityCd ?? 0);
      const disabled = !!actor && (actor.dead || cooldown > 0 || !!actor.activeAction);
      const status = !actor ? selected === hero.key ? 'Selected · send in' : 'Select to send in' : actor.dead ? 'Subbed out' : actor.activeAction ? 'Play in progress' : cooldown > 0 ? `Ready in ${cooldown}s` : 'Signature ready';
      return <button key={hero.key} type="button" disabled={disabled} aria-label={`${hero.name}: ${!actor ? 'select for deployment' : hero.abilityName}. ${status}`}
        aria-pressed={!actor ? selected === hero.key : undefined} onClick={() => actor ? onAbility(hero.key) : onSelect(hero)}
        className={`min-h-16 rounded-xl px-2 py-2 flex gap-2 items-center text-left border-2 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white ${disabled ? 'bg-slate-900 border-slate-700 text-slate-400' : selected === hero.key || actor ? 'border-amber-400 bg-amber-950/40 text-white' : 'border-slate-600 bg-slate-800 text-white'}`}>
        <HeroArt heroKey={hero.key} art={hero.art} className="shrink-0 w-10 h-12" />
        <span className="min-w-0 leading-tight">
          <span className="block text-xs font-bold">{hero.name}</span>
          <span className="block text-xs mt-0.5" style={{ color: disabled ? '#cbd5e1' : '#fde68a' }}>{actor ? hero.abilityName : status}</span>
          {actor && <span className="block text-xs mt-0.5 tabular-nums">{status}</span>}
        </span>
      </button>;
    })}
  </div>;
}
