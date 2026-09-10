import { EQUIPMENT_COUNTERS } from '../combat/defenseCounters';
// Defensive equipment read model. Pure functions over GameState.
// Geometry and gates: fixedBase.ts. Prices and base stats: constants.ts DEFENSE_TYPES.
// Level scaling: battle.ts defenseLayoutFromBase (the real layout builder, called here with the
// slot alone so the numbers are exactly what the battle layout would carry). Upgrade rules:
// game/authority/clubActions.ts defense.upgrade-slot. Combat behaviour: game/combat/engine.ts.
import { DEFENSE_TYPES, EXTRA_SLOT_COSTS } from '../../constants';
import { MAX_SLOT_LEVEL, masteryDefMult, slotUnlocked, slotUpgradeCost, slotsFor, type DefenseSlotDef } from '../../fixedBase';
import { defenseLayoutFromBase } from '../../battle';
import { defenseTroopBoost } from '../../defense';
import { campusLayoutForState } from '../campusLayout';
import type { GameState } from '../../types';
import { shortfall, stadiumLevelOf, type Blocker } from './common';

export type EquipmentStatus =
  | 'installed'    // level ≥ 1 in state.defenseSlots
  | 'preview'      // slot unlocked, level 0 — numbers shown are what level 1 would give
  | 'unavailable'; // slot gate not met (Stadium level or Crown slot not purchased)

export type EquipmentKind = 'jugs' | 'sled' | 'ref' | 'tshirt' | 'cooler';

/** How a kind fights — transcribed from the turret loop in game/combat/engine.ts. */
export interface DefenseBehaviour {
  kind: EquipmentKind;
  /** World units; DEFENSE_TYPES.range, never scaled by level. */
  range: number;
  /** Seconds between shots while a target is in range. */
  cooldownSeconds: number;
  /** Multiplier applied to the slot's damage on a direct hit. */
  hitDamageMult: number;
  targeting: 'nearest-single' | 'nearest-plus-splash';
  splash: { radius: number; damageMult: number; slowSeconds: number } | null;
  /** Slow applied by the basic shot. `apply` says whether it extends (max) or overwrites the timer. */
  slow: { seconds: number; apply: 'extend' | 'overwrite' } | null;
  puddle: { radius: number; lifeSeconds: number; slowSecondsWhileInside: number } | null;
  /** Speed multiplier while any slow timer is running (one timer per attacker; never stacks). */
  slowSpeedMult: number;
  signature: { name: string; unlockLevel: 10; everySeconds: number; searchRangeMult: number; effect: string };
  /** Exact wording that matches the code (the shipped `desc` in DEFENSE_TYPES is left untouched). */
  correctedDescription: string;
  sources: string[];
}

