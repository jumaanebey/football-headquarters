// Hero progression read model. Pure: (GameState, heroKey, now) → what the UI may show.
// Every number comes from the existing rule helpers (battle.ts, gacha.ts, constants.ts) and
// the authoritative `hero.*` rules in game/authority/clubActions.ts. Nothing here spends,
// starts or completes anything.
import { ABILITY_CD, HEAL_PER_SEC, HERO_DEFS, heroForBattle, heroLevelMult, heroMaxLevel, heroStarMult, heroUpgradeCost, type HeroDef } from '../../battle';
import { MAX_STARS, STAR_UP_COSTS } from '../../gacha';
import { upgradeDurationSecs } from '../../constants';
import type { GameState, HeroState } from '../../types';
import { jobView, shortfall, stadiumLevelOf, upgradeJobsOf, type Blocker, type JobView } from './common';

export type HeroProgressionStatus =
  | 'locked'                 // not owned and cannot be unlocked right now (or unknown to this club)
  | 'recruitable'            // not owned; the unlock price is affordable
  | 'owned'                  // owned, idle, next training is affordable
  | 'training'               // a hero job is running in state.upgrades
  | 'completed'              // the job's finish time has passed but the state has not settled it yet
  | 'maxed'                  // owned and at heroMaxLevel(stadium) — the Stadium is the gate
  | 'insufficient-resource'; // owned, idle, below the max level, but coins are short

/** The four numbers heroForBattle produces. Grit = hp, yardage = dps (Design Bible naming). */
export interface HeroStatBlock { grit: number; yardage: number; speed: number; range: number }
export interface HeroStatDelta extends HeroStatBlock { gritPct: number; yardagePct: number }

/** Which stats grow, verified against heroForBattle (battle.ts) and the engine's hero troop. */
export const HERO_STAT_SCALING = {
  grit: 'level+star',     // Math.round(baseHp × heroLevelMult × heroStarMult)
  yardage: 'level+star',  // baseDps × heroLevelMult × heroStarMult (not rounded by the helper)
  speed: 'fixed',         // def.speed, untouched by level or stars
  range: 'fixed',         // def.range (engine overrides for qb/kicker — see heroBattleRange)
  abilityCooldownSeconds: 'fixed', // ABILITY_CD for every hero
} as const;

export type AbilityScaling = 'yardage' | 'grit' | 'none';
export interface HeroAbilityFacts {
  /** What the signature effect grows with. 'none' = every number in it is a constant. */
  scalesWith: AbilityScaling;
  /** Exact implementation, in words, from game/combat/actions.ts stepHeroActions. */
  implementation: string;
  radius: number | null;
  sources: string[];
}

/** Implementation facts per ability. Source: game/combat/actions.ts (stepHeroActions) and
 *  game/combat/engine.ts (rage/sprint/truck/heal multipliers). Kept next to the model so the UI
 *  never has to guess what a description implies. */
export const HERO_ABILITY_FACTS: Record<HeroDef['ability'], HeroAbilityFacts> = {
  hailmary: { scalesWith: 'yardage', implementation: 'On contact the closest facility loses 300 + 4 × this hero\'s yardage (base yardage, not the Blitz-doubled value). Requires a facility to exist.', radius: null, sources: ['game/combat/actions.ts stepHeroActions hailmary', 'game/combat/actions.ts beginHeroAction (projectile target = nearestBuilding)'] },
  truckstick: { scalesWith: 'yardage', implementation: 'Refills his own grit to maximum, grants 6 s of Blitz (yardage ×2, speed ×1.5) and 1.8 s of truck speed (×1.6); the first facility he reaches while trucking takes a contact burst of 100 + 2 × yardage.', radius: null, sources: ['game/combat/actions.ts stepHeroActions truckstick', 'game/combat/engine.ts troop step (raging/truckT speed, contact burst 100 + dps × 2)'] },
  motivation: { scalesWith: 'none', implementation: 'Every living attacker within 20 world units (himself included) gets Blitz for at least 4 s (yardage ×2, speed ×1.5). Timers refresh to 4 s; they do not add up.', radius: 20, sources: ['game/combat/actions.ts stepHeroActions motivation', 'game/combat/engine.ts troop step (raging multipliers)'] },
  onside_bomb: { scalesWith: 'none', implementation: 'On contact the closest facility loses exactly 500 yards and every other facility within 12 world units of it loses 250. These amounts never change with level or stars.', radius: 12, sources: ['game/combat/actions.ts stepHeroActions onside_bomb'] },
  burner_dash: { scalesWith: 'none', implementation: 'No teleport: he keeps normal wall-aware pathing toward the closest facility with 2.5 s of sprint (speed ×1.7) and 2.5 s of Blitz (yardage ×2, speed ×1.5). Requires a facility to exist.', radius: null, sources: ['game/combat/actions.ts stepHeroActions burner_dash', 'game/combat/engine.ts troop step (sprintT)'] },
  field_medic: { scalesWith: 'grit', implementation: `Every living attacker within 18 world units (herself included) recovers 35% of their own maximum grit immediately, then ${HEAL_PER_SEC} grit per second for 5 s. Recovery never exceeds maximum grit.`, radius: 18, sources: ['game/combat/actions.ts stepHeroActions field_medic', 'game/combat/engine.ts troop step (healT, HEAL_PER_SEC)'] },
  shield_wall: { scalesWith: 'none', implementation: 'Every living attacker within 16 world units (himself included) takes 50% pressure for 5 s.', radius: 16, sources: ['game/combat/actions.ts stepHeroActions shield_wall', 'game/combat/actions.ts applyTroopPressure'] },
  trick_play: { scalesWith: 'none', implementation: 'Three generic offensive skill troops (not roster individuals) enter beside him at the squad\'s preparation multiplier.', radius: null, sources: ['game/combat/actions.ts stepHeroActions trick_play', 'game/combat/engine.ts reinforcements event'] },
  hall_of_fame: { scalesWith: 'grit', implementation: 'Every living attacker anywhere on the field recovers to maximum grit and gets Blitz for at least 6 s (yardage ×2, speed ×1.5).', radius: null, sources: ['game/combat/actions.ts stepHeroActions hall_of_fame'] },
};

