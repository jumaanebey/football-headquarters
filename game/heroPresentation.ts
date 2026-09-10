// Hero presentation profiles: how each of the nine heroes carries themselves, expressed only
// in terms of frames that exist in the approved sheets and of timings that read simulation
// state. Nothing here changes where an actor is, how fast it moves, when it hits or what a
// replay hashes — the simulation owns position, facing, stride phase (distance-driven in
// game/spriteMotion.ts), action timers and hit flashes; profiles choose which authored frame
// shows for that state and for how long a transition frame lingers.
//
// Motion sheet columns (row = facing): 0 idle, 1 start/anticipation, 2–5 stride, 6 plant
// (turn/stop/brace), 7 gesture (wave/directive/celebrate), 8 hit brace (nine-column heroes;
// QB/Enforcer take hit frames from their reaction sheet). Elite poses: 0 idle, 1–6 walk,
// 7 attack contact, 8 celebrate.
export type ReactionIntensity = 'light' | 'medium' | 'heavy';
export interface HeroPresentationProfile {
  /** Stride cycle scale for cadence-driven consumers (campus patrol, rig underlay): < 1 quicker footfalls, > 1 longer strides. Battle stride frames follow distance, so cadence there stretches or shortens the frame table (`contactHold`). */
  cadence: number;
  /** Share of the stride cycle spent on planted-contact frames (columns 2 and 4); heavier heroes hold contact longer. 0.5 = even. */
  contactHold: number;
  idle: { column: number; breathSeconds: number; breathAmplitude: number; settleSeconds: number };
  start: { column: number; seconds: number };
  turn: { column: number; seconds: number };
  stop: { column: number; seconds: number };
  attack: { anticipationSeconds: number; anticipationColumn: number; recoverySeconds: number; recoveryColumn: number };
  reaction: { intensity: ReactionIntensity; seconds: number };
  signature: { prepColumn: number; prepSeconds: number };
  /** Optional idle gesture (column 7): cadence and hold; none when omitted. */
  gesture?: { everySeconds: number; seconds: number };
  campus: { travel: number; rest: number; actionSeconds: number; cycle: number };
  lift: number;
}
const BASE: HeroPresentationProfile = {
  cadence: 1, contactHold: .5,
  idle: { column: 0, breathSeconds: 3.2, breathAmplitude: 1, settleSeconds: .16 },
  start: { column: 1, seconds: .1 }, turn: { column: 6, seconds: .12 }, stop: { column: 6, seconds: .16 },
  attack: { anticipationSeconds: .06, anticipationColumn: 1, recoverySeconds: .08, recoveryColumn: 6 },
  reaction: { intensity: 'medium', seconds: .18 },
  signature: { prepColumn: 6, prepSeconds: 0 },
  campus: { travel: 5.5, rest: 2.2, actionSeconds: .9, cycle: .58 },
  lift: 3,
};
const profile = (overrides: Partial<{ [K in keyof HeroPresentationProfile]: HeroPresentationProfile[K] extends object ? Partial<HeroPresentationProfile[K]> : HeroPresentationProfile[K] }>): HeroPresentationProfile => ({
  ...BASE, ...overrides,
  idle: { ...BASE.idle, ...overrides.idle }, start: { ...BASE.start, ...overrides.start }, turn: { ...BASE.turn, ...overrides.turn }, stop: { ...BASE.stop, ...overrides.stop },
  attack: { ...BASE.attack, ...overrides.attack }, reaction: { ...BASE.reaction, ...overrides.reaction }, signature: { ...BASE.signature, ...overrides.signature },
  campus: { ...BASE.campus, ...overrides.campus }, gesture: overrides.gesture === undefined ? BASE.gesture : Object.assign({ everySeconds: 6, seconds: .6 }, overrides.gesture),
} as HeroPresentationProfile);

