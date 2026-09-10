export type HeroMotionSample = { x: number; y: number; moving?: boolean; hitFlash?: number; stridePhase?: number };
export type HeroMotionState = { x: number; y: number; moving: boolean; direction: number; changedAt: number; transition?: 'start' | 'turn' | 'stop' };
/** Directions are screen-space: front-left, front-right, back-left, back-right. */
export function advanceHeroMotion(previous: HeroMotionState | undefined, actor: HeroMotionSample, time: number, key: string) {
  const moving=!!actor.moving;
  const dx=actor.x-(previous?.x??actor.x),dy=actor.y-(previous?.y??actor.y);
  let direction=previous?.direction??0;
  if(Math.hypot(dx,dy)>.02) direction=(dx+dy<0?2:0)+(dx-dy>0?1:0);
  const changed=!previous || previous.moving!==moving || previous.direction!==direction;
  const transition: HeroMotionState['transition'] = changed ? !moving ? 'stop' : previous?.moving ? 'turn' : 'start' : previous.transition;
  const state={x:actor.x,y:actor.y,moving,direction,transition,changedAt:!previous&&!moving?time-1:changed?time:previous!.changedAt};
  const age=Math.max(0,time-state.changedAt);
  const phase=Number.isFinite(actor.stridePhase)?((actor.stridePhase!%1)+1)%1:0;
  const column=moving ? age<.1 ? transition==='turn' ? 6 : 1 : 2+Math.floor(phase*4) : previous?.moving || age<.16 && !!previous ? 6 : 0;
  // The QB generator supplied the back-facing rows in the opposite order.
  const row=key==='qb'&&direction>=2?5-direction:direction;
  return {state,frame:(actor.hitFlash??0)>0 ? 32+direction : row*8+column};
}
