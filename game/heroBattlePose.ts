import type { BTroop } from '../battle';
import type { HeroAnimation } from './heroAnimation';

/** Contact poses follow the simulation's visible release beat, not a second clock. */
export function heroBattlePose(actor: Pick<BTroop, 'moving' | 'actionPoseT' | 'abilityPoseT'>, fighting: boolean): HeroAnimation {
  if (!fighting) return 'idle';
  if ((actor.actionPoseT ?? 0) > 0 || (actor.abilityPoseT ?? 0) > 0.52) return 'attack';
  return actor.moving ? 'walk' : 'idle';
}
