import { BuildingType, UnitGroup, PlayerState } from './types';

// Maps each in-game building type to its real sprite art (transparent isometric PNGs
// sourced from the Kickoff Club asset set) and the level variants that actually exist.
const BUILDING_ART: Record<BuildingType, { slug: string; levels: number[] }> = {
  [BuildingType.STADIUM]:        { slug: 'stadium',        levels: [1, 2, 3, 4, 5] },
  [BuildingType.TRAINING_PITCH]: { slug: 'practice-field', levels: [1, 2, 3, 4, 5] },
  [BuildingType.YOUTH_ACADEMY]:  { slug: 'headquarters',   levels: [1, 2, 3, 4, 5] },
  [BuildingType.TACTICS_ROOM]:   { slug: 'film-room',      levels: [1, 3, 5] },
  [BuildingType.MEDICAL_CENTER]: { slug: 'weight-room',    levels: [1, 3, 5] },
};

/** The art level-gates that exist for a building type — powers the progression-photo "road" UI. */
export const BUILDING_ART_LEVELS = (type: BuildingType): number[] => BUILDING_ART[type].levels;

// Each facility's approved STORY ARC — era names for the progression photos, in the
// same order as BUILDING_ART levels. (Scouting = the Draft Board story, etc.)
export const BUILDING_ERAS: Record<BuildingType, string[]> = {
  [BuildingType.STADIUM]:        ['Roped Field', 'Bleachers', 'The Horseshoe', 'The Bowl', 'The Cathedral'],
  [BuildingType.TRAINING_PITCH]: ['Sandlot', 'First Sled', 'Real Turf', 'Team Facility', 'The Pro Cage'],
  [BuildingType.YOUTH_ACADEMY]:  ['The Easel', 'The Shed', 'The Office', 'The Ops Hub', 'Draft Command'],
  [BuildingType.TACTICS_ROOM]:   ['Chalk Talk', 'The Film Room', 'The Theater'],
  [BuildingType.MEDICAL_CENTER]: ['The Ice Tank', 'The Deck', 'The Spa'],
};

/** Returns the sprite URL for a building, snapping to the highest art level <= the building's level. */
export const buildingSprite = (type: BuildingType, level: number): string => {
  const art = BUILDING_ART[type];
  const match = [...art.levels].filter((l) => l <= level).pop() ?? art.levels[0];
  return `/assets/buildings/${art.slug}-${match}.webp`;
};

// Maps each unit group to its player-trio sprite slug.
const UNIT_ART: Record<UnitGroup, string> = {
  [UnitGroup.OFFENSE_LINE]: 'offensive-line',
  [UnitGroup.OFFENSE_SKILL]: 'skill-positions',
  [UnitGroup.DEFENSE_LINE]: 'defensive-line',
  [UnitGroup.DEFENSE_SECONDARY]: 'secondary',
};

/** Returns the unit-group sprite for a given animation state (idle | ready | training). */
export const unitSprite = (unit: UnitGroup, state: 'idle' | 'ready' | 'training' = 'idle'): string => {
  return `/assets/units/${UNIT_ART[unit]}-${state}.webp`;
};

/** Single-player battle sprite (ONE football player, not the clumpy trio). IDE-generated;
 *  falls back to a clean jersey chip in-battle until the art lands. */
export const unitPlayerSprite = (unit: UnitGroup): string => `/assets/units/${UNIT_ART[unit]}-player.webp`;

/** Convenience: pick a unit sprite state from a live PlayerState. */
export const unitSpriteForState = (unit: UnitGroup, playerState: PlayerState): string => {
  const st = playerState === PlayerState.TRAINING ? 'training' : playerState === PlayerState.WALKING ? 'ready' : 'idle';
  return unitSprite(unit, st);
};

export const RESOURCE_ICON = {
  coins: '/assets/icons/coins.webp',
  energy: '/assets/icons/energy.webp',
};

// Battle-screen building art. When ATTACKING, buildings wear the crimson RIVAL skins so
// raids read as away games; defending shows your own home art.
const BATTLE_BUILDING_POOL = ['headquarters-1', 'film-room-1', 'weight-room-1', 'practice-field-1'];
const RIVAL_POOL = ['rival-headquarters', 'rival-film-room', 'rival-weight-room', 'rival-practice-field'];
const DEFENSE_FLAVOR_SPRITE: Record<string, string> = {
  jugs: 'jugs-machine', sled: 'tackling-sled', ref: 'ref-tower', tshirt: 'tshirt-cannon', cooler: 'gatorade-station',
};

// Walls (Blocking Sleds) wear era art by STADIUM level: backyard sawhorse pads →
// hazard-striped pro sled → championship barrier. One tier per base (walls are uniform).
export const wallSprite = (stadiumLevel: number): string =>
  stadiumLevel >= 9 ? '/assets/battle/blocking-sled-3.webp'
  : stadiumLevel >= 5 ? '/assets/battle/blocking-sled.webp'
  : '/assets/battle/blocking-sled-1.webp';

// Defense emplacements LEVEL UP visibly: tier 1 (L1-3) → tier 2 pro rig (L4-7) →
// tier 3 flagship (L8+). Art tiers exist for all four kinds in /assets/battle/.
export const DEFENSE_ART_GATES = [1, 4, 8] as const;
export const defenseSprite = (kind: string, level = 1): string => {
  const slug = DEFENSE_FLAVOR_SPRITE[kind] ?? 'jugs-machine';
  const tier = level >= 8 ? 3 : level >= 4 ? 2 : 1;
  return `/assets/battle/${slug}${tier > 1 ? `-${tier}` : ''}.webp`;
};
export const battleBuildingSprite = (kind: string, id: string, rival = false, flavor?: string): string => {
  if (kind === 'hq') return rival ? '/assets/buildings/rival-stadium.webp' : '/assets/buildings/stadium-3.webp';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  if (kind === 'defense') {
    // A flavored turret LOOKS like what it does (Ref Tower throws the flags you see);
    // unflavored turrets stay hash-varied so bases feel distinct.
    const slug = (flavor && DEFENSE_FLAVOR_SPRITE[flavor])
      ?? ['jugs-machine', 'tackling-sled', 'ref-tower', 'tshirt-cannon'][h % 4];
    return `/assets/battle/${slug}.webp`;
  }
  const pool = rival ? RIVAL_POOL : BATTLE_BUILDING_POOL;
  return `/assets/buildings/${pool[h % pool.length]}.webp`;
};
