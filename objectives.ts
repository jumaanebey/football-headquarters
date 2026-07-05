import { GameState, BuildingType, DrillState } from './types';
import { collectorCap, RALLY_CONFIG, UPGRADE_CONFIG, RECRUIT_CONFIG } from './constants';

export type TourTarget = 'collect' | 'drill-done' | 'trophy' | 'coach' | 'rally' | 'design' | null;
export type IconKey = 'coins' | 'check' | 'trophy' | 'clock' | 'zap' | 'dumbbell' | 'shield' | 'arrowUp' | 'swords' | 'users';

export interface Objective {
  text: string;
  iconKey: IconKey;
  tone: 'go' | 'wait';
  target: TourTarget;
}

// A single concurrent goal shown in the Goals panel. `id` routes the tap to an action.
export type GoalId = 'collect-drill' | 'play' | 'collect-coins' | 'fortify' | 'train' | 'upgrade' | 'recruit' | 'raid';
export interface ObjectiveItem {
  id: GoalId;
  text: string;
  iconKey: IconKey;
  target: TourTarget;
  progress?: { cur: number; max: number };
}

// A base is "fortified" once it has at least this many Blocking Sleds (walls).
export const FORTIFY_MIN_WALLS = 8;

/**
 * Up to 3 concurrent goals, prioritized — so the player always has a few things to
 * pursue in parallel instead of one linear step. Includes the fortify-base nudge.
 */
export const getObjectives = (gs: GameState): ObjectiveItem[] => {
  const stadium = gs.buildings.find(b => b.type === BuildingType.STADIUM);
  const stadiumLvl = stadium?.level ?? 1;
  const banked = Math.floor(stadium?.accrued || 0);
  const cap = stadium ? collectorCap(BuildingType.STADIUM, stadium.level) : 0;
  const completedDrill = gs.buildings.some(b => b.state === DrillState.COMPLETED);
  const buildersFree = gs.builders - gs.upgrades.length;
  const academy = gs.buildings.find(b => b.type === BuildingType.YOUTH_ACADEMY);
  const rosterCap = RECRUIT_CONFIG.baseRosterCap + (academy?.level ?? 1) * RECRUIT_CONFIG.capPerLevel;

  const canUpgrade = buildersFree > 0 && gs.buildings.some(b => {
    const gated = b.type !== BuildingType.STADIUM && b.level >= stadiumLvl;
    if (gated) return false;
    const cost = Math.floor(UPGRADE_CONFIG.baseCost * Math.pow(UPGRADE_CONFIG.costMultiplier, b.level - 1));
    return gs.resources.COINS >= cost;
  });

  const pool: (ObjectiveItem & { prio: number })[] = [];
  if (completedDrill) pool.push({ prio: 1, id: 'collect-drill', text: 'Collect your finished drill (green ✓)', iconKey: 'check', target: 'drill-done' });
  if (gs.teamReadiness >= 100) pool.push({ prio: 2, id: 'play', text: 'Squad FIRED UP (+15% raid power) — raid now!', iconKey: 'trophy', target: 'trophy' });
  if (banked >= Math.max(30, cap * 0.25)) pool.push({ prio: 3, id: 'collect-coins', text: 'Bank your Stadium revenue', iconKey: 'coins', target: 'collect' });
  if (gs.walls.length < FORTIFY_MIN_WALLS) pool.push({ prio: 4, id: 'fortify', text: 'Fortify your base — add Blocking Sleds', iconKey: 'shield', target: 'design', progress: { cur: gs.walls.length, max: FORTIFY_MIN_WALLS } });
  if (gs.teamReadiness < 100) pool.push({ prio: 5, id: 'train', text: 'Train up to match-ready', iconKey: 'dumbbell', target: 'coach', progress: { cur: Math.round(gs.teamReadiness), max: 100 } });
  if (canUpgrade) pool.push({ prio: 6, id: 'upgrade', text: 'Upgrade a building', iconKey: 'arrowUp', target: null });
  if (gs.roster.length < rosterCap && !gs.recruitSlot) pool.push({ prio: 7, id: 'recruit', text: 'Scout a new player', iconKey: 'users', target: null, progress: { cur: gs.roster.length, max: rosterCap } });
  pool.push({ prio: 8, id: 'raid', text: 'Raid a rival for loot', iconKey: 'swords', target: null });

  return pool.sort((a, b) => a.prio - b.prio).slice(0, 3).map(({ prio, ...rest }) => rest);
};

/** Reads the live game state and returns the single most relevant next action + where to point. */
export const getObjective = (gs: GameState): Objective => {
  const stadium = gs.buildings.find(b => b.type === BuildingType.STADIUM);
  const banked = Math.floor(stadium?.accrued || 0);
  const cap = stadium ? collectorCap(BuildingType.STADIUM, stadium.level) : 0;
  const completedDrill = gs.buildings.some(b => b.state === DrillState.COMPLETED);
  const activeDrill = gs.buildings.some(b => b.state === DrillState.ACTIVE);

  if (completedDrill)
    return { text: 'Tap the green ✓ over your Training Field to collect', iconKey: 'check', tone: 'go', target: 'drill-done' };
  if (gs.teamReadiness >= 100)
    return { text: 'Squad FIRED UP (+15% power) — tap the ⚔️ to raid!', iconKey: 'trophy', tone: 'go', target: 'trophy' };
  if (banked >= Math.max(30, cap * 0.25))
    return { text: 'Tap the coin bubble on your Stadium to bank revenue', iconKey: 'coins', tone: 'go', target: 'collect' };
  if (activeDrill)
    return { text: 'Training in progress — collect it when the ✓ appears', iconKey: 'clock', tone: 'wait', target: null };
  if (gs.resources.ENERGY < 15) {
    const canRally = gs.resources.ENERGY < 100 && gs.resources.FANS >= RALLY_CONFIG.fanCost;
    return { text: canRally ? 'Low Energy — tap Rally to spend Fans and refill' : 'Low Energy — wait for it to refill', iconKey: 'zap', tone: 'wait', target: canRally ? 'rally' : null };
  }
  return { text: 'Open COACH, pick a group, and run a drill to build Readiness', iconKey: 'dumbbell', tone: 'go', target: 'coach' };
};
