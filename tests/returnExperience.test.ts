import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/initialState';
import { advanceCampus } from '../game/campus';
import { loadState, SAVE_KEY, parseSavedClub } from '../game/persistence';
import { fanMilestoneTotal, nextFanMilestone, rallyFans, rallyPreview } from '../game/fanProgress';
import { defenseHistoryLabel, isArchivedAiRaid } from '../game/defenseHistory';
import { finishUpgradeNow } from '../game/upgrades';
import { BuildingType, DrillState, type DefenseLogEntry, type GameState } from '../types';
import { collectorCap, GROWTH_TIERS } from '../constants';

const start = new Date(2026, 8, 9, 12, 0, 0, 357).getTime();
function savedClub(state: GameState): Storage {
  const values = new Map([[SAVE_KEY, JSON.stringify(state)]]);
  return { get length() { return values.size; }, getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: index => [...values.keys()][index] ?? null };
}
const historical: DefenseLogEntry = { id: `def_${start}_0`, attacker: 'Old AI rival', at: start, stars: 2, pct: 80, coinsLost: 120, seen: true };
const live: DefenseLogEntry = { ...historical, id: 'pvp_123', attacker: 'Rival club', attackerPid: 'rival-id' };
const campusStage = (state: GameState) => GROWTH_TIERS.filter(tier => fanMilestoneTotal(state) >= tier.fans).length;

describe('permanent fan milestones', () => {
  it('keeps an earned campus stage after spending enough Fans to cross below it', () => {
    const state = createInitialState(start); state.resources.FANS = 1200; state.resources.ENERGY = 10;
    const next = rallyFans(state);
    expect(next.resources.FANS).toBe(1140); expect(next.resources.ENERGY).toBe(65);
    expect(fanMilestoneTotal(next)).toBe(1200); expect(campusStage(next)).toBe(campusStage(state));
    expect(state.resources.FANS).toBe(1200); // no mutation of the source save
    expect(campusStage(loadState(savedClub(next), start))).toBe(2);
  });
  it('preserves a higher record through repeated rallies and smaller subsequent rewards', () => {
    const state = createInitialState(start); state.resources.FANS = 900; state.resources.ENERGY = 0; state.peakFans = 5000;
    const once = rallyFans(state), twice = rallyFans(once);
    expect(twice.resources.ENERGY).toBe(100); expect(twice.resources.FANS).toBe(780);
    expect(rallyFans(twice)).toBe(twice);
    expect(nextFanMilestone(twice, 30)).toBe(5000);
    expect(nextFanMilestone(twice, 6000)).toBe(6780);
    expect(campusStage(twice)).toBe(3);
  });
  it('backfills only the known fan balance on a legacy save and migrates idempotently', () => {
    const state = createInitialState(start); delete state.peakFans; state.resources.FANS = 1250;
    const migrated = loadState(savedClub(state), start);
    expect(migrated.peakFans).toBe(1250);
    expect(loadState(savedClub(migrated), start).peakFans).toBe(1250);
  });
  it('previews the actual cap-limited refill and rejects unaffordable actions', () => {
    const state = createInitialState(start); state.resources.FANS = 100; state.resources.ENERGY = 97;
    expect(rallyPreview(state)).toEqual({ fanCost: 60, energyGain: 3, canRally: true });
    expect(rallyFans(state).resources.ENERGY).toBe(100);
    state.resources.FANS = 59;
    expect(rallyPreview(state).canRally).toBe(false); expect(rallyFans(state)).toBe(state);
  });
  it('clears banked regeneration when a rally fills energy, even if energy is immediately spent', () => {
    const state = createInitialState(start); state.resources.FANS = 200; state.resources.ENERGY = 90; state.energyProgressMs = 7900;
    const full = rallyFans(state);
    full.resources.ENERGY -= 10;
    expect(advanceCampus(full, start + 100).resources.ENERGY).toBe(90);
    state.resources.ENERGY = 10;
    expect(rallyFans(state).energyProgressMs).toBe(7900);
  });
  it.each(['peakFans', 'energyProgressMs'])('rejects malformed %s without changing the save', field => {
    const state = createInitialState(start) as unknown as Record<string, unknown>;
    state[field] = -1;
    expect(() => parseSavedClub(JSON.stringify(state))).toThrow();
  });
});