export interface HeroAbilityView {
  key: HeroDef['ability'];
  name: string;
  /** The description shipped in HERO_DEFS, verbatim (never rewritten here). */
  description: string;
  cooldownSeconds: number;
  scalesWith: AbilityScaling;
  implementation: string;
  radius: number | null;
}

export interface HeroNextLevel {
  level: number;
  stats: HeroStatBlock;
  delta: HeroStatDelta;
  costCoins: number;
  /** Seconds the training job runs (hero.train: round(upgradeDurationSecs(toLevel) × 3)). */
  durationSeconds: number;
  affordable: boolean;
  shortfallCoins: number;
}

export interface HeroNextStar {
  stars: number;
  stats: HeroStatBlock;
  delta: HeroStatDelta;
  shardCost: number;
  shardsHave: number;
  shardsShort: number;
  affordable: boolean;
}

export interface HeroUnlockView {
  coins: number;
  gems: number;
  affordable: boolean;
  shortfall: { coins: number; gems: number };
}

export interface HeroBlocker extends Blocker { action: 'train' | 'star' | 'unlock' }

export interface HeroProgressionModel {
  key: string;
  name: string;
  role: string;
  emoji: string;
  status: HeroProgressionStatus;
  /** False when the club's hero list does not contain this hero at all (older save, new hero). */
  present: boolean;
  owned: boolean;
  level: number;
  stars: number;
  maxStars: number;
  shards: number;
  maxLevel: number;
  stadiumLevel: number;
  stadiumGate: {
    atMax: boolean;
    /** Stadium level at which one more hero level becomes available (null when not at max). */
    nextStadiumLevel: number | null;
    maxLevelAtNextStadium: number | null;
  };
  multipliers: { level: number; star: number; combined: number };
  current: HeroStatBlock;
  scaling: typeof HERO_STAT_SCALING;
  ability: HeroAbilityView;
  nextLevel: HeroNextLevel | null;
  nextStar: HeroNextStar | null;
  unlock: HeroUnlockView | null;
  training: JobView | null;
  blockers: HeroBlocker[];
  canTrain: boolean;
  canStarUp: boolean;
  canUnlock: boolean;
}

/** Duration hero.train assigns (game/authority/clubActions.ts): three facility durations. */
export const heroTrainingSeconds = (toLevel: number): number => Math.round(upgradeDurationSecs(toLevel) * 3);

/** The range the engine actually gives a fielded hero. makeHeroTroop (game/combat/engine.ts)
 *  overrides HERO_DEFS for the two throwers; every other hero keeps def.range. */
export const heroBattleRange = (def: Pick<HeroDef, 'key' | 'range'>): number =>
  def.key === 'qb' ? 13 : def.key === 'kicker' ? 16 : def.range;

/** heroForBattle output as a stat block, with the engine's real range. Yardage is left unrounded
 *  exactly as the sim uses it; round for display. */
