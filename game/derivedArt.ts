// Derived alpha-baked variants of the approved cutout atlases. The originals keep the magenta
// production backdrop and are keyed at runtime (keySceneryPixels / keyHeroPixels); the derived
// files are produced by scripts/derive-campus-cutouts.ts by running that same keying in Node
// BEFORE lossy encoding, so no key fringe is baked in, then stored with real alpha. Source URLs
// in data, layouts and films never change: renderers ask `derivedAlphaSource(src)` and fall back
// to the original + runtime keying if the derived file is missing or fails to decode.
export interface DerivedAtlas { original: string; derived: string; keying: 'scenery' | 'hero'; quality: number }
export const DERIVED_ATLASES: readonly DerivedAtlas[] = [
  { original: '/assets/buildings/starter-campus-cutouts.webp', derived: '/assets/buildings/starter-campus-cutouts.alpha.webp', keying: 'hero', quality: 90 },
  { original: '/assets/buildings/stadium-1-cutout.webp', derived: '/assets/buildings/stadium-1-cutout.alpha.webp', keying: 'scenery', quality: 90 },
  { original: '/assets/buildings/upgraded-campus-cutouts.webp', derived: '/assets/buildings/upgraded-campus-cutouts.alpha.webp', keying: 'scenery', quality: 90 },
  { original: '/assets/decor/tailgate-tent-cutout.webp', derived: '/assets/decor/tailgate-tent-cutout.alpha.webp', keying: 'scenery', quality: 90 },
  { original: '/assets/decor/grounds-cutouts.webp', derived: '/assets/decor/grounds-cutouts.alpha.webp', keying: 'scenery', quality: 90 },
  { original: '/assets/battle/field-equipment-cutouts.webp', derived: '/assets/battle/field-equipment-cutouts.alpha.webp', keying: 'scenery', quality: 90 },
];
const byOriginal = new Map(DERIVED_ATLASES.map(a => [a.original, a]));
/** The derived file for an approved atlas, or null when none exists. */
export const derivedAlphaSource = (original: string): DerivedAtlas | null => byOriginal.get(original) ?? null;
