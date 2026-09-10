import { describe, expect, it } from 'vitest';
import { ABILITY_CD, HERO_DEFS, heroForBattle, heroMaxLevel, heroUpgradeCost, type BBuilding, type BTroop } from '../battle';
import { MAX_STARS, STAR_UP_COSTS } from '../gacha';
import { beginHeroAction, stepHeroActions } from '../game/combat/actions';
import { createBattleEngine } from '../game/combat/engine';
import { heroPracticeConfig } from '../game/combat/practice';
import { applyClubAction } from '../game/authority/clubActions';
import { HERO_ABILITY_FACTS, heroProgression, heroProgressionRoster, heroTrainingPreview, heroTrainingSeconds } from '../game/progression';
import { NOW, act, context, heroCompleted, heroCompletedNow, heroInsufficient, heroLegacySave, heroLocked, heroMaxStars, heroMaxed, heroMissingSave, heroOwned, heroRecruitable, heroStarReady, heroTraining, otherAccount, withCoins, withHero, withStadium, baseState } from './fixtures/progression';

const model = (s: ReturnType<typeof baseState>, key: string, now = NOW) => heroProgression(s, key, now)!;

describe('hero progression states resolve from live state', () => {
  it('locked vs recruitable follows hero.unlock affordability', () => {
    const locked = model(heroLocked(), 'medic');
    expect(locked.status).toBe('locked');
    expect(locked.unlock).toMatchObject({ coins: 8000, gems: 0, affordable: false, shortfall: { coins: 8000, gems: 0 } });
    expect(locked.blockers).toContainEqual({ action: 'unlock', code: 'insufficient_resources', message: 'Not enough coins or Crowns.' });
    const recruitable = model(heroRecruitable(), 'medic');
    expect(recruitable.status).toBe('recruitable');
    expect(recruitable.canUnlock).toBe(true);
    expect(model(heroRecruitable(), 'legend').status).toBe('locked'); // 120 gems short
    expect(model(heroRecruitable(), 'legend').unlock?.shortfall).toEqual({ coins: 0, gems: 120 });
  });

  it('owned, insufficient-resource, maxed', () => {
    expect(model(heroOwned(), 'qb').status).toBe('owned');
    expect(model(heroOwned(), 'qb').canTrain).toBe(true);
    const broke = model(heroInsufficient(), 'qb');
    expect(broke.status).toBe('insufficient-resource');
    expect(broke.nextLevel?.shortfallCoins).toBe(heroUpgradeCost(1));
    expect(broke.blockers).toContainEqual({ action: 'train', code: 'insufficient_resources', message: 'Not enough coins.' });
    const maxed = model(heroMaxed(), 'qb');
    expect(maxed.status).toBe('maxed');
    expect(maxed.nextLevel).toBeNull();
    expect(maxed.maxLevel).toBe(heroMaxLevel(1));
    expect(maxed.stadiumGate).toEqual({ atMax: true, nextStadiumLevel: 2, maxLevelAtNextStadium: heroMaxLevel(2) });
    expect(maxed.blockers).toContainEqual({ action: 'train', code: 'locked', message: 'Upgrade the Stadium to train this hero further.' });
    // Raising the Stadium reopens the ladder without touching the hero.
    expect(model(withStadium(heroMaxed(), 2), 'qb').status).toBe('owned');
  });

  it('training and completed come from the job in state.upgrades, keyed by hero', () => {
    const s = heroTraining();
    const qb = model(s, 'qb');
    expect(qb.status).toBe('training');
    expect(qb.training).toMatchObject({ jobId: s.upgrades[0].id, toLevel: 2, complete: false });
    expect(qb.training?.remainingSeconds).toBe(heroTrainingSeconds(2));
    expect(qb.blockers).toContainEqual({ action: 'train', code: 'busy', message: 'This hero is already training.' });
    // A different hero selected in the UI must not inherit the running job.
    expect(model(s, 'enforcer').training).toBeNull();
    expect(model(s, 'enforcer').status).toBe('owned');
    // Due but unsettled: the state still lists the job.
    const due = model(heroCompleted(), 'qb', heroCompletedNow());
    expect(due.status).toBe('completed');
    expect(due.training?.complete).toBe(true);
    expect(due.level).toBe(1);
    // Settled by the authority clock → the job is gone and the level is real.
    const settled = act(heroCompleted(), { type: 'sync' }, context(heroCompletedNow())).state;
    expect(model(settled, 'qb', heroCompletedNow())).toMatchObject({ status: 'owned', level: 2, training: null });
  });

  it('star-up mirrors hero.star', () => {
    const ready = model(heroStarReady(), 'qb');
    expect(ready.nextStar).toMatchObject({ stars: 3, shardCost: STAR_UP_COSTS[2], shardsHave: 60, shardsShort: 0, affordable: true });
    expect(ready.canStarUp).toBe(true);
    const short = model(withHero(heroOwned(), 'qb', { stars: 2, shards: 10 }), 'qb');
    expect(short.nextStar?.shardsShort).toBe(STAR_UP_COSTS[2] - 10);
    expect(short.blockers).toContainEqual({ action: 'star', code: 'insufficient_resources', message: 'Not enough hero shards.' });
    const maxed = model(heroMaxStars(), 'qb');
    expect(maxed.nextStar).toBeNull();
    expect(maxed.stars).toBe(MAX_STARS);
    expect(maxed.blockers).toContainEqual({ action: 'star', code: 'limit_reached', message: 'This hero has reached maximum stars.' });
    expect(model(heroLocked(), 'medic').blockers).toContainEqual({ action: 'star', code: 'locked', message: 'Unlock this hero first.' });
  });
});