export const heroStatsAt = (def: HeroDef, level: number, stars: number): HeroStatBlock => {
  const kit = heroForBattle(def, level, stars);
  return { grit: kit.hp, yardage: kit.dps, speed: kit.speed, range: heroBattleRange(def) };
};

const delta = (before: HeroStatBlock, after: HeroStatBlock): HeroStatDelta => ({
  grit: after.grit - before.grit,
  yardage: after.yardage - before.yardage,
  speed: after.speed - before.speed,
  range: after.range - before.range,
  gritPct: before.grit > 0 ? (after.grit - before.grit) / before.grit : 0,
  yardagePct: before.yardage > 0 ? (after.yardage - before.yardage) / before.yardage : 0,
});

/** Backfill the way game/persistence.ts does for old saves: missing `unlocked` → starter status,
 *  missing stars/shards → 1/0. A hero missing from the list is reported as not present. */
const resolveHeroState = (state: Pick<GameState, 'heroes'>, def: HeroDef): { hero: HeroState; present: boolean } => {
  const raw = (state.heroes ?? []).find(h => h.key === def.key) as Partial<HeroState> | undefined;
  if (!raw) return { present: false, hero: { key: def.key, level: 1, unlocked: !!def.starter, stars: 1, shards: 0 } };
  return {
    present: true,
    hero: {
      key: def.key,
      level: Number.isFinite(raw.level) && (raw.level as number) >= 1 ? (raw.level as number) : 1,
      unlocked: raw.unlocked ?? !!def.starter,
      stars: Number.isFinite(raw.stars) && (raw.stars as number) >= 1 ? (raw.stars as number) : 1,
      shards: Number.isFinite(raw.shards) && (raw.shards as number) >= 0 ? (raw.shards as number) : 0,
    },
  };
};

export const heroTrainingJob = (state: Pick<GameState, 'upgrades'>, heroKey: string) =>
  upgradeJobsOf(state).find(job => job.kind === 'hero' && job.key === heroKey) ?? null;

/** Build the read model for one hero from the live state. Unknown keys return null. */
export function heroProgression(state: GameState, heroKey: string, now: number): HeroProgressionModel | null {
  const def = HERO_DEFS.find(h => h.key === heroKey);
  if (!def) return null;
  const { hero, present } = resolveHeroState(state, def);
  const coins = state.resources?.COINS ?? 0;
  const gems = state.resources?.GEMS ?? 0;
  const stadiumLevel = stadiumLevelOf(state);
  const maxLevel = heroMaxLevel(stadiumLevel);
  const job = heroTrainingJob(state, def.key);
  const training = job ? jobView(job, now) : null;
  const owned = hero.unlocked;
  const current = heroStatsAt(def, hero.level, hero.stars);
  const atMax = hero.level >= maxLevel;

  // Next level (mirrors hero.train order: locked → busy → stadium gate → coins).
  const blockers: HeroBlocker[] = [];
  let nextLevel: HeroNextLevel | null = null;
  if (!owned || !present) blockers.push({ action: 'train', code: 'locked', message: 'Unlock this hero first.' });
  else if (job) blockers.push({ action: 'train', code: 'busy', message: 'This hero is already training.' });
  else if (atMax) blockers.push({ action: 'train', code: 'locked', message: 'Upgrade the Stadium to train this hero further.' });
  if (!atMax) {
    const costCoins = heroUpgradeCost(hero.level);
    const stats = heroStatsAt(def, hero.level + 1, hero.stars);
    nextLevel = { level: hero.level + 1, stats, delta: delta(current, stats), costCoins, durationSeconds: heroTrainingSeconds(hero.level + 1), affordable: coins >= costCoins, shortfallCoins: shortfall(coins, costCoins) };
    if (owned && present && !job && !nextLevel.affordable) blockers.push({ action: 'train', code: 'insufficient_resources', message: 'Not enough coins.' });
  }

  // Next star (mirrors hero.star: locked → limit → shards).
  let nextStar: HeroNextStar | null = null;
  if (!owned || !present) blockers.push({ action: 'star', code: 'locked', message: 'Unlock this hero first.' });
  else if (hero.stars >= MAX_STARS) blockers.push({ action: 'star', code: 'limit_reached', message: 'This hero has reached maximum stars.' });
  if (hero.stars < MAX_STARS) {
    const shardCost = STAR_UP_COSTS[hero.stars];
    if (shardCost) {
      const stats = heroStatsAt(def, hero.level, hero.stars + 1);
      nextStar = { stars: hero.stars + 1, stats, delta: delta(current, stats), shardCost, shardsHave: hero.shards, shardsShort: shortfall(hero.shards, shardCost), affordable: hero.shards >= shardCost };
      if (owned && present && !nextStar.affordable) blockers.push({ action: 'star', code: 'insufficient_resources', message: 'Not enough hero shards.' });
    }
  }

  // Unlock (mirrors hero.unlock: not_found → already_claimed → resources).
  let unlock: HeroUnlockView | null = null;
  if (!def.unlock || !present) blockers.push({ action: 'unlock', code: 'not_found', message: 'That hero cannot be unlocked here.' });
  else if (owned) blockers.push({ action: 'unlock', code: 'already_claimed', message: 'This hero is already yours.' });
  if (def.unlock) {
    const uCoins = def.unlock.coins ?? 0, uGems = def.unlock.gems ?? 0;
    unlock = { coins: uCoins, gems: uGems, affordable: coins >= uCoins && gems >= uGems, shortfall: { coins: shortfall(coins, uCoins), gems: shortfall(gems, uGems) } };
    if (present && !owned && !unlock.affordable) blockers.push({ action: 'unlock', code: 'insufficient_resources', message: 'Not enough coins or Crowns.' });
  }

  const canTrain = !blockers.some(b => b.action === 'train');
  const canStarUp = !blockers.some(b => b.action === 'star');
  const canUnlock = !blockers.some(b => b.action === 'unlock');

  const status: HeroProgressionStatus = !owned || !present
    ? (canUnlock ? 'recruitable' : 'locked')
    : training ? (training.complete ? 'completed' : 'training')
    : atMax ? 'maxed'
    : nextLevel && !nextLevel.affordable ? 'insufficient-resource'
    : 'owned';

  return {
    key: def.key, name: def.name, role: def.role, emoji: def.emoji,
    status, present, owned,
    level: hero.level, stars: hero.stars, maxStars: MAX_STARS, shards: hero.shards,
    maxLevel, stadiumLevel,
    stadiumGate: { atMax, nextStadiumLevel: atMax ? stadiumLevel + 1 : null, maxLevelAtNextStadium: atMax ? heroMaxLevel(stadiumLevel + 1) : null },
    multipliers: { level: heroLevelMult(hero.level), star: heroStarMult(hero.stars), combined: heroLevelMult(hero.level) * heroStarMult(hero.stars) },
    current,
    scaling: HERO_STAT_SCALING,
    ability: { key: def.ability, name: def.abilityName, description: def.abilityDesc, cooldownSeconds: ABILITY_CD, ...HERO_ABILITY_FACTS[def.ability] },
    nextLevel, nextStar, unlock, training, blockers, canTrain, canStarUp, canUnlock,
  };
}

