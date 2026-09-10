import { EQUIPMENT_COUNTERS } from '../game/combat/defenseCounters';
import { describe, expect, it } from 'vitest';
import { DEFENSE_TYPES, EXTRA_SLOT_COSTS } from '../constants';
import { MAX_SLOT_LEVEL, masteryDefMult, slotDmgMult, slotHpMult, slotUpgradeCost, slotsFor } from '../fixedBase';
import { defenseLayoutFromBase } from '../battle';
import { defenseTroopBoost } from '../defense';
import { createBattleEngine } from '../game/combat/engine';
import { applyClubAction } from '../game/authority/clubActions';
import { applyCampusLayout, templateCampusLayout } from '../game/campusLayout';
import { LEGACY_DEFENSE_BEHAVIOUR as DEFENSE_BEHAVIOUR } from '../game/progression/equipmentModel';
import { crownSlotPurchase, equipmentModel, equipmentRoster, type EquipmentKind } from '../game/progression';
import { UnitGroup } from '../types';
import { NOW, act, context, equipmentBase, equipmentLockedButLevelled, equipmentMaxed, equipmentStadium4, equipmentWithCrown } from './fixtures/progression';

describe('equipment statuses and gates', () => {
  it('installed, preview and unavailable follow the slot gate and the stored level', () => {
    const s = equipmentBase(); // Stadium 1, D1 level 1
    expect(equipmentModel(s, 'D1')).toMatchObject({ status: 'installed', level: 1, fielded: true, gate: { kind: 'stadium', required: 1, met: true } });
    expect(equipmentModel(s, 'D3')).toMatchObject({ status: 'unavailable', level: 0, fielded: false, gate: { kind: 'stadium', required: 2, current: 1, met: false }, current: null });
    expect(equipmentModel(s, 'C1')).toMatchObject({ status: 'unavailable', gate: { kind: 'crown', index: 0, costGems: EXTRA_SLOT_COSTS[0], purchased: false, met: false } });
    expect(equipmentModel(equipmentStadium4(), 'D3')).toMatchObject({ status: 'preview', level: 0, current: null, next: { toLevel: 1, costCoins: DEFENSE_TYPES.find(d => d.kind === 'ref')!.cost, canUpgrade: true } });
    expect(equipmentModel(equipmentWithCrown(), 'C1')).toMatchObject({ status: 'preview', gate: { kind: 'crown', purchased: true, met: true } });
    expect(equipmentModel(equipmentWithCrown(), 'C2')).toMatchObject({ status: 'unavailable' });
    expect(equipmentModel(s, 'Z9')).toBeNull();
    expect(equipmentRoster(s).map(e => e.slotId)).toEqual(slotsFor('goalline').map(x => x.id));
  });

  it('a levelled slot behind a locked gate is not fielded (mirrors the defense snapshot filter)', () => {
    const m = equipmentModel(equipmentLockedButLevelled(), 'D3')!;
    expect(m.level).toBe(2);
    expect(m.status).toBe('unavailable');
    expect(m.fielded).toBe(false);
    expect(m.next?.blockers).toEqual([{ code: 'locked', message: 'Unlock this slot or upgrade the Stadium first.' }]);
  });

  it('location comes from the campus layout, coverage text from fixedBase', () => {
    const s = equipmentBase();
    const d1 = slotsFor('goalline').find(x => x.id === 'D1')!;
    expect(equipmentModel(s, 'D1')!.location).toEqual({ gridX: d1.gridX, gridY: d1.gridY, covers: d1.covers, formation: 'goalline' });
    const layout = templateCampusLayout('goalline', s.buildings);
    const d1Placed = layout.slots.find(x => x.id === 'D1')!;
    d1Placed.gridX = 3; d1Placed.gridY = 1; // open tile between the War Room block and the north gate
    const moved = applyCampusLayout(s, layout);
    expect(equipmentModel(moved, 'D1')!.location).toMatchObject({ gridX: 3, gridY: 1, covers: d1.covers });
    const cover3 = { ...s, formation: 'cover3' as const };
    expect(equipmentModel(cover3, 'D1')!.location.covers).toBe(slotsFor('cover3').find(x => x.id === 'D1')!.covers);
  });
});

