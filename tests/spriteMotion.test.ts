import { expect, it } from 'vitest';
import { spriteMotion } from '../game/spriteMotion';
it('holds an idle pose and last facing without displacement', () => {
  expect(spriteMotion({ x: 4, y: 9 }, { x: 4, y: 9 }, 0.05, -1)).toMatchObject({ moving: false, face: -1 });
});
it('recognizes small Y-axis steps and faces their screen direction', () => {
  expect(spriteMotion({ x: 0, y: 0 }, { x: 0, y: 0.1 }, 0.05)).toMatchObject({ moving: true, face: -1 });
});
it('matches stride tempo to speed and bounds unusually fast/slow movement', () => {
  const sample = (speed: number) => spriteMotion({ x: 0, y: 0 }, { x: speed * 0.05, y: 0 }, 0.05).strideSeconds;
  expect(sample(15)).toBeCloseTo(0.42);
  expect(sample(8)).toBeGreaterThan(sample(15));
  expect(sample(1000)).toBe(0.28);
  expect(sample(0.1)).toBe(0.9);
});
it('treats a zero-duration update as stationary', () => {
  expect(spriteMotion({ x: 0, y: 0 }, { x: 2, y: 1 }, 0).moving).toBe(false);
});

it('preserves footfall across stops and produces the same phase at different tick rates', () => {
  const whole = spriteMotion({x:0,y:0},{x:2,y:0},.1,1,.2);
  const first = spriteMotion({x:0,y:0},{x:1,y:0},.05,1,.2);
  const paused = spriteMotion({x:1,y:0},{x:1,y:0},.05,1,first.stridePhase);
  const second = spriteMotion({x:1,y:0},{x:2,y:0},.05,1,paused.stridePhase);
  expect(paused.stridePhase).toBe(first.stridePhase);
  expect(second.stridePhase).toBeCloseTo(whole.stridePhase);
  expect(spriteMotion({x:0,y:0},{x:6.3,y:0},.42,1,.2).stridePhase).toBeCloseTo(.2);
});
