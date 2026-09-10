import type { HeroAnimation, MODERN_HEROES } from './heroAnimation';
import { signatureFrameAt } from './combat/actionTiming';

export type SignatureBeat = 0 | 1 | 2 | 3;
export const SIGNATURE_BEATS = ['Set', 'Load', 'Release', 'Recover'] as const;
type HeroKey = typeof MODERN_HEROES[number];
type SignatureStyle = { load: number; lean: number; color: string; cue: 'ball' | 'drive' | 'rally' | 'kick' | 'speed' | 'recover' | 'protect' | 'route' | 'captain' };

/** Each silhouette keeps its approved pose; small foot-anchored changes show
 * weight transfer. These are presentation values, never movement or yardage. */
export const HERO_SIGNATURE_STYLE: Record<HeroKey, SignatureStyle> = {
  qb: { load: .98, lean: -.012, color: '#fbbf24', cue: 'ball' },
  enforcer: { load: .95, lean: .024, color: '#fb923c', cue: 'drive' },
  coach: { load: .985, lean: .012, color: '#fbbf24', cue: 'rally' },
  kicker: { load: .97, lean: -.016, color: '#fbbf24', cue: 'kick' },
  burner: { load: .96, lean: .028, color: '#fb923c', cue: 'speed' },
  medic: { load: .99, lean: 0, color: '#4ade80', cue: 'recover' },
  captain: { load: .955, lean: .012, color: '#67e8f9', cue: 'protect' },
  playmaker: { load: .965, lean: .02, color: '#c4b5fd', cue: 'route' },
  legend: { load: .985, lean: .008, color: '#fde68a', cue: 'captain' },
};

export const asSignatureBeat = (value: number | undefined): SignatureBeat | undefined =>
  value !== undefined && Number.isInteger(value) && value >= 0 && value < 4 ? value as SignatureBeat : undefined;

export type SignaturePlayback = { beat?: SignatureBeat; seconds: number; authored: boolean };
/** Resolve source availability once per action. A late sheet download can be
 * used on the next take without replacing the athlete halfway through this one. */
export function advanceSignaturePlayback(previous: SignaturePlayback, beat: SignatureBeat | undefined, delta: number, authoredReady: boolean): SignaturePlayback {
  if (beat === undefined) return { seconds: 0, authored: false };
  if (beat !== previous.beat) return { beat, seconds: 0, authored: previous.beat === undefined ? authoredReady : previous.authored };
  const elapsed = Number.isFinite(delta) ? Math.max(0, Math.min(.05, delta)) : 0;
  return { ...previous, seconds: previous.seconds + elapsed };
}

/** Film Room follows the same four beats as combat, and never loops a release. */
export function previewSignatureBeat(key: string, elapsed: number): SignatureBeat | undefined {
  if (!Number.isFinite(elapsed) || elapsed < 0) return undefined;
  const projectile = key === 'qb' || key === 'kicker';
  return asSignatureBeat(signatureFrameAt(elapsed, projectile ? .35 : .2, projectile ? .3 : .25));
}

/** Truck Stick primes before locomotion; its shoulder contact is the engine's
 * planted actionPoseT window, not the activation's release beat. Film Room has
 * no combat frame and continues to preview all four authored poses. */
export function battleSignatureBeat(key: string, mode: HeroAnimation, signatureFrame: number | undefined, contactSeconds?: number): SignatureBeat | undefined {
  const beat = asSignatureBeat(signatureFrame);
  if (key !== 'enforcer') return beat;
  if (beat !== undefined) return beat === 0 ? 0 : 1;
  if (mode === 'attack' && contactSeconds !== undefined && Number.isFinite(contactSeconds) && contactSeconds >= 0 && contactSeconds < .32) {
    return contactSeconds < .16 ? 2 : 3;
  }
  return undefined;
}

export function heroSignaturePose(key: string, beat: SignatureBeat, secondsInBeat: number, reduced = false, authored = false) {
  const style = HERO_SIGNATURE_STYLE[key as HeroKey] ?? HERO_SIGNATURE_STYLE.qb;
  const t = Math.max(0, Math.min(1, (Number.isFinite(secondsInBeat) ? secondsInBeat : 0) / .12));
  const eased = t * t * (3 - 2 * t);
  const loaded = beat === 1 ? eased : beat === 2 ? 1 - eased : 0;
  const recovery = beat === 3 ? 1 - eased : 0;
  return {
    ...style,
    frame: reduced ? 0 : beat === 2 || (beat === 3 && t < .5) ? 7 : 0,
    scaleY: reduced || authored ? 1 : 1 - (1 - style.load) * loaded,
    lean: reduced || authored ? 0 : style.lean * loaded + style.lean * .25 * recovery,
    // Reduced motion retains a static semantic cue, without pumping or travel.
    cueOpacity: beat === 2 ? 1 : beat === 3 ? reduced ? 0 : recovery : 0,
  };
}
