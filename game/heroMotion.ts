import { heroPresentation, strideColumn } from './heroPresentation';

export const heroMotionColumns = (key: string) => ['qb', 'enforcer'].includes(key) ? 8 : 9;
export type HeroMotionSample = { x: number; y: number; moving?: boolean; hitFlash?: number; stridePhase?: number };
export type HeroMotionState = { x: number; y: number; moving: boolean; direction: number; changedAt: number; transition?: 'start' | 'turn' | 'stop' };
/** Directions are screen-space: front-left, front-right, back-left, back-right. */
export const heroMotionRow = (key: string, direction: number) => (key === 'qb' && direction >= 2 ? 5 - direction : direction); // the QB generator supplied the back-facing rows in the opposite order
/**
 * Presentation-only frame choice from simulation state. `time` is whatever clock the caller
 * animates with: the battle passes simulation seconds so pause and replay speed hold or scale
 * the start/turn/stop transitions coherently; the campus passes its own patrol clock. Position,
 * facing and stride phase come from the sample (distance-driven), never from this clock.
 */
export function advanceHeroMotion(previous: HeroMotionState | undefined, actor: HeroMotionSample, time: number, key: string) {
  const profile = heroPresentation(key);
  const moving = !!actor.moving;
  const dx = actor.x - (previous?.x ?? actor.x), dy = actor.y - (previous?.y ?? actor.y);
  let direction = previous?.direction ?? 0;
  if (Math.hypot(dx, dy) > .02) direction = (dx + dy < 0 ? 2 : 0) + (dx - dy > 0 ? 1 : 0);
  // The first moving sample cannot know its direction yet; resolving it during the start window is
  // part of starting, not a turn (otherwise every departure would flash the plant frame).
  const startingUp = !!previous && previous.moving && previous.transition === 'start' && time - previous.changedAt < profile.start.seconds;
  const changed = !previous || previous.moving !== moving || (previous.direction !== direction && !startingUp);
  const transition: HeroMotionState['transition'] = changed ? !moving ? 'stop' : previous?.moving ? 'turn' : 'start' : previous.transition;
  const state = { x: actor.x, y: actor.y, moving, direction, transition, changedAt: !previous && !moving ? time - 1 : changed ? time : previous!.changedAt };
  const age = Math.max(0, time - state.changedAt);
  const phase = Number.isFinite(actor.stridePhase) ? ((actor.stridePhase! % 1) + 1) % 1 : 0;
  let column: number;
  if (moving) {
    if (transition === 'turn' && age < profile.turn.seconds) column = profile.turn.column;
    else if (transition === 'start' && age < profile.start.seconds) column = profile.start.column;
    else column = strideColumn(phase, profile.contactHold);
  } else column = previous?.moving || (age < profile.stop.seconds && !!previous) ? profile.stop.column : profile.idle.column;
  const columns = heroMotionColumns(key);
  const row = heroMotionRow(key, direction);
  return { state, frame: (actor.hitFlash ?? 0) > 0 ? columns === 8 ? 32 + direction : row * 9 + 8 : row * columns + column };
}
