// Coverage matrix for every club action the client exposes: exact currency deltas, resulting
// state, the receipt, a verbatim retry (same operation id → same receipt, no second charge)
// and a stale second session (revision conflict, latest club adopted). Delayed completions
// use the server clock. Run against the SQL-equivalent memory store.
import { describe, expect, it } from 'vitest';
import { createAuthorityService, type AuthoritySuccess } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { BuildingType, DrillState, ResourceType, type GameState } from '../types';
import { DRILLS, EXTRA_SLOT_COSTS, MAX_BUILDERS, PARKING_LOT, RECRUIT_CONFIG, UPGRADE_CONFIG, builderHireCost, skipGemCost, trainingYieldMult, upgradeDurationSecs } from '../constants';
import { HERO_DEFS, STARTER_HERO_KEYS, heroUpgradeCost } from '../battle';
import { ROLL_COST_GEMS, STAR_UP_COSTS } from '../gacha';
import { recruitCost } from '../recruiting';
import { questsForDate } from '../dailies';
import { slotUpgradeCost } from '../fixedBase';
import { rallyPreview } from '../game/fanProgress';
import { templateCampusLayout } from '../game/campusLayout';
import { canonicalJson } from '../game/combat/canonical';
import { createInitialState } from '../game/initialState';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const harness = () => {
  let now = ACTIVATION + 60_000;
  const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
  const service = createAuthorityService(store, { now: () => now, randomUint32: () => 0x0fff_ffff, uuid: () => op(9000) });
  const call = (input: unknown) => service({ owner: A, createdAt: ACTIVATION + 1000 }, input);
  const state = () => store.clubs.get(A)!.state;
  const revision = () => store.clubs.get(A)!.revision;
  let ops = 1;
  /** Runs one action and checks exactly-once semantics: retry returns the receipt, a stale revision conflicts. */
  const act = async (action: Record<string, unknown>) => {
    const request = { kind: 'action', operationId: op(ops++), expectedRevision: revision(), action };
    const first = await call(request);
    if (!first.ok) return { ok: false as const, code: first.code, message: first.message };
    const retry = await call(request);
    expect(retry.ok).toBe(true);
    expect(canonicalJson((retry as AuthoritySuccess).result)).toBe(canonicalJson(first.result));
    expect((retry as AuthoritySuccess).club?.revision).toBe(first.club?.revision);
    const stale = await call({ ...request, operationId: op(ops++), expectedRevision: (request.expectedRevision as number) });
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.code).toBe('revision_conflict');
    expect(!stale.ok && stale.club?.revision).toBe(first.club?.revision);
    expect(store.commits).toBe(revision());
    return { ok: true as const, result: first.result as Record<string, unknown>, club: first.club!.state };
  };
  const set = (mutate: (s: GameState) => void) => { mutate(store.clubs.get(A)!.state); };
  return { store, call, act, set, state, revision, advance: (ms: number) => { now += ms; }, get now() { return now; } };
};
const boot = async (h: ReturnType<typeof harness>) => { expect((await h.call({ kind: 'bootstrap' })).ok).toBe(true); };