describe('hero deltas come from the real helpers', () => {
  it.each(HERO_DEFS.map(h => h.key))('%s: next-level and next-star deltas equal heroForBattle differences; speed and range never move', key => {
    const def = HERO_DEFS.find(h => h.key === key)!;
    for (let level = 1; level <= 8; level++) for (let stars = 1; stars <= 4; stars++) {
      const s = withHero(withStadium(withCoins(baseState(), 1e9, 1e6), 10), key, { unlocked: true, level, stars, shards: 1000 });
      const m = model(s, key);
      const now = heroForBattle(def, level, stars), lvl = heroForBattle(def, level + 1, stars), star = heroForBattle(def, level, stars + 1);
      expect(m.current.grit).toBe(now.hp);
      expect(m.current.yardage).toBe(now.dps);
      expect(m.nextLevel!.delta.grit).toBe(lvl.hp - now.hp);
      expect(m.nextLevel!.delta.yardage).toBeCloseTo(lvl.dps - now.dps, 9);
      expect(m.nextLevel!.delta.speed).toBe(0);
      expect(m.nextLevel!.delta.range).toBe(0);
      expect(m.nextStar!.delta.grit).toBe(star.hp - now.hp);
      expect(m.nextStar!.delta.yardage).toBeCloseTo(star.dps - now.dps, 9);
      expect(m.nextStar!.delta.speed).toBe(0);
      expect(m.nextStar!.stats.speed).toBe(def.speed);
      expect(Number.isInteger(m.current.grit)).toBe(true); // rounding lives in heroForBattle, not here
      expect(m.nextLevel!.costCoins).toBe(heroUpgradeCost(level));
      expect(m.nextLevel!.durationSeconds).toBe(heroTrainingSeconds(level + 1));
    }
  });

  it('cost and duration equal what hero.train actually charges and schedules', () => {
    for (const level of [1, 2, 5, 9]) {
      const s = withHero(withStadium(withCoins(baseState(), 1e9), 10), 'qb', { level });
      const m = model(s, 'qb');
      const outcome = applyClubAction(s, { type: 'hero.train', heroKey: 'qb' }, context(NOW));
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.result.spent).toEqual({ COINS: m.nextLevel!.costCoins });
      expect(outcome.state.upgrades[0].finishTime - NOW).toBe(m.nextLevel!.durationSeconds * 1000);
      expect(outcome.result.toLevel).toBe(m.nextLevel!.level);
    }
  });

  it('range matches the engine\'s fielded hero, not HERO_DEFS where the engine overrides it', () => {
    for (const def of HERO_DEFS) {
      const engine = createBattleEngine(heroPracticeConfig(def.key), 11);
      expect(engine.command({ k: 'h', key: def.key, x: 8, y: 80, tick: 0 })).toBe(true);
      const troop = engine.state.troops.find(t => t.heroKey === def.key)!;
      const m = model(withHero(baseState(), def.key, { unlocked: true }), def.key);
      expect(m.current.range).toBe(troop.range);
      expect(m.current.speed).toBe(troop.speed);
      expect(m.current.grit).toBe(troop.maxHp);
      expect(m.ability.cooldownSeconds).toBe(ABILITY_CD);
    }
    expect(model(baseState(), 'qb').current.range).not.toBe(HERO_DEFS.find(h => h.key === 'qb')!.range);
    expect(model(baseState(), 'kicker').current.range).not.toBe(HERO_DEFS.find(h => h.key === 'kicker')!.range);
  });

  it('ability facts cover every ability and match the action code: Onside Bomb is fixed, Hail Mary scales with yardage', () => {
    for (const def of HERO_DEFS) expect(HERO_ABILITY_FACTS[def.ability]).toBeDefined();
    const fire = (key: string, level: number) => {
      const kit = heroForBattle(HERO_DEFS.find(h => h.key === key)!, level);
      const actor: BTroop = { ...kit, id: key, heroKey: key, isHero: true, x: 20, y: 70, maxHp: kit.hp, dead: false, targetId: null, hitFlash: 0, rageT: 0, healT: 0 };
      const target: BBuilding = { id: 'target', kind: 'building', hp: 100000, maxHp: 100000, size: 8, x: 40, y: 55, dead: false, cooldown: 0 };
      const action = beginHeroAction(actor, [target], 0)!;
      for (let tick = 0; tick < 60; tick++) stepHeroActions([action], [actor], [target], 0.05);
      return { yards: 100000 - target.hp, dps: kit.dps };
    };
    const bombLow = fire('kicker', 1), bombHigh = fire('kicker', 8);
    expect(bombLow.yards).toBe(500);
    expect(bombHigh.yards).toBe(500);
    expect(HERO_ABILITY_FACTS.onside_bomb.scalesWith).toBe('none');
    const hmLow = fire('qb', 1), hmHigh = fire('qb', 8);
    expect(hmLow.yards).toBe(300 + 4 * hmLow.dps);
    expect(hmHigh.yards - hmLow.yards).toBeCloseTo(4 * (hmHigh.dps - hmLow.dps), 9);
    expect(HERO_ABILITY_FACTS.hailmary.scalesWith).toBe('yardage');
  });
});