describe('honest return history', () => {
  it.each([1_200_000, 7_200_000, 86_400_000 * 7])('does not create attacks, losses, mastery or shields after %i ms away', elapsed => {
    const state = createInitialState(start);
    state.resources.COINS = 10000; state.trophies = 432; state.formationMastery.goalline = 2;
    state.defenseLog = [live, historical];
    const next = loadState(savedClub(state), start + elapsed);
    expect(next.resources.COINS).toBe(10000); expect(next.trophies).toBe(432);
    expect(next.formationMastery).toEqual(state.formationMastery);
    expect(next.defenseLog).toEqual(state.defenseLog);
    expect(next.shieldUntil ?? 0).toBe(0);
    expect(next.buildings.find(b => b.type === BuildingType.STADIUM)?.accrued).toBeGreaterThan(0);
  });
  it('labels only the retired generator format as an archived AI simulation', () => {
    expect(isArchivedAiRaid(historical)).toBe(true);
    expect(defenseHistoryLabel(historical)).toBe('Archived AI simulation');
    expect(isArchivedAiRaid(live)).toBe(false); expect(defenseHistoryLabel(live)).toBe('Rival attack');
    expect(isArchivedAiRaid({ ...historical, attackerPid: 'real-rival' })).toBe(false);
    expect(defenseHistoryLabel({ ...historical, id: 'imported-result' })).toBe('Saved result');
  });
});

