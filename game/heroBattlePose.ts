import type { BTroop } from '../battle';
import type { HeroAnimation } from './heroAnimation';
import { asSignatureBeat } from './heroSignaturePresentation';

/** Contact poses follow the simulation's visible release beat, not a second clock. */
export function heroBattlePose(actor: Pick<BTroop, 'moving' | 'actionPoseT' | 'abilityPoseT' | 'signatureFrame'>, fighting: boolean, heroKey?: string): HeroAnimation {
  if (!fighting) return 'idle';
  if (asSignatureBeat(actor.signatureFrame) !== undefined) return 'signature';
  // The activation leaves a brief action timer behind. A running Enforcer
  // must keep his footfalls until physical contact, rather than slide in a brace.
  if (heroKey === 'enforcer' && actor.moving) return 'walk';
  if ((actor.actionPoseT ?? 0) > 0 || (actor.abilityPoseT ?? 0) > 0.52) return 'attack';
  return actor.moving ? 'walk' : 'idle';
}
