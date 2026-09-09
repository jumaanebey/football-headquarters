import React from 'react';
import { AnimatedHero } from './AnimatedHero';
import type { HeroAnimation } from '../game/heroAnimation';

export function HeroArt({ heroKey, art, label = '', mode = 'idle', className = '' }: {
  heroKey: string; art: string; label?: string; mode?: HeroAnimation; className?: string;
}) {
  return <span className={`fhq-unit relative block ${className}`}>
    <img src={art} alt="" className="fhq-flat absolute inset-0 h-full w-full object-contain" />
    <AnimatedHero heroKey={heroKey} label={label} mode={mode} />
  </span>;
}
