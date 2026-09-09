export type HeroAnimation = 'idle' | 'walk' | 'attack' | 'showcase';
export const MODERN_HEROES = ['qb', 'enforcer', 'medic'] as const;
export const hasModernHero = (key: string) => MODERN_HEROES.some(k => k === key);
export function heroFrame(mode: HeroAnimation, elapsed: number, cycle = 0.48, reduced = false): number {
  if (reduced || mode === 'idle') return 0;
  if (mode === 'walk') {
    const duration = Number.isFinite(cycle) && cycle > 0 ? cycle : 0.48;
    const phase = elapsed < 0 ? ((elapsed % duration) + duration) % duration : elapsed % duration;
    return [1, 2, 3, 4][Math.min(3, Math.floor(phase / duration * 4))];
  }
  if (mode === 'attack') {
    const beat = elapsed % 0.7;
    return beat >= 0.14 && beat < 0.46 ? 5 : 0;
  }
  const beat = elapsed % 7;
  return beat < 2 ? 0 : beat < 4.5 ? heroFrame('walk', beat - 2, 0.6) : beat < 5.5 ? 5 : 0;
}
/** Chroma-key matte for generated production sheets. Preserve orange uniforms,
 * white equipment and dark outlines; remove only saturated magenta backdrop. */
export function keyHeroPixels(pixels: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const excess = Math.min(r, b) - g;
    if (r > 110 && b > 100 && excess > 45) {
      const alpha = Math.max(0, Math.min(1, (100 - excess) / 55));
      pixels[i + 3] = Math.round(pixels[i + 3] * alpha);
      if (alpha > 0) { // suppress key spill on antialiased outlines
        pixels[i] = Math.min(r, g + 35);
        pixels[i + 2] = Math.min(b, g + 35);
      }
    }
  }
}

/** Keep footfall phase continuous when Blitz or a slow changes running speed. */
export function advanceHeroStride(phase: number, delta: number, cycle = 0.48): number {
  const duration = Number.isFinite(cycle) && cycle > 0 ? cycle : 0.48;
  return (phase + Math.max(0, Math.min(delta, 0.05)) / duration) % 1;
}