export const HERO_PRESENTATION: Record<string, HeroPresentationProfile> = {
  // The Franchise: composed movement, a planted read/throw posture before contact and a long recovery.
  qb: profile({ cadence: 1, contactHold: .5, idle: { breathSeconds: 2.8, breathAmplitude: .9 }, start: { seconds: .08 }, stop: { column: 6, seconds: .22 },
    attack: { anticipationSeconds: .12, anticipationColumn: 6, recoverySeconds: .16, recoveryColumn: 6 }, reaction: { intensity: 'light', seconds: .14 },
    signature: { prepColumn: 6, prepSeconds: .12 }, campus: { travel: 5.5, rest: 2.6, actionSeconds: .9, cycle: .58 }, lift: 4 }),
  // The Enforcer: heavy footfalls (long contact), short drive steps, a braced plant and a heavy, longer recovery from contact.
  enforcer: profile({ cadence: .85, contactHold: .66, idle: { breathSeconds: 3.4, breathAmplitude: .7, settleSeconds: .24 }, start: { column: 1, seconds: .14 }, turn: { seconds: .18 }, stop: { seconds: .24 },
    attack: { anticipationSeconds: .04, anticipationColumn: 1, recoverySeconds: .2, recoveryColumn: 6 }, reaction: { intensity: 'light', seconds: .12 },
    campus: { travel: 4.6, rest: 2.4, actionSeconds: 1.1, cycle: .72 }, lift: 2 }),
  // The General: measured stride, directive gestures at rest, unhurried turns.
  coach: profile({ cadence: 1.15, contactHold: .64, idle: { breathSeconds: 3.6, breathAmplitude: .6, settleSeconds: .2 }, start: { seconds: .18 }, turn: { seconds: .16 }, stop: { seconds: .2 },
    attack: { anticipationSeconds: .1, anticipationColumn: 6, recoverySeconds: .12, recoveryColumn: 6 }, reaction: { intensity: 'medium', seconds: .18 },
    gesture: { everySeconds: 4.5, seconds: .8 }, campus: { travel: 7, rest: 3, actionSeconds: 1.2, cycle: .72 }, lift: 1 }),
  // The Specialist: approach, plant, kick — a long planted anticipation before the strike, quick recovery.
  kicker: profile({ cadence: 1, contactHold: .5, idle: { breathSeconds: 3.1 }, start: { seconds: .1 }, stop: { column: 6, seconds: .2 },
    attack: { anticipationSeconds: .14, anticipationColumn: 6, recoverySeconds: .06, recoveryColumn: 1 }, reaction: { intensity: 'medium', seconds: .18 },
    signature: { prepColumn: 6, prepSeconds: .14 }, campus: { travel: 5.5, rest: 2.2, actionSeconds: 1, cycle: .58 }, lift: 4 }),
  // The Burner: quick cadence, an explosive start frame, a clear stop from full speed.
  burner: profile({ cadence: .7, contactHold: .4, idle: { breathSeconds: 2.1, breathAmplitude: 1.2, settleSeconds: .1 }, start: { column: 1, seconds: .16 }, turn: { seconds: .08 }, stop: { column: 6, seconds: .26 },
    attack: { anticipationSeconds: .04, anticipationColumn: 1, recoverySeconds: .06, recoveryColumn: 1 }, reaction: { intensity: 'heavy', seconds: .22 },
    campus: { travel: 4, rest: 1.6, actionSeconds: .7, cycle: .42 }, lift: 7 }),
  // The Medic: purposeful support movement (quick to set off, light contact), a treatment cue (gesture) at rest, soft turns.
  medic: profile({ cadence: 1.05, contactHold: .42, idle: { breathSeconds: 2.9, breathAmplitude: .8, settleSeconds: .12 }, start: { seconds: .04 }, turn: { seconds: .1 }, stop: { seconds: .22 },
    attack: { anticipationSeconds: .1, anticipationColumn: 6, recoverySeconds: .1, recoveryColumn: 6 }, reaction: { intensity: 'medium', seconds: .18 },
    gesture: { everySeconds: 5, seconds: .7 }, campus: { travel: 5.5, rest: 2.8, actionSeconds: 1, cycle: .6 }, lift: 2 }),
  // The Captain: braced protective stance (plant column at rest after moving), measured turns, light reactions.
  captain: profile({ cadence: 1.1, contactHold: .6, idle: { column: 0, breathSeconds: 3.8, breathAmplitude: .5, settleSeconds: .3 }, start: { seconds: .12 }, turn: { column: 6, seconds: .22 }, stop: { column: 6, seconds: .3 },
    attack: { anticipationSeconds: .08, anticipationColumn: 6, recoverySeconds: .14, recoveryColumn: 6 }, reaction: { intensity: 'light', seconds: .12 },
    campus: { travel: 6, rest: 3, actionSeconds: 1.1, cycle: .7 }, lift: 1 }),
  // The Playmaker: agile cuts (fast turns through the plant frame) and a decoy gesture at rest.
  playmaker: profile({ cadence: .8, contactHold: .42, idle: { breathSeconds: 2.5, breathAmplitude: 1.1, settleSeconds: .1 }, start: { seconds: .08 }, turn: { column: 6, seconds: .06 }, stop: { seconds: .12 },
    attack: { anticipationSeconds: .06, anticipationColumn: 1, recoverySeconds: .06, recoveryColumn: 1 }, reaction: { intensity: 'heavy', seconds: .2 },
    gesture: { everySeconds: 3.5, seconds: .5 }, campus: { travel: 4.6, rest: 1.8, actionSeconds: .8, cycle: .46 }, lift: 5 }),
  // The Legend: deliberate stride, long settles, a visible signature preparation.
  legend: profile({ cadence: 1.25, contactHold: .58, idle: { breathSeconds: 4.2, breathAmplitude: .6, settleSeconds: .26 }, start: { seconds: .14 }, turn: { seconds: .2 }, stop: { seconds: .26 },
    attack: { anticipationSeconds: .12, anticipationColumn: 6, recoverySeconds: .16, recoveryColumn: 6 }, reaction: { intensity: 'medium', seconds: .2 },
    signature: { prepColumn: 6, prepSeconds: .18 }, campus: { travel: 7, rest: 3.2, actionSeconds: 1.3, cycle: .78 }, lift: 2 }),
};
export const DEFAULT_HERO_PRESENTATION: HeroPresentationProfile = BASE;
/** Safe for unknown/legacy keys: the base profile. */
export const heroPresentation = (key: string | undefined | null): HeroPresentationProfile => (key && HERO_PRESENTATION[key]) || BASE;

