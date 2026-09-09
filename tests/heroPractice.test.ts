import { describe, expect, it } from 'vitest';
import { heroPracticeConfig, isNonProgressionBattle, canRefundRaidEnergy } from '../game/combat/practice';
import { rosterTroop, rosterPreparation, routeRefreshSeconds } from '../game/combat/roster';
import { HERO_DEFS, unitCombatStats } from '../battle';
import { INITIAL_ROSTER } from '../constants';

describe('practice isolation', () => {
  it.each(HERO_DEFS.map(h => h.key))('offers %s without unlocking or spending anything', key => {
    const practice = heroPracticeConfig(key);
    expect(practice.practice).toBe(true);
    expect(practice.heroes?.[0].key).toBe(key);
    expect(new Set(practice.heroes?.map(h => h.key)).size).toBe(2);
    expect(practice.loot).toEqual({ coins: 0, fans: 0 });
    expect(practice.pvpTarget).toBeUndefined();
    expect(practice.campaignStage).toBeUndefined();
    expect(practice.gauntlet).toBeUndefined();
  });

  it('starts retries with fresh hero, roster, layout and inventory objects', () => {
    const first = heroPracticeConfig('qb');
    first.squad![0].stats.strength = 999;
    first.heroes![0].hp = 0;
    first.buildings[0].hp = 0;
    const next = heroPracticeConfig('qb');
    expect(next.squad![0].stats.strength).not.toBe(999);
    expect(INITIAL_ROSTER[0].stats.strength).not.toBe(999);
    expect(next.heroes![0].hp).toBeGreaterThan(0);
    expect(next.buildings[0].hp).toBeGreaterThan(0);
  });

  it('blocks progression using either result flags or active configuration', () => {
    expect(isNonProgressionBattle({ isPractice: true }, null)).toBe(true);
    expect(isNonProgressionBattle({}, { practice: true })).toBe(true);
    expect(isNonProgressionBattle({ isReplay: true }, null)).toBe(true);
    expect(isNonProgressionBattle({}, null)).toBe(false);
  });

  it('never refunds uncharged practice, replay or defense energy', () => {
    expect(canRefundRaidEnergy(true, heroPracticeConfig('qb'))).toBe(false);
    expect(canRefundRaidEnergy(true, { mode: 'defense' })).toBe(false);
    expect(canRefundRaidEnergy(true, { mode: 'attack', replay: { seed: 0, script: [], planKey: 'balanced' } })).toBe(false);
    expect(canRefundRaidEnergy(false, { mode: 'attack' })).toBe(false);
    expect(canRefundRaidEnergy(true, { mode: 'attack' })).toBe(true);
  });
});

describe('individual roster stats', () => {
  it('fields individual stats instead of the position-group average', () => {
    const player = structuredClone(INITIAL_ROSTER[0]);
    const expected = unitCombatStats(player);
    const troop = rosterTroop(player, 'named', 10, 80, 1.15, 12);
    expect(troop.nameTag).toBe(player.name); expect(troop.role).toBe(player.role);
    expect(troop.hp).toBe(Math.round(expected.hp * 1.15));
    expect(troop.dps).toBeCloseTo(expected.dps * 1.15);
    expect(troop.speed).toBe(expected.speed);
    expect(troop.chargeRate).toBe(expected.chargeRate);
  });

  it('changes strength, speed and route awareness independently', () => {
    const player = structuredClone(INITIAL_ROSTER[0]);
    const base = rosterTroop(player, 'base', 0, 0);
    player.stats.strength += 30;
    const stronger = rosterTroop(player, 'stronger', 0, 0);
    expect(stronger.hp).toBeGreaterThan(base.hp); expect(stronger.dps).toBeGreaterThan(base.dps);
    player.stats.speed += 30;
    expect(rosterTroop(player, 'faster', 0, 0).speed).toBeGreaterThan(base.speed);
    player.stats.iq += 30;
    expect(routeRefreshSeconds(rosterTroop(player, 'aware', 0, 0))).toBeLessThan(routeRefreshSeconds(base));
  });

  it('keeps group preparation independent of individual stat training', () => {
    const roster = structuredClone(INITIAL_ROSTER);
    const before = rosterPreparation(roster);
    roster[0].stats.strength += 50;
    expect(rosterPreparation(roster)).toEqual(before);
    expect(rosterPreparation(roster, 100)[roster[0].unit]).toBeCloseTo(before[roster[0].unit] * 1.15);
  });
});