/** Every hero in HERO_DEFS order — the roster card list. */
export const heroProgressionRoster = (state: GameState, now: number): HeroProgressionModel[] =>
  HERO_DEFS.map(def => heroProgression(state, def.key, now)!).filter(Boolean);

/** Before/after view for a training session. Always labelled `kind: 'preview'`; the UI may
 *  render it before any mutation. `confirmed` is derived from the state alone: it turns true only
 *  when the state's hero level has reached `toLevel` and no hero job for this key remains. */
export interface HeroTrainingPreview {
  kind: 'preview';
  heroKey: string;
  fromLevel: number;
  toLevel: number;
  stars: number;
  before: HeroStatBlock;
  after: HeroStatBlock;
  delta: HeroStatDelta;
  costCoins: number | null;
  durationSeconds: number;
  /** A job for this hero exists in the state (running or due). */
  job: JobView | null;
  /** The job is due but the state still carries it (settlement pending) — show "completing", not the new stats. */
  pendingSettlement: boolean;
  confirmed: boolean;
}

export function heroTrainingPreview(state: GameState, heroKey: string, now: number, toLevel?: number): HeroTrainingPreview | null {
  const def = HERO_DEFS.find(h => h.key === heroKey);
  if (!def) return null;
  const { hero } = resolveHeroState(state, def);
  const job = heroTrainingJob(state, def.key);
  const target = toLevel ?? job?.toLevel ?? hero.level + 1;
  const fromLevel = Math.min(hero.level, target - 1);
  const before = heroStatsAt(def, fromLevel, hero.stars);
  const after = heroStatsAt(def, target, hero.stars);
  const view = job ? jobView(job, now) : null;
  return {
    kind: 'preview', heroKey: def.key, fromLevel, toLevel: target, stars: hero.stars,
    before, after, delta: delta(before, after),
    costCoins: target === fromLevel + 1 ? heroUpgradeCost(fromLevel) : null,
    durationSeconds: heroTrainingSeconds(target),
    job: view,
    pendingSettlement: !!view?.complete,
    confirmed: !job && hero.level >= target,
  };
}
