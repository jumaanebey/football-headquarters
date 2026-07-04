
import { BuildingType, Drill, DrillState, BuildingInstance, Player, PlayerRole, PlayerRarity, PlayerState, UnitGroup, SeasonPhase, Opponent, ResourceType } from './types';

export const DRILLS: Record<string, Drill> = {
  // OFFENSE LINE DRILLS
  'sled_push': {
    id: 'sled_push',
    name: 'Blocking Sleds',
    targetUnit: UnitGroup.OFFENSE_LINE,
    durationSeconds: 10,
    costEnergy: 15,
    rewardCoins: 100,
    rewardXp: 10,
    readinessGain: 5,
    levelReq: 1,
    icon: 'Shield',
  },
  // OFFENSE SKILL DRILLS
  'routes': {
    id: 'routes',
    name: 'Route Tree',
    targetUnit: UnitGroup.OFFENSE_SKILL,
    durationSeconds: 15,
    costEnergy: 20,
    rewardCoins: 150,
    rewardXp: 15,
    readinessGain: 5,
    levelReq: 1,
    icon: 'Wind',
  },
  // DEFENSE LINE DRILLS
  'tackle_dummy': {
    id: 'tackle_dummy',
    name: 'Tackle Dummies',
    targetUnit: UnitGroup.DEFENSE_LINE,
    durationSeconds: 12,
    costEnergy: 15,
    rewardCoins: 120,
    rewardXp: 12,
    readinessGain: 5,
    levelReq: 1,
    icon: 'Target',
  },
  // SECONDARY DRILLS
  'coverage': {
    id: 'coverage',
    name: 'Zone Coverage',
    targetUnit: UnitGroup.DEFENSE_SECONDARY,
    durationSeconds: 15,
    costEnergy: 20,
    rewardCoins: 150,
    rewardXp: 15,
    readinessGain: 5,
    levelReq: 1,
    icon: 'Eye',
  },
  // FULL TEAM
  'scrimmage': {
    id: 'scrimmage',
    name: 'Full Scrimmage',
    targetUnit: 'ALL',
    durationSeconds: 60,
    costEnergy: 80,
    rewardCoins: 1000,
    rewardXp: 100,
    readinessGain: 20,
    levelReq: 5,
    icon: 'Users',
  }
};

export const INITIAL_BUILDINGS: BuildingInstance[] = [
  {
    id: 'pitch-1',
    type: BuildingType.TRAINING_PITCH,
    level: 1,
    gridX: 2,
    gridY: 2,
    activeDrillId: null,
    targetUnit: null,
    startTime: null,
    finishTime: null,
    state: DrillState.IDLE
  },
  {
    id: 'academy-1',
    type: BuildingType.YOUTH_ACADEMY,
    level: 1,
    gridX: 7,
    gridY: 2,
    activeDrillId: null,
    targetUnit: null,
    startTime: null,
    finishTime: null,
    state: DrillState.IDLE
  },
  {
    id: 'med-1',
    type: BuildingType.MEDICAL_CENTER,
    level: 1,
    gridX: 3,
    gridY: 6,
    activeDrillId: null,
    targetUnit: null,
    startTime: null,
    finishTime: null,
    state: DrillState.IDLE
  },
  {
    id: 'stadium-1',
    type: BuildingType.STADIUM,
    level: 1,
    gridX: 6,
    gridY: 6,
    activeDrillId: null,
    targetUnit: null,
    startTime: null,
    finishTime: null,
    state: DrillState.IDLE,
    accrued: 0
  },
  {
    id: 'tactics-1',
    type: BuildingType.TACTICS_ROOM,
    level: 1,
    gridX: 3,
    gridY: 3,
    activeDrillId: null,
    targetUnit: null,
    startTime: null,
    finishTime: null,
    state: DrillState.IDLE
  }
];