export const LEGACY_DEFENSE_BEHAVIOUR: Record<EquipmentKind, DefenseBehaviour> = {
  jugs: {
    kind: 'jugs', range: 24, cooldownSeconds: 0.55, hitDamageMult: 1, targeting: 'nearest-single', splash: null, slow: null, puddle: null, slowSpeedMult: 0.55,
    signature: { name: 'JUGS Overdrive', unlockLevel: 10, everySeconds: 9, searchRangeMult: 1.25, effect: 'A 2.2× damage volley on the nearest attacker within 1.25× range.' },
    correctedDescription: 'Rapid-fire football launcher: hits the nearest runner every 0.55 s for full damage. Range 24.',
    sources: ['game/combat/engine.ts turret loop (jugs cooldown 0.55)', 'game/combat/engine.ts JUGS OVERDRIVE (level ≥ 10)'],
  },
  sled: {
    kind: 'sled', range: 14, cooldownSeconds: 1.1, hitDamageMult: 1.35, targeting: 'nearest-single', splash: null, slow: null, puddle: null, slowSpeedMult: 0.55,
    signature: { name: 'Pancake Block', unlockLevel: 10, everySeconds: 8, searchRangeMult: 1.25, effect: 'Knocks the nearest attacker within 9 units back 11 units, slows them 1.8 s and hits for 1.4× damage.' },
    correctedDescription: 'Short range, hits like a truck: the nearest runner takes 135% damage every 1.1 s. Range 14.',
    sources: ['game/combat/engine.ts turret loop (sled ×1.35, cooldown 1.1)', 'game/combat/engine.ts PANCAKE BLOCK (level ≥ 10)'],
  },
  ref: {
    kind: 'ref', range: 30, cooldownSeconds: 0.9, hitDamageMult: 1, targeting: 'nearest-single', splash: null, slow: { seconds: 2.2, apply: 'overwrite' }, puddle: null, slowSpeedMult: 0.55,
    signature: { name: 'Booth Review', unlockLevel: 10, everySeconds: 11, searchRangeMult: 1.25, effect: 'Every attacker within range is slowed 2.2 s (extend) and takes 0.6× damage.' },
    correctedDescription: 'Penalty flags: the nearest runner takes full damage and runs at 55% speed for 2.2 s, every 0.9 s. One runner per flag; the flag resets the runner\'s slow timer to 2.2 s. Longest range (30).',
    sources: ['game/combat/engine.ts turret loop (ref: prey.slowT = 2.2, cooldown 0.9)', 'game/combat/engine.ts troop step (slowT → speed × 0.55)', 'game/combat/engine.ts BOOTH REVIEW (level ≥ 10)'],
  },
  tshirt: {
    kind: 'tshirt', range: 20, cooldownSeconds: 1.15, hitDamageMult: 0.7, targeting: 'nearest-plus-splash', splash: { radius: 7, damageMult: 0.7, slowSeconds: 1.5 }, slow: { seconds: 1.5, apply: 'extend' }, puddle: null, slowSpeedMult: 0.55,
    signature: { name: 'T-Shirt Storm', unlockLevel: 10, everySeconds: 10, searchRangeMult: 1.25, effect: 'Double-wide volley: every attacker within 12 units of the nearest one takes 0.9× damage and is slowed 2 s.' },
    correctedDescription: 'Splash: every runner within 7 units of the nearest one takes 70% damage and is slowed to 55% speed for 1.5 s, every 1.15 s. Range 20.',
    sources: ['game/combat/engine.ts turret loop (tshirt: radius 7, ×0.7, slow 1.5, cooldown 1.15)', 'game/combat/engine.ts T-SHIRT STORM (level ≥ 10)'],
  },
  cooler: {
    kind: 'cooler', range: 22, cooldownSeconds: 2.6, hitDamageMult: 1, targeting: 'nearest-single', splash: null, slow: null, puddle: { radius: 7, lifeSeconds: 3.5, slowSecondsWhileInside: 0.3 }, slowSpeedMult: 0.55,
    signature: { name: 'Flood Zone', unlockLevel: 10, everySeconds: 10, searchRangeMult: 1.25, effect: 'One 13-unit puddle that lasts 5 s.' },
    correctedDescription: 'Sprays water every 2.6 s: the nearest runner takes full damage and a 7-unit puddle soaks the turf for 3.5 s — every attacker inside it runs at 55% speed (the slow ends about 0.3 s after they leave). Range 22.',
    sources: ['game/combat/engine.ts turret loop (cooler: puddle r 7, life 3.5, cooldown 2.6)', 'game/combat/engine.ts puddle step (slowT ≥ 0.3 while inside)', 'game/combat/engine.ts FLOOD ZONE (level ≥ 10)'],
  },
};

/** Current rules; legacy descriptions remain available for old-film verification. */
export const DEFENSE_BEHAVIOUR = Object.fromEntries(Object.entries(LEGACY_DEFENSE_BEHAVIOUR).map(([key, old]) => {
  const kind=key as EquipmentKind, rule=EQUIPMENT_COUNTERS[kind];
  return [kind, {...old, cooldownSeconds:rule.cooldown, hitDamageMult:rule.damage,
    slowSpeedMult:kind==='cooler'?.6:kind==='ref'?.75:.65,
    slow: kind==='ref'?{seconds:1.4,apply:'extend'}:kind==='tshirt'?{seconds:.9,apply:'extend'}:null,
    splash:kind==='tshirt'?{radius:7,damageMult:EQUIPMENT_COUNTERS.tshirt.damage,slowSeconds:.9}:null,
    puddle:kind==='cooler'?{radius:7,lifeSeconds:3.5,slowSecondsWhileInside:.15}:null,
    correctedDescription:`${rule.counter} ${rule.windup ? `${rule.windup}s warning, then ` : ''}${rule.cooldown}s recovery after each attack.`,
    signature:{...old.signature,searchRangeMult:1,effect:kind==='sled'?'5-unit knockback reduced by brace resistance; obstacle-safe. 1.4× normal impact.':kind==='ref'?'Flags every attacker within normal range; IQ shortens each flag.':kind==='tshirt'?'11.2-unit area, 1.4× normal pressure with edge falloff.':kind==='cooler'?'11.2-unit water zone lasting 5 seconds; no direct damage.':'2.2× pressure on the nearest attacker.'},
    sources:['game/combat/defenseCounters.ts','game/combat/defenseCounterStep.ts']}];
})) as Record<EquipmentKind, DefenseBehaviour>;

