import type { Player, UnitGroup } from '../../types';
import type { BattleBuildingDef, RaidHero, SpecialDef, HomeGuardDef, GauntletWave, ReplayAction, ReplayData, RoadChallenge } from '../../battle';
import type { RivalCoach } from '../../campaign';

export interface BattleConfig {
  mode: 'attack' | 'defense';
  roadChallenge?: RoadChallenge;
  title: string;
  buildings: BattleBuildingDef[];
  playerArmy?: Record<UnitGroup, number>;
  power?: Record<UnitGroup, number>;
  heroes?: RaidHero[];
  specials?: SpecialDef[];
  preTroops?: { unit: UnitGroup; x: number; y: number }[];
  squad?: Player[];       // the roster as INDIVIDUALS — deploys pull real named players
  preparation?: Record<UnitGroup, number>;
  practice?: boolean; // isolated new-rules field: no energy, rewards or online writes
  aiMult?: number;
  loot: { coins: number; fans: number };
  campaignStage?: number; // set when this attack is a Season campaign stage
  pvpTarget?: string;     // set when raiding a LIVE rival's published base (their pid)
  rival?: RivalCoach;     // the coach across the field — trash talk pre-game, reaction post-game
  attackerName?: string;  // YOUR club name — shown on the pre-game matchup card
  homeGuards?: HomeGuardDef[]; // defense mode: YOUR roster's defenders start on the field
  fans?: number;          // defense mode: your fanbase — the crowd erupts and stalls drives
  parkingLot?: number;    // defense mode: apron level (visual; the layout is pre-compressed)
  masteryTier?: number;   // defense mode: formation mastery ★ tier (0-3) — the DEFENSE PLAYS LADDER
  gauntlet?: { tier: number; waves: GauntletWave[] }; // 🛡 THE GAUNTLET: escalating waves storm your house
  replay?: { seed: number; script: ReplayAction[]; planKey: string; version?: 1 | 2; rules?: string; expectedHash?: string; expectedTicks?: number; displayTitle?: string }; // spectate a recorded attack
  /** Server-issued match binding: the seed and rules version belong to this match id (game/authority/matches.ts). */
  authority?: { matchId: string; seed: number; rules: string; issuedAt: number; expiresAt: number };
  /** Defense snapshot identity stamped by defenseBattleFields (game/defenseSnapshot.ts). */
  defenseLayoutId?: string;
  defenseSnapshotId?: string;
  defenseFormation?: string;
}

export interface BattleResult {
  mode: 'attack' | 'defense';
  title: string;
  stars: number;
  pct: number;
  coins: number;
  fans: number;
  won: boolean;
  campaignStage?: number;
  pvpTarget?: string;
  isReplay?: boolean;    // spectated replays award nothing
  isPractice?: boolean;
  replay?: ReplayData;   // recorded on live-rival attacks so the defender can watch
  gauntletTier?: number; // set when this was a Gauntlet night
  wavesHeld?: number;    // waves survived before the whistle (or the breach)
  gauntletCleared?: boolean;
  defenseLayoutId?: string;   // identity of the defense snapshot this result was played against
  defenseSnapshotId?: string;
  defenseFormation?: string;
}

