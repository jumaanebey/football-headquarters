// Legacy save matrix: every supported era loads with identity intact, repeated migration is
// idempotent, unreadable saves fail recoverably, future fields survive an older loader, and the
// authority admits each honest era for a pre-activation account without losing identity.
import { describe, expect, it } from 'vitest';
import { loadState, SAVE_KEY, SaveLoadError, parseSavedClub } from '../game/persistence';
import { createAuthorityService } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { validateReplay } from '../game/combat/replay';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import { BuildingType, type GameState } from '../types';
import type { BattleConfig } from '../game/combat/contracts';
import { CORRUPT_SAVES, ERA_NOW, IDENTITY, campusSave, fixedBaseSave, futureSave, preFixedBaseSave, protectedMirrorSave, returnProgressionSave } from './fixtures/legacySaves';

const memoryStorage = (values: Record<string, string> = {}): Storage => {
  const data = new Map(Object.entries(values));
  return { get length() { return data.size; }, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); }, clear: () => data.clear(), key: n => [...data.keys()][n] ?? null };
};
const ERAS: [string, () => Record<string, unknown>][] = [['pre-fixed-base (June 2026)', preFixedBaseSave], ['fixed base (July 2026)', fixedBaseSave], ['return progression (Sept 2026)', returnProgressionSave], ['custom campus (Sept 2026)', campusSave], ['protected mirror (Sept 2026)', protectedMirrorSave], ['future client', futureSave]];
const LOAD_AT = ERA_NOW + 5 * 60_000;
/** Fields the loader legitimately recomputes on every load. */
/** Everything except what the loader legitimately recomputes with the clock: energy regen, passive production, patrol positions, daily/gauntlet day. */
const stable = (s: GameState) => {
  const { lastTick, timeOfDay, bonusOrbs, dailies, gauntlet, energyProgressMs, resources, roster, buildings, ...rest } = s as GameState & Record<string, unknown>;
  return { ...rest, gauntletBest: gauntlet.best, dailiesDate: dailies.date, resources: { ...resources, ENERGY: undefined },
    roster: roster.map(({ worldPos, targetPos, state, ...identity }) => identity), buildings: buildings.map(({ accrued, ...b }) => b) };
};