export interface EquipmentStats {
  level: number;
  durability: number;
  damage: number;
  /** Maximum pressure × hitDamageMult ÷ (warning + recovery); resistance and spacing reduce this — steady single-target output while a runner is in range. */
  sustainedDamagePerSecond: number;
}

export interface EquipmentUpgradeView {
  toLevel: number;
  stats: EquipmentStats;
  delta: { durability: number; damage: number; sustainedDamagePerSecond: number };
  costCoins: number;
  affordable: boolean;
  shortfallCoins: number;
  /** defense.upgrade-slot refusal reasons in the authority's order. */
  blockers: Blocker[];
  canUpgrade: boolean;
}

export interface EquipmentModel {
  slotId: string;
  kind: EquipmentKind;
  name: string;
  emoji: string;
  /** The description shipped in DEFENSE_TYPES, verbatim. */
  description: string;
  status: EquipmentStatus;
  level: number;
  maxLevel: number;
  /** Level 1..10, unlocked slot — the defense snapshot fields it (game/defenseSnapshot.ts). */
  fielded: boolean;
  location: { gridX: number; gridY: number; covers: string; formation: GameState['formation'] };
  gate:
    | { kind: 'stadium'; required: number; current: number; met: boolean }
    | { kind: 'crown'; index: number; costGems: number; purchased: boolean; met: boolean };
  /** Base numbers (defBoost 1) for the installed level; null for a level-0 preview. */
  current: EquipmentStats | null;
  /** Live layout multiplier: defenseTroopBoost(roster) × masteryDefMult(holds for this formation). */
  boost: number;
  currentBoosted: EquipmentStats | null;
  next: EquipmentUpgradeView | null;
  behaviour: DefenseBehaviour;
}

const kindOf = (kind: string): EquipmentKind => (kind in DEFENSE_BEHAVIOUR ? kind : 'jugs') as EquipmentKind;

/** Level-scaled hp/damage from the real layout builder (defenseLayoutFromBase). */
export const equipmentStatsAt = (slot: Pick<DefenseSlotDef, 'id' | 'kind' | 'gridX' | 'gridY'>, level: number, boost = 1): EquipmentStats => {
  const piece = defenseLayoutFromBase([], [], boost, [{ id: slot.id, kind: slot.kind, gridX: slot.gridX, gridY: slot.gridY, level }])[0];
  const behaviour = DEFENSE_BEHAVIOUR[kindOf(slot.kind)];
  const damage = piece.damage ?? 0;
  return { level, durability: piece.hp, damage, sustainedDamagePerSecond: damage * behaviour.hitDamageMult / (behaviour.cooldownSeconds + EQUIPMENT_COUNTERS[kindOf(slot.kind)].windup) };
};

const gateOf = (slot: DefenseSlotDef, stadiumLevel: number, bonusDefSlots: number): EquipmentModel['gate'] =>
  slot.crownIndex !== undefined
    ? { kind: 'crown', index: slot.crownIndex, costGems: EXTRA_SLOT_COSTS[slot.crownIndex], purchased: bonusDefSlots > slot.crownIndex, met: slotUnlocked(slot, stadiumLevel, bonusDefSlots) }
    : { kind: 'stadium', required: slot.stadiumReq ?? 1, current: stadiumLevel, met: slotUnlocked(slot, stadiumLevel, bonusDefSlots) };