describe('equipment numbers come from the real layout builder and the authority', () => {
  it.each(slotsFor('goalline').map(s => s.id))('%s: current and next stats equal defenseLayoutFromBase, and level scaling matches slotHpMult/slotDmgMult', slotId => {
    const s = { ...equipmentStadium4(), bonusDefSlots: 3, defenseSlots: { [slotId]: 3 } };
    const m = equipmentModel(s, slotId)!;
    const slot = slotsFor('goalline').find(x => x.id === slotId)!;
    const at = (level: number) => defenseLayoutFromBase([], [], 1, [{ ...slot, level }])[0];
    expect(m.current).toMatchObject({ level: 3, durability: at(3).hp, damage: at(3).damage });
    expect(m.next).toMatchObject({ toLevel: 4, stats: { durability: at(4).hp, damage: at(4).damage } });
    expect(m.next!.delta.durability).toBe(at(4).hp - at(3).hp);
    const def = DEFENSE_TYPES.find(d => d.kind === slot.kind)!;
    expect(m.current!.durability).toBe(Math.round(def.hp * slotHpMult(3)));
    expect(m.current!.damage).toBe(Math.round(def.damage * slotDmgMult(3)));
    expect(m.behaviour.range).toBe(def.range);
    expect(m.next!.costCoins).toBe(slotUpgradeCost(slot.kind, 4));
    expect(m.next!.stats.sustainedDamagePerSecond).toBeCloseTo(at(4).damage! * m.behaviour.hitDamageMult / (m.behaviour.cooldownSeconds + EQUIPMENT_COUNTERS[m.kind].windup), 9);
  });

  it('upgrade cost and blockers match defense.upgrade-slot', () => {
    const s = equipmentStadium4();
    const m = equipmentModel(s, 'D1')!;
    const receipt = act(s, { type: 'defense.upgrade-slot', slotId: 'D1' }).result;
    expect(receipt).toEqual({ type: 'defense.upgrade-slot', toLevel: m.next!.toLevel, spent: { COINS: m.next!.costCoins } });
    // Stadium cap: level may not exceed the Stadium level.
    const capped = { ...s, defenseSlots: { D1: 4 } };
    expect(equipmentModel(capped, 'D1')!.next?.blockers).toEqual([{ code: 'locked', message: 'Unlock this slot or upgrade the Stadium first.' }]);
    expect(applyClubAction(capped, { type: 'defense.upgrade-slot', slotId: 'D1' }, context())).toMatchObject({ ok: false, code: 'locked' });
    // Coins.
    const broke = { ...s, resources: { ...s.resources, COINS: 10 } };
    expect(equipmentModel(broke, 'D1')!.next).toMatchObject({ affordable: false, shortfallCoins: slotUpgradeCost('jugs', 2) - 10, blockers: [{ code: 'insufficient_resources', message: 'Not enough coins.' }] });
    expect(applyClubAction(broke, { type: 'defense.upgrade-slot', slotId: 'D1' }, context())).toMatchObject({ ok: false, code: 'insufficient_resources' });
    // Maximum level.
    const maxed = equipmentModel(equipmentMaxed(), 'D1')!;
    expect(maxed.level).toBe(MAX_SLOT_LEVEL);
    expect(maxed.next).toBeNull();
    expect(applyClubAction(equipmentMaxed(), { type: 'defense.upgrade-slot', slotId: 'D1' }, context())).toMatchObject({ ok: false, code: 'limit_reached' });
  });

  it('boosted numbers apply the live layout multiplier (roster tendencies × formation mastery)', () => {
    const s = { ...equipmentBase(), formationMastery: { goalline: 8 } };
    const m = equipmentModel(s, 'D1')!;
    const boost = defenseTroopBoost(s.roster) * masteryDefMult(8);
    expect(m.boost).toBeCloseTo(boost, 12);
    const slot = slotsFor('goalline').find(x => x.id === 'D1')!;
    const live = defenseLayoutFromBase([], [], boost, [{ ...slot, level: 1 }])[0];
    expect(m.currentBoosted).toMatchObject({ durability: live.hp, damage: live.damage });
  });

  it('crown slot purchase mirrors defense.buy-slot', () => {
    expect(crownSlotPurchase(equipmentBase())).toMatchObject({ purchased: 0, max: 3, nextCostGems: EXTRA_SLOT_COSTS[0], canBuy: true });
    expect(crownSlotPurchase({ ...equipmentBase(), bonusDefSlots: 3 })).toMatchObject({ nextCostGems: null, canBuy: false, blockers: [{ code: 'limit_reached', message: 'All extra equipment slots are unlocked.' }] });
    expect(crownSlotPurchase({ ...equipmentBase(), resources: { ...equipmentBase().resources, GEMS: 1 } }).blockers).toEqual([{ code: 'insufficient_resources', message: 'Not enough Crowns.' }]);
  });
});

