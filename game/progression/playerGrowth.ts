// Ordinary (roster) player growth read model. Pure functions over GameState.
//
// Audit result (types.ts, constants.ts, game/authority/clubActions.ts training.*): there is NO
// per-player XP or progress field. Drill.rewardXp is declared on the drill table but never read
// by any rule — `training.collect` grants every player in the trained unit +1 level and +1 to
// each raw stat, whole numbers, no threshold, no bar. This model says so instead of inventing one.
import { DRILLS, LEVEL_STAT_GAIN, RARITY_CONFIG, RARITY_MULT, trainingYieldMult, warRoomReadinessMult } from '../../constants';
import { combatStat, unitCombatStats, unitPower, type UnitCombatStats } from '../../battle';
import { rosterPreparation } from '../combat/roster';
import { BuildingType, DrillState, PlayerRarity, UnitGroup, type Drill, type GameState, type Player, type PlayerStats } from '../../types';
import { shortfall, type Blocker } from './common';

export interface EffectiveStats extends PlayerStats {}

export interface PlayerCombatView {
  /** combatStat per stat: role base × rarity × level growth + trained surplus above 10. */
  effective: EffectiveStats;
  /** unitPower — the number deploy cards and tooltips show. */
  power: number;
  /** unitCombatStats — the real battle statline (hp, dps, speed, range, chargeRate). */
  statline: UnitCombatStats;
}

export interface DrillGrowthEffect {
  drillId: string;
  name: string;
  targetUnit: Drill['targetUnit'];
  durationSeconds: number;
  energyCost: number;
  /** Coins on collect at the current Training Field level (training.collect). */
  coins: number;
  /** Readiness added on collect at the current Film Room level, before the 100 cap. */
  readinessGain: number;
  /** Declared on the drill table but not applied by any rule. */
  rewardXp: { declared: number; applied: false; reason: string };
  levelReq: number;
  /** The Training Field meets levelReq. */
  unlocked: boolean;
  /** Roster players this drill would level on collect. */
  playersAffected: number;
  /** training.start refusal reasons in the authority's order. */
  blockers: Blocker[];
  canStart: boolean;
}

export type PlayerTrainingState =
  | { kind: 'idle' }
  | { kind: 'training'; buildingId: string; drillId: string; finishTime: number; remainingSeconds: number; progress: number; complete: boolean; collectable: boolean };

export interface PlayerGrowthModel {
  id: string;
  name: string;
  role: Player['role'];
  unit: UnitGroup;
  rarity: PlayerRarity;
  level: number;
  stats: PlayerStats;
  /** Player.maxStat as stored (RARITY_CONFIG default when the save lacks it). No rule enforces it. */
  declaredMaxStat: number;
  maxStatEnforced: false;
  rarityMultiplier: number;
  /** LEVEL_STAT_GAIN: each level past 1 adds this fraction of the rarity-scaled role base. */
  levelGainPerLevel: number;
  combat: PlayerCombatView;
  /** The honest answer: no per-player progress is tracked. */
  progress: { kind: 'none'; reason: string };
  /** The exact change the next collected drill applies to this player. */
  nextStep: {
    kind: 'drill-collect';
    /** Drills whose collect levels this player (unit drills + Full Scrimmage). */
    drillIds: string[];
    after: { level: number; stats: PlayerStats; combat: PlayerCombatView };
    delta: { level: 1; stats: PlayerStats; effective: EffectiveStats; power: number; statline: UnitCombatStats };
  };
  training: PlayerTrainingState;
  rarityPath: { next: PlayerRarity | null; promotion: { kind: 'none'; reason: string } };
}

export interface RosterGrowthModel {
  players: PlayerGrowthModel[];
  readiness: {
    value: number;
    cap: 100;
    /** rosterPreparation applies ×1.15 to every unit once readiness reaches 100. */
    firedUp: boolean;
    preparation: Record<UnitGroup, number>;
  };
  drills: DrillGrowthEffect[];
  trainingField: { level: number; state: DrillState; busy: boolean } | null;
}

