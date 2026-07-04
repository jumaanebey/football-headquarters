import { Player, PlayerRarity, PlayerRole, PlayerState } from './types';
import {
  RECRUIT_CONFIG,
  ROLE_UNIT,
  UNIT_COLOR,
  RECRUIT_FIRST_NAMES,
  RECRUIT_LAST_NAMES,
  RARITY_CONFIG,
  randomTendency,
} from './constants';

const ALL_ROLES: PlayerRole[] = [
  PlayerRole.QB, PlayerRole.RB, PlayerRole.WR, PlayerRole.OL,
  PlayerRole.DL, PlayerRole.LB, PlayerRole.CB, PlayerRole.S,
];

/** Roster capacity grows with the Scouting Dept (Youth Academy) level. */
export const rosterCap = (scoutLevel: number): number =>
  RECRUIT_CONFIG.baseRosterCap + scoutLevel * RECRUIT_CONFIG.capPerLevel;

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Weighted-random rarity roll (commons frequent, legendaries rare). */
const rollRarity = (): PlayerRarity => {
  const entries = Object.entries(RECRUIT_CONFIG.rarity) as [PlayerRarity, { weight: number }][];
  const total = entries.reduce((sum, [, v]) => sum + v.weight, 0);
  let r = Math.random() * total;
  for (const [rarity, v] of entries) {
    r -= v.weight;
    if (r <= 0) return rarity;
  }
  return PlayerRarity.COMMON;
};

const statFor = (base: number, jitter: number) =>
  Math.max(1, Math.round(base + (Math.random() * 2 - 1) * jitter));

/** Generates a single scouting candidate (not yet on the roster). */
export const rollCandidate = (): Player => {
  const role = pick(ALL_ROLES);
  const unit = ROLE_UNIT[role];
  const rarity = rollRarity();
  const tuning = RECRUIT_CONFIG.rarity[rarity];

  return {
    id: `rec_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
    name: `${pick(RECRUIT_FIRST_NAMES)} ${pick(RECRUIT_LAST_NAMES)}`,
    role,
    unit,
    rarity,
    level: 1,
    stats: {
      strength: statFor(tuning.baseStat, tuning.jitter),
      speed: statFor(tuning.baseStat, tuning.jitter),
      iq: statFor(tuning.baseStat, tuning.jitter),
    },
    maxStat: RARITY_CONFIG[rarity].maxStat,
    worldPos: { x: 60, y: 12, z: 0 },
    targetPos: { x: 60, y: 12, z: 0 },
    state: PlayerState.IDLE,
    avatarColor: UNIT_COLOR[unit],
    tendency: randomTendency(),
  };
};

/** Generates a fresh board of candidates. */
export const rollBoard = (count = RECRUIT_CONFIG.candidateCount): Player[] =>
  Array.from({ length: count }, () => rollCandidate());

/** Overall rating (average of the three stats). */
export const candidateOvr = (p: Player): number =>
  Math.round((p.stats.strength + p.stats.speed + p.stats.iq) / 3);

export const recruitCost = (p: Player): number => RECRUIT_CONFIG.rarity[p.rarity].cost;
export const recruitSeconds = (p: Player): number => RECRUIT_CONFIG.rarity[p.rarity].seconds;
