import { describe, expect, it } from 'vitest';
import { createAuthorityService, type AuthorityResponse, type AuthoritySuccess } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { createInitialState } from '../game/initialState';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import { replayMatch } from '../game/combat/engine';
import { validateReplay } from '../game/combat/replay';
import { RAID_ENERGY, UPGRADE_CONFIG } from '../constants';
import { BuildingType, type GameState } from '../types';
import { HERO_DEFS, STARTER_HERO_KEYS } from '../battle';
import type { BattleConfig, BattleResult } from '../game/combat/contracts';
import type { AuthorityMatchConfig } from '../server/authorityStore';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A deterministic service over the memory store with a controllable clock. */
const harness = () => {
  let now = ACTIVATION + 60_000;
  let ids = 1000;
  const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
  const service = createAuthorityService(store, { now: () => now, randomUint32: () => 0x1234_5678, uuid: () => op(ids++) });
  const call = (owner: string, input: unknown, createdAt = ACTIVATION + 1000) => service({ owner, createdAt }, input);
  const ok = async (owner: string, input: unknown, createdAt?: number): Promise<AuthoritySuccess> => {
    const response = await call(owner, input, createdAt);
    if (!response.ok) throw new Error(`expected success, got ${response.code}: ${response.message}`);
    return response;
  };
  const fail = async (owner: string, input: unknown, createdAt?: number) => {
    const response = await call(owner, input, createdAt);
    if (response.ok) throw new Error('expected failure');
    return response;
  };
  const advance = (ms: number) => { now += ms; };
  const state = (owner: string) => store.clubs.get(owner)!.state;
  const revision = (owner: string) => store.clubs.get(owner)!.revision;
  /** Reserve → begin → play → finish one match, returning the finish response. */
  const play = async (owner: string, choice: unknown, opBase: number, tamper?: (submission: Record<string, unknown>) => void): Promise<AuthorityResponse> => {
    const reserved = await ok(owner, { kind: 'match.reserve', operationId: op(opBase), expectedRevision: revision(owner), choice });
    const matchId = (reserved.result as { matchId: string }).matchId;
    await ok(owner, { kind: 'match.begin', operationId: op(opBase + 1), expectedRevision: revision(owner), matchId });
    const match = store.matches.get(matchId)!;
    const film = playHeadlessMatch(match.config as BattleConfig, match.seed);
    advance(film.submission.ticks * 50 + 500);
    const submission: Record<string, unknown> = { ...film.submission };
    tamper?.(submission);
    return call(owner, { kind: 'match.finish', operationId: op(opBase + 2), expectedRevision: revision(owner), matchId, submission });
  };
  /** Beginner protection lifts after two Season games. */
  const graduate = async (owner: string, opBase: number) => {
    for (let stage = 1; stage <= 2; stage++) {
      const finished = await play(owner, { kind: 'campaign', stage }, opBase + stage * 10);
      if (!finished.ok) throw new Error(`stage ${stage}: ${finished.code} ${finished.message}`);
    }
  };
  return { store, service, call, ok, fail, advance, state, revision, play, graduate, get now() { return now; } };
};

describe('authority bootstrap and admission', () => {
  it('creates one fresh club per account and returns the same club on repeated bootstrap', async () => {
    const h = harness();
    const first = await h.ok(A, { kind: 'bootstrap' });
    expect(first.club?.origin).toBe('new');
    expect(first.club?.revision).toBe(0);
    const again = await h.ok(A, { kind: 'bootstrap' });
    expect(again.club?.owner).toBe(A);
    expect(h.store.clubs.size).toBe(1);
  });
  it('admits a played legacy club only for accounts created before activation, and never replaces a newer account\'s progress', async () => {
    const h = harness();
    const legacy: GameState = { ...createInitialState(ACTIVATION - 86_400_000), trophies: 120, currentMatch: 4 };
    legacy.resources = { ...legacy.resources, COINS: 4321 };
    const admitted = await h.ok(A, { kind: 'bootstrap', legacy }, ACTIVATION - 3_600_000);
    expect(admitted.club?.origin).toBe('legacy');
    expect(admitted.club?.state.resources.COINS).toBe(4321);
    expect(admitted.club?.state.trophies).toBe(120);
    expect(admitted.club?.state.roster.length).toBe(legacy.roster.length);
    const rejected = await h.fail(B, { kind: 'bootstrap', legacy }, ACTIVATION + 1000);
    expect(rejected.code).toBe('legacy_ineligible');
    expect(h.store.clubs.has(B)).toBe(false);
  });
  it('rejects malformed legacy saves without creating a club', async () => {
    const h = harness();
    const broken = await h.fail(A, { kind: 'bootstrap', legacy: { resources: { COINS: -5 } } }, ACTIVATION - 1000);
    expect(broken.code).toBe('invalid_legacy');
    expect(h.store.clubs.has(A)).toBe(false);
  });
});

