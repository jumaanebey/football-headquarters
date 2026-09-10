import { heroMovementStyle } from './heroMovementStyle';
export const heroMotionColumns = (key: string) => ['qb', 'enforcer'].includes(key) ? 8 : 9;
export type HeroMotionSample = { x: number; y: number; moving?: boolean; hitFlash?: number; stridePhase?: number };
export type HeroMotionState = { x: number; y: number; moving: boolean; direction: number; changedAt: number; sampledAt?: number; sourcePhase?: number; visualPhase?: number; transition?: 'start' | 'turn' | 'stop' };
/** Directions are screen-space: front-left, front-right, back-left, back-right. */
export function advanceHeroMotion(previous: HeroMotionState | undefined, actor: HeroMotionSample, time: number, key: string) {
  const profile=heroMovementStyle(key);
  const displaced=!previous || Math.hypot(actor.x-previous.x,actor.y-previous.y)>.0001;
  // Repeated renders at the same simulation time must preserve the existing pose.
  const sameTick=previous && time===previous.sampledAt;
  const moving=!!actor.moving && (sameTick ? previous.moving : displaced);
  const dx=actor.x-(previous?.x??actor.x),dy=actor.y-(previous?.y??actor.y);
  let direction=previous?.direction??0;
  if(Math.hypot(dx,dy)>.02) direction=(dx+dy<0?2:0)+(dx-dy>0?1:0);
  const changed=!previous || previous.moving!==moving || previous.direction!==direction;
  const transition: HeroMotionState['transition'] = changed ? !moving ? 'stop' : previous?.moving ? 'turn' : 'start' : previous.transition;
  const sourcePhase=Number.isFinite(actor.stridePhase)?((actor.stridePhase!%1)+1)%1:0;
  const phaseDelta=previous?.sourcePhase === undefined ? 0 : (sourcePhase-previous.sourcePhase+1)%1;
  const visualPhase=previous?.visualPhase === undefined ? sourcePhase : (previous.visualPhase+(moving ? phaseDelta*profile.cadence : 0))%1;
  const state={sourcePhase,visualPhase,sampledAt:time,x:actor.x,y:actor.y,moving,direction,transition,changedAt:!previous&&!moving?time-1:changed?time:previous!.changedAt};
  const age=Math.max(0,time-state.changedAt);
  const phase=visualPhase;
  const column=moving ? age<profile.plant ? transition==='turn' ? 6 : 1 : 2+Math.floor(phase*4) : previous?.moving || age<profile.settle && !!previous ? 6 : 0;
  // The QB generator supplied the back-facing rows in the opposite order.
  const row=key==='qb'&&direction>=2?5-direction:direction;
  return {state,frame:(actor.hitFlash??0)>0 ? heroMotionColumns(key) === 8 ? 32+direction : row*9+8 : row*heroMotionColumns(key)+column};
}