describe('legacy save fixtures load with identity intact', () => {
  it.each(ERAS)('%s', (_label, build) => {
    const raw = JSON.stringify(build());
    const loaded = loadState(memoryStorage({ [SAVE_KEY]: raw }), LOAD_AT);
    expect(loaded.teamName).toBe(IDENTITY.teamName);
    expect(loaded.resources.COINS).toBeGreaterThanOrEqual(IDENTITY.coins); // never less; a refund may add
    expect(loaded.resources.GEMS).toBe(IDENTITY.gems);
    expect(loaded.trophies).toBe(IDENTITY.trophies);
    expect(loaded.roster[0].level).toBe(IDENTITY.firstPlayerLevel);
    expect(loaded.roster.map(p => p.id)).toEqual((build().roster as { id: string }[]).map(p => p.id));
    expect(loaded.heroes.find(h => h.key === 'qb')?.level).toBe(IDENTITY.qbLevel);
    const medicWas = (build().heroes as { key: string; unlocked?: boolean }[]).find(h => h.key === 'medic')?.unlocked;
    expect(loaded.heroes.find(h => h.key === 'medic')?.unlocked).toBe(medicWas ?? false); // eras before unlocks treat non-starters as locked
    expect(loaded.heroes.every(h => Number.isInteger(h.stars) && Number.isInteger(h.shards) && typeof h.unlocked === 'boolean')).toBe(true);
    expect(loaded.buildings.find(b => b.type === BuildingType.STADIUM)?.level).toBe(IDENTITY.stadiumLevel);
    expect(loaded.campaign.claimed).toEqual(IDENTITY.claimed);
    expect(loaded.matchHistory).toHaveLength(1);
    expect(loaded.defenseLog.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(loaded.defenseSlots).length).toBeGreaterThan(0);
    if ('formationMastery' in build()) expect(loaded.formationMastery.goalline).toBe(2); else expect(loaded.formationMastery).toEqual({});
  });
  it('pre-fixed-base equipment becomes slot levels and unplaceable pieces refund at shop price', () => {
    const loaded = loadState(memoryStorage({ [SAVE_KEY]: JSON.stringify(preFixedBaseSave()) }), LOAD_AT);
    expect(loaded.defenseSlots).toEqual({ D1: 1, D3: 1, D2: 1 }); // jugs, ref, and the stored sled fills D2 (Stadium 3 unlocks it)
    expect(loaded.resources.COINS).toBe(IDENTITY.coins); // every owned piece found a slot, so nothing was refunded
    const poorer = preFixedBaseSave(); (poorer.buildings as GameState['buildings']).forEach(b => { if (b.type === BuildingType.STADIUM) b.level = 2; });
    const refunded = loadState(memoryStorage({ [SAVE_KEY]: JSON.stringify(poorer) }), LOAD_AT);
    expect(refunded.defenseSlots).toEqual({ D1: 1, D3: 1 });
    expect(refunded.resources.COINS).toBe(IDENTITY.coins + 1800); // the sled had no unlocked slot at Stadium 2 → refunded at its shop price, once
  });
  it('a custom campus layout survives and positions facilities', () => {
    const loaded = loadState(memoryStorage({ [SAVE_KEY]: JSON.stringify(campusSave()) }), LOAD_AT);
    expect(loaded.campusLayout?.formation).toBe('goalline');
    const scout = loaded.buildings.find(b => b.type === BuildingType.YOUTH_ACADEMY)!;
    expect(scout).toMatchObject({ gridX: 7, gridY: 2 });
  });
  it('protected-mirror receipts and the server board survive the guest loader', () => {
    const loaded = loadState(memoryStorage({ [SAVE_KEY]: JSON.stringify(protectedMirrorSave()) }), LOAD_AT);
    expect(loaded.defenseLog.some(e => e.authorityMatchId)).toBe(true);
    expect(loaded.recruitBoard).toEqual({ candidates: [], generatedAt: ERA_NOW });
  });
});

describe('migration is idempotent', () => {
  it.each(ERAS)('%s: loading the loaded save changes nothing except the clock', (_label, build) => {
    const first = loadState(memoryStorage({ [SAVE_KEY]: JSON.stringify(build()) }), LOAD_AT);
    const second = loadState(memoryStorage({ [SAVE_KEY]: JSON.stringify(first) }), LOAD_AT + 1000);
    const third = loadState(memoryStorage({ [SAVE_KEY]: JSON.stringify(second) }), LOAD_AT + 2000);
    expect(stable(second)).toEqual(stable(first));
    expect(stable(third)).toEqual(stable(first));
    expect(second.resources.COINS).toBe(first.resources.COINS); // refunds are one-time
  });
});

describe('unreadable saves fail recoverably', () => {
  it.each(CORRUPT_SAVES)('%s: load throws SaveLoadError and leaves the file and the last readable backup untouched', (_label, raw) => {
    const backup = JSON.stringify(fixedBaseSave());
    const storage = memoryStorage({ [SAVE_KEY]: raw, fhq_save_backup_boot: backup });
    expect(() => loadState(storage, LOAD_AT)).toThrow(SaveLoadError);
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    expect(storage.getItem('fhq_save_backup_boot')).toBe(backup);
    expect(() => parseSavedClub(backup)).not.toThrow(); // the boundary's "restore last readable backup" path stays viable
  });
  it('a readable save always leaves a boot backup for the recovery screen', () => {
    const raw = JSON.stringify(campusSave());
    const storage = memoryStorage({ [SAVE_KEY]: raw });
    loadState(storage, LOAD_AT);
    expect(storage.getItem('fhq_save_backup_boot')).toBe(raw);
  });
});