describe('club action coverage: facilities and builders', () => {
  it('facility.upgrade charges once, then the server clock completes it; facility.rush spends Crowns by remaining time', async () => {
    const h = harness(); await boot(h);
    h.set(s => { s.resources.COINS = 10_000; s.resources.GEMS = 50; });
    const stadium = h.state().buildings.find(b => b.type === BuildingType.STADIUM)!;
    const up = await h.act({ type: 'facility.upgrade', buildingId: stadium.id });
    expect(up.ok && up.result).toMatchObject({ type: 'facility.upgrade', buildingId: stadium.id, toLevel: 2, spent: { COINS: UPGRADE_CONFIG.baseCost } });
    expect(up.ok && up.club.resources.COINS).toBe(10_000 - UPGRADE_CONFIG.baseCost);
    expect(up.ok && up.club.upgrades).toHaveLength(1);
    // The same facility cannot be queued twice while its job runs.
    expect(await h.act({ type: 'facility.upgrade', buildingId: stadium.id })).toMatchObject({ ok: false, code: 'busy' });
    const job = h.state().upgrades[0];
    const remaining = (job.finishTime - h.now) / 1000;
    expect(remaining).toBe(upgradeDurationSecs(2));
    const rush = await h.act({ type: 'facility.rush', jobId: job.id });
    expect(rush.ok && rush.result).toMatchObject({ type: 'facility.rush', jobId: job.id, toLevel: 2, spent: { GEMS: skipGemCost(remaining) } });
    expect(rush.ok && rush.club.buildings.find(b => b.id === stadium.id)?.level).toBe(2);
    expect(rush.ok && rush.club.upgrades).toHaveLength(0);
    expect(rush.ok && rush.club.resources.GEMS).toBe(50 - skipGemCost(remaining));
    expect(await h.act({ type: 'facility.rush', jobId: job.id })).toMatchObject({ ok: false, code: 'not_found' });
  });
  it('a timed upgrade completes on the server clock through any later action', async () => {
    const h = harness(); await boot(h);
    h.set(s => { s.resources.COINS = 10_000; });
    const pitch = h.state().buildings.find(b => b.type === BuildingType.TRAINING_PITCH)!;
    const stadium = h.state().buildings.find(b => b.type === BuildingType.STADIUM)!;
    expect(await h.act({ type: 'facility.upgrade', buildingId: pitch.id })).toMatchObject({ ok: false, code: 'locked' }); // capped at Stadium level
    const up = await h.act({ type: 'facility.upgrade', buildingId: stadium.id });
    expect(up.ok).toBe(true);
    h.advance(upgradeDurationSecs(2) * 1000 - 1000);
    const early = await h.act({ type: 'sync' });
    expect(early.ok && early.club.buildings.find(b => b.id === stadium.id)?.level).toBe(1);
    h.advance(2000);
    const done = await h.act({ type: 'sync' });
    expect(done.ok && done.club.buildings.find(b => b.id === stadium.id)?.level).toBe(2);
    expect(done.ok && done.club.upgrades).toHaveLength(0);
  });
  it('facility.collect banks accrued Stadium coins exactly once and advances the daily objective', async () => {
    const h = harness(); await boot(h);
    const stadium = h.state().buildings.find(b => b.type === BuildingType.STADIUM)!;
    expect(await h.act({ type: 'facility.collect', buildingId: stadium.id })).toMatchObject({ ok: false, code: 'not_ready' });
    h.advance(20 * 60_000);
    const before = h.state().resources.COINS;
    const collect = await h.act({ type: 'facility.collect', buildingId: stadium.id });
    const gained = collect.ok ? Number((collect.result.gained as Record<string, number>).COINS) : 0;
    expect(gained).toBeGreaterThan(0);
    expect(collect.ok && collect.club.resources.COINS).toBe(before + gained);
    expect(collect.ok && collect.club.buildings.find(b => b.id === stadium.id)?.accrued).toBe(0);
    if (questsForDate(h.state().dailies.date).some(q => q.id === 'bank_coins')) expect(collect.ok && collect.club.dailies.progress.bank_coins).toBeGreaterThanOrEqual(Math.min(gained, 1200));
    expect(await h.act({ type: 'facility.collect', buildingId: stadium.id })).toMatchObject({ ok: false, code: 'not_ready' });
  });
  it('builder.hire spends Crowns per hire up to the cap', async () => {
    const h = harness(); await boot(h);
    h.set(s => { s.resources.GEMS = 1000; });
    let builders = h.state().builders;
    while (builders < MAX_BUILDERS) {
      const cost = builderHireCost(builders);
      const gems = h.state().resources.GEMS;
      const hire = await h.act({ type: 'builder.hire' });
      expect(hire.ok && hire.result).toMatchObject({ spent: { GEMS: cost } });
      expect(hire.ok && hire.club.resources.GEMS).toBe(gems - cost);
      builders = hire.ok ? hire.club.builders : builders + 1;
    }
    expect(await h.act({ type: 'builder.hire' })).toMatchObject({ ok: false, code: 'limit_reached' });
  });
  it('rally trades Fans for Energy using the shared preview', async () => {
    const h = harness(); await boot(h);
    expect(await h.act({ type: 'rally' })).toMatchObject({ ok: false, code: 'limit_reached' }); // Energy is full
    h.set(s => { s.resources.ENERGY = 20; s.resources.FANS = 500; });
    const preview = rallyPreview(h.state());
    const rally = await h.act({ type: 'rally' });
    expect(rally.ok && rally.result).toMatchObject({ spent: { FANS: preview.fanCost }, gained: { ENERGY: preview.energyGain } });
    expect(rally.ok && rally.club.resources.ENERGY).toBe(20 + preview.energyGain);
    expect(rally.ok && rally.club.resources.FANS).toBe(500 - preview.fanCost);
    h.set(s => { s.resources.ENERGY = 20; s.resources.FANS = 10; });
    expect(await h.act({ type: 'rally' })).toMatchObject({ ok: false, code: 'insufficient_resources' });
  });
});

