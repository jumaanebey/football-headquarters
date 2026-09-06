// Game-wide constants and unit/building definitions.
// Internal identifiers stay terse (towncenter, villager, ...); every player-facing string follows
// DESIGN-BIBLE.md: football vocabulary, no weapons, nobody gets hurt.
export const MAP_SIZE = 320;          // world units, square map centred on origin
export const CELL = 2;                // nav-grid cell size in world units
export const GRID = MAP_SIZE / CELL;  // nav-grid cells per side (160)
export const FOG_CELL = 4;            // scouting (fog) cell size
export const FOG_GRID = MAP_SIZE / FOG_CELL; // 80
export const WATER_LEVEL = -1.4;
export const PLAYER = 0;
export const ENEMY = 1;
export const MAX_POP = 75;
export const TICK = 1 / 20;

// Home team: black #111827 with orange #f97316. Rival: crimson #b91c1c with charcoal.
export const OWNER_COLORS = [0xf97316, 0xb91c1c];
export const OWNER_BASE = [0x111827, 0x1f2937];
export const OWNER_NAMES = ['Home', 'Rival'];

export const BASE_POS = [
  { x: -105, z: 105 },   // home program: south-west (screen bottom-left)
  { x: 105, z: -105 },   // rival program: north-east
];

export const RES_TYPES = ['food', 'wood', 'gold', 'stone'];
export const RES_NAMES = { food: 'Fans', wood: 'Gear', gold: 'Coins', stone: 'Turf' };
export const RES_ICONS = { food: '📣', wood: '🏈', gold: '🪙', stone: '🟩' };

export const UNITS = {
  villager: {
    name: 'Staffer', hp: 25, speed: 5.5, attack: 3, armor: 0, range: 1.3, cooldown: 1.5, los: 9,
    cost: { food: 50 }, trainTime: 20, carry: 10, gatherRate: 1.0,
    desc: 'Equipment staff. Collects Fans, Gear, Coins and Turf, and builds facilities. Right-click a tailgate, gear pallet, booster tent or turf pile.',
    hotkey: 'T',
  },
  militia: {
    name: 'Lineman', hp: 55, speed: 5.4, attack: 5, armor: 1, range: 1.4, cooldown: 1.2, los: 9,
    cost: { food: 60, gold: 20 }, trainTime: 16, desc: 'The wall. Blocks and tackles up close, soaks pressure, opens lanes for everyone else.', hotkey: 'L',
  },
  archer: {
    name: 'Skill Player', hp: 30, speed: 5.8, attack: 5, armor: 0, range: 9, cooldown: 1.6, los: 12, ranged: true, projectile: 'football',
    cost: { wood: 30, gold: 45 }, trainTime: 20, desc: 'The playmaker. Throws footballs from range for big yards, folds fast if pressured.', hotkey: 'K',
  },
  knight: {
    name: 'Front 7', hp: 95, speed: 7.5, attack: 11, armor: 2, range: 1.6, cooldown: 1.4, los: 10,
    cost: { food: 60, gold: 75 }, trainTime: 26, desc: 'The enforcer. Wades in and trucks facilities up close. High yards, tough to move.', hotkey: 'F',
  },
};

// size = footprint in nav cells (square). walkable = does not block pathing.
export const BUILDINGS = {
  towncenter: {
    name: 'Stadium', hp: 1800, size: 3, cost: { wood: 300, stone: 100 }, buildTime: 120, los: 19,
    pop: 10, dropoff: ['food', 'wood', 'gold', 'stone'], trains: ['villager'], attack: 5, range: 10, cooldown: 2.2, projectile: 'tshirt',
    desc: 'Your house. Signs staffers and stores everything you collect. The home crowd fires t-shirts at rivals who get close. If it gets sacked, the season is over.', hotkey: 'N',
  },
  house: {
    name: 'Locker Room', hp: 300, size: 2, cost: { wood: 30 }, buildTime: 22, los: 6, pop: 5,
    desc: '+5 roster spots.', hotkey: 'L',
  },
  farm: {
    name: 'Fan Zone', hp: 200, size: 3, cost: { wood: 60 }, buildTime: 14, los: 4, walkable: true, farm: true,
    desc: 'Endless Fans. One staffer runs each fan zone. Build near a Stadium or Fan Club Tent.', hotkey: 'F',
  },
  mill: {
    name: 'Fan Club Tent', hp: 400, size: 2, cost: { wood: 100 }, buildTime: 30, los: 7, dropoff: ['food'],
    desc: 'Fans check in here. Build it beside tailgates or fan zones.', hotkey: 'N',
  },
  lumbercamp: {
    name: 'Equipment Shed', hp: 400, size: 2, cost: { wood: 100 }, buildTime: 30, los: 7, dropoff: ['wood'],
    desc: 'Gear drop-off. Build it beside an equipment yard.', hotkey: 'G',
  },
  miningcamp: {
    name: 'Booster Club', hp: 400, size: 2, cost: { wood: 100 }, buildTime: 30, los: 7, dropoff: ['gold', 'stone'],
    desc: 'Coins and Turf drop-off. Build it beside booster tents or turf piles.', hotkey: 'B',
  },
  barracks: {
    name: 'Weight Room', hp: 1000, size: 3, cost: { wood: 175 }, buildTime: 45, los: 8, trains: ['militia'],
    desc: 'Trains Linemen.', hotkey: 'W',
  },
  archeryrange: {
    name: 'Passing Camp', hp: 900, size: 3, cost: { wood: 175 }, buildTime: 45, los: 8, trains: ['archer'],
    desc: 'Trains Skill Players.', hotkey: 'P',
  },
  stable: {
    name: 'Blitz Camp', hp: 1000, size: 3, cost: { wood: 175, gold: 50 }, buildTime: 50, los: 8, trains: ['knight'],
    desc: 'Trains the Front 7.', hotkey: 'Z',
  },
  tower: {
    name: 'JUGS Machine', hp: 700, size: 1, cost: { wood: 50, stone: 125 }, buildTime: 45, los: 14,
    attack: 7, range: 11, cooldown: 2.0, projectile: 'football', desc: 'Pitching machine set to eleven. Fires footballs at rivals in range and scouts a wide area.', hotkey: 'J',
  },
};

export const BUILD_MENU = ['house', 'farm', 'mill', 'lumbercamp', 'miningcamp', 'barracks', 'archeryrange', 'stable', 'tower'];

export const NODE_TYPES = {
  tree: { res: 'wood', amount: 120, rate: 0.9, name: 'Gear Pallet' },
  gold: { res: 'gold', amount: 900, rate: 0.75, name: 'Booster Tent' },
  stone: { res: 'stone', amount: 700, rate: 0.7, name: 'Turf Pile' },
  berry: { res: 'food', amount: 150, rate: 0.95, name: 'Tailgate' },
};
export const FARM_RATE = 0.6;

export const DIFFICULTY = {
  easy:   { name: 'JV',       resMult: 0.75, firstAttack: 540, waveSize: 5, waveGrowth: 2, trainMult: 1.25 },
  normal: { name: 'Varsity',  resMult: 1.0,  firstAttack: 360, waveSize: 7, waveGrowth: 3, trainMult: 1.0 },
  hard:   { name: 'All-Pro',  resMult: 1.35, firstAttack: 240, waveSize: 9, waveGrowth: 4, trainMult: 0.8 },
};

export const START_RES = { food: 200, wood: 250, gold: 100, stone: 100 };
