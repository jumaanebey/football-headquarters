import { describe, expect, it } from 'vitest';
import { MODERN_HEROES, heroFrame } from '../game/heroAnimation';
import { advanceSignaturePlayback, asSignatureBeat, heroSignaturePose, HERO_SIGNATURE_STYLE, previewSignatureBeat } from '../game/heroSignaturePresentation';
import { heroBattlePose } from '../game/heroBattlePose';

describe('signature presentation stays on the action clock', () => {
  it.each(MODERN_HEROES)('%s has four grounded beats, a contact pose, and a settled finish', key => {
    expect(HERO_SIGNATURE_STYLE[key]).toBeDefined();
    expect(previewSignatureBeat(key, 0)).toBe(0);
    expect(previewSignatureBeat(key, key === 'qb' || key === 'kicker' ? .2 : .12)).toBe(1);
    expect(previewSignatureBeat(key, key === 'qb' || key === 'kicker' ? .36 : .21)).toBe(2);
    expect(previewSignatureBeat(key, key === 'qb' || key === 'kicker' ? .55 : .35)).toBe(3);
    expect(previewSignatureBeat(key, .8)).toBeUndefined();
    expect(previewSignatureBeat(key, 20)).toBeUndefined();
    expect(heroSignaturePose(key, 2, 0).frame).toBe(7);
    expect(heroSignaturePose(key, 3, .13).frame).toBe(0);
    expect(heroSignaturePose(key, 1, .12).scaleY).toBeGreaterThanOrEqual(.95);
    expect(heroSignaturePose(key, 3, .13).scaleY).toBe(1);
    expect(heroSignaturePose(key, 3, .13).lean).toBeCloseTo(0);
  });
  it.each(MODERN_HEROES)('%s keeps a static pose and no weight transfer with reduced motion', key => {
    for (const beat of [0, 1, 2, 3] as const) {
      const pose = heroSignaturePose(key, beat, .1, true);
      expect(pose.frame).toBe(0); expect(pose.scaleY).toBe(1); expect(pose.lean).toBe(0);
    }
  });
  it('prefers semantic action beats over the old attack countdown or running', () => {
    for (const signatureFrame of [0, 1, 2, 3]) {
      expect(heroBattlePose({ signatureFrame, moving: true, actionPoseT: .28 }, true)).toBe('signature');
      expect(heroBattlePose({ signatureFrame, moving: true }, false)).toBe('idle');
    }
    expect(heroBattlePose({ moving: true }, true)).toBe('walk');
  });
  it('does not replay a contact when an endpoint holds longer than one action', () => {
    expect(heroFrame('attack', .2)).toBe(7);
    for (const elapsed of [.7, .9, 1.6, 10]) expect(heroFrame('attack', elapsed)).toBe(0);
  });
  it('rejects nonsemantic frames and bad preview times', () => {
    for (const frame of [undefined, NaN, -1, .5, 4, Infinity]) expect(asSignatureBeat(frame)).toBeUndefined();
    for (const time of [NaN, -1, Infinity]) expect(previewSignatureBeat('qb', time)).toBeUndefined();
  });
  it('keeps the chosen artwork through a late download and picks up the new art on retry', () => {
    let state = advanceSignaturePlayback({ seconds: 0, authored: false }, 0, .02, false);
    state = advanceSignaturePlayback(state, 1, .02, true);
    expect(state.authored).toBe(false);
    state = advanceSignaturePlayback(state, 2, .02, true);
    expect(state.authored).toBe(false);
    state = advanceSignaturePlayback(state, undefined, .02, true);
    state = advanceSignaturePlayback(state, 0, .02, true);
    expect(state.authored).toBe(true);
    expect(state.seconds).toBe(0);
  });
  it('holds hidden-tab presentation time and caps a long frame without skipping recovery', () => {
    const state = { beat: 3 as const, seconds: .01, authored: true };
    expect(advanceSignaturePlayback(state, 3, 0, true)).toEqual(state);
    expect(advanceSignaturePlayback(state, 3, 5, true).seconds).toBeCloseTo(.06);
    expect(advanceSignaturePlayback(state, 3, -1, true).seconds).toBe(.01);
    expect(advanceSignaturePlayback(state, undefined, .02, true)).toEqual({ seconds: 0, authored: false });
  });
});