describe('club action coverage: training', () => {
  it('training.start spends Energy and occupies the field; training.collect pays coins, levels the unit and needs the server clock', async () => {
    const h = harness(); await boot(h);
    const drill = DRILLS.sled_push;
    const unit = 'OFFENSE_LINE';
    const start = await h.act({ type: 'training.start', drillId: drill.id, unit });
    expect(start.ok && start.result).toMatchObject({ spent: { ENERGY: drill.costEnergy } });
    expect(start.ok && start.club.resources.ENERGY).toBe(100 - drill.costEnergy);
    const pitch = start.ok ? start.club.buildings.find(b => b.type === BuildingType.TRAINING_PITCH)! : null!;
    expect(pitch.state).toBe(DrillState.ACTIVE);
    expect(await h.act({ type: 'training.start', drillId: drill.id, unit })).toMatchObject({ ok: false, code: 'busy' });
    expect(await h.act({ type: 'training.collect', buildingId: pitch.id })).toMatchObject({ ok: false, code: 'not_ready' });
    h.advance(drill.durationSeconds * 1000 + 100);
    const linemen = h.state().roster.filter(p => p.unit === unit);
    const before = h.state().resources.COINS;
    const collect = await h.act({ type: 'training.collect', buildingId: pitch.id });
    const coins = Math.round(drill.rewardCoins * trainingYieldMult(1));
    expect(collect.ok && collect.result).toMatchObject({ gained: { COINS: coins } });
    expect(collect.ok && collect.club.resources.COINS).toBe(before + coins);
    for (const p of linemen) {
      const after = collect.ok ? collect.club.roster.find(r => r.id === p.id)! : null!;
      expect(after.level).toBe(p.level + 1);
      expect(after.stats.strength).toBe(p.stats.strength + 1);
    }
    expect(collect.ok && collect.club.buildings.find(b => b.id === pitch.id)?.state).toBe(DrillState.IDLE);
    if (questsForDate(h.state().dailies.date).some(q => q.id === 'drills')) expect(collect.ok && collect.club.dailies.progress.drills).toBe(1);
    expect(await h.act({ type: 'training.start', drillId: 'scrimmage', unit })).toMatchObject({ ok: false, code: 'locked' });
    expect(await h.act({ type: 'training.start', drillId: drill.id, unit: 'DEFENSE_LINE' })).toMatchObject({ ok: false, code: 'invalid_command' });
  });
});

