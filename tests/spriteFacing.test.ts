import { expect, it } from 'vitest';
import { spriteFacing } from '../game/spriteFacing';

it('faces projected travel, including Y-only and diagonal movement', () => {
  expect(spriteFacing(10, 10, 20, 10)).toBe(1);
  expect(spriteFacing(10, 10, 10, 20)).toBe(-1);
  expect(spriteFacing(10, 10, 15, 20)).toBe(-1);
  expect(spriteFacing(10, 10, 5, 0)).toBe(1);
});
it('keeps the last facing when stationary or moving vertically on screen', () => {
  expect(spriteFacing(10, 10, 10, 10, -1)).toBe(-1);
  expect(spriteFacing(10, 10, 20, 20, -1)).toBe(-1);
  expect(spriteFacing(10, 10, 10.1, 10, -1)).toBe(-1);
});
