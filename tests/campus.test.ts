import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/initialState';
import { advanceCampus } from '../game/campus';
import { BuildingType, DrillState, PlayerState } from '../types';
import { collectorCap, energyIntervalMs } from '../constants';
import { todayKey } from '../dailies';
const now = new Date(2026, 8, 8, 12).getTime();
describe('campus simulation', () => {
  it('lands on a nearby destination without oscillation', () => {
    const initial = createInitialState(now), player = initial.roster[0];
    player.state = PlayerState.WALKING; player.tendency = '';
    player.worldPos = { x: 40, y: 40, z: 0 }; player.targetPos = { x: 40.8, y: 40, z: 1 };
    const next = advanceCampus(initial, now + 100);
    expect(next.roster[0].worldPos).toEqual({ x: 40.8, y: 40, z: 0 });
    expect(next.roster[0].state).toBe(PlayerState.TRAINING);
    expect(advanceCampus(next, now + 200).roster[0].worldPos).toEqual(next.roster[0].worldPos);
  });
  it('banks economy and completes timers while bounding movement after a long pause', () => {
    const initial = createInitialState(now); initial.resources.ENERGY = 0;
    initial.roster[0] = { ...initial.roster[0], tendency: '', state: PlayerState.WALKING, worldPos: { x: 10, y: 10, z: 0 }, targetPos: { x: 90, y: 10, z: 0 } };
    const stadium = initial.buildings.find(b => b.type === BuildingType.STADIUM)!;
    stadium.state = DrillState.ACTIVE; stadium.finishTime = now + 1000;
    initial.upgrades = [{ id: 'job', kind: 'building', key: stadium.id, toLevel: 2, startTime: now, finishTime: now + 2000 }];
    const next = advanceCampus(initial, now + 86_400_000), upgraded = next.buildings.find(b => b.id === stadium.id)!;
    expect(next.resources.ENERGY).toBe(100); expect(upgraded.state).toBe(DrillState.COMPLETED); expect(upgraded.level).toBe(2);
    expect(upgraded.accrued).toBeLessThanOrEqual(collectorCap(BuildingType.STADIUM, 1)); expect(next.upgrades).toHaveLength(0);
    expect(next.roster[0].worldPos.x).toBeGreaterThan(10); expect(next.roster[0].worldPos.x).toBeLessThanOrEqual(13.75);
  });
  it('is deterministic and leaves the previous save unchanged when React replays a tick', () => {
    const initial = createInitialState(now), before = structuredClone(initial);
    expect(advanceCampus(initial, now + 100)).toEqual(advanceCampus(initial, now + 100)); expect(initial).toEqual(before);
  });
  it('does not grant resources twice or move the clock backwards', () => {
    const initial = createInitialState(now); initial.resources.ENERGY = 0;
    const next = advanceCampus(initial, now + energyIntervalMs(1) * 3);
    expect(next.resources.ENERGY).toBe(3); expect(advanceCampus(next, next.lastTick)).toBe(next); expect(advanceCampus(next, now)).toBe(next);
  });
  it('resets daily attempts at local midnight while preserving best Gauntlet progress', () => {
    const late = new Date(2026, 8, 8, 23, 59, 59).getTime(), initial = createInitialState(late);
    initial.gauntlet.best = 7; initial.gauntlet.attempts = 0; initial.dailies.claimed = ['drills'];
    const next = advanceCampus(initial, late + 2000);
    expect(next.dailies.date).toBe(todayKey(late + 2000)); expect(next.dailies.claimed).toEqual([]);
    expect(next.gauntlet).toEqual({ date: todayKey(late + 2000), best: 7, attempts: 3 });
  });
  it('creates independent clubs with no shared mutable roster defaults', () => {
    const a = createInitialState(now), b = createInitialState(now); a.roster[0].stats.speed = 999;
    expect(b.roster[0].stats.speed).not.toBe(999);
  });
});