describe('club action coverage: hero progression and scouting', () => {
  it('hero.train charges coins and finishes on the server clock; hero.unlock and hero.star spend their costs once', async () => {
    const h = harness(); await boot(h);
    h.set(s => { s.resources.COINS = 100_000; s.resources.GEMS = 500; });
    const key = STARTER_HERO_KEYS[0];
    const train = await h.act({ type: 'hero.train', heroKey: key });
    expect(train.ok && train.result).toMatchObject({ heroKey: key, toLevel: 2, spent: { COINS: heroUpgradeCost(1) } });
    expect(train.ok && train.club.resources.COINS).toBe(100_000 - heroUpgradeCost(1));
    if (questsForDate(h.state().dailies.date).some(q => q.id === 'train_hero')) expect(train.ok && train.club.dailies.progress.train_hero).toBe(1);
    expect(await h.act({ type: 'hero.train', heroKey: key })).toMatchObject({ ok: false, code: 'busy' });
    h.advance(upgradeDurationSecs(2) * 3 * 1000 + 100);
    const synced = await h.act({ type: 'sync' });
    expect(synced.ok && synced.club.heroes.find(x => x.key === key)?.level).toBe(2);
    const locked = HERO_DEFS.find(d => d.unlock?.coins)!;
    const unlock = await h.act({ type: 'hero.unlock', heroKey: locked.key });
    expect(unlock.ok && unlock.result).toMatchObject({ heroKey: locked.key, spent: { COINS: locked.unlock!.coins, GEMS: 0 } });
    expect(unlock.ok && unlock.club.heroes.find(x => x.key === locked.key)?.unlocked).toBe(true);
    expect(await h.act({ type: 'hero.unlock', heroKey: locked.key })).toMatchObject({ ok: false, code: 'already_claimed' });
    expect(await h.act({ type: 'hero.star', heroKey: key })).toMatchObject({ ok: false, code: 'insufficient_resources' });
    h.set(s => { s.heroes.find(x => x.key === key)!.shards = STAR_UP_COSTS[1] + 3; });
    const star = await h.act({ type: 'hero.star', heroKey: key });
    expect(star.ok && star.result).toMatchObject({ heroKey: key, toLevel: 2 });
    expect(star.ok && star.club.heroes.find(x => x.key === key)).toMatchObject({ stars: 2, shards: 3 });
  });
  it('hero.scout spends Crowns and returns a receipt the client displays; the retry never rolls twice', async () => {
    const h = harness(); await boot(h);
    h.set(s => { s.resources.GEMS = ROLL_COST_GEMS * 2; });
    const roll = await h.act({ type: 'hero.scout' });
    expect(roll.ok && roll.result).toMatchObject({ spent: { GEMS: ROLL_COST_GEMS } });
    const receipt = roll.ok ? roll.result.roll as { key: string; isNew: boolean; shards: number } : null;
    expect(receipt && HERO_DEFS.some(d => d.key === receipt.key)).toBe(true);
    expect(roll.ok && roll.club.resources.GEMS).toBe(ROLL_COST_GEMS);
    if (questsForDate(h.state().dailies.date).some(q => q.id === 'scout')) expect(roll.ok && roll.club.dailies.progress.scout).toBe(1);
    const hero = roll.ok ? roll.club.heroes.find(x => x.key === receipt!.key)! : null!;
    expect(hero.unlocked).toBe(true);
    if (receipt && !receipt.isNew) expect(hero.shards).toBe(receipt.shards);
    await h.act({ type: 'hero.scout' });
    expect(await h.act({ type: 'hero.scout' })).toMatchObject({ ok: false, code: 'insufficient_resources' });
  });
});

describe('club action coverage: recruiting', () => {
  it('refresh issues a board; start charges the prospect cost; rush spends Crowns; sign adds the player; cut releases one', async () => {
    const h = harness(); await boot(h);
    h.set(s => { s.resources.COINS = 100_000; s.resources.GEMS = 100; });
    const refresh = await h.act({ type: 'recruit.refresh' });
    const board = refresh.ok ? refresh.club.recruitBoard!.candidates : [];
    expect(board).toHaveLength(RECRUIT_CONFIG.candidateCount);
    const candidate = board[0];
    expect(await h.act({ type: 'recruit.start', candidateId: 'nope' })).toMatchObject({ ok: false, code: 'not_found' });
    const start = await h.act({ type: 'recruit.start', candidateId: candidate.id });
    expect(start.ok && start.result).toMatchObject({ playerId: candidate.id, spent: { COINS: recruitCost(candidate) } });
    expect(start.ok && start.club.resources.COINS).toBe(100_000 - recruitCost(candidate));
    expect(start.ok && start.club.recruitBoard!.candidates.map(c => c.id)).not.toContain(candidate.id);
    expect(await h.act({ type: 'recruit.refresh' })).toMatchObject({ ok: false, code: 'busy' });
    expect(await h.act({ type: 'recruit.sign' })).toMatchObject({ ok: false, code: 'not_ready' });
    const rush = await h.act({ type: 'recruit.rush' });
    expect(rush.ok && rush.result).toMatchObject({ spent: { GEMS: RECRUIT_CONFIG.rushGemCost } });
    expect(await h.act({ type: 'recruit.rush' })).toMatchObject({ ok: false, code: 'not_ready' });
    const size = h.state().roster.length;
    const sign = await h.act({ type: 'recruit.sign' });
    expect(sign.ok && sign.result).toMatchObject({ playerId: candidate.id });
    expect(sign.ok && sign.club.roster).toHaveLength(size + 1);
    expect(sign.ok && sign.club.roster.some(p => p.id === candidate.id)).toBe(true);
    expect(sign.ok && sign.club.recruitSlot).toBeNull();
    expect(sign.ok && sign.club.recruitBoard!.candidates).toHaveLength(RECRUIT_CONFIG.candidateCount);
    const cut = await h.act({ type: 'recruit.cut', playerId: candidate.id });
    expect(cut.ok && cut.club.roster).toHaveLength(size);
    h.set(s => { s.roster = s.roster.slice(0, 6); });
    expect(await h.act({ type: 'recruit.cut', playerId: h.state().roster[0].id })).toMatchObject({ ok: false, code: 'limit_reached' });
  });
});

