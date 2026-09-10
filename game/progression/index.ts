// Stable surface for the Codex UI: pure read models over GameState. See docs/GROWTH-EQUIPMENT-MODELS.md.
export type { Blocker, JobView } from './common';
export {
  heroProgression, heroProgressionRoster, heroTrainingPreview, heroTrainingJob, heroStatsAt, heroBattleRange, heroTrainingSeconds,
  HERO_ABILITY_FACTS, HERO_STAT_SCALING,
} from './heroProgression';
export type {
  HeroProgressionModel, HeroProgressionStatus, HeroStatBlock, HeroStatDelta, HeroNextLevel, HeroNextStar, HeroUnlockView, HeroBlocker,
  HeroAbilityView, HeroAbilityFacts, AbilityScaling, HeroTrainingPreview,
} from './heroProgression';
export { playerGrowth, rosterGrowth, drillEffects } from './playerGrowth';
export type { PlayerGrowthModel, PlayerCombatView, PlayerTrainingState, DrillGrowthEffect, RosterGrowthModel, EffectiveStats } from './playerGrowth';
export { prospectComparison, scoutingBoard } from './rosterCompare';
export type { ProspectComparison, ComparablePlayer, ScoutingBoardModel, ScoutingJobView, BoardStaleReason } from './rosterCompare';
export { equipmentModel, equipmentRoster, equipmentStatsAt, crownSlotPurchase, DEFENSE_BEHAVIOUR } from './equipmentModel';
export type { EquipmentModel, EquipmentStatus, EquipmentKind, EquipmentStats, EquipmentUpgradeView, DefenseBehaviour } from './equipmentModel';
