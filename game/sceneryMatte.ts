/** Scenery has light steel and fine dark fence mesh. Remove only the saturated
 * production backdrop; neutralize reflected magenta without erasing metalwork. */
export function keySceneryPixels(pixels: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const excess = Math.min(r, b) - g;
    if (excess <= 20) continue;
    const alpha = Math.max(0, Math.min(1, (200 - excess) / 60));
    pixels[i + 3] = Math.round(pixels[i + 3] * alpha);
    // Unlike a character matte, preserve partially reflected metal and fences.
    pixels[i] = r - excess;
    pixels[i + 2] = b - excess;
  }
}
