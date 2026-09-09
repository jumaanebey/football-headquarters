import { expect, it } from 'vitest';
import { signatureRegistration } from '../game/heroSignatureAtlas';

it('registers different stances at one scale and a common ground line', () => {
  const width = 100, height = 100, pixels = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, w, h] of [[12, 4, 25, 44], [62, 8, 29, 40], [5, 66, 39, 31], [63, 58, 25, 39]]) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) pixels[(yy * width + xx) * 4 + 3] = 255;
  }
  const frames = signatureRegistration('qb', pixels, width, height);
  expect(new Set(frames.map(frame => frame.scale)).size).toBe(1);
  for (const frame of frames) {
    expect(frame.dy + frame.h * frame.scale).toBeCloseTo(370);
    expect(frame.dx).toBeGreaterThanOrEqual(12);
    expect(frame.dx + frame.w * frame.scale).toBeLessThanOrEqual(372);
  }
});

it('rejects malformed or empty source sheets instead of hiding the approved sprite', () => {
  expect(() => signatureRegistration('qb', new Uint8ClampedArray(0), 10, 10)).toThrow('Invalid signature atlas');
  expect(() => signatureRegistration('qb', new Uint8ClampedArray(400), 10, 10)).toThrow('Empty signature frame');
  expect(() => signatureRegistration('enforcer', new Uint8ClampedArray(400), 10, 10)).toThrow('Invalid signature atlas');
});