export const BUILDING_INFO = {
  [BuildingType.TRAINING_PITCH]: { name: 'Training Field', color: '#10b981', description: 'Increases XP gained from drills.' },
  [BuildingType.YOUTH_ACADEMY]: { name: 'Scouting Dept', color: '#3b82f6', description: 'Raises your roster cap so you can sign more players.' },
  [BuildingType.TACTICS_ROOM]: { name: 'War Room', color: '#9333ea', description: 'Sharper game plan — boosts team readiness gained from drills.' },
  [BuildingType.MEDICAL_CENTER]: { name: 'Rehab Center', color: '#ef4444', description: 'Increases Energy Regen rate.' },
  [BuildingType.STADIUM]: { name: 'Stadium', color: '#e2e8f0', description: 'Earns ticket revenue (Coins) over time. Upgrade to raise income and storage.' },
};

// Spend Fans to top up Energy ("Rally the Fans"). A partial refill (not a free full
// tank) so Energy stays a real pacing constraint and Fans have a recurring sink.
export const RALLY_CONFIG = {
  fanCost: 60,    // Fans spent per rally
  energyGain: 55, // partial top-up toward the 100 cap
};

// --- PASSIVE COLLECTORS ------------------------------------------------------
// Buildings that bank a resource over time until the player taps to collect.
export const COLLECTOR_CONFIG: Partial<Record<BuildingType, {
  resource: ResourceType;
  ratePerSecPerLevel: number; // resource generated per second, per building level
  capPerLevel: number;        // storage cap, per building level
  maxOfflineSeconds: number;  // how much offline time counts toward accrual
}>> = {
  [BuildingType.STADIUM]: {
    resource: ResourceType.COINS,
    ratePerSecPerLevel: 1.5,    // L1 = 1.5 coins/sec (90/min) — passive is a trickle, not a faucet
    capPerLevel: 300,           // L1 storage cap = 300 (fills in ~3.3min, then you must collect)
    maxOfflineSeconds: 3 * 3600 // bank up to 3h while away
  },
};

export const collectorRate = (type: BuildingType, level: number): number => {
  const cfg = COLLECTOR_CONFIG[type];
  return cfg ? cfg.ratePerSecPerLevel * level : 0;
};

export const collectorCap = (type: BuildingType, level: number): number => {
  const cfg = COLLECTOR_CONFIG[type];
  return cfg ? cfg.capPerLevel * level : 0;
};

// --- DECOR -------------------------------------------------------------------
// Non-interactive scenery placed on empty grid tiles (avoiding building tiles
// 2,2 / 6,1 / 1,6 / 6,6).
export const DECOR: { slug: string; gridX: number; gridY: number; scale: number }[] = [
  { slug: 'statue-legends', gridX: 4, gridY: 3, scale: 0.8 },
  { slug: 'merch-stand',    gridX: 8, gridY: 3, scale: 0.75 },
  { slug: 'club-fountain',  gridX: 2, gridY: 8, scale: 0.75 },
  { slug: 'tailgate-tent',  gridX: 8, gridY: 7, scale: 0.8 },
  { slug: 'team-bus',       gridX: 4, gridY: 9, scale: 0.9 },
  { slug: 'parking-lot',    gridX: 0, gridY: 4, scale: 0.85 },
];

// Steeper curve so upgrades are a real coin sink: you can't afford every building's
// next level at once — you choose. L1→2=1400, 2→3≈2380, 3→4≈4046, 4→5≈6879, 5→6≈11695.
export const UPGRADE_CONFIG = {
  baseCost: 1400,
  costMultiplier: 1.7,
};

// --- BUILDERS / TIMED UPGRADES ---
export const INITIAL_BUILDERS = 2;
// Seconds an upgrade to `toLevel` takes — grows so higher levels are a real wait.
export const upgradeDurationSecs = (toLevel: number) => Math.round(20 * Math.pow(1.4, Math.max(0, toLevel - 2)));
// Gems to instantly finish, scaled by remaining time.
export const skipGemCost = (remainingSecs: number) => Math.max(1, Math.ceil(remainingSecs / 25));
// Gem cost to hire the next builder (you start with INITIAL_BUILDERS).
export const builderHireCost = (current: number) => (current <= 2 ? 40 : current === 3 ? 100 : 250);
export const MAX_BUILDERS = 5;

