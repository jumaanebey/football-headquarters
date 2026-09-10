// Time advancement parity: the server settles protected clubs on its own clock and the client
// advances a mirror for display. Both must produce the same energy, production, upgrade and
// day-boundary results for the same elapsed time; clock rollback must never advance or rewind.
import { describe, expect, it } from 'vitest';
import { createAuthorityService } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { settleClubState } from '../game/authority/clubActions';
import { advanceCampus } from '../game/campus';
import { createInitialState } from '../game/initialState';
import { BuildingType, type GameState } from '../types';
import { UPGRADE_CONFIG, collectorCap, upgradeDurationSecs } from '../constants';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const economy = (s: GameState) => ({ energy: s.resources.ENERGY, coins: s.resources.COINS, levels: s.buildings.map(b => [b.id, b.level]), accrued: s.buildings.map(b => [b.id, Math.floor(b.accrued ?? 0)]), upgrades: s.upgrades.map(u => u.id), heroLevels: s.heroes.map(h => h.level), dailies: s.dailies.date, gauntlet: s.gauntlet });

const harness = (start = ACTIVATION + 60_000) => {
  let now = start; let ops = 1;
  const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
  const service = createAuthorityService(store, { now: () => now, randomUint32: () => 7, uuid: () => op(9000) });
  const call = (input: unknown) => service({ owner: A, createdAt: ACTIVATION + 1000 }, input);
  const act = (action: unknown) => call({ kind: 'action', operationId: op(ops++), expectedRevision: store.clubs.get(A)!.revision, action });
  return { store, call, act, state: () => store.clubs.get(A)!.state, set: (f: (s: GameState) => void) => f(store.clubs.get(A)!.state), advance: (ms: number) => { now += ms; }, rewind: (ms: number) => { now -= ms; }, get now() { return now; } };
};

describe('server settlement and client advancement agree on elapsed time', () => {
  it('a closed tab for seven days: energy and production cap, timed work completes, days roll — identically on both sides', async () => {
    const h = harness(); await h.call({ kind: 'bootstrap' });
    h.set(s => { s.resources.COINS = 10_000; s.resources.ENERGY = 5; });
    const stadium = h.state().buildings.find(b => b.type === BuildingType.STADIUM)!;
    expect((await h.act({ type: 'facility.upgrade', buildingId: stadium.id })).ok).toBe(true);
    expect((await h.act({ type: 'hero.train', heroKey: 'qb' })).ok).toBe(true);
    const before = JSON.parse(JSON.stringify(h.state())) as GameState;
    h.advance(7 * 86_400_000);
    const client = advanceCampus(before, h.now, utcDay(h.now));
    const server = settleClubState(before, { now: h.now });
    expect(economy(client)).toEqual(economy(server));
    expect(server.resources.ENERGY).toBe(100);
    expect(server.buildings.find(b => b.id === stadium.id)?.level).toBe(2);
    expect(server.heroes.find(x => x.key === 'qb')?.level).toBe(2);
    expect(server.upgrades).toEqual([]);
    expect(Math.floor(server.buildings.find(b => b.id === stadium.id)!.accrued!)).toBe(collectorCap(BuildingType.STADIUM, 2));
    expect(server.dailies.date).toBe(utcDay(h.now));
    expect(server.gauntlet.attempts).toBe(3);
    // The next real action settles the same way.
    const synced = await h.act({ type: 'sync' });
    expect(synced.ok && economy(synced.club!.state)).toEqual(economy(server));
  });
  it('a hidden tab that stops ticking catches up in one step to the same values as many small steps', () => {
    const start = createInitialState(ACTIVATION + 60_000);
    start.resources.ENERGY = 10; start.resources.COINS = 10_000;
    const job = { id: 'up_1', kind: 'building' as const, key: 'stadium-1', toLevel: 2, startTime: start.lastTick, finishTime: start.lastTick + upgradeDurationSecs(2) * 1000 };
    start.upgrades = [job]; start.resources.COINS -= UPGRADE_CONFIG.baseCost;
    const end = start.lastTick + 45 * 60_000;
    let stepped: GameState = start;
    for (let t = start.lastTick + 100; t <= end; t += 100) stepped = advanceCampus(stepped, t, utcDay(t));
    const jumped = advanceCampus(start, end, utcDay(end));
    expect(economy(jumped)).toEqual(economy(stepped));
    expect(jumped.buildings.find(b => b.id === 'stadium-1')?.level).toBe(2);
    expect(economy(jumped)).toEqual(economy(settleClubState(start, { now: end })));
  });
  it('a clock that runs backwards neither rewinds nor advances: the client keeps its state and the server refuses the action', async () => {
    const h = harness(); await h.call({ kind: 'bootstrap' });
    h.advance(60_000);
    expect((await h.act({ type: 'sync' })).ok).toBe(true);
    const settled = JSON.parse(JSON.stringify(h.state())) as GameState;
    expect(advanceCampus(settled, settled.lastTick - 5000, utcDay(settled.lastTick))).toBe(settled);
    h.rewind(30_000);
    const refused = await h.act({ type: 'rally' });
    expect(!refused.ok && refused.code).toBe('invalid_clock');
    expect(h.state()).toEqual(settled);
    h.advance(30_000);
    expect((await h.act({ type: 'sync' })).ok).toBe(true);
  });
  it('the UTC day boundary resets daily quests and Gauntlet attempts exactly once, on both sides', async () => {
    const dayEnd = Date.parse('2026-09-12T23:59:59.000Z');
    const h = harness(dayEnd - 3_600_000); await h.call({ kind: 'bootstrap' });
    h.set(s => { s.gauntlet.attempts = 1; s.dailies.progress = { win_attack: 1 }; });
    h.advance(3_600_000); // 23:59:59
    const late = await h.act({ type: 'sync' });
    expect(late.ok && late.club!.state.dailies.date).toBe('2026-09-12');
    expect(late.ok && late.club!.state.gauntlet.attempts).toBe(1);
    expect(late.ok && late.club!.state.dailies.progress).toEqual({ win_attack: 1 });
    h.advance(2000); // 00:00:01 next day
    const early = await h.act({ type: 'sync' });
    expect(early.ok && early.club!.state.dailies.date).toBe('2026-09-13');
    expect(early.ok && early.club!.state.gauntlet.attempts).toBe(3);
    expect(early.ok && early.club!.state.dailies.progress).toEqual({});
    const clientView = advanceCampus(late.ok ? late.club!.state : createInitialState(), h.now, utcDay(h.now));
    expect(clientView.dailies.date).toBe('2026-09-13');
    expect(clientView.gauntlet.attempts).toBe(3);
    h.advance(3_600_000);
    const again = await h.act({ type: 'sync' });
    expect(again.ok && again.club!.state.gauntlet.attempts).toBe(3); // no second reset within the day
  });
  it('a guest club keeps its documented local-day reset while a protected club follows the server day', () => {
    const at = Date.parse('2026-09-12T23:30:00.000Z'); // 4:30 pm Pacific on the 12th
    const state = createInitialState(at - 60_000);
    state.dailies.date = '2026-09-12';
    const protectedView = advanceCampus(state, at + 3_600_000, utcDay(at + 3_600_000)); // 00:30 UTC on the 13th
    expect(protectedView.dailies.date).toBe('2026-09-13');
    const guestView = advanceCampus(state, at + 3_600_000);
    const localDay = new Date(at + 3_600_000);
    expect(guestView.dailies.date).toBe(`${localDay.getFullYear()}-${String(localDay.getMonth() + 1).padStart(2, '0')}-${String(localDay.getDate()).padStart(2, '0')}`);
  });
});
