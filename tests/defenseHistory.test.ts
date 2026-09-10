// Defense consequence and history integrity for protected clubs: receipts are newest-first,
// consequences are applied exactly once at settlement (never on read), the visible log keeps a
// bounded number of receipts without losing the consequences already applied, and repeated status
// loads or reloads never duplicate or re-apply anything. The legacy paginated inbox is covered by
// tests/defenseInbox.test.ts (stable (timestamp, id) cursor, equal timestamps, overlapping pages).
import { describe, expect, it } from 'vitest';
import { createAuthorityService } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import type { BattleConfig } from '../game/combat/contracts';
import type { GameState } from '../types';

const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const TARGET = uid(1);

describe('protected-club defense receipts', () => {
  it('thirty-five raids leave thirty newest-first receipts, every consequence applied once, and reloading changes nothing', async () => {
    let now = ACTIVATION + 60_000; let ops = 1; let ids = 9000;
    const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
    const service = createAuthorityService(store, { now: () => now, randomUint32: () => 3, uuid: () => op(ids++) });
    const call = (owner: string, input: unknown) => service({ owner, createdAt: ACTIVATION + 1000 }, input);
    const revision = (owner: string) => store.clubs.get(owner)!.revision;
    await call(TARGET, { kind: 'bootstrap' });
    store.clubs.get(TARGET)!.state.currentMatch = 5;
    store.clubs.get(TARGET)!.state.resources.COINS = 1_000_000;
    let expectedCoins = 1_000_000;
    const settledIds: string[] = [];
    for (let i = 2; i <= 36; i++) {
      const attacker = uid(i);
      await call(attacker, { kind: 'bootstrap' });
      store.clubs.get(attacker)!.state.currentMatch = 5;
      store.clubs.get(TARGET)!.state.shieldUntil = 0; // fixture: keep the target attackable between raids
      const reserved = await call(attacker, { kind: 'match.reserve', operationId: op(ops++), expectedRevision: revision(attacker), choice: { kind: 'rival', target: TARGET } });
      expect(reserved.ok, `raid ${i}`).toBe(true);
      const matchId = reserved.ok ? (reserved.result as { matchId: string }).matchId : '';
      await call(attacker, { kind: 'match.begin', operationId: op(ops++), expectedRevision: revision(attacker), matchId });
      const match = store.matches.get(matchId)!;
      const film = playHeadlessMatch(match.config as BattleConfig, match.seed);
      now += film.submission.ticks * 50 + 500;
      const coinsBefore = store.clubs.get(TARGET)!.state.resources.COINS;
      const settled = await call(attacker, { kind: 'match.finish', operationId: op(ops++), expectedRevision: revision(attacker), matchId, submission: film.submission });
      expect(settled.ok, `settle ${i}`).toBe(true);
      const lost = Math.min(film.result.coins, Math.floor(coinsBefore * 0.12));
      expectedCoins -= lost;
      expect(store.clubs.get(TARGET)!.state.resources.COINS).toBe(expectedCoins);
      settledIds.push(matchId);
      // The receipt's coinsLost matches the consequence that was applied.
      expect(store.clubs.get(TARGET)!.state.defenseLog[0]).toMatchObject({ id: matchId, coinsLost: lost, seen: false });
    }
    const state = store.clubs.get(TARGET)!.state;
    expect(state.defenseLog).toHaveLength(30);
    expect(state.defenseLog.map(e => e.id)).toEqual(settledIds.slice(-30).reverse()); // newest first, oldest five aged out
    expect(new Set(state.defenseLog.map(e => e.id)).size).toBe(30);
    expect(state.defenseLog.every((e, i, all) => i === 0 || e.at <= all[i - 1].at)).toBe(true);
    expect(state.resources.COINS).toBe(expectedCoins); // the five aged-out receipts' consequences were kept
    // Reading status any number of times is not a consequence.
    const before = JSON.stringify(state);
    for (let i = 0; i < 3; i++) expect((await call(TARGET, { kind: 'status' })).ok).toBe(true);
    expect(JSON.stringify(store.clubs.get(TARGET)!.state)).toBe(before);
    // Marking receipts seen touches only the flag; film for an aged-out match remains fetchable by both participants.
    const seen = await call(TARGET, { kind: 'action', operationId: op(ops++), expectedRevision: revision(TARGET), action: { type: 'defense.seen', ids: state.defenseLog.slice(0, 5).map(e => e.id) } });
    expect(seen.ok && seen.club!.state.defenseLog.filter(e => e.seen)).toHaveLength(5);
    expect(seen.ok && seen.club!.state.resources.COINS).toBe(expectedCoins);
    expect((await call(TARGET, { kind: 'film', matchId: settledIds[0] })).ok).toBe(true);
    expect((await call(uid(2), { kind: 'film', matchId: settledIds[0] })).ok).toBe(true);
  });
  it('two raids settled at the same millisecond are both kept, ordered deterministically', async () => {
    let now = ACTIVATION + 60_000; let ops = 1; let ids = 9500;
    const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
    const service = createAuthorityService(store, { now: () => now, randomUint32: () => 5, uuid: () => op(ids++) });
    const call = (owner: string, input: unknown) => service({ owner, createdAt: ACTIVATION + 1000 }, input);
    const revision = (owner: string) => store.clubs.get(owner)!.revision;
    await call(TARGET, { kind: 'bootstrap' });
    store.clubs.get(TARGET)!.state.currentMatch = 5;
    const films: { attacker: string; matchId: string; submission: unknown }[] = [];
    for (const attacker of [uid(2), uid(3)]) {
      await call(attacker, { kind: 'bootstrap' });
      store.clubs.get(attacker)!.state.currentMatch = 5;
      const reserved = await call(attacker, { kind: 'match.reserve', operationId: op(ops++), expectedRevision: revision(attacker), choice: { kind: 'rival', target: TARGET } });
      const matchId = (reserved.ok && (reserved.result as { matchId: string }).matchId) || '';
      await call(attacker, { kind: 'match.begin', operationId: op(ops++), expectedRevision: revision(attacker), matchId });
      const match = store.matches.get(matchId)!;
      films.push({ attacker, matchId, submission: playHeadlessMatch(match.config as BattleConfig, match.seed).submission });
    }
    now += 1400 * 50 + 1000;
    for (const f of films) expect((await call(f.attacker, { kind: 'match.finish', operationId: op(ops++), expectedRevision: revision(f.attacker), matchId: f.matchId, submission: f.submission })).ok).toBe(true);
    const log = (store.clubs.get(TARGET)!.state as GameState).defenseLog;
    expect(log.map(e => e.id)).toEqual([films[1].matchId, films[0].matchId]);
    expect(log[0].at).toBe(log[1].at);
  });
});
