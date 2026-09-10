/** Presentation only: projected coordinates are percentages of the field. */
export function heroCameraFrame(point?: { x: number; y: number }) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return { scale: 1.06, x: 0, y: 0 };
  const scale = 1.65;
  const limit = (scale - 1) * 50;
  const bound = (value: number) => Math.max(-limit, Math.min(limit, value));
  return { scale, x: bound((50 - point.x) * scale), y: bound((56 - point.y) * scale) };
}
