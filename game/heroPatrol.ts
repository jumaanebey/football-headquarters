import { heroPresentation } from './heroPresentation';

/** Presentation-only drills on the home campus. Pauses, turns and gestures never touch simulation state.
 *  Timings come from the hero's presentation profile (lane keeps the legacy three-way variety when no
 *  key is given, so older callers keep their look). `gesture` marks a rest beat where the hero's
 *  column-7 frame (directive, treatment cue, decoy, wave) shows instead of plain idle. */
export function heroPatrol(time: number, lane: number, reduced = false, key?: string) {
  const profile = key ? heroPresentation(key) : undefined;
  const travel = profile?.campus.travel ?? [5.5, 7, 4.6][lane % 3];
  const rest = profile?.campus.rest ?? 2.2;
  const action = profile?.campus.actionSeconds ?? .9;
  const cycle = profile?.campus.cycle ?? [0.58, 0.72, 0.46][lane % 3];
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
  const resting = beat >= travel + action;
  const gesture = !!profile?.gesture && !reduced && resting && outward && (beat - travel - action) < profile.gesture.seconds;
  return {
    progress: reduced ? 0.35 : outward ? progress : 1 - progress,
    facing: reduced ? -1 : outward ? -1 : 1,
    mode: reduced ? 'idle' as const : beat < travel ? 'walk' as const : beat < travel + action ? 'attack' as const : 'idle' as const,
    gesture,
    cycle: cycle * (profile?.cadence ?? 1),
    stridePhase: reduced ? 0 : (progress * travel / cycle) % 1,
    actionElapsed: Math.min(.69, Math.max(0, beat - travel)),
  };
}