describe('authority club actions are exactly-once and revision-guarded', () => {
  it('spends once for a facility upgrade even when the same operation is retried, and refuses the id for a different request', async () => {
    const h = harness();
    await h.ok(A, { kind: 'bootstrap' });
    const stadium = h.state(A).buildings.find(b => b.type === BuildingType.STADIUM)!;
    h.store.clubs.get(A)!.state.resources.COINS = 100_000;
    const coins = h.state(A).resources.COINS;
    const request = { kind: 'action', operationId: op(1), expectedRevision: 0, action: { type: 'facility.upgrade', buildingId: stadium.id } };
    const first = await h.ok(A, request);
    expect(first.club?.revision).toBe(1);
    expect(first.club?.state.resources.COINS).toBe(coins - UPGRADE_CONFIG.baseCost);
    expect(first.club?.state.upgrades).toHaveLength(1);
    const retry = await h.ok(A, request); // lost reply: identical request, stale expectedRevision
    expect(retry.result).toEqual(first.result);
    expect(retry.club?.revision).toBe(1);
    expect(retry.club?.state.resources.COINS).toBe(coins - UPGRADE_CONFIG.baseCost);
    expect(h.store.commits).toBe(1);
    const reused = await h.fail(A, { ...request, action: { type: 'rally' } });
    expect(reused.code).toBe('operation_conflict');
  });
  it('reports a revision conflict with the latest club instead of applying a stale device\'s action', async () => {
    const h = harness();
    await h.ok(A, { kind: 'bootstrap' });
    await h.ok(A, { kind: 'action', operationId: op(1), expectedRevision: 0, action: { type: 'club.rename', name: 'Device One' } });
    const stale = await h.fail(A, { kind: 'action', operationId: op(2), expectedRevision: 0, action: { type: 'club.rename', name: 'Device Two' } });
    expect(stale.code).toBe('revision_conflict');
    expect(stale.club?.state.teamName).toBe('Device One');
    expect(h.state(A).teamName).toBe('Device One');
  });
  it('rejects unknown actions, extra fields and unaffordable purchases without changing the club', async () => {
    const h = harness();
    await h.ok(A, { kind: 'bootstrap' });
    expect((await h.fail(A, { kind: 'action', operationId: op(1), expectedRevision: 0, action: { type: 'hero.spawn' } })).code).toBe('invalid_command');
    expect((await h.fail(A, { kind: 'action', operationId: op(2), expectedRevision: 0, action: { type: 'rally', extra: 1 } })).code).toBe('invalid_command');
    expect((await h.fail(A, { kind: 'action', operationId: op(3), expectedRevision: 0, action: { type: 'builder.hire' } })).code).toBe('insufficient_resources');
    expect((await h.fail(A, { kind: 'action', operationId: op(4), expectedRevision: 0, action: { type: 'rally' }, bonus: true })).code).toBe('invalid_request');
    expect(h.revision(A)).toBe(0);
  });
});

