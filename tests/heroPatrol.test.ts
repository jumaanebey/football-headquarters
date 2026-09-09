import { expect, it } from 'vitest';
import { heroPatrol } from '../game/heroPatrol';
import { heroFrame } from '../game/heroAnimation';
it('finishes a run before performing a drill and recovering at the same spot', () => {
  expect(heroPatrol(5.49, 0).mode).toBe('walk');
  expect(heroPatrol(5.6, 0)).toMatchObject({ progress: 1, mode: 'attack', facing: -1 });
  expect(heroPatrol(6.5, 0)).toMatchObject({ progress: 1, mode: 'idle', facing: -1 });
  expect(heroPatrol(7.71, 0)).toMatchObject({ mode: 'walk', facing: 1 });
  expect(heroPatrol(7.71, 0).progress).toBeGreaterThan(0.99);
});
it('reduced motion holds heroes in place across the entire drill', () => {
  for (const time of [0, 3, 6, 9, 13, 20]) {
    expect(heroPatrol(time, 1, true)).toMatchObject({ progress: 0.35, mode: 'idle' });
  }
});
it('gives a deliberate action a recovery instead of holding contact indefinitely', () => {
  expect(heroFrame('attack', 0.05)).toBe(0);
  expect(heroFrame('attack', 0.25)).toBe(7);
  expect(heroFrame('attack', 0.6)).toBe(0);
  for (const cycle of [0, -1, NaN, Infinity]) expect(heroFrame('walk', 0.2, cycle)).toBe(3);
});

it('accelerates and brakes without overshooting either drill endpoint', () => {
  const start = heroPatrol(.1, 0).progress;
  const cruise = heroPatrol(2.1, 0).progress - heroPatrol(2, 0).progress;
  const stop = 1 - heroPatrol(5.4, 0).progress;
  expect(start).toBeLessThan(cruise / 3);
  expect(stop).toBeCloseTo(start);
  for (let t = 0; t < 32; t += .03) {
    expect(heroPatrol(t, 0).progress).toBeGreaterThanOrEqual(0);
    expect(heroPatrol(t, 0).progress).toBeLessThanOrEqual(1);
  }
});

it('ties footfall to travel and performs only one action before turning', () => {
  for (const t of [.2, 1, 3, 5.4]) {
    const pose = heroPatrol(t, 0);
    expect(pose.stridePhase).toBeCloseTo((pose.progress * 5.5 / .58) % 1);
  }
  expect(heroFrame('attack', heroPatrol(5.75, 0).actionElapsed)).toBe(7);
  expect(heroFrame('attack', heroPatrol(6.39, 0).actionElapsed)).toBe(0);
});
