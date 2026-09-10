import React, { useRef } from 'react';
import { advanceHeroMotion, type HeroMotionState } from '../game/heroMotion';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';
import type { BTroop } from '../battle';
import { heroBattlePose } from '../game/heroBattlePose';
import { hasModernHero } from '../game/heroAnimation';
import { AnimatedHero } from './AnimatedHero';
import { SpriteFrames, WALK_FRAMES } from './SpriteFrames';

/** Both teams and all nine heroes share action timing and fallback behavior. */
export function BattleHeroSprite({ heroKey, actor, fighting, filter }: {
  heroKey: string; actor: Pick<BTroop, 'moving' | 'actionPoseT' | 'abilityPoseT' | 'face' | 'strideSeconds' | 'stridePhase' | 'signatureFrame' | 'truckT' | 'x' | 'y' | 'hitFlash'>; fighting: boolean; filter?: string;
}) {
  const motion = useRef<HeroMotionState | undefined>(undefined);
  const sample = advanceHeroMotion(motion.current, fighting ? actor : {...actor, moving: false, hitFlash: 0}, performance.now()/1000, heroKey);
  motion.current = sample.state;
  const mode = heroBattlePose(actor, fighting, heroKey);
  const base = `/assets/heroes/rig/${heroKey}`;
  const idle = heroKey === 'qb' ? '/assets/heroes/franchise-rig/body.webp' : `${base}-body.webp`;
  const action = heroKey === 'qb' ? '/assets/heroes/franchise-rig/body-followthrough.webp' : `${base}-action.webp`;
  const contact = mode === 'attack' || (mode === 'signature' && actor.signatureFrame === 2);
  const sources = mode === 'walk' ? WALK_FRAMES.map(frame => `${base}-${frame}.webp`) : [contact ? action : idle];
  return <>
    <SpriteFrames sources={sources} duration={actor.strideSeconds} style={{ filter, transform: (actor.face ?? 1) > 0 ? 'scaleX(-1)' : undefined }} />
    {hasModernHero(heroKey) && <AnimatedHero motionFrame={HERO_MOTION_BOUNDS[heroKey] && mode !== 'attack' && mode !== 'signature' ? sample.frame : undefined} heroKey={heroKey} mode={mode} facing={actor.face} cycle={actor.strideSeconds} loadSignatureArt
      signatureFrame={fighting ? actor.signatureFrame : undefined}
      contactSeconds={heroKey === 'enforcer' && mode === 'attack' ? Math.max(0, .32 - (actor.actionPoseT ?? 0)) : undefined}
      driving={heroKey === 'enforcer' && (actor.truckT ?? 0) > 0}
      elapsedSeconds={mode === 'attack' ? 0.2 : mode === 'walk' ? actor.stridePhase : undefined} filter={filter} />}
  </>;
}
