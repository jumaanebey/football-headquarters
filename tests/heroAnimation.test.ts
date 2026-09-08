import { expect, it } from 'vitest';
import { heroFrame, keyHeroPixels, advanceHeroStride } from '../game/heroAnimation';
it('cycles four distinct walk poses and holds idle for reduced motion', () => {
  expect([0, .12, .24, .36].map(t => heroFrame('walk', t, .48))).toEqual([1, 2, 3, 4]);
  expect(heroFrame('attack', .3)).toBe(5);
  expect(heroFrame('walk', .3, .48, true)).toBe(0);
});
it('removes magenta while preserving team colors and medical whites', () => {
  const pixels = new Uint8ClampedArray([255,0,255,255, 249,115,22,255, 17,24,39,255, 255,255,255,255]);
  keyHeroPixels(pixels);
  expect(pixels[3]).toBe(0);
  expect([...pixels.slice(4)]).toEqual([249,115,22,255, 17,24,39,255, 255,255,255,255]);
});

it('changes run cadence without jumping backward through the stride', () => {
  const phase = advanceHeroStride(.4, .02, .6);
  const faster = advanceHeroStride(phase, .02, .3);
  expect(phase).toBeCloseTo(.4333333333);
  expect(faster).toBeCloseTo(.5);
  expect(advanceHeroStride(.95, .03, .3)).toBeCloseTo(.05);
  expect(advanceHeroStride(.4, 0, .3)).toBe(.4);
});
