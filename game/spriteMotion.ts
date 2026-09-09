import { spriteFacing } from './spriteFacing';

/** Presentation only: observe displacement after a simulation step. Never change
 * combat speed or consume gameplay RNG to make a character look animated. */
export function spriteMotion(from: { x: number; y: number }, to: { x: number; y: number }, seconds: number, previousFace = 1, previousStride = 0) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const moving = seconds > 0 && distance > 0.0001;
  const speed = moving ? distance / seconds : 0;
  return {
    // 6.3 field units per stride: subdivision and render cadence cannot change
    // footfall phase. A blocked actor keeps its phase until it moves again.
    stridePhase: moving ? (previousStride + distance / 6.3) % 1 : previousStride,
    moving,
    face: moving ? spriteFacing(0, 0, (to.x - from.x) / seconds, (to.y - from.y) / seconds, previousFace) : previousFace,
    strideSeconds: moving ? Math.max(0.28, Math.min(0.9, 0.42 * 15 / speed)) : 0.42,
  };
}
