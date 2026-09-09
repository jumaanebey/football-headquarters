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
