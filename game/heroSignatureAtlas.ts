import { HERO_ATLAS } from './heroAtlas';

/** Editable registration points, measured in each source cell. Source images are
 * preserved so animation/art review can adjust registration without repainting. */
export const HERO_SIGNATURE_ATLAS: Record<string, { src: string; anchorX: readonly number[]; splitY?: number; splitX?: number; stature?: number }> = {
  coach: { src: '/assets/heroes/signatures/coach.webp', anchorX: [.5,.5,.5,.5] },
  kicker: { src: '/assets/heroes/signatures/kicker.webp', anchorX: [.5,.5,.5,.5], splitX: .53 },
  burner: { src: '/assets/heroes/signatures/burner.webp', anchorX: [.5,.5,.5,.5], stature: .7 },
  medic: { src: '/assets/heroes/signatures/medic.webp', anchorX: [.5,.5,.5,.5] },
  captain: { src: '/assets/heroes/signatures/captain.webp', anchorX: [.5,.5,.5,.5] },
  playmaker: { src: '/assets/heroes/signatures/playmaker.webp', anchorX: [.5,.5,.5,.5], splitY: .46 },
  legend: { src: '/assets/heroes/signatures/legend.webp', anchorX: [.5,.5,.5,.5] },
  enforcer: { src: '/assets/heroes/signatures/enforcer.webp', anchorX: [.49, .49, .49, .49] },
  qb: { src: '/assets/heroes/signatures/qb.webp', anchorX: [.53, .50, .54, .49] },
};

/** Accept keyed pixels; locate actual content while preserving one body scale
 * across all four poses. Crouching must not make the Enforcer grow taller. */
export function signatureRegistration(key: string, pixels: Uint8ClampedArray, width: number, height: number, override?: typeof HERO_SIGNATURE_ATLAS[string]) {
  const spec = override ?? HERO_SIGNATURE_ATLAS[key], original = HERO_ATLAS[key];
  if (!spec || !original || width % 2 || height % 2 || pixels.length !== width * height * 4) throw new Error('Invalid signature atlas');
  const cellW = width / 2, split = Math.round(height * (spec.splitY ?? .5));
  const regions = Array.from({ length: 4 }, (_, frame) => {
    const cellX = frame % 2 ? Math.round(width * (spec.splitX ?? .5)) : 0, cellRight = frame % 2 ? width : Math.round(width * (spec.splitX ?? .5)), cellY = frame < 2 ? 0 : split, cellBottom = frame < 2 ? split : height;
    let x = width, y = height, right = -1, bottom = -1;
    for (let yy = cellY; yy < cellBottom; yy++) for (let xx = cellX; xx < cellRight; xx++) {
      if (pixels[(yy * width + xx) * 4 + 3] <= 48) continue;
      x = Math.min(x, xx); y = Math.min(y, yy); right = Math.max(right, xx + 1); bottom = Math.max(bottom, yy + 1);
    }
    if (right <= x || bottom <= y) throw new Error(`Empty signature frame ${frame}`);
    return { x, y, w: right - x, h: bottom - y, anchor: frame % 2 * cellW + spec.anchorX[frame] * cellW };
  });
  const originalScale = Math.min(340 / Math.max(...original.map(b => b[2] - b[0])), 346 / Math.max(...original.map(b => b[3] - b[1])));
  const standingHeight = (original[0][3] - original[0][1]) * originalScale;
  const scale = Math.min(standingHeight * (spec.stature ?? 1) / regions[0].h, 340 / Math.max(...regions.map(b => b.w)), 346 / Math.max(...regions.map(b => b.h)));
  return regions.map(region => ({ ...region, scale,
    dx: Math.max(12, Math.min(372 - region.w * scale, 192 - (region.anchor - region.x) * scale)),
    dy: 370 - region.h * scale,
  }));
}
