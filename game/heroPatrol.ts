/** Presentation-only drills. Pauses and turns never touch simulation state. */
export function heroPatrol(time: number, lane: number, reduced = false) {
  const travel = [5.5, 7, 4.6][lane % 3];
  const rest = 2.2;
  const leg = travel + rest;
  const phase = ((time % (leg * 2)) + leg * 2) % (leg * 2);
  const outward = phase < leg;
  const beat = phase % leg;
  // Integrate a short acceleration/braking ramp. The endpoints and drill
  // duration stay fixed, but feet can plant before the action starts.
  const ramp = .45;
  const t = Math.min(travel, beat);
  const distance = t < ramp ? t * t / (2 * ramp)
    : t > travel - ramp ? travel - ramp - (travel - t) ** 2 / (2 * ramp)
    : t - ramp / 2;
  const progress = distance / (travel - ramp);
  return {
    progress: reduced ? 0.35 : outward ? progress : 1 - progress,
    facing: reduced ? -1 : outward ? -1 : 1,
    mode: reduced ? 'idle' as const : beat < travel ? 'walk' as const : beat < travel + 0.9 ? 'attack' as const : 'idle' as const,
    cycle: [0.58, 0.72, 0.46][lane % 3],
    stridePhase: reduced ? 0 : (progress * travel / [0.58, 0.72, 0.46][lane % 3]) % 1,
    actionElapsed: Math.min(.69, Math.max(0, beat - travel)),
  };
}