describe('hero training preview', () => {
  it('is labelled a preview and only confirms from the state', () => {
    const idle = heroTrainingPreview(heroOwned(), 'qb', NOW)!;
    expect(idle).toMatchObject({ kind: 'preview', fromLevel: 1, toLevel: 2, confirmed: false, pendingSettlement: false, job: null, costCoins: heroUpgradeCost(1) });
    expect(idle.after.grit - idle.before.grit).toBe(idle.delta.grit);
    const running = heroTrainingPreview(heroTraining(), 'qb', NOW)!;
    expect(running.job?.toLevel).toBe(2);
    expect(running.confirmed).toBe(false);
    const due = heroTrainingPreview(heroCompleted(), 'qb', heroCompletedNow())!;
    expect(due.pendingSettlement).toBe(true);
    expect(due.confirmed).toBe(false);
    const settled = act(heroCompleted(), { type: 'sync' }, context(heroCompletedNow())).state;
    const confirmed = heroTrainingPreview(settled, 'qb', heroCompletedNow(), 2)!;
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.job).toBeNull();
    // The next preview after settlement targets level 3 and is unconfirmed again.
    expect(heroTrainingPreview(settled, 'qb', heroCompletedNow())).toMatchObject({ fromLevel: 2, toLevel: 3, confirmed: false });
  });
});

describe('hero model purity and legacy saves', () => {
  it('does not mutate the state and carries nothing across accounts', () => {
    const a = heroTraining();
    const snapshot = JSON.stringify(a);
    const aModel = model(a, 'qb');
    const b = otherAccount();
    const bModel = model(b, 'qb', NOW + 1);
    expect(JSON.stringify(a)).toBe(snapshot);
    expect(aModel.training).not.toBeNull();
    expect(bModel.training).toBeNull();
    expect(bModel).toMatchObject({ level: 4, stars: 2, shards: 12, stadiumLevel: 3, maxLevel: heroMaxLevel(3) });
    expect(bModel.nextLevel?.affordable).toBe(false); // 123 coins
    expect(model(b, 'medic', NOW + 1).owned).toBe(true);
    expect(model(a, 'medic').owned).toBe(false);
  });

  it('reads old saves: starters owned, unlockables locked, no upgrades field means no training', () => {
    const roster = heroProgressionRoster(heroLegacySave(), NOW);
    expect(roster).toHaveLength(HERO_DEFS.length);
    for (const m of roster) {
      expect(m.owned).toBe(!!HERO_DEFS.find(h => h.key === m.key)!.starter);
      expect(m.training).toBeNull();
      expect(m.stars).toBe(1);
      expect(m.shards).toBe(0);
    }
  });

  it('reports a hero the club has never seen as not present, with the authority\'s not_found reason', () => {
    const m = model(heroMissingSave(), 'legend');
    expect(m.present).toBe(false);
    expect(m.status).toBe('locked');
    expect(m.canUnlock).toBe(false);
    expect(m.blockers).toContainEqual({ action: 'unlock', code: 'not_found', message: 'That hero cannot be unlocked here.' });
    expect(applyClubAction(heroMissingSave(), { type: 'hero.unlock', heroKey: 'legend' }, context())).toMatchObject({ ok: false, code: 'not_found' });
    expect(heroProgression(baseState(), 'nobody', NOW)).toBeNull();
  });
});
