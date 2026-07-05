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

/** Returns the sprite URL for a building, snapping to the highest art level <= the building's level. */
export const buildingSprite = (type: BuildingType, level: number): string => {
  const art = BUILDING_ART[type];
  const match = [...art.levels].filter((l) => l <= level).pop() ?? art.levels[0];
  return `/assets/buildings/${art.slug}-${match}.png`;
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
  return `/assets/units/${UNIT_ART[unit]}-${state}.png`;
};

/** Single-player battle sprite (ONE football player, not the clumpy trio). IDE-generated;
 *  falls back to a clean jersey chip in-battle until the art lands. */
export const unitPlayerSprite = (unit: UnitGroup): string => `/assets/units/${UNIT_ART[unit]}-player.png`;

/** Convenience: pick a unit sprite state from a live PlayerState. */
export const unitSpriteForState = (unit: UnitGroup, playerState: PlayerState): string => {
  const st = playerState === PlayerState.TRAINING ? 'training' : playerState === PlayerState.WALKING ? 'ready' : 'idle';
  return unitSprite(unit, st);
};

export const RESOURCE_ICON = {
  coins: '/assets/icons/coins.png',
  energy: '/assets/icons/energy.png',
  level: '/assets/icons/level.png',
  xp: '/assets/icons/xp.png',
};

// Battle-screen building art. When ATTACKING, buildings wear the crimson RIVAL skins so
// raids read as away games; defending shows your own home art.
const BATTLE_BUILDING_POOL = ['headquarters-1', 'film-room-1', 'weight-room-1', 'practice-field-1'];
const RIVAL_POOL = ['rival-headquarters', 'rival-film-room', 'rival-weight-room', 'rival-practice-field'];
export const battleBuildingSprite = (kind: string, id: string, rival = false): string => {
  if (kind === 'hq') return rival ? '/assets/buildings/rival-stadium.png' : '/assets/buildings/stadium-3.png';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  if (kind === 'defense') {
    // De-weaponized non-weapon football defenses (all generated). Varied so bases feel distinct.
    const defensePool = ['jugs-machine', 'tackling-sled', 'ref-tower', 'tshirt-cannon'];
    return `/assets/battle/${defensePool[h % defensePool.length]}.png`;
  }
  const pool = rival ? RIVAL_POOL : BATTLE_BUILDING_POOL;
  return `/assets/buildings/${pool[h % pool.length]}.png`;
};