describe('authority matches: reservation, verification and settlement', () => {
  it('reserves Energy with a server seed, settles a verified film exactly once, and refuses tampered or replayed films', async () => {
    const h = harness();
    await h.ok(A, { kind: 'bootstrap' });
    const energy = h.state(A).resources.ENERGY;
    const reserved = await h.ok(A, { kind: 'match.reserve', operationId: op(1), expectedRevision: 0, choice: { kind: 'campaign', stage: 1 } });
    const matchId = (reserved.result as { matchId: string }).matchId;
    expect(reserved.club?.state.resources.ENERGY).toBe(energy - RAID_ENERGY);
    expect(reserved.match?.status).toBe('reserved');
    const config = reserved.match?.config as AuthorityMatchConfig;
    expect(config.authority).toEqual({ matchId, seed: 0x1234_5678, rules: 'hero-actions-3', issuedAt: h.now, expiresAt: h.now + 15 * 60_000 });
    expect(config.squad?.length).toBe(h.state(A).roster.length);
    // A second reservation and any club action are blocked while the game is open.
    expect((await h.fail(A, { kind: 'match.reserve', operationId: op(2), expectedRevision: 1, choice: { kind: 'campaign', stage: 1 } })).code).toBe('active_match');
    expect((await h.fail(A, { kind: 'action', operationId: op(3), expectedRevision: 1, action: { type: 'rally' } })).code).toBe('active_match');
    // Film cannot be submitted before kickoff is acknowledged.
    expect((await h.fail(A, { kind: 'match.finish', operationId: op(4), expectedRevision: 1, matchId, submission: {} })).code).toBe('match_not_started');
    await h.ok(A, { kind: 'match.begin', operationId: op(5), expectedRevision: 1, matchId });
    const match = h.store.matches.get(matchId)!;
    const film = playHeadlessMatch(match.config as BattleConfig, match.seed);
    // Ticks cannot outrun wall-clock time since the match was issued.
    const early = await h.fail(A, { kind: 'match.finish', operationId: op(6), expectedRevision: 2, matchId, submission: film.submission });
    expect(early.code).toBe('invalid_time');
    h.advance(film.submission.ticks * 50 + 500);
    const forged = await h.fail(A, { kind: 'match.finish', operationId: op(7), expectedRevision: 2, matchId, submission: { ...film.submission, finalHash: '00000000' } });
    expect(forged.code).toBe('simulation_mismatch');
    const extraCommands = await h.fail(A, { kind: 'match.finish', operationId: op(8), expectedRevision: 2, matchId, submission: { ...film.submission, script: [...film.submission.script, { k: 't', u: 'OFFENSE_LINE', x: 50, y: 50, tick: 0 }] } });
    expect(['invalid_film', 'simulation_mismatch']).toContain(extraCommands.code);
    expect(h.state(A).currentMatch).toBe(1);
    const coins = h.state(A).resources.COINS;
    const finish = { kind: 'match.finish', operationId: op(9), expectedRevision: 2, matchId, submission: film.submission };
    const settled = await h.ok(A, finish);
    const battle = (settled.result as { battleResult: BattleResult }).battleResult;
    expect(battle.coins).toBe(film.result.coins);
    expect(settled.club?.state.resources.COINS).toBe(coins + battle.coins);
    expect(settled.club?.state.currentMatch).toBe(2);
    expect(settled.club?.activeMatch).toBeNull();
    expect(h.store.matches.get(matchId)?.status).toBe('settled');
    // The lost-reply retry returns the same receipt and credits nothing again.
    const retry = await h.ok(A, finish);
    expect(retry.result).toEqual(settled.result);
    expect(retry.club?.state.resources.COINS).toBe(coins + battle.coins);
    expect(retry.club?.state.currentMatch).toBe(2);
    // The settled match cannot be finished again under a new operation either.
    expect((await h.fail(A, { kind: 'match.finish', operationId: op(10), expectedRevision: 3, matchId, submission: film.submission })).code).toBe('match_conflict');
  });
  it('expires an unstarted reservation and refunds Energy only when the game never kicked off', async () => {
    const h = harness();
    await h.ok(A, { kind: 'bootstrap' });
    const energy = h.state(A).resources.ENERGY;
    const reserved = await h.ok(A, { kind: 'match.reserve', operationId: op(1), expectedRevision: 0, choice: { kind: 'campaign', stage: 1 } });
    const matchId = (reserved.result as { matchId: string }).matchId;
    h.advance(16 * 60_000);
    expect((await h.fail(A, { kind: 'match.begin', operationId: op(2), expectedRevision: 1, matchId })).code).toBe('expired');
    const cancelled = await h.ok(A, { kind: 'match.cancel', operationId: op(3), expectedRevision: 1, matchId });
    expect(cancelled.result).toEqual({ type: 'match.cancel', matchId, refunded: true });
    expect(cancelled.club?.state.resources.ENERGY).toBe(energy);
    expect(cancelled.club?.activeMatch).toBeNull();
    const second = await h.ok(A, { kind: 'match.reserve', operationId: op(4), expectedRevision: 2, choice: { kind: 'campaign', stage: 1 } });
    const secondId = (second.result as { matchId: string }).matchId;
    await h.ok(A, { kind: 'match.begin', operationId: op(5), expectedRevision: 3, matchId: secondId });
    const abandoned = await h.ok(A, { kind: 'match.cancel', operationId: op(6), expectedRevision: 4, matchId: secondId });
    expect(abandoned.result).toEqual({ type: 'match.cancel', matchId: secondId, refunded: false });
    expect(abandoned.club?.state.resources.ENERGY).toBe(energy - RAID_ENERGY);
  });
  it('rejects malformed submissions and invalid choices', async () => {
    const h = harness();
    await h.ok(A, { kind: 'bootstrap' });
    expect((await h.fail(A, { kind: 'match.reserve', operationId: op(1), expectedRevision: 0, choice: { kind: 'campaign', stage: 99 } })).code).toBe('invalid_choice');
    expect((await h.fail(A, { kind: 'match.reserve', operationId: op(2), expectedRevision: 0, choice: { kind: 'rival', target: 'not-a-uuid' } })).code).toBe('invalid_choice');
    const reserved = await h.ok(A, { kind: 'match.reserve', operationId: op(3), expectedRevision: 0, choice: { kind: 'campaign', stage: 1 } });
    const matchId = (reserved.result as { matchId: string }).matchId;
    await h.ok(A, { kind: 'match.begin', operationId: op(4), expectedRevision: 1, matchId });
    expect((await h.fail(A, { kind: 'match.finish', operationId: op(5), expectedRevision: 2, matchId, submission: { plan: 'balanced', script: [], ticks: 0 } })).code).toBe('invalid_film');
    expect((await h.fail(A, { kind: 'match.finish', operationId: op(6), expectedRevision: 2, matchId, submission: { plan: 'balanced', script: 'x', ticks: 0, finalHash: 'deadbeef' } })).code).toBe('invalid_film');
    expect(h.store.matches.get(matchId)?.status).toBe('started');
  });
});

