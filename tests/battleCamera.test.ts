import { describe, expect, it } from 'vitest';
import { heroCameraFrame } from '../game/battleCamera';

describe('hero camera geometry', () => {
  it('restores the full field when the followed hero is absent', () => {
    expect(heroCameraFrame()).toEqual({ scale: 1.06, x: 0, y: 0 });
    expect(heroCameraFrame({ x: NaN, y: 40 })).toEqual(heroCameraFrame());
  });
  it('centers a hero with headroom and keeps edge views bounded', () => {
    const point = { x: 40, y: 50 };
    const frame = heroCameraFrame(point);
    expect(50 + (point.x - 50) * frame.scale + frame.x).toBeCloseTo(50);
    expect(50 + (point.y - 50) * frame.scale + frame.y).toBeCloseTo(59.9);
    for (const x of [0, 100]) for (const y of [0, 100]) {
      const edge = heroCameraFrame({ x, y });
      expect(Math.abs(edge.x)).toBeLessThanOrEqual((edge.scale - 1) * 50);
      expect(Math.abs(edge.y)).toBeLessThanOrEqual((edge.scale - 1) * 50);
    }
    expect(point).toEqual({ x: 40, y: 50 });
  });
});