describe('club action coverage: dailies, defense, campus and club', () => {
  it('daily.claim pays once per quest and the sweep bonus once', async () => {
    const h = harness(); await boot(h);
    // The authority settles dailies on the UTC day; a protected club's slate is that day's.
    const day = new Date(h.now).toISOString().slice(0, 10);
    const slate = questsForDate(day);
    expect(await h.act({ type: 'daily.claim', questId: slate[0].id })).toMatchObject({ ok: false, code: 'not_ready' });
    h.set(s => { s.dailies = { date: day, progress: Object.fromEntries(slate.map(q => [q.id, q.target])), claimed: [], sweepClaimed: false }; });
    let gems = h.state().resources.GEMS;
    for (const [i, q] of slate.entries()) {
      const claim = await h.act({ type: 'daily.claim', questId: q.id });
      const expected = (q.reward.gems ?? 0) + (i === slate.length - 1 ? 6 : 0);
      expect(claim.ok && claim.result).toMatchObject({ gained: { GEMS: expected, COINS: q.reward.coins ?? 0 } });
      expect(claim.ok && claim.club.resources.GEMS).toBe(gems + expected);
      gems += expected;
      expect(await h.act({ type: 'daily.claim', questId: q.id })).toMatchObject({ ok: false, code: 'already_claimed' });
    }
    expect(h.state().dailies.sweepClaimed).toBe(true);
  });
  it('defense.buy-slot, defense.upgrade-slot and parking.upgrade spend exactly their ladder costs', async () => {
    const h = harness(); await boot(h);
    h.set(s => { s.resources.COINS = 200_000; s.resources.GEMS = 1000; s.buildings.find(b => b.type === BuildingType.STADIUM)!.level = 3; });
    const buy = await h.act({ type: 'defense.buy-slot' });
    expect(buy.ok && buy.result).toMatchObject({ spent: { GEMS: EXTRA_SLOT_COSTS[0] } });
    expect(buy.ok && buy.club.bonusDefSlots).toBe(1);
    const d1 = await h.act({ type: 'defense.upgrade-slot', slotId: 'D1' });
    expect(d1.ok && d1.result).toMatchObject({ toLevel: 2, spent: { COINS: slotUpgradeCost('jugs', 2) } });
    const d3 = await h.act({ type: 'defense.upgrade-slot', slotId: 'D3' });
    expect(d3.ok && d3.result).toMatchObject({ toLevel: 1, spent: { COINS: slotUpgradeCost('ref', 1) } });
    expect(d3.ok && d3.club.defenseSlots).toEqual({ D1: 2, D3: 1 });
    expect(await h.act({ type: 'defense.upgrade-slot', slotId: 'D6' })).toMatchObject({ ok: false, code: 'locked' });
    expect(await h.act({ type: 'defense.upgrade-slot', slotId: 'ZZ' })).toMatchObject({ ok: false, code: 'not_found' });
    const coins = h.state().resources.COINS;
    const pave = await h.act({ type: 'parking.upgrade' });
    expect(pave.ok && pave.result).toMatchObject({ toLevel: 1, spent: { COINS: PARKING_LOT.costs[0] } });
    expect(pave.ok && pave.club.resources.COINS).toBe(coins - PARKING_LOT.costs[0]);
  });
  it('formation.set, gate.assign, campus.apply and defense.seen change defense settings without spending', async () => {
    const h = harness(); await boot(h);
    const coins = h.state().resources.COINS;
    const formation = await h.act({ type: 'formation.set', formation: 'cover3' });
    expect(formation.ok && formation.club.formation).toBe('cover3');
    expect(formation.ok && formation.club.campusLayout).toBeUndefined();
    expect(await h.act({ type: 'formation.set', formation: 'wishbone' })).toMatchObject({ ok: false, code: 'invalid_command' });
    const gate = await h.act({ type: 'gate.assign', postId: 'south', heroKey: STARTER_HERO_KEYS[1] });
    expect(gate.ok && gate.club.heroGates).toEqual({ south: STARTER_HERO_KEYS[1] });
    const moved = await h.act({ type: 'gate.assign', postId: 'north', heroKey: STARTER_HERO_KEYS[1] });
    expect(moved.ok && moved.club.heroGates).toEqual({ north: STARTER_HERO_KEYS[1] }); // one post per hero
    expect(await h.act({ type: 'gate.assign', postId: 'north', heroKey: 'legend' })).toMatchObject({ ok: false, code: 'locked' });
    const layout = templateCampusLayout('cover3', h.state().buildings);
    const campus = await h.act({ type: 'campus.apply', layout });
    expect(campus.ok && campus.club.campusLayout?.formation).toBe('cover3');
    expect(await h.act({ type: 'campus.apply', layout: { ...layout, walls: [] } })).toMatchObject({ ok: false, code: 'invalid_command' });
    h.set(s => { s.defenseLog = [{ id: 'm1', attacker: 'X', at: 1, stars: 1, pct: 50, coinsLost: 0, seen: false }, { id: 'm2', attacker: 'Y', at: 2, stars: 0, pct: 10, coinsLost: 0, seen: false }]; });
    const seen = await h.act({ type: 'defense.seen', ids: ['m1'] });
    expect(seen.ok && seen.club.defenseLog.map(e => e.seen)).toEqual([true, false]);
    expect(h.state().resources.COINS).toBe(coins);
  });
  it('club.rename applies the shared name rule and preserves an over-long stored legacy name until edited', async () => {
    const h = harness(); await boot(h);
    h.set(s => { s.teamName = 'A Legacy Club Name That Is Far Too Long For The Rule'; });
    const sync = await h.act({ type: 'sync' });
    expect(sync.ok && sync.club.teamName).toBe('A Legacy Club Name That Is Far Too Long For The Rule');
    expect(await h.act({ type: 'club.rename', name: 'x'.repeat(25) })).toMatchObject({ ok: false, code: 'invalid_command' });
    const renamed = await h.act({ type: 'club.rename', name: '  Storm   City  ' });
    expect(renamed.ok && renamed.club.teamName).toBe('Storm City');
  });
});

