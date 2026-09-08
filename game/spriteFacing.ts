/** Isometric screen X is proportional to world X minus world Y. Preserve the
 * last facing for vertical travel so near-zero deltas cannot flicker the rig. */
export function spriteFacing(x: number, y: number, targetX: number, targetY: number, previous = 1): number {
  const horizontal = (targetX - x) - (targetY - y);
  return Math.abs(horizontal) > 0.3 ? Math.sign(horizontal) : previous;
}