describe('authority rival matches use one server-built defense snapshot', () => {
  it('enforces beginner protection, self-attack, shields and busy targets', async () => {
    const h = harness();
    await h.ok(A, { kind: 'bootstrap' });
    await h.ok(B, { kind: 'bootstrap' });
    expect((await h.fail(A, { kind: 'match.reserve', operationId: op(1), expectedRevision: 0, choice: { kind: 'rival', target: A } })).code).toBe('self_attack');
    expect((await h.fail(A, { kind: 'match.reserve', operationId: op(2), expectedRevision: 0, choice: { kind: 'rival', target: B } })).code).toBe('beginner_protection');
    await h.graduate(A, 100);
    expect((await h.fail(A, { kind: 'match.reserve', operationId: op(3), expectedRevision: h.revision(A), choice: { kind: 'rival', target: B } })).code).toBe('beginner_protection');
    await h.graduate(B, 200);
    h.store.clubs.get(B)!.state.shieldUntil = h.now + 60_000;
    expect((await h.fail(A, { kind: 'match.reserve', operationId: op(4), expectedRevision: h.revision(A), choice: { kind: 'rival', target: B } })).code).toBe('shielded');
    h.store.clubs.get(B)!.state.shieldUntil = 0;
    await h.ok(B, { kind: 'match.reserve', operationId: op(5), expectedRevision: h.revision(B), choice: { kind: 'campaign', stage: 3 } });
    expect((await h.fail(A, { kind: 'match.reserve', operationId: op(6), expectedRevision: h.revision(A), choice: { kind: 'rival', target: B } })).code).toBe('target_busy');
    const rivals = await h.ok(A, { kind: 'status' });
    expect(rivals.rivals?.map(r => r.owner)).toEqual([]); // a busy club is not listed either
  });
  it('attacks the defender\'s current gate assignment and slot upgrade, settles both clubs once, and serves the defender the same film', async () => {
    const h = harness();
    await h.ok(A, { kind: 'bootstrap' });
    await h.ok(B, { kind: 'bootstrap' });
    await h.graduate(A, 100);
    await h.graduate(B, 200);
    // Defender B changes a gate assignment (to a starter hero it owns) and upgrades an emplacement.
    const gateHero = STARTER_HERO_KEYS[STARTER_HERO_KEYS.length - 1];
    const gateHeroName = HERO_DEFS.find(d => d.key === gateHero)!.name;
    h.store.clubs.get(B)!.state.resources.COINS = 100_000;
    h.store.clubs.get(B)!.state.buildings = h.state(B).buildings.map(b => b.type === BuildingType.STADIUM ? { ...b, level: 3 } : b);
    await h.ok(B, { kind: 'action', operationId: op(301), expectedRevision: h.revision(B), action: { type: 'gate.assign', postId: 'south', heroKey: gateHero } });
    await h.ok(B, { kind: 'action', operationId: op(302), expectedRevision: h.revision(B), action: { type: 'defense.upgrade-slot', slotId: 'D1' } });
    await h.ok(B, { kind: 'action', operationId: op(303), expectedRevision: h.revision(B), action: { type: 'defense.upgrade-slot', slotId: 'D3' } });
    expect(h.state(B).heroGates.south).toBe(gateHero);
    expect(h.state(B).defenseSlots).toEqual({ D1: 2, D3: 1 });
    const bCoins = h.state(B).resources.COINS, bTrophies = h.state(B).trophies, bRevision = h.revision(B);
    const rivals = await h.ok(A, { kind: 'status' });
    expect(rivals.rivals?.map(r => r.owner)).toEqual([B]);
    const reserved = await h.ok(A, { kind: 'match.reserve', operationId: op(401), expectedRevision: h.revision(A), choice: { kind: 'rival', target: B } });
    const matchId = (reserved.result as { matchId: string }).matchId;
    const config = reserved.match?.config as AuthorityMatchConfig;
    expect(config.pvpTarget).toBe(B);
    expect(config.defenseSnapshotId).toMatch(/^defense-v1-[0-9a-f]{16}$/);
    expect(config.defenseLayoutId).toMatch(/^campus-v1-[0-9a-f]{16}$/);
    expect(config.fans).toBe(h.state(B).resources.FANS);
    const guardNames = (config.homeGuards ?? []).map(g => g.name);
    expect(guardNames).toContain(gateHeroName); // the assigned starter hero holds the south gate
    expect(config.buildings.find(b => b.id === 'D1')?.level).toBe(2);
    expect(config.buildings.find(b => b.id === 'D3')?.level).toBe(1);
    // Reserving locks the defender's revision too: a later change on B does not alter the snapshot.
    expect(h.revision(B)).toBe(bRevision + 1);
    await h.ok(A, { kind: 'match.begin', operationId: op(402), expectedRevision: h.revision(A), matchId });
    const match = h.store.matches.get(matchId)!;
    const film = playHeadlessMatch(match.config as BattleConfig, match.seed);
    h.advance(film.submission.ticks * 50 + 500);
    const aCoins = h.state(A).resources.COINS;
    const finish = { kind: 'match.finish', operationId: op(403), expectedRevision: h.revision(A), matchId, submission: film.submission };
    const settled = await h.ok(A, finish);
    const battle = (settled.result as { battleResult: BattleResult }).battleResult;
    expect(battle.defenseSnapshotId).toBe(config.defenseSnapshotId);
    expect(settled.club?.state.resources.COINS).toBe(aCoins + battle.coins);
    const defender = h.state(B);
    const lost = Math.min(battle.coins, Math.floor(bCoins * 0.12));
    expect(defender.resources.COINS).toBe(bCoins - lost);
    expect(defender.defenseLog[0]).toMatchObject({ id: matchId, attackerPid: A, stars: battle.stars, pct: battle.pct, coinsLost: lost, seen: false, authorityMatchId: matchId, defenseLayoutId: config.defenseLayoutId });
    if (battle.won) { expect(defender.trophies).toBe(Math.max(0, bTrophies - Math.max(1, battle.stars) * 3)); expect(defender.shieldUntil).toBeGreaterThan(h.now); }
    else expect(defender.formationMastery[defender.formation]).toBe(1);
    // Retrying the settlement is a no-op for both clubs.
    const bAfter = h.revision(B);
    await h.ok(A, finish);
    expect(h.revision(B)).toBe(bAfter);
    expect(h.state(B).defenseLog).toHaveLength(1);
    // Both participants can fetch the film; it replays to the same verified result under the same snapshot.
    const attackerFilm = await h.ok(A, { kind: 'film', matchId });
    const defenderFilm = await h.ok(B, { kind: 'film', matchId });
    expect(defenderFilm.result).toEqual(attackerFilm.result);
    const replay = validateReplay((defenderFilm.result as { replay: unknown }).replay);
    expect(replay).not.toBeNull();
    expect(replay!.snapshot?.defenseSnapshotId).toBe(config.defenseSnapshotId);
    expect(replay!.snapshot?.homeGuards?.map(g => g.name)).toEqual(guardNames);
    const verified = replayMatch(replay!);
    expect(verified.matches).toBe(true);
    expect(verified.result?.pct).toBe(battle.pct);
    // A third account never sees this film.
    await h.ok('cccccccc-cccc-4ccc-8ccc-cccccccccccc', { kind: 'bootstrap' });
    expect((await h.fail('cccccccc-cccc-4ccc-8ccc-cccccccccccc', { kind: 'film', matchId })).code).toBe('film_unavailable');
  });
});