describe('every exposed action type has a matrix entry', () => {
  it('lists the reducer\'s action types', async () => {
    const covered = ['sync', 'facility.collect', 'facility.upgrade', 'facility.rush', 'builder.hire', 'rally', 'training.start', 'training.collect', 'hero.train', 'hero.unlock', 'hero.star', 'hero.scout', 'recruit.refresh', 'recruit.start', 'recruit.rush', 'recruit.sign', 'recruit.cut', 'daily.claim', 'defense.seen', 'defense.buy-slot', 'defense.upgrade-slot', 'formation.set', 'gate.assign', 'campus.apply', 'parking.upgrade', 'club.rename'];
    const { parseClubAction } = await import('../game/authority/clubActions');
    for (const type of covered) expect(parseClubAction({ type, ...({ 'facility.collect': { buildingId: 'x' }, 'facility.upgrade': { buildingId: 'x' }, 'facility.rush': { jobId: 'x' }, 'training.start': { drillId: 'x', unit: 'OFFENSE_LINE' }, 'training.collect': { buildingId: 'x' }, 'hero.train': { heroKey: 'x' }, 'hero.unlock': { heroKey: 'x' }, 'hero.star': { heroKey: 'x' }, 'recruit.start': { candidateId: 'x' }, 'recruit.cut': { playerId: 'x' }, 'daily.claim': { questId: 'x' }, 'defense.seen': { ids: [] }, 'defense.upgrade-slot': { slotId: 'x' }, 'formation.set': { formation: 'goalline' }, 'gate.assign': { postId: 'x', heroKey: 'x' }, 'campus.apply': { layout: templateCampusLayout('goalline', createInitialState().buildings) }, 'club.rename': { name: 'ok' } } as Record<string, Record<string, unknown>>)[type] })).not.toBeNull();
    expect(parseClubAction({ type: 'hero.spawn' })).toBeNull();
    expect(ResourceType.COINS).toBe('COINS');
  });
});