// After a damaging offline raid you get a protective shield: no new offline raids can hit
// you until it expires. Going on offense (raiding) drops the shield (Clash rule).
export const SHIELD_HOURS = 4;

export const VOXEL_CONFIG = {
  tileSize: 80,
  gridSize: 10,
};

// --- WALLS ("Blocking Sleds") ---
export const WALL_CAP = 24;
export const WALL_HP = 220;
// Starter ring protecting the Stadium (HQ) at grid (6,6).
export const INITIAL_WALLS: { gridX: number; gridY: number }[] = [
  { gridX: 5, gridY: 5 }, { gridX: 6, gridY: 5 }, { gridX: 7, gridY: 5 },
  { gridX: 5, gridY: 6 }, { gridX: 7, gridY: 6 },
  { gridX: 5, gridY: 7 }, { gridX: 6, gridY: 7 }, { gridX: 7, gridY: 7 },
];

// HELPER: Generate roster
// --- PLAYER TENDENCIES: a trait that leans a player toward offense or defense, so the
//     roster you build/keep changes how hard you hit AND how well your stadium defends. ---
export type TendencyKey = 'blitzer' | 'playmaker' | 'anchor' | 'ironwall' | 'general' | 'wildcard';
export const TENDENCIES: Record<TendencyKey, { label: string; side: 'offense' | 'defense' | 'balanced'; desc: string; color: string; emoji: string }> = {
  blitzer:   { label: 'Blitzer',       side: 'offense',  desc: 'Aggressive rusher — boosts raid power', color: '#ef4444', emoji: '🔥' },
  playmaker: { label: 'Playmaker',     side: 'offense',  desc: 'Makes big plays — boosts raid power',   color: '#f97316', emoji: '✨' },
  anchor:    { label: 'Anchor',        side: 'defense',  desc: 'Holds the line — boosts defense',       color: '#3b82f6', emoji: '⚓' },
  ironwall:  { label: 'Iron Wall',     side: 'defense',  desc: 'Immovable — boosts defense',            color: '#64748b', emoji: '🧱' },
  general:   { label: 'Field General', side: 'balanced', desc: 'High IQ — boosts offense & defense',    color: '#a855f7', emoji: '🎖️' },
  wildcard:  { label: 'Wildcard',      side: 'balanced', desc: 'Unpredictable — small all-round boost', color: '#22c55e', emoji: '🎲' },
};
export const TENDENCY_KEYS = Object.keys(TENDENCIES) as TendencyKey[];
export const randomTendency = (): TendencyKey => TENDENCY_KEYS[Math.floor(Math.random() * TENDENCY_KEYS.length)];
/** Deterministic tendency from a player id, so the same player always has the same tendency. */
export const tendencyFromId = (id: string): TendencyKey => {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TENDENCY_KEYS[h % TENDENCY_KEYS.length];
};

const createPlayer = (id: string, name: string, role: PlayerRole, unit: UnitGroup, rarity: PlayerRarity, x: number, y: number, color: string): Player => ({
  id, name, role, unit, rarity, level: 1,
  stats: { strength: 10, speed: 10, iq: 10 },
  maxStat: 50,
  worldPos: { x, y, z: 0 },
  targetPos: { x, y, z: 0 },
  state: PlayerState.IDLE,
  avatarColor: color,
  tendency: tendencyFromId(id),
});