const NO_PROGRESS_REASON = 'No per-player XP or progress field exists in GameState.roster (types.ts Player). Levels rise by exactly 1 whenever a drill covering this unit is collected (game/authority/clubActions.ts training.collect); Drill.rewardXp is declared but never applied.';

const combatView = (player: Pick<Player, 'role' | 'rarity' | 'level' | 'unit'> & { stats: PlayerStats }): PlayerCombatView => ({
  effective: { strength: combatStat(player, 'strength'), speed: combatStat(player, 'speed'), iq: combatStat(player, 'iq') },
  power: unitPower(player),
  statline: unitCombatStats(player),
});

const drillsForUnit = (unit: UnitGroup): Drill[] => Object.values(DRILLS).filter(d => d.targetUnit === 'ALL' || d.targetUnit === unit);

const trainingStateFor = (state: GameState, player: Player, now: number): PlayerTrainingState => {
  for (const building of state.buildings ?? []) {
    if (building.type !== BuildingType.TRAINING_PITCH || !building.activeDrillId || building.state === DrillState.IDLE) continue;
    const drill = Object.prototype.hasOwnProperty.call(DRILLS, building.activeDrillId) ? DRILLS[building.activeDrillId] : undefined;
    if (!drill) continue;
    const covers = drill.targetUnit === 'ALL' || building.targetUnit === player.unit;
    if (!covers) continue;
    const finishTime = building.finishTime ?? now;
    const startTime = building.startTime ?? finishTime - drill.durationSeconds * 1000;
    const total = Math.max(1, finishTime - startTime);
    const complete = finishTime <= now;
    return {
      kind: 'training', buildingId: building.id, drillId: drill.id, finishTime,
      remainingSeconds: Math.ceil(Math.max(0, finishTime - now) / 1000),
      progress: Math.max(0, Math.min(1, (now - startTime) / total)),
      complete,
      collectable: building.state === DrillState.COMPLETED && complete,
    };
  }
  return { kind: 'idle' };
};

/** One player's growth model. Pure. */
export function playerGrowth(state: GameState, playerId: string, now: number): PlayerGrowthModel | null {
  const player = (state.roster ?? []).find(p => p.id === playerId);
  if (!player) return null;
  const rarity = player.rarity ?? PlayerRarity.COMMON;
  const normalized = { ...player, rarity };
  const combat = combatView(normalized);
  const afterStats: PlayerStats = { strength: player.stats.strength + 1, speed: player.stats.speed + 1, iq: player.stats.iq + 1 };
  const afterCombat = combatView({ ...normalized, level: player.level + 1, stats: afterStats });
  return {
    id: player.id, name: player.name, role: player.role, unit: player.unit, rarity, level: player.level,
    stats: { ...player.stats },
    declaredMaxStat: player.maxStat ?? RARITY_CONFIG[rarity].maxStat,
    maxStatEnforced: false,
    rarityMultiplier: RARITY_MULT[rarity],
    levelGainPerLevel: LEVEL_STAT_GAIN,
    combat,
    progress: { kind: 'none', reason: NO_PROGRESS_REASON },
    nextStep: {
      kind: 'drill-collect',
      drillIds: drillsForUnit(player.unit).map(d => d.id),
      after: { level: player.level + 1, stats: afterStats, combat: afterCombat },
      delta: {
        level: 1,
        stats: { strength: 1, speed: 1, iq: 1 },
        effective: { strength: afterCombat.effective.strength - combat.effective.strength, speed: afterCombat.effective.speed - combat.effective.speed, iq: afterCombat.effective.iq - combat.effective.iq },
        power: afterCombat.power - combat.power,
        statline: { hp: afterCombat.statline.hp - combat.statline.hp, dps: afterCombat.statline.dps - combat.statline.dps, speed: afterCombat.statline.speed - combat.statline.speed, range: afterCombat.statline.range - combat.statline.range, chargeRate: afterCombat.statline.chargeRate - combat.statline.chargeRate },
      },
    },
    training: trainingStateFor(state, player, now),
    rarityPath: { next: RARITY_CONFIG[rarity].next, promotion: { kind: 'none', reason: 'No club action changes a player\'s rarity (game/authority/clubActions.ts has no promote/evolve rule). Rarity is fixed at signing.' } },
  };
}

