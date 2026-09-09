import { describe, expect, it } from 'vitest';
import { keySceneryPixels } from '../game/sceneryMatte';

describe('scenery transparency', () => {
  it('removes magenta while retaining light metal, dark mesh, and team colors', () => {
    const pixels = new Uint8ClampedArray([
      251, 3, 251, 255, // generated backdrop
      205, 115, 205, 255, // steel reflecting the production backdrop
      82, 31, 82, 255, // dark fence mesh
      245, 135, 25, 255, // orange uniform/trim
      30, 75, 45, 255, // green chalkboard/foliage
      230, 230, 230, 255, // white chalk/equipment
    ]);
    keySceneryPixels(pixels);
    expect(pixels[3]).toBe(0);
    expect([...pixels.slice(4, 12)]).toEqual([115, 115, 115, 255, 31, 31, 31, 255]);
    expect([...pixels.slice(12)]).toEqual([245,135,25,255,30,75,45,255,230,230,230,255]);
  });
});
