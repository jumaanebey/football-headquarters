import React from 'react';
import type { BTroop } from '../battle';
import { heroBattlePose } from '../game/heroBattlePose';
import { hasModernHero } from '../game/heroAnimation';
import { AnimatedHero } from './AnimatedHero';
import { SpriteFrames, WALK_FRAMES } from './SpriteFrames';

/** Both teams and all nine heroes share action timing and fallback behavior. */
export function BattleHeroSprite({ heroKey, actor, fighting, filter }: {
  heroKey: string; actor: BTroop; fighting: boolean; filter?: string;
}) {
  const mode = heroBattlePose(actor, fighting);
  const base = `/assets/heroes/rig/${heroKey}`;
  const idle = heroKey === 'qb' ? '/assets/heroes/franchise-rig/body.webp' : `${base}-body.webp`;
  const action = heroKey === 'qb' ? '/assets/heroes/franchise-rig/body-followthrough.webp' : `${base}-action.webp`;
  const sources = mode === 'walk' ? WALK_FRAMES.map(frame => `${base}-${frame}.webp`) : [mode === 'attack' ? action : idle];
  return <>
    <SpriteFrames sources={sources} duration={actor.strideSeconds} style={{ filter, transform: (actor.face ?? 1) > 0 ? 'scaleX(-1)' : undefined }} />
    {hasModernHero(heroKey) && <AnimatedHero heroKey={heroKey} mode={mode} facing={actor.face} cycle={actor.strideSeconds}
      elapsedSeconds={mode === 'attack' ? 0.2 : undefined} filter={filter} />}
  </>;
}