/** Drill effects at the club's current facility levels, with training.start blockers for `unit`. */
export function drillEffects(state: GameState, unit: UnitGroup): DrillGrowthEffect[] {
  const pitches = (state.buildings ?? []).filter(b => b.type === BuildingType.TRAINING_PITCH);
  const idlePitch = pitches.find(b => b.state === DrillState.IDLE);
  const pitchLevel = (idlePitch ?? pitches[0])?.level ?? 1;
  const warRoomLevel = (state.buildings ?? []).find(b => b.type === BuildingType.TACTICS_ROOM)?.level ?? 1;
  const energy = state.resources?.ENERGY ?? 0;
  return Object.values(DRILLS).map(drill => {
    const applies = drill.targetUnit === 'ALL' || drill.targetUnit === unit;
    const playersAffected = (state.roster ?? []).filter(p => drill.targetUnit === 'ALL' || p.unit === unit).length;
    const blockers: Blocker[] = [];
    if (!applies) blockers.push({ code: 'invalid_command', message: 'That drill does not train this unit.' });
    else if (!idlePitch) blockers.push({ code: 'busy', message: 'The Training Field is busy.' });
    else if (idlePitch.level < drill.levelReq) blockers.push({ code: 'locked', message: 'Upgrade the Training Field for this drill.' });
    else if (playersAffected === 0) blockers.push({ code: 'not_found', message: 'No players in this training unit.' });
    else if (shortfall(energy, drill.costEnergy) > 0) blockers.push({ code: 'insufficient_resources', message: 'Not enough Energy.' });
    return {
      drillId: drill.id, name: drill.name, targetUnit: drill.targetUnit,
      durationSeconds: drill.durationSeconds, energyCost: drill.costEnergy,
      coins: Math.round(drill.rewardCoins * trainingYieldMult(pitchLevel)),
      readinessGain: drill.readinessGain * warRoomReadinessMult(warRoomLevel),
      rewardXp: { declared: drill.rewardXp, applied: false, reason: 'training.collect never reads rewardXp; growth is +1 level and +1 per stat for the trained unit.' },
      levelReq: drill.levelReq,
      unlocked: pitchLevel >= drill.levelReq,
      playersAffected,
      blockers,
      canStart: blockers.length === 0,
    };
  });
}

/** Whole-roster view plus the readiness the next attack will use. */
export function rosterGrowth(state: GameState, now: number): RosterGrowthModel {
  const players = (state.roster ?? []).map(p => playerGrowth(state, p.id, now)!).filter(Boolean);
  const readiness = Math.max(0, Math.min(100, state.teamReadiness ?? 0));
  const pitch = (state.buildings ?? []).find(b => b.type === BuildingType.TRAINING_PITCH) ?? null;
  // Each drill evaluated for the unit it trains; Full Scrimmage (ALL) is unit-independent, so any unit works.
  const anyUnit = (state.roster ?? [])[0]?.unit ?? UnitGroup.OFFENSE_LINE;
  const drills = Object.values(DRILLS).map(drill => drillEffects(state, drill.targetUnit === 'ALL' ? anyUnit : drill.targetUnit).find(e => e.drillId === drill.id)!);
  return {
    players,
    readiness: { value: readiness, cap: 100, firedUp: readiness >= 100, preparation: rosterPreparation(state.roster ?? [], readiness) },
    drills,
    trainingField: pitch ? { level: pitch.level, state: pitch.state, busy: pitch.state !== DrillState.IDLE } : null,
  };
}