describe('old-client write protection', () => {
  it('an older loader preserves fields it does not know, so a newer client\'s data is not erased by a local round trip', () => {
    const loaded = loadState(memoryStorage({ [SAVE_KEY]: JSON.stringify(futureSave()) }), LOAD_AT) as GameState & Record<string, unknown>;
    expect(loaded.saveSchema).toBe(9);
    expect(loaded.futureFeature).toEqual({ enabled: true, items: [1, 2, 3] });
    expect((loaded.heroes[0] as unknown as Record<string, unknown>).talents).toEqual(['x']);
    const again = parseSavedClub(JSON.stringify(loaded)) as GameState & Record<string, unknown>;
    expect(again.saveSchema).toBe(9);
  });
  it('an older client cannot downgrade a protected club: a bootstrap with its old-shaped save returns the existing club unchanged', async () => {
    const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
    const A = '11111111-1111-4111-8111-111111111111';
    const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => ACTIVATION + 60_000 });
    const service = createAuthorityService(store, { now: () => ACTIVATION + 60_000 });
    const identity = { owner: A, createdAt: ACTIVATION - 86_400_000 };
    const admitted = await service(identity, { kind: 'bootstrap', legacy: campusSave() });
    expect(admitted.ok && admitted.club?.state.campusLayout?.formation).toBe('goalline');
    await service(identity, { kind: 'action', operationId: '33333333-3333-4333-8333-333333333333', expectedRevision: 0, action: { type: 'club.rename', name: 'Renamed Online' } });
    const stale = await service(identity, { kind: 'bootstrap', legacy: preFixedBaseSave() });
    expect(stale.ok && stale.club?.revision).toBe(1);
    expect(stale.ok && stale.club?.state.teamName).toBe('Renamed Online');
    expect(stale.ok && stale.club?.state.campusLayout?.formation).toBe('goalline');
  });
  it('film recorded under other rules is refused explicitly instead of replayed', async () => {
    const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
    const A = '11111111-1111-4111-8111-111111111111';
    let now = ACTIVATION + 60_000;
    const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
    const service = createAuthorityService(store, { now: () => now, randomUint32: () => 1, uuid: () => '44444444-4444-4444-8444-444444444444' });
    const identity = { owner: A, createdAt: ACTIVATION + 1000 };
    await service(identity, { kind: 'bootstrap' });
    const reserved = await service(identity, { kind: 'match.reserve', operationId: '55555555-5555-4555-8555-555555555555', expectedRevision: 0, choice: { kind: 'campaign', stage: 1 } });
    const matchId = reserved.ok ? (reserved.result as { matchId: string }).matchId : '';
    await service(identity, { kind: 'match.begin', operationId: '66666666-6666-4666-8666-666666666666', expectedRevision: 1, matchId });
    const match = store.matches.get(matchId)!;
    const film = playHeadlessMatch(match.config as BattleConfig, match.seed);
    now += film.submission.ticks * 50 + 500;
    // The client validator refuses foreign rules on the film itself…
    expect(validateReplay({ ...film.engine.getReplay(), rules: 'hero-actions-2' })).toBeNull();
    expect(validateReplay({ ...film.engine.getReplay(), v: 3 })).toBeNull();
    // …and the server refuses a submission whose commands could only have come from other rules (a 'd' command in attack mode is invalid).
    const foreign = await service(identity, { kind: 'match.finish', operationId: '77777777-7777-4777-8777-777777777777', expectedRevision: 2, matchId, submission: { ...film.submission, script: [{ k: 'd', key: 'noise', tick: 0 }] } });
    expect(!foreign.ok && ['invalid_film', 'simulation_mismatch']).toContain(!foreign.ok && foreign.code);
    expect(store.matches.get(matchId)?.status).toBe('started');
  });
});
