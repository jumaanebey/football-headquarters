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
export type GoalId = 'collect-drill' | 'play' | 'collect-coins' | 'fortify' | 'train' | 'upgrade' | 'recruit' | 'raid' | 'campaign';
export interface ObjectiveItem {
  id: GoalId;
  text: string;
  iconKey: IconKey;
  target: TourTarget;
  progress?: { cur: number; max: number };
}

// FIXED BASE: walls are automatic now. "Fortify" = install/upgrade defense
// emplacements in the Front Office instead of placing sleds.
export const FORTIFY_MIN_SLOTS = 2;

// Keep "play your next game" as the top goal through the early season, while the
// campaign is the only reliably winnable loop a new coach has.
export const EARLY_SEASON_GOAL_THROUGH = 3;
export const CAMPAIGN_STAGE_COUNT = 12;

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
  // A new coach's next move is always the next game. Without this, the top goal for a
  // fresh player was an impossible one (see fortify below) and nothing in the Goals
  // panel ever pointed at the only loop that works early: play the next season game.
  if ((gs.campaign?.unlocked ?? 1) <= EARLY_SEASON_GOAL_THROUGH) {
    const wk = Math.min(gs.campaign?.unlocked ?? 1, CAMPAIGN_STAGE_COUNT);
    pool.push({ prio: 0, id: 'campaign', text: `Play your next game — Week ${wk}`, iconKey: 'swords', target: 'trophy' });
  }
  if (completedDrill) pool.push({ prio: 1, id: 'collect-drill', text: 'Collect your finished drill (green ✓)', iconKey: 'check', target: 'drill-done' });
  if (gs.teamReadiness >= 100) pool.push({ prio: 2, id: 'play', text: 'Squad FIRED UP (+15% raid power) — raid now!', iconKey: 'trophy', target: 'trophy' });
  // (No "bank your revenue" goal — the coin bubble on the Stadium already sells itself.
  //  Goals are for MOVES: fortify, train, upgrade, recruit, raid.)
  {
    // The 2nd defense slot (D3) needs Stadium L2 — see fixedBase.ts SLOTS. Offering
    // "install defenses" at L1 sent every brand-new coach to a wall of padlocks: it was
    // prio 4, which made it goal #1, so the game's FIRST instruction was impossible.
    const activeSlots = Object.values(gs.defenseSlots ?? {}).filter(l => l > 0).length;
    const canActuallyFortify = stadiumLvl >= 2;
    if (activeSlots < FORTIFY_MIN_SLOTS && canActuallyFortify) pool.push({ prio: 4, id: 'fortify', text: 'Set up your defense — add equipment in the Front Office', iconKey: 'shield', target: 'design', progress: { cur: activeSlots, max: FORTIFY_MIN_SLOTS } });
  }
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