describe('equipment behaviour matches the combat engine', () => {
  const firstShot = (kind: EquipmentKind) => {
    const def = DEFENSE_TYPES.find(d => d.kind === kind)!;
    const engine = createBattleEngine({
      authority:{matchId:'legacy',seed:5,rules:'hero-actions-3',issuedAt:0,expiresAt:1}, mode: 'attack', title: 'turret probe', loot: { coins: 0, fans: 0 },
      playerArmy: { [UnitGroup.OFFENSE_LINE]: 1, [UnitGroup.OFFENSE_SKILL]: 0, [UnitGroup.DEFENSE_LINE]: 0, [UnitGroup.DEFENSE_SECONDARY]: 0 },
      buildings: [
        { id: 'hq', kind: 'hq', x: 50, y: 30, size: 8, hp: 100000 },
        { id: 'probe', kind: 'defense', flavor: kind, x: 50, y: 60, size: 5, hp: 100000, damage: def.damage, range: def.range },
      ],
    }, 5);
    expect(engine.command({ k: 't', u: UnitGroup.OFFENSE_LINE, x: 50, y: 74, tick: 0 })).toBe(true); // exactly 14 from the turret
    const troop = engine.state.troops[0];
    const hpBefore = troop.hp;
    const turret = engine.state.buildings.find(b => b.id === 'probe')!;
    for (let i = 0; i < 60; i++) {
      engine.advance();
      if (turret.cooldown > 0) return { cooldown: turret.cooldown, hit: hpBefore - troop.hp, slowT: troop.slowT ?? 0, puddles: engine.state.puddles.map(p => ({ r: p.r, life: p.maxLife })), damage: def.damage };
    }
    throw new Error(`${kind} never fired`);
  };

  it.each(Object.keys(DEFENSE_BEHAVIOUR) as EquipmentKind[])('%s: first-shot cooldown, hit and slow equal DEFENSE_BEHAVIOUR', kind => {
    const b = DEFENSE_BEHAVIOUR[kind];
    const shot = firstShot(kind);
    expect(shot.cooldown).toBeCloseTo(b.cooldownSeconds, 9);
    expect(shot.hit).toBeCloseTo(shot.damage * b.hitDamageMult, 9);
    if (b.slow) expect(shot.slowT).toBeCloseTo(b.slow.seconds, 9);
    else if (b.puddle) {
      expect(shot.puddles).toEqual([{ r: b.puddle.radius, life: b.puddle.lifeSeconds }]);
      expect(shot.slowT).toBeCloseTo(b.puddle.slowSecondsWhileInside, 9); // the runner stands in the fresh puddle
    } else expect(shot.slowT).toBe(0);
    expect(b.range).toBe(DEFENSE_TYPES.find(d => d.kind === kind)!.range);
  });

  it('a Ref flag overwrites a longer slow while every other slow extends it', () => {
    expect(DEFENSE_BEHAVIOUR.ref.slow?.apply).toBe('overwrite');
    expect(DEFENSE_BEHAVIOUR.tshirt.slow?.apply).toBe('extend');
    const engine = createBattleEngine({
      authority:{matchId:'legacy',seed:5,rules:'hero-actions-3',issuedAt:0,expiresAt:1}, mode: 'attack', title: 'overwrite probe', loot: { coins: 0, fans: 0 },
      playerArmy: { [UnitGroup.OFFENSE_LINE]: 1, [UnitGroup.OFFENSE_SKILL]: 0, [UnitGroup.DEFENSE_LINE]: 0, [UnitGroup.DEFENSE_SECONDARY]: 0 },
      buildings: [
        { id: 'hq', kind: 'hq', x: 50, y: 30, size: 8, hp: 100000 },
        { id: 'probe', kind: 'defense', flavor: 'ref', x: 50, y: 60, size: 5, hp: 100000, damage: 1, range: 30 },
      ],
    }, 5);
    engine.command({ k: 't', u: UnitGroup.OFFENSE_LINE, x: 50, y: 74, tick: 0 });
    const troop = engine.state.troops[0];
    troop.slowT = 9; // a longer stall (crowd, timeout) already running
    engine.advance();
    expect(troop.slowT).toBeCloseTo(2.2 - 0, 9); // the flag replaced the 9 s timer this tick
  });
});
