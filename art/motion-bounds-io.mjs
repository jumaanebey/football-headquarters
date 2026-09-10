// Shared read/merge/write for game/heroMotionBounds.ts, used by every hero-motion encoder.
// Encoders regenerate one or a few heroes at a time; the bounds file holds all nine. Writing
// only the heroes an encoder processed would silently erase the others' authored regions
// (art/encode-motion.mjs did exactly that before this module existed), so encoders must
// merge into the existing file and never overwrite it wholesale.
import fs from 'node:fs';

export const MOTION_BOUNDS_FILE = 'game/heroMotionBounds.ts';
const HEADER = '// Authored source regions: original generated images preserved.\n';

export function readMotionBounds(file = MOTION_BOUNDS_FILE) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf(' = ');
  if (start < 0) throw new Error(`${file}: no bounds literal`);
  const parsed = JSON.parse(text.slice(start + 3).trim().replace(/;$/, ''));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${file}: bounds literal is not an object`);
  return parsed;
}

/** Existing heroes stay unless the update names them; a hero can never be dropped by omission. */
export function mergeMotionBounds(existing, updates) {
  for (const [key, bounds] of Object.entries(updates)) {
    if (!Array.isArray(bounds) || bounds.some(b => !Array.isArray(b) || b.length !== 4 || b.some(n => !Number.isInteger(n) || n < 0))) throw new Error(`motion bounds for ${key} are not integer [x, y, right, bottom] boxes`);
  }
  return { ...existing, ...updates };
}

export function writeMotionBounds(updates, file = MOTION_BOUNDS_FILE) {
  const merged = mergeMotionBounds(readMotionBounds(file), updates);
  fs.writeFileSync(file, `${HEADER}export const HERO_MOTION_BOUNDS: Record<string, number[][]> = ${JSON.stringify(merged)};\n`);
  return merged;
}
