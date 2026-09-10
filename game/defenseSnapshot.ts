import { BuildingType, PlayerState, type BuildingInstance, type GameState, type HeroState, type Player } from '../types';
import { defenseLayoutFromBase, heroesForBattle, homeDefenders, type BattleBuildingDef, type HomeGuardDef } from '../battle';
import { PARKING_LOT, wallCap } from '../constants';
import { masteryDefMult, masteryLevel, slotUnlocked, slotsFor, wallHpFor, type FormationKey } from '../fixedBase';
import { defenseTroopBoost } from '../defense';
import { COMBAT_RULES_VERSION } from './combat/actions';
import { canonicalJson } from './combat/canonical';
import type { BattleConfig } from './combat/contracts';
import { campusLayoutForState, campusLayoutId, type CampusLayout } from './campusLayout';

export interface DefenseSnapshot {
  version: 1;
  rules: string;
  layoutId: string;
  campus: CampusLayout;
  facilities: { id: string; type: BuildingType; level: number }[];
  buildings: BattleBuildingDef[];
  roster: Player[];
  heroStates: HeroState[];
  heroGates: Record<string, string>;
  assignedHeroes: { gateId: string; heroKey: string; guard: HomeGuardDef }[];
  equipment: Record<string, number>;
  bonusDefSlots: number;
  mastery: { formation: FormationKey; holds: number; tier: number };
  crowd: { fans: number; parkingLot: number };
  homeGuards: HomeGuardDef[];
  snapshotId: string;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const reference = (value: unknown) => {
  let hash = 14695981039346656037n;
  const encoded = canonicalJson(value);
  for (let i = 0; i < encoded.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(encoded.charCodeAt(i))) * 1099511628211n);
  return `defense-v1-${hash.toString(16).padStart(16, '0')}`;
};

export function createDefenseSnapshot(source: GameState): DefenseSnapshot {
  const campus = campusLayoutForState(source);
  const buildings: BuildingInstance[] = campus.facilities.map(p => {
    const owned = source.buildings.find(b => b.id === p.id)!;
    return { ...owned, gridX: p.gridX, gridY: p.gridY };
  }).sort(byId);
  const stadiumLevel = buildings.find(b => b.type === BuildingType.STADIUM)?.level ?? 1;
  const roster: Player[] = source.roster.map(p => ({ ...clone(p), worldPos: { x: 0, y: 0, z: 0 }, targetPos: { x: 0, y: 0, z: 0 }, state: PlayerState.IDLE })).sort(byId);
  const heroes = clone(source.heroes).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const equipment: Record<string, number> = {};
  const unlocked = slotsFor(campus.formation);
  for (const slot of campus.slots) {
    const def = unlocked.find(s => s.id === slot.id)!;
    const level = source.defenseSlots[slot.id] ?? 0;
    if (Number.isInteger(level) && level >= 1 && level <= 10 && slotUnlocked(def, stadiumLevel, source.bonusDefSlots)) equipment[slot.id] = level;
  }
  const emplacements = campus.slots.filter(s => equipment[s.id]).map(s => ({ ...s, level: equipment[s.id] }));
  const holds = Math.max(0, source.formationMastery[campus.formation] ?? 0);
  const parkingLot = Math.max(0, Math.min(PARKING_LOT.maxLevel, source.parkingLot));
  const fans = Math.max(0, source.resources.FANS);
  const pool = heroesForBattle(heroes).sort((a, b) => b.hp * b.dps - a.hp * a.dps || (a.key < b.key ? -1 : 1));
  const used = new Set<string>();
  const heroGates: Record<string, string> = {};
  for (const gate of campus.gates) {
    const hero = pool.find(h => h.key === source.heroGates[gate.id] && !used.has(h.key));
    if (hero) { heroGates[gate.id] = hero.key; used.add(hero.key); }
  }
  for (const gate of campus.gates) if (!heroGates[gate.id]) {
    const hero = pool.find(h => !used.has(h.key));
    if (hero) { heroGates[gate.id] = hero.key; used.add(hero.key); }
  }
  const squeeze = 1 - PARKING_LOT.compressPerLevel * parkingLot;
  const coordinate = (v: number) => 50 + (v - 50) * squeeze;
  const assignedHeroes = campus.gates.flatMap(gate => {
    const h = pool.find(hero => hero.key === heroGates[gate.id]);
    if (!h) return [];
    const guard: HomeGuardDef = {
      jersey: 0,
      hp: Math.round(h.hp * 0.75),
      dps: Math.round(h.dps * 0.75 * 10) / 10,
      name: h.name,
      art: h.art,
      unit: h.unit,
      x: coordinate(gate.gridX * 10),
      y: coordinate(gate.gridY * 10),
    };
    return [{ gateId: gate.id, heroKey: h.key, guard }];
  });
  const snapshot: Omit<DefenseSnapshot, 'snapshotId'> = {
    version: 1,
    rules: COMBAT_RULES_VERSION,
    layoutId: campusLayoutId(campus),
    campus,
    facilities: buildings.map(b => ({ id: b.id, type: b.type, level: b.level })),
    buildings: defenseLayoutFromBase(buildings, campus.walls.slice(0, wallCap(stadiumLevel)), defenseTroopBoost(roster) * masteryDefMult(holds), emplacements, campus.bus, parkingLot, wallHpFor(stadiumLevel), campus.formation),
    roster,
    heroStates: heroes,
    heroGates,
    assignedHeroes,
    equipment,
    bonusDefSlots: source.bonusDefSlots,
    mastery: { formation: campus.formation, holds, tier: masteryLevel(holds) },
    crowd: { fans, parkingLot },
    homeGuards: [...homeDefenders(roster, parkingLot), ...assignedHeroes.map(a => a.guard)],
  };
  return clone({ ...snapshot, snapshotId: reference(snapshot) });
}

export function defenseBattleFields(snapshot: DefenseSnapshot): Pick<BattleConfig, 'buildings' | 'homeGuards' | 'fans' | 'parkingLot' | 'masteryTier' | 'defenseLayoutId' | 'defenseSnapshotId' | 'defenseFormation'> {
  return {
    buildings: clone(snapshot.buildings),
    homeGuards: clone(snapshot.homeGuards),
    fans: snapshot.crowd.fans,
    parkingLot: snapshot.crowd.parkingLot,
    masteryTier: snapshot.mastery.tier,
    defenseLayoutId: snapshot.layoutId,
    defenseSnapshotId: snapshot.snapshotId,
    defenseFormation: snapshot.campus.formation,
  };
}
