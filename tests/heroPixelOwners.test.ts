import { expect, it } from 'vitest';
import { heroPixelOwners } from '../game/heroPixelOwners';

it('keeps a neighboring boot out of a celebration crop while retaining a detached ball', () => {
  const width = 12, height = 12, pixels = new Uint8ClampedArray(width * height * 4);
  const paint = (x: number, y: number) => { pixels[(y * width + x) * 4 + 3] = 255; };
  // Upper pose extends into the lower pose's rectangular crop.
  for (let y = 0; y < 7; y++) for (let x = 6; x < 10; x++) paint(x, y);
  for (let y = 6; y < 12; y++) for (let x = 1; x < 4; x++) paint(x, y);
  paint(0, 5); // detached football belonging to the lower pose
  const owners = heroPixelOwners(pixels, width, height, [[6, 0, 10, 7], [0, 5, 10, 12]]);
  expect(owners[6 * width + 8]).toBe(0);
  expect(owners[9 * width + 2]).toBe(1);
  expect(owners[5 * width]).toBe(1);
  expect(owners[11 * width + 11]).toBe(-1);
});
