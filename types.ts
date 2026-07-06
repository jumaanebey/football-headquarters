
export enum ResourceType {
  COINS = 'COINS',
  GEMS = 'GEMS',
  ENERGY = 'ENERGY',
  FANS = 'FANS'
}

export enum BuildingType {
  TRAINING_PITCH = 'TRAINING_PITCH',
  YOUTH_ACADEMY = 'YOUTH_ACADEMY',
  TACTICS_ROOM = 'TACTICS_ROOM',
  MEDICAL_CENTER = 'MEDICAL_CENTER',
  STADIUM = 'STADIUM'
}

export enum DrillState {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED'
}

export enum SeasonPhase {
  OFF_SEASON = 'OFF_SEASON', // Training Camp
  SEASON = 'SEASON'          // Match Days
}

export enum UnitGroup {
  OFFENSE_LINE = 'OFFENSE_LINE',   // OL
  OFFENSE_SKILL = 'OFFENSE_SKILL', // QB, WR, RB
  DEFENSE_LINE = 'DEFENSE_LINE',   // DL, LB
  DEFENSE_SECONDARY = 'DEFENSE_SECONDARY' // CB, S
}

export enum PlayerRole {
  QB = 'QB',
  RB = 'RB',
  WR = 'WR',
  OL = 'OL',
  DL = 'DL',
  LB = 'LB',
  CB = 'CB',
  S = 'S'
}

export enum PlayerRarity {
  COMMON = 'COMMON',
  RARE = 'RARE',
  EPIC = 'EPIC',
  LEGENDARY = 'LEGENDARY'
}

export enum PlayerState {
  IDLE = 'IDLE',
  WALKING = 'WALKING',
  TRAINING = 'TRAINING',
  PATROLLING = 'PATROLLING' // defensive-tendency players guard the stadium when off-duty
}

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface PlayerStats {
  strength: number; // Blocking/Tackling
  speed: number;    // Route/Coverage
  iq: number;       // Play recognition
}

export interface Player {
  id: string;
  name: string;
  role: PlayerRole;
  unit: UnitGroup;
  rarity: PlayerRarity;
  level: number;
  stats: PlayerStats;
  maxStat: number;
  worldPos: WorldPosition;
  targetPos: WorldPosition;
  state: PlayerState;
  avatarColor: string;
  tendency: string; // play tendency (Blitzer / Anchor / …) — drives offense/defense rating
}

export interface Drill {
  id: string;
  name: string;
  targetUnit: UnitGroup | 'ALL';
  durationSeconds: number;
  costEnergy: number;
  rewardCoins: number;
  rewardXp: number;
  readinessGain: number;
  levelReq: number;
  icon: string;
}

export interface BuildingInstance {
  id: string;
  type: BuildingType;
  level: number;
  gridX: number;
  gridY: number;
  activeDrillId: string | null;
  targetUnit: UnitGroup | null; // Track which unit is training here
  startTime: number | null;
  finishTime: number | null;
  state: DrillState;
  accrued?: number; // Passive resources banked in this building (collectors only)
}

export interface BonusOrb {
  id: number;
  x: number;
  y: number;
  value: number;
  type: ResourceType;
  createdAt: number;
}

export interface MatchResult {
  week: number;
  opponent: string;
  ourScore: number;
  theirScore: number;
  won: boolean;
  reward: number;
}

export interface Opponent {
  id: string;
  name: string;
  offenseRating: number;
  defenseRating: number;
  primaryColor: string;
}

// An in-progress scouting job at the Scouting Dept: a candidate being signed, with an
// absolute finish timestamp so it resumes correctly across reloads.
export interface RecruitSlot {
  candidate: Player;
  finishTime: number;
  cost: number;
}

// A timed upgrade occupying one builder until finishTime (persists across reloads).
export interface UpgradeJob {
  id: string;
  kind: 'building' | 'hero';
  key: string;      // building id or hero key
  toLevel: number;
  startTime: number;
  finishTime: number;
}

