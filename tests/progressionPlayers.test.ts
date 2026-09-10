import { describe, expect, it } from 'vitest';
import { DRILLS, LEVEL_STAT_GAIN, RARITY_CONFIG, RARITY_MULT, trainingYieldMult } from '../constants';
import { unitCombatStats, unitPower } from '../battle';
import { rosterPreparation } from '../game/combat/roster';
import { applyClubAction } from '../game/authority/clubActions';
import { drillEffects, playerGrowth, rosterGrowth } from '../game/progression';
import { DrillState, PlayerRarity, UnitGroup } from '../types';
import { NOW, act, baseState, context, legacyPlayer, trainingDue, trainingStarted } from './fixtures/progression';

describe('player growth is reported only where the code tracks it', () => {
  it('exposes no progress bar: there is no per-player XP field', () => {
    const s = baseState();
    for (const p of s.roster) {
      const m = playerGrowth(s, p.id, NOW)!;
      expect(m.progress.kind).toBe('none');
      expect(m.progress.reason).toMatch(/rewardXp/);
      expect(m.maxStatEnforced).toBe(false);
      expect(m.rarityPath.promotion.kind).toBe('none');
      expect(m.nextStep.kind).toBe('drill-collect');
      expect(m.nextStep.delta.stats).toEqual({ strength: 1, speed: 1, iq: 1 });
      expect(m.levelGainPerLevel).toBe(LEVEL_STAT_GAIN);
      expect(m.rarityMultiplier).toBe(RARITY_MULT[p.rarity]);
    }
    expect(Object.values(DRILLS).every(d => d.rewardXp > 0)).toBe(true); // declared…
    expect(drillEffects(s, UnitGroup.OFFENSE_LINE).every(d => d.rewardXp.applied === false)).toBe(true); // …never applied
  });

  it('the next step equals what training.collect really applies, including the combat statline', () => {
    const { state, finish, settled } = trainingDue();
    const before = playerGrowth(state, 'ol1', NOW)!;
    const collected = act(settled, { type: 'training.collect', buildingId: settled.buildings.find(b => b.type === 'TRAINING_PITCH')!.id }, context(finish)).state;
    const after = collected.roster.find(p => p.id === 'ol1')!;
    expect(after.level).toBe(before.nextStep.after.level);
    expect(after.stats).toEqual(before.nextStep.after.stats);
    expect(unitPower(after)).toBe(before.nextStep.after.combat.power);
    expect(unitCombatStats(after)).toEqual(before.nextStep.after.combat.statline);
    expect(before.nextStep.delta.power).toBe(unitPower(after) - unitPower(state.roster.find(p => p.id === 'ol1')!));
    // A player outside the trained unit is untouched, and the model said so (nextStep is per-collect, not queued).
    const wr = collected.roster.find(p => p.id === 'wr1')!;
    expect(wr.level).toBe(1);
    expect(before.nextStep.drillIds).toEqual(['sled_push', 'scrimmage']);
  });

  it('training state follows the Training Field, not the player object', () => {
    const { state } = trainingStarted();
    const ol = playerGrowth(state, 'ol1', NOW)!;
    expect(ol.training).toMatchObject({ kind: 'training', drillId: 'sled_push', complete: false, collectable: false, remainingSeconds: DRILLS.sled_push.durationSeconds });
    expect(playerGrowth(state, 'wr1', NOW)!.training).toEqual({ kind: 'idle' });
    const { finish, settled } = trainingDue();
    expect(playerGrowth(state, 'ol1', finish)!.training).toMatchObject({ kind: 'training', complete: true, collectable: false }); // due but unsettled
    expect(playerGrowth(settled, 'ol1', finish)!.training).toMatchObject({ kind: 'training', complete: true, collectable: true });
    expect(settled.buildings.find(b => b.type === 'TRAINING_PITCH')!.state).toBe(DrillState.COMPLETED);
  });

  it('drill effects mirror training.start blockers and training.collect payouts', () => {
    const idle = baseState();
    const effects = drillEffects(idle, UnitGroup.OFFENSE_LINE);
    expect(effects.find(e => e.drillId === 'sled_push')).toMatchObject({ canStart: true, playersAffected: 3, coins: Math.round(100 * trainingYieldMult(1)) });
    expect(effects.find(e => e.drillId === 'scrimmage')?.blockers).toEqual([{ code: 'locked', message: 'Upgrade the Training Field for this drill.' }]);
    expect(effects.find(e => e.drillId === 'routes')?.blockers).toEqual([{ code: 'invalid_command', message: 'That drill does not train this unit.' }]);
    const busy = drillEffects(trainingStarted().state, UnitGroup.OFFENSE_SKILL);
    expect(busy.find(e => e.drillId === 'routes')?.blockers).toEqual([{ code: 'busy', message: 'The Training Field is busy.' }]);
    const tired = { ...idle, resources: { ...idle.resources, ENERGY: 5 } };
    expect(drillEffects(tired, UnitGroup.OFFENSE_LINE).find(e => e.drillId === 'sled_push')?.blockers).toEqual([{ code: 'insufficient_resources', message: 'Not enough Energy.' }]);
    expect(applyClubAction(tired, { type: 'training.start', drillId: 'sled_push', unit: UnitGroup.OFFENSE_LINE }, context())).toMatchObject({ ok: false, code: 'insufficient_resources' });
    const { finish, settled } = trainingDue();
    const receipt = act(settled, { type: 'training.collect', buildingId: settled.buildings.find(b => b.type === 'TRAINING_PITCH')!.id }, context(finish)).result;
    expect(receipt.gained).toEqual({ COINS: effects.find(e => e.drillId === 'sled_push')!.coins });
  });

  it('roster view carries readiness and the preparation multiplier the match will use', () => {
    const cold = rosterGrowth(baseState(), NOW);
    expect(cold.readiness).toMatchObject({ value: 0, cap: 100, firedUp: false });
    expect(cold.readiness.preparation).toEqual(rosterPreparation(baseState().roster, 0));
    const hot = rosterGrowth({ ...baseState(), teamReadiness: 100 }, NOW);
    expect(hot.readiness.firedUp).toBe(true);
    expect(hot.readiness.preparation[UnitGroup.OFFENSE_LINE]).toBeCloseTo(cold.readiness.preparation[UnitGroup.OFFENSE_LINE] * 1.15, 9);
    expect(hot.drills.map(d => d.drillId)).toEqual(Object.keys(DRILLS));
    expect(hot.players).toHaveLength(baseState().roster.length);
    expect(hot.trainingField).toMatchObject({ level: 1, busy: false });
  });

  it('defaults legacy players and never mutates the state', () => {
    const s = legacyPlayer(baseState());
    const snapshot = JSON.stringify(s);
    const m = playerGrowth(s, s.roster[0].id, NOW)!;
    expect(m.rarity).toBe(PlayerRarity.COMMON);
    expect(m.declaredMaxStat).toBe(RARITY_CONFIG[PlayerRarity.COMMON].maxStat);
    expect(m.combat.power).toBe(unitPower({ ...s.roster[0], rarity: PlayerRarity.COMMON }));
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(playerGrowth(s, 'nobody', NOW)).toBeNull();
  });
});