/** Stride frame for a distance-driven phase: contact frames (columns 2 and 4) hold for `contactHold` of the cycle. */
export function strideColumn(phase: number, contactHold = .5): number {
  const p = ((Number.isFinite(phase) ? phase : 0) % 1 + 1) % 1;
  const half = p < .5 ? p * 2 : (p - .5) * 2; // two half-cycles: contact→swing, contact→swing
  const column = half < contactHold ? 0 : 1;   // 0 = contact frame, 1 = swing frame
  return p < .5 ? 2 + column : 4 + column;
}
/** Attack frame selection from the simulation's countdown timer: anticipation column first, contact (elite pose 7) in the middle, recovery column last. */
export const MIN_CONTACT_SECONDS = .12;
export function attackPhase(profile: HeroPresentationProfile, actionPoseT: number, total: number): 'anticipation' | 'contact' | 'recovery' {
  // The authored contact pose always gets at least MIN_CONTACT_SECONDS of the simulation's window; anticipation and recovery share the rest.
  const budget = Math.max(0, total - MIN_CONTACT_SECONDS);
  const anticipation = Math.min(profile.attack.anticipationSeconds, budget * .6);
  const recovery = Math.min(profile.attack.recoverySeconds, budget - anticipation);
  const elapsed = Math.max(0, total - actionPoseT);
  if (elapsed < anticipation) return 'anticipation';
  if (actionPoseT <= recovery) return 'recovery';
  return 'contact';
}
/** Cosmetic reaction offset (screen px per 100 px of sprite) for a hit flash: heavier reactions kick further and decay over the profile's window. */
export function reactionOffset(profile: HeroPresentationProfile, hitFlash: number, facing: number, reduced = false): { dx: number; dy: number } {
  if (reduced || !(hitFlash > 0)) return { dx: 0, dy: 0 };
  const amplitude = { light: 2, medium: 4, heavy: 7 }[profile.reaction.intensity];
  const t = Math.min(1, hitFlash / profile.reaction.seconds);
  return { dx: -facing * amplitude * t, dy: -amplitude * .35 * t };
}