export const INITIAL_ROSTER: Player[] = [
  // OFFENSE LINE (The Wall) - Grey/Silver
  createPlayer('ol1', 'Big Mike', PlayerRole.OL, UnitGroup.OFFENSE_LINE, PlayerRarity.COMMON, 20, 20, '#94a3b8'),
  createPlayer('ol2', 'Tank', PlayerRole.OL, UnitGroup.OFFENSE_LINE, PlayerRarity.COMMON, 22, 22, '#94a3b8'),
  createPlayer('ol3', 'Fridge', PlayerRole.OL, UnitGroup.OFFENSE_LINE, PlayerRarity.RARE, 24, 20, '#94a3b8'),

  // OFFENSE SKILL (Flashy) - Red
  createPlayer('qb1', 'Ace QB', PlayerRole.QB, UnitGroup.OFFENSE_SKILL, PlayerRarity.EPIC, 30, 30, '#ef4444'),
  createPlayer('wr1', 'Speedy', PlayerRole.WR, UnitGroup.OFFENSE_SKILL, PlayerRarity.RARE, 35, 25, '#ef4444'),
  createPlayer('rb1', 'Power Back', PlayerRole.RB, UnitGroup.OFFENSE_SKILL, PlayerRarity.COMMON, 32, 35, '#ef4444'),

  // DEFENSE LINE (Aggressive) - Blue
  createPlayer('dl1', 'Crusher', PlayerRole.DL, UnitGroup.DEFENSE_LINE, PlayerRarity.RARE, 60, 60, '#3b82f6'),
  createPlayer('lb1', 'Hawk', PlayerRole.LB, UnitGroup.DEFENSE_LINE, PlayerRarity.COMMON, 65, 62, '#3b82f6'),

  // DEFENSE SECONDARY (Fast) - Dark Blue
  createPlayer('cb1', 'Island', PlayerRole.CB, UnitGroup.DEFENSE_SECONDARY, PlayerRarity.EPIC, 70, 30, '#1e40af'),
  createPlayer('s1', 'Viper', PlayerRole.S, UnitGroup.DEFENSE_SECONDARY, PlayerRarity.RARE, 75, 35, '#1e40af'),
];

export const RARITY_CONFIG = {
  [PlayerRarity.COMMON]: { color: 'from-slate-500 to-slate-700', border: 'border-slate-400', maxStat: 30, next: PlayerRarity.RARE },
  [PlayerRarity.RARE]: { color: 'from-blue-500 to-blue-700', border: 'border-blue-400', maxStat: 50, next: PlayerRarity.EPIC },
  [PlayerRarity.EPIC]: { color: 'from-amber-400 to-amber-600', border: 'border-amber-300', maxStat: 80, next: PlayerRarity.LEGENDARY },
  [PlayerRarity.LEGENDARY]: { color: 'from-purple-500 to-fuchsia-700', border: 'border-fuchsia-400', maxStat: 100, next: null },
};

export const OPPONENTS: Opponent[] = [
  { id: 'tm1', name: 'Valley State', offenseRating: 40, defenseRating: 35, primaryColor: '#ea580c' },
  { id: 'tm2', name: 'Tech University', offenseRating: 55, defenseRating: 45, primaryColor: '#eab308' },
  { id: 'tm3', name: 'North Sharks', offenseRating: 60, defenseRating: 65, primaryColor: '#06b6d4' },
  { id: 'tm4', name: 'Iron City', offenseRating: 75, defenseRating: 80, primaryColor: '#1e293b' },
  { id: 'tm5', name: 'Golden Knights', offenseRating: 90, defenseRating: 85, primaryColor: '#ca8a04' },
];

// --- RECRUITING (Scouting Dept) ---------------------------------------------
export const RECRUIT_CONFIG = {
  baseRosterCap: 10,   // roster cap = baseRosterCap + scoutLevel * capPerLevel
  capPerLevel: 2,
  rushGemCost: 5,      // gems to instantly finish a scouting job
  candidateCount: 3,   // candidates shown per scouting board
  // Per-rarity tuning. Higher rarity = pricier, slower to scout, stronger.
  rarity: {
    [PlayerRarity.COMMON]:    { cost: 300,  seconds: 15,  baseStat: 10, jitter: 4,  weight: 55 },
    [PlayerRarity.RARE]:      { cost: 800,  seconds: 30,  baseStat: 16, jitter: 5,  weight: 28 },
    [PlayerRarity.EPIC]:      { cost: 2000, seconds: 60,  baseStat: 24, jitter: 6,  weight: 13 },
    [PlayerRarity.LEGENDARY]: { cost: 5000, seconds: 120, baseStat: 34, jitter: 8,  weight: 4 },
  } as Record<PlayerRarity, { cost: number; seconds: number; baseStat: number; jitter: number; weight: number }>,
};

