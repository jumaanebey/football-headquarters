import React, { useRef } from 'react';
import { advanceHeroMotion, heroMotionColumns, heroMotionRow, type HeroMotionState } from '../game/heroMotion';
import { attackPhase, heroPresentation, reactionOffset } from '../game/heroPresentation';
import { asSignatureBeat } from '../game/heroSignaturePresentation';
import { HERO_MOTION_BOUNDS } from '../game/heroMotionBounds';
import type { BTroop } from '../battle';
import { heroBattlePose } from '../game/heroBattlePose';
import { hasModernHero } from '../game/heroAnimation';
import { AnimatedHero } from './AnimatedHero';
import { SpriteFrames, WALK_FRAMES } from './SpriteFrames';

/** Both teams and all nine heroes share action timing and fallback behavior. */
/** Presentation timers read the simulation clock when the battle screen supplies it (`simSeconds`),
 *  so pause holds a transition frame and replay speed scales it; the wall clock is the fallback. */
export function BattleHeroSprite({ heroKey, actor, fighting, filter, simSeconds, reduced = false }: {
  heroKey: string; actor: Pick<BTroop, 'moving' | 'actionPoseT' | 'abilityPoseT' | 'face' | 'strideSeconds' | 'stridePhase' | 'signatureFrame' | 'truckT' | 'x' | 'y' | 'hitFlash'>; fighting: boolean; filter?: string; simSeconds?: number; reduced?: boolean;
}) {
  const motion = useRef<HeroMotionState | undefined>(undefined);
  const clock = Number.isFinite(simSeconds) ? (simSeconds as number) : performance.now() / 1000;
  const sample = advanceHeroMotion(motion.current, fighting ? actor : {...actor, moving: false, hitFlash: 0}, clock, heroKey);
  motion.current = sample.state;
  const mode = heroBattlePose(actor, fighting, heroKey);
  const profile = heroPresentation(heroKey);
  const columns = heroMotionColumns(heroKey), row = heroMotionRow(heroKey, sample.state.direction);
  // Attack: anticipation column → contact (authored elite pose 7) → recovery column, timed by the simulation's own countdown.
  const contactTotal = heroKey === 'enforcer' ? .32 : .28;
  const phase = mode === 'attack' && (actor.actionPoseT ?? 0) > 0 ? attackPhase(profile, actor.actionPoseT ?? 0, contactTotal) : undefined;
  const attackFrame = phase === 'anticipation' ? row * columns + profile.attack.anticipationColumn : phase === 'recovery' ? row * columns + profile.attack.recoveryColumn : undefined;
  // Signature Set beat: the profile's preparation plant (Legend, Specialist, Franchise) instead of a plain idle.
  const prepFrame = mode === 'signature' && asSignatureBeat(actor.signatureFrame) === 0 && profile.signature.prepSeconds > 0 ? row * columns + profile.signature.prepColumn : undefined;
  const motionFrame = HERO_MOTION_BOUNDS[heroKey] ? (mode === 'attack' ? attackFrame : mode === 'signature' ? prepFrame : sample.frame) : undefined;
  const offset = fighting ? reactionOffset(profile, actor.hitFlash ?? 0, actor.face ?? 1, reduced) : undefined;
  const base = `/assets/heroes/rig/${heroKey}`;
  const idle = heroKey === 'qb' ? '/assets/heroes/franchise-rig/body.webp' : `${base}-body.webp`;
  const action = heroKey === 'qb' ? '/assets/heroes/franchise-rig/body-followthrough.webp' : `${base}-action.webp`;
  const contact = mode === 'attack' || (mode === 'signature' && actor.signatureFrame === 2);
  const sources = mode === 'walk' ? WALK_FRAMES.map(frame => `${base}-${frame}.webp`) : [contact ? action : idle];
  return <>
    <SpriteFrames sources={sources} duration={actor.strideSeconds} style={{ filter, transform: (actor.face ?? 1) > 0 ? 'scaleX(-1)' : undefined }} />
    {hasModernHero(heroKey) && <AnimatedHero tier="battle" motionFrame={motionFrame} offset={offset && (offset.dx || offset.dy) ? offset : undefined} heroKey={heroKey} mode={mode} facing={actor.face} cycle={actor.strideSeconds} loadSignatureArt
      signatureFrame={fighting ? actor.signatureFrame : undefined}
      contactSeconds={heroKey === 'enforcer' && mode === 'attack' ? Math.max(0, .32 - (actor.actionPoseT ?? 0)) : undefined}
      driving={heroKey === 'enforcer' && (actor.truckT ?? 0) > 0}
      elapsedSeconds={mode === 'attack' ? 0.2 : mode === 'walk' ? actor.stridePhase : undefined} filter={filter} />}
  </>;
}