export interface GameState {
  resources: {
    [key in ResourceType]: number;
  };
  seasonPhase: SeasonPhase;
  teamReadiness: number; // 0-100%
  currentMatch: number; // 1-17
  matchHistory: MatchResult[];
  level: number;
  xp: number;
  xpToNextLevel: number;
  buildings: BuildingInstance[];
  roster: Player[];
  bonusOrbs: BonusOrb[];
  lastTick: number;
  timeOfDay: number; // 0-24
  recruitSlot: RecruitSlot | null;
  walls: { gridX: number; gridY: number }[]; // Blocking Sleds — player-placed defensive barriers
  heroes: HeroState[];      // trainable star heroes (unlocked = owned; stars/shards = evolution)
  campaign: CampaignProgress; // Season campaign ladder progress
  builders: number;         // how many upgrades can run at once
  upgrades: UpgradeJob[];   // in-progress timed upgrades
  defenseLog: DefenseLogEntry[]; // record of rival raids on your base (Clash "while you were away")
  shieldUntil?: number;     // timestamp; while now < this, no offline raids can hit you
  trophies: number;         // trophy-ladder standing (drives your Rank)
  teamName: string;         // your club's public name (shown to Live Rivals)
  dailies: import('./dailies').DailiesState; // today's Daily Practice quests
  defenses: DefensePiece[]; // LEGACY (pre-fixed-base) — kept for save migration only
  inventory: StoredPieces;  // LEGACY (pre-fixed-base) — kept for save migration only
  bus: { gridX: number; gridY: number; flip?: boolean } | null; // LEGACY — bus is a fixed fixture now
  parkingLot: number;       // 0-3 — each level widens the apron attackers must cross (longer under fire)
  bonusDefSlots: number;    // 0-3 — extra equipment slots purchased with Crowns
  /** FIXED BASE: emplacement levels by slot id (D1-D6, C1-C3). Absent/0 = not activated.
   *  Geometry lives in fixedBase.ts — the save stores ONLY levels. */
  defenseSlots: Record<string, number>;
}

// Pieces you own but currently have OFF the board (Design-mode inventory).
export interface StoredPieces {
  sleds: number;              // blocking-sled walls stored
  defenses: { kind: string }[]; // stored equipment (kind preserved — they were paid for)
  bus: boolean;               // the Team Bus parked off-board
}

// A placeable defense piece — bought and positioned by the player in Design mode;
// becomes a real turret in the battle layout.
export interface DefensePiece {
  id: string;
  kind: string; // key into DEFENSE_TYPES
  gridX: number;
  gridY: number;
  flip?: boolean; // mirrored facing (tap-to-rotate in Design)
}

// A hero's persistent progression: level (coins), stars (evolution via shards), shards (from
// Scout Searches and campaign first-clears — duplicates convert to shards, Castle Clash-style).
export interface HeroState {
  key: string;
  level: number;
  unlocked: boolean;
  stars: number;  // 1..5 — each star multiplies hero power
  shards: number; // banked toward the next star-up
}

// Season campaign ladder: highest unlocked stage, best Game Balls per stage, claimed first-clears.
export interface CampaignProgress {
  unlocked: number;                 // highest stage available (starts at 1)
  stars: Record<number, number>;    // stage -> best Game Balls (0-3)
  claimed: number[];                // stages whose first-clear reward was granted
}

// One rival raid resolved against the player's base while they were away.
export interface DefenseLogEntry {
  id: string;
  attacker: string; // rival team name
  at: number;       // timestamp (ms)
  stars: number;    // stars the attacker earned (0-3; fewer = your base held)
  pct: number;      // % of your base they destroyed
  coinsLost: number;
  seen: boolean;    // false until the player views the log (drives the "new" badge)
  avenged?: boolean; // true once the player has taken revenge on this raid
  replay?: unknown;  // recorded attack script (live rivals) — watch the actual drive
  attackerPid?: string; // live rivals: their identity — revenge hits their REAL base
}

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
}