// Which unit group each position belongs to.
export const ROLE_UNIT: Record<PlayerRole, UnitGroup> = {
  [PlayerRole.QB]: UnitGroup.OFFENSE_SKILL,
  [PlayerRole.RB]: UnitGroup.OFFENSE_SKILL,
  [PlayerRole.WR]: UnitGroup.OFFENSE_SKILL,
  [PlayerRole.OL]: UnitGroup.OFFENSE_LINE,
  [PlayerRole.DL]: UnitGroup.DEFENSE_LINE,
  [PlayerRole.LB]: UnitGroup.DEFENSE_LINE,
  [PlayerRole.CB]: UnitGroup.DEFENSE_SECONDARY,
  [PlayerRole.S]:  UnitGroup.DEFENSE_SECONDARY,
};

// Jersey/marker color by unit group (matches the on-field player markers).
export const UNIT_COLOR: Record<UnitGroup, string> = {
  [UnitGroup.OFFENSE_LINE]: '#94a3b8',
  [UnitGroup.OFFENSE_SKILL]: '#ef4444',
  [UnitGroup.DEFENSE_LINE]: '#3b82f6',
  [UnitGroup.DEFENSE_SECONDARY]: '#1e40af',
};

// Name pools for generated recruits.
export const RECRUIT_FIRST_NAMES = ['Deon', 'Marcus', 'Jamal', 'Tyler', 'Cole', 'Zeke', 'Malik', 'Trey', 'Rocco', 'Xavier', 'Isaiah', 'Brock', 'Cash', 'Diesel', 'Ace', 'Vince', 'Rex', 'Duke', 'Bo', 'Nash'];
export const RECRUIT_LAST_NAMES = ['Steel', 'Storm', 'Rhodes', 'Blaze', 'Cannon', 'Voss', 'Knight', 'Cross', 'Wolfe', 'Stone', 'Frost', 'Hayes', 'Vega', 'Reyes', 'Payne', 'Lane', 'Fox', 'Beck', 'Ward', 'Kane'];

// --- BUILDING EFFECTS (single source of truth; used by the game loop AND the upgrade modal
//     so the displayed stat is always the REAL wired effect, never a placeholder) ---
export const trainingXpMult      = (level: number) => 1 + level * 0.1; // Training Field: +10% drill XP / level
export const warRoomReadinessMult = (level: number) => 1 + level * 0.1; // War Room: +10% drill readiness / level
export const energyIntervalMs    = (medLevel: number) => Math.max(4000, 8000 - (medLevel - 1) * 800); // Rehab Center regen cadence

/** The real, wired effect of a building at a given level — {label, value} for the upgrade modal. */
export const buildingEffect = (type: BuildingType, level: number): { label: string; value: string } => {
  switch (type) {
    case BuildingType.STADIUM:
      return { label: 'Income', value: `${Math.round(collectorRate(type, level) * 60)}/min` };
    case BuildingType.TRAINING_PITCH:
      return { label: 'Drill XP', value: `+${Math.round((trainingXpMult(level) - 1) * 100)}%` };
    case BuildingType.MEDICAL_CENTER:
      return { label: 'Energy Regen', value: `${(60000 / energyIntervalMs(level)).toFixed(1)}/min` };
    case BuildingType.YOUTH_ACADEMY:
      return { label: 'Roster Cap', value: `${RECRUIT_CONFIG.baseRosterCap + level * RECRUIT_CONFIG.capPerLevel}` };
    case BuildingType.TACTICS_ROOM:
      return { label: 'Drill Readiness', value: `+${Math.round((warRoomReadinessMult(level) - 1) * 100)}%` };
    default:
      return { label: 'Level', value: `${level}` };
  }
};
