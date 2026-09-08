/** Presentation-only drills. Pauses and turns never touch simulation state. */
export function heroPatrol(time: number, lane: number, reduced = false) {
  const travel = [5.5, 7, 4.6][lane % 3];
  const rest = 2.2;
  const leg = travel + rest;
  const phase = ((time % (leg * 2)) + leg * 2) % (leg * 2);
  const outward = phase < leg;
  const beat = phase % leg;
  const progress = Math.min(1, beat / travel);
  return {
    progress: reduced ? 0.35 : outward ? progress : 1 - progress,
    facing: reduced ? -1 : outward ? -1 : 1,
    mode: reduced ? 'idle' as const : beat < travel ? 'walk' as const : beat < travel + 0.9 ? 'attack' as const : 'idle' as const,
    cycle: [0.58, 0.72, 0.46][lane % 3],
  };
}