describe('facility schedules and Stadium decisions through the authority ledger',()=>{
 it('commits a schedule once, settles each room once and preserves the reports on retry',async()=>{
  const h=harness();await h.ok(A,{kind:'bootstrap'});
  const request={kind:'action',operationId:op(91001),expectedRevision:h.revision(A),action:{type:'development.start',unit:'ALL',steps:[{station:'film',play:'slants'},{station:'rehab',play:'power'}]}};
  const started=await h.ok(A,request),again=await h.ok(A,request);expect(again.club!.revision).toBe(started.club!.revision);expect(h.state(A).resources.ENERGY).toBe(95);
  h.advance(180000);const sync={kind:'action',operationId:op(91002),expectedRevision:h.revision(A),action:{type:'sync'}};
  const finished=await h.ok(A,sync);expect(finished.club!.state.development!.schedule).toBeNull();expect(finished.club!.state.development!.reports).toHaveLength(2);
  const repeated=await h.ok(A,sync);expect(repeated.club!.revision).toBe(finished.club!.revision);expect(repeated.club!.state.roster[0].stats.iq).toBe(11);
 });
 it('blocks concurrent raid/Stadium play and binds each call to its exact turn',async()=>{
  const h=harness();await h.ok(A,{kind:'bootstrap'});
  await h.ok(A,{kind:'action',operationId:op(92001),expectedRevision:h.revision(A),action:{type:'stadium.start',opponent:'harbor'}});
  const rejected=await h.fail(A,{kind:'match.reserve',operationId:op(92002),expectedRevision:h.revision(A),choice:{kind:'campaign',stage:1}});expect(rejected.code).toBe('active_match');
  const game=h.state(A).stadiumFootball!.game!,call={kind:'action',operationId:op(92003),expectedRevision:h.revision(A),action:{type:'stadium.call',gameId:game.id,turn:'0',call:'left'}};
  const first=await h.ok(A,call),duplicate=await h.ok(A,call);expect(duplicate.club!.state.stadiumFootball).toEqual(first.club!.state.stadiumFootball);expect(duplicate.club!.revision).toBe(first.club!.revision);
  const stale=await h.fail(A,{...call,operationId:op(92004),expectedRevision:h.revision(A)});expect(stale.code).toBe('not_ready');
 });
});