/** One slot of the current formation. Unknown slot ids return null. */
export function equipmentModel(state: GameState, slotId: string): EquipmentModel | null {
  const formation = state.formation ?? 'goalline';
  const slot = slotsFor(formation).find(s => s.id === slotId);
  if (!slot) return null;
  const def = DEFENSE_TYPES.find(d => d.kind === slot.kind) ?? DEFENSE_TYPES[0];
  const kind = kindOf(slot.kind);
  const stadiumLevel = stadiumLevelOf(state);
  const bonusDefSlots = Math.max(0, state.bonusDefSlots ?? 0);
  const rawLevel = state.defenseSlots?.[slot.id] ?? 0;
  const level = Number.isInteger(rawLevel) && rawLevel > 0 ? Math.min(MAX_SLOT_LEVEL, rawLevel) : 0;
  const gate = gateOf(slot, stadiumLevel, bonusDefSlots);
  const layout = campusLayoutForState(state);
  const placed = layout.slots.find(s => s.id === slot.id) ?? slot;
  const geometry = { id: slot.id, kind: slot.kind, gridX: placed.gridX, gridY: placed.gridY };
  const holds = Math.max(0, state.formationMastery?.[formation] ?? 0);
  const boost = defenseTroopBoost(state.roster ?? []) * masteryDefMult(holds);
  const coins = state.resources?.COINS ?? 0;

  const status: EquipmentStatus = !gate.met ? 'unavailable' : level >= 1 ? 'installed' : 'preview';
  const current = level >= 1 ? equipmentStatsAt(geometry, level) : null;

  // defense.upgrade-slot order: not_found → limit_reached → locked → insufficient_resources.
  let next: EquipmentUpgradeView | null = null;
  const toLevel = level + 1;
  if (toLevel <= MAX_SLOT_LEVEL) {
    const blockers: Blocker[] = [];
    if (!gate.met || toLevel > stadiumLevel) blockers.push({ code: 'locked', message: 'Unlock this slot or upgrade the Stadium first.' });
    const costCoins = slotUpgradeCost(slot.kind, toLevel);
    if (blockers.length === 0 && shortfall(coins, costCoins) > 0) blockers.push({ code: 'insufficient_resources', message: 'Not enough coins.' });
    const stats = equipmentStatsAt(geometry, toLevel);
    const base = current ?? { level: 0, durability: 0, damage: 0, sustainedDamagePerSecond: 0 };
    next = {
      toLevel, stats,
      delta: { durability: stats.durability - base.durability, damage: stats.damage - base.damage, sustainedDamagePerSecond: stats.sustainedDamagePerSecond - base.sustainedDamagePerSecond },
      costCoins, affordable: coins >= costCoins, shortfallCoins: shortfall(coins, costCoins), blockers, canUpgrade: blockers.length === 0,
    };
  }

  return {
    slotId: slot.id, kind, name: def.name, emoji: def.emoji, description: DEFENSE_BEHAVIOUR[kind].correctedDescription,
    status, level, maxLevel: MAX_SLOT_LEVEL,
    fielded: gate.met && level >= 1 && level <= MAX_SLOT_LEVEL,
    location: { gridX: placed.gridX, gridY: placed.gridY, covers: slot.covers, formation },
    gate,
    current, boost,
    currentBoosted: level >= 1 ? equipmentStatsAt(geometry, level, boost) : null,
    next,
    behaviour: DEFENSE_BEHAVIOUR[kind],
  };
}

/** All slots of the current formation in fixedBase order. */
export const equipmentRoster = (state: GameState): EquipmentModel[] =>
  slotsFor(state.formation ?? 'goalline').map(s => equipmentModel(state, s.id)!).filter(Boolean);

/** Crown-slot purchase view (defense.buy-slot). */
export function crownSlotPurchase(state: GameState): { purchased: number; max: number; nextCostGems: number | null; blockers: Blocker[]; canBuy: boolean } {
  const purchased = Math.max(0, state.bonusDefSlots ?? 0);
  const blockers: Blocker[] = [];
  const nextCostGems = purchased < EXTRA_SLOT_COSTS.length ? EXTRA_SLOT_COSTS[purchased] : null;
  if (nextCostGems === null) blockers.push({ code: 'limit_reached', message: 'All extra equipment slots are unlocked.' });
  else if (shortfall(state.resources?.GEMS ?? 0, nextCostGems) > 0) blockers.push({ code: 'insufficient_resources', message: 'Not enough Crowns.' });
  return { purchased, max: EXTRA_SLOT_COSTS.length, nextCostGems, blockers, canBuy: blockers.length === 0 };
}