describe('shared elapsed-time progression', () => {
  const fixture = () => {
    const state = createInitialState(start);
    state.resources.ENERGY = 0; state.energyProgressMs = 0;
    const stadium = state.buildings.find(b => b.type === BuildingType.STADIUM)!;
    const rehab = state.buildings.find(b => b.type === BuildingType.MEDICAL_CENTER)!;
    state.upgrades = [
      { id: 'stadium-job', kind: 'building', key: stadium.id, toLevel: 2, startTime: start, finishTime: start + 5000 },
      { id: 'rehab-job', kind: 'building', key: rehab.id, toLevel: 2, startTime: start, finishTime: start + 5000 },
      { id: 'hero-job', kind: 'hero', key: 'qb', toLevel: 3, startTime: start, finishTime: start + 8000 },
    ];
    return state;
  };

  it('preserves partial energy regeneration through repeated short reopens', () => {
    let state = createInitialState(start); state.resources.ENERGY = 0;
    state = loadState(savedClub(state), start + 3000);
    expect(state.resources.ENERGY).toBe(0); expect(state.energyProgressMs).toBe(3000);
    state = loadState(savedClub(state), start + 6000);
    expect(state.resources.ENERGY).toBe(0); expect(state.energyProgressMs).toBe(6000);
    state = loadState(savedClub(state), start + 8000);
    expect(state.resources.ENERGY).toBe(1); expect(state.energyProgressMs).toBe(0);
  });

  it.each([100, 500, 1000, 5000])('matches reopening and a hidden-tab catch-up to active ticks of %i ms', cadence => {
    const initial = fixture();
    let active = structuredClone(initial);
    for (let at = start + cadence; at <= start + 25000; at += cadence) active = advanceCampus(active, at);
    const hidden = advanceCampus(initial, start + 25000);
    const reopened = loadState(savedClub(initial), start + 25000);
    for (const other of [hidden, reopened]) {
      expect(other.resources).toEqual(active.resources);
      expect(other.energyProgressMs).toBeCloseTo(active.energyProgressMs!, 5);
      expect(other.heroes).toEqual(active.heroes); expect(other.upgrades).toEqual(active.upgrades);
      for (const b of other.buildings) {
        const expected = active.buildings.find(a => a.id === b.id)!;
        expect(b.level).toBe(expected.level); expect(b.accrued ?? 0).toBeCloseTo(expected.accrued ?? 0, 5);
      }
    }
  });

  it('applies pre- and post-upgrade rates only during their own portions of the absence', () => {
    const next = loadState(savedClub(fixture()), start + 25000);
    const stadium = next.buildings.find(b => b.type === BuildingType.STADIUM)!;
    expect(stadium.accrued).toBeCloseTo(5 * 1.5 + 20 * 3);
    expect(stadium.level).toBe(2);
    expect(next.resources.ENERGY).toBe(3); expect(next.energyProgressMs).toBeCloseTo(2900);
    expect(next.heroes.find(h => h.key === 'qb')?.level).toBe(3); expect(next.upgrades).toHaveLength(0);
  });

  it('uses upgraded storage capacity during a long absence and does not bank energy beyond full', () => {
    const next = loadState(savedClub(fixture()), start + 86_400_000);
    expect(next.buildings.find(b => b.type === BuildingType.STADIUM)?.accrued).toBe(collectorCap(BuildingType.STADIUM, 2));
    expect(next.resources.ENERGY).toBe(100); expect(next.energyProgressMs).toBe(0);
    next.resources.ENERGY = 90;
    expect(advanceCampus(next, next.lastTick + 100).resources.ENERGY).toBe(90);
  });

  it('does not pay completed progress twice after saving, reloading, or replaying the same tick', () => {
    const next = loadState(savedClub(fixture()), start + 25000);
    const restored = loadState(savedClub(next), start + 25000);
    expect(restored.resources).toEqual(next.resources); expect(restored.energyProgressMs).toBe(next.energyProgressMs);
    expect(restored.buildings).toEqual(next.buildings); expect(restored.heroes).toEqual(next.heroes);
    expect(advanceCampus(next, next.lastTick)).toBe(next);
    expect(advanceCampus(next, start)).toBe(next);
  });

  it('completes an elapsed drill without collecting its reward or duplicating a completion', () => {
    const state = createInitialState(start);
    const facility = state.buildings[0];
    facility.state = DrillState.ACTIVE; facility.finishTime = start + 1500;
    const reopened = loadState(savedClub(state), start + 3000);
    expect(reopened.buildings.find(building => building.id === facility.id)?.state).toBe(DrillState.COMPLETED);
    expect(reopened.resources.COINS).toBe(state.resources.COINS);
    expect(reopened.roster.map(player => player.stats)).toEqual(state.roster.map(player => player.stats));
    expect(loadState(savedClub(reopened), start + 3000).resources).toEqual(reopened.resources);
  });

  it('retains the regeneration fraction when Rehab is rushed midway through an interval', () => {
    const state = fixture(), before = structuredClone(state);
    const next = finishUpgradeNow(state, 'rehab-job', start + 4000);
    expect(next.resources.GEMS).toBe(state.resources.GEMS - 1);
    expect(next.energyProgressMs).toBe(3600); // half of the new 7200 ms interval
    expect(next.buildings.find(building => building.type === BuildingType.MEDICAL_CENTER)?.level).toBe(2);
    expect(advanceCampus(next, start + 7600).resources.ENERGY).toBe(1);
    expect(finishUpgradeNow(next, 'rehab-job', start + 4000)).toBe(next);
    expect(state).toEqual(before);
  });

  it('credits collector time before a rushed upgrade at the original level', () => {
    const state = fixture();
    const next = finishUpgradeNow(state, 'stadium-job', start + 4000);
    expect(next.buildings.find(building => building.type === BuildingType.STADIUM)?.accrued).toBe(6);
    const later = advanceCampus(next, start + 8000);
    expect(later.buildings.find(building => building.type === BuildingType.STADIUM)?.accrued).toBe(18);
  });

  it('settles naturally completed upgrades without charging a minimum rush cost', () => {
    const state = fixture();
    const next = finishUpgradeNow(state, 'stadium-job', start + 5000);
    expect(next.resources.GEMS).toBe(state.resources.GEMS);
    expect(next.upgrades.some(job => job.id === 'stadium-job')).toBe(false);
    // Legacy state may have saved precisely at the completion boundary.
    state.lastTick = start + 5000;
    expect(finishUpgradeNow(state, 'stadium-job', start + 5000).resources.GEMS).toBe(state.resources.GEMS);
  });

  it('does not rush an unaffordable job while still settling ordinary elapsed time', () => {
    const state = fixture(); state.resources.GEMS = 0;
    const next = finishUpgradeNow(state, 'stadium-job', start + 4000);
    expect(next.resources.GEMS).toBe(0);
    expect(next.buildings.find(building => building.type === BuildingType.STADIUM)?.level).toBe(1);
    expect(next.buildings.find(building => building.type === BuildingType.STADIUM)?.accrued).toBe(6);
    expect(next.upgrades).toHaveLength(3);
  });
});
