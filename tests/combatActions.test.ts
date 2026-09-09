import { describe, expect, it } from 'vitest';
import { HERO_DEFS, heroForBattle, type BBuilding, type BTroop } from '../battle';
import { applyBuildingYardage, applyTroopPressure, beginHeroAction, stepHeroActions, actionFlight, actionFinished, type CombatEvent, type HeroAction } from '../game/combat/actions';

const hero = (key = 'qb'): BTroop => {
  const kit = heroForBattle(HERO_DEFS.find(h => h.key === key)!, 1);
  return { ...kit, id: key, heroKey: key, isHero: true, x: 20, y: 70, maxHp: kit.hp, dead: false, targetId: null, hitFlash: 0, rageT: 0, healT: 0 };
};
const facility = (id = 'target', hp = 1000, x = 40, y = 55): BBuilding => ({ id, kind: 'building', hp, maxHp: hp, size: 8, x, y, dead: false, cooldown: 0 });
const advance = (action: HeroAction, troops: BTroop[], buildings: BBuilding[], seconds: number): CombatEvent[] => {
  const events: CombatEvent[] = [];
  for (let tick = 0; tick < Math.round(seconds / .05); tick++) events.push(...stepHeroActions([action], troops, buildings, .05));
  return events;
};

describe('timed signature actions', () => {
  it('plants, releases, flies, and only applies yardage on contact', () => {
    const actor = hero(), target = facility();
    const action = beginHeroAction(actor, [target], 0)!;
    expect(actor.activeAction).toBe(action.id);
    expect(actor.actionPoseT ?? 0).toBe(0);
    advance(action, [actor], [target], .3);
    expect(action.released).toBe(false);
    expect(target.hp).toBe(1000);
    const released = advance(action, [actor], [target], .05);
    expect(released.filter(e => e.type === 'signature-release')).toHaveLength(1);
    expect(actor.actionPoseT).toBe(.3);
    expect(actionFlight(action)).toBeCloseTo(0);
    advance(action, [actor], [target], .25);
    expect(actionFlight(action)).toBeGreaterThan(0);
    expect(target.hp).toBe(1000);
    const impact = advance(action, [actor], [target], .3);
    expect(target.hp).toBe(1000 - 300 - actor.dps * 4);
    expect(actor.dmg).toBe(300 + actor.dps * 4);
    expect(impact.filter(e => e.type === 'signature-impact')).toHaveLength(1);
    const once = actor.dmg;
    advance(action, [actor], [target], 1);
    expect(actor.dmg).toBe(once);
    expect(actionFinished(action)).toBe(true);
    expect(actor.activeAction).toBeUndefined();
  });

  it('ignores repeated taps, cooldowns, missing targets and knocked-out actors', () => {
    const actor = hero(), target = facility();
    expect(beginHeroAction(actor, [], 0)).toBeNull();
    expect(beginHeroAction(actor, [target], 0)).not.toBeNull();
    expect(beginHeroAction(actor, [target], 0)).toBeNull();
    actor.activeAction = undefined;
    expect(beginHeroAction(actor, [target], 1)).toBeNull();
    actor.abilityCd = 0; actor.dead = true;
    expect(beginHeroAction(actor, [target], 2)).toBeNull();
  });

  it('cancels a windup on KO, but a released ball remains in play', () => {
    const actor = hero(), target = facility();
    const canceled = beginHeroAction(actor, [target], 0)!;
    actor.dead = true;
    expect(advance(canceled, [actor], [target], .05)).toEqual([]);
    expect(actionFinished(canceled)).toBe(true);
    expect(target.hp).toBe(1000);
    actor.dead = false; actor.abilityCd = 0;
    const released = beginHeroAction(actor, [target], 1)!;
    advance(released, [actor], [target], .35);
    actor.dead = true;
    advance(released, [actor], [target], 1);
    expect(target.hp).toBeLessThan(1000);
  });

  it('credits only remaining yardage and emits exactly one sack, including simultaneous hits', () => {
    const first = hero(), second = hero('kicker'), target = facility('hq', 25);
    target.kind = 'hq';
    expect(applyBuildingYardage(first, target, 500).map(e => e.type)).toEqual(['yardage', 'sacked']);
    expect(first.dmg).toBe(25);
    expect(target.hp).toBe(0);
    expect(applyBuildingYardage(second, target, 500)).toEqual([]);
    expect(second.dmg ?? 0).toBe(0);
  });

  it('does not damage a replacement target if the chosen target falls during flight', () => {
    const actor = hero(), target = facility('first', 25), other = facility('other');
    const action = beginHeroAction(actor, [target, other], 0)!;
    applyBuildingYardage(hero('enforcer'), target, 100);
    const events = advance(action, [actor], [target, other], 2);
    expect(other.hp).toBe(1000);
    expect(events.filter(e => e.type === 'sacked')).toHaveLength(0);
  });

  it('routes primary and splash damage through the same accounting boundary', () => {
    const actor = hero('kicker'), primary = facility('first', 100), nearby = facility('near', 600, 44, 55), far = facility('far', 1000, 95, 95);
    const action = beginHeroAction(actor, [primary, nearby, far], 0)!;
    const events = advance(action, [actor], [primary, nearby, far], 2);
    expect(primary.hp).toBe(0); expect(nearby.hp).toBe(350); expect(far.hp).toBe(1000);
    expect(actor.dmg).toBe(350);
    expect(events.filter(e => e.type === 'sacked')).toHaveLength(1);
  });

  it('activates Jet Sweep without teleporting through intervening walls', () => {
    const actor = hero('burner'), target = facility();
    const before = { x: actor.x, y: actor.y };
    const action = beginHeroAction(actor, [target], 0)!;
    advance(action, [actor], [target], .25);
    expect({ x: actor.x, y: actor.y }).toEqual(before);
    expect(actor.sprintT).toBe(2.5);
    expect(actor.rageT).toBe(2.5);
  });

  it('caps healing to actual missing grit and does not revive knocked-out players', () => {
    const actor = hero('medic'), ally = hero('qb'), knockedOut = hero('burner');
    ally.hp -= 20; knockedOut.hp = 0; knockedOut.dead = true;
    const action = beginHeroAction(actor, [], 0)!;
    advance(action, [actor, ally, knockedOut], [], .25);
    expect(ally.hp).toBe(ally.maxHp); expect(actor.healingDone).toBe(20);
    expect(ally.healingSource).toBe(actor.id); expect(knockedOut.hp).toBe(0);
  });

  it('credits only pressure the Captain actually prevents', () => {
    const actor = hero('captain'), ally = hero('qb');
    const action = beginHeroAction(actor, [], 0)!;
    advance(action, [actor, ally], [], .25);
    expect(applyTroopPressure(ally, 40, [actor, ally])).toBe(20);
    expect(actor.protectionDone).toBe(20);
    ally.hp = 5;
    expect(applyTroopPressure(ally, 40, [actor, ally])).toBe(5);
    expect(actor.protectionDone).toBe(20); // both shielded and unshielded would lose the remaining 5
  });

  it.each(HERO_DEFS.map(h => h.key))('resolves %s exactly once with fixed-step input', key => {
    const actor = hero(key), target = facility();
    actor.hp *= .5;
    const action = beginHeroAction(actor, [target], 0)!;
    const events = advance(action, [actor], [target], 3);
    expect(events.filter(e => e.type === 'signature-release')).toHaveLength(1);
    expect(events.filter(e => e.type === 'signature-impact')).toHaveLength(1);
    expect(actionFinished(action)).toBe(true);
  });

  it('repeats the same event sequence for the same fixture and commands', () => {
    const run = () => { const actor = hero(), target = facility(); return advance(beginHeroAction(actor, [target], 8)!, [actor], [target], 2); };
    expect(run()).toEqual(run()); // isolated action determinism, not a claim of full-engine replay parity
  });
});
