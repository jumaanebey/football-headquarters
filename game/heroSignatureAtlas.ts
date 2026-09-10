import { HERO_ATLAS } from './heroAtlas';

/** Editable registration points, measured in each source cell. Source images are
 * preserved so animation/art review can adjust registration without repainting. */
export const HERO_SIGNATURE_ATLAS: Record<string, { src: string; anchorX: readonly number[] }> = {
  qb: { src: '/assets/heroes/signatures/qb.webp', anchorX: [.53, .50, .54, .49] },
};

/** Accept keyed pixels; locate actual content while preserving one body scale
 * across all four poses. Crouching must not make the Enforcer grow taller. */
export function signatureRegistration(key: string, pixels: Uint8ClampedArray, width: number, height: number) {
  const spec = HERO_SIGNATURE_ATLAS[key], original = HERO_ATLAS[key];
  if (!spec || !original || width % 2 || height % 2 || pixels.length !== width * height * 4) throw new Error('Invalid signature atlas');
  const cellW = width / 2, cellH = height / 2;
  const regions = Array.from({ length: 4 }, (_, frame) => {
    const cellX = frame % 2 * cellW, cellY = Math.floor(frame / 2) * cellH;
    let x = width, y = height, right = -1, bottom = -1;
    for (let yy = cellY; yy < cellY + cellH; yy++) for (let xx = cellX; xx < cellX + cellW; xx++) {
      if (pixels[(yy * width + xx) * 4 + 3] <= 48) continue;
      x = Math.min(x, xx); y = Math.min(y, yy); right = Math.max(right, xx + 1); bottom = Math.max(bottom, yy + 1);
    }
    if (right <= x || bottom <= y) throw new Error(`Empty signature frame ${frame}`);
    return { x, y, w: right - x, h: bottom - y, anchor: cellX + spec.anchorX[frame] * cellW };
  });
  const originalScale = Math.min(340 / Math.max(...original.map(b => b[2] - b[0])), 346 / Math.max(...original.map(b => b[3] - b[1])));
  const standingHeight = (original[0][3] - original[0][1]) * originalScale;
  const scale = Math.min(standingHeight / regions[0].h, 340 / Math.max(...regions.map(b => b.w)), 346 / Math.max(...regions.map(b => b.h)));
  return regions.map(region => ({ ...region, scale,
    dx: Math.max(12, Math.min(372 - region.w * scale, 192 - (region.anchor - region.x) * scale)),
    dy: 370 - region.h * scale,
  }));
}
