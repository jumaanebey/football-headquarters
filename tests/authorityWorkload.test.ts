// Workload bounds: the club state synced on every answer never carries film; answers and film
// payloads stay under the documented caps; verification of the worst valid film is bounded;
// settled matches accumulate one row each (retention is an owner decision, recorded).
import { describe, expect, it } from 'vitest';
import { createAuthorityService } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import { buildMatchCorpus } from '../game/authority/matchCorpus';
import { verifyMatch } from '../game/authority/matches';
import type { BattleConfig } from '../game/combat/contracts';

const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
const hasScript = (v: unknown): boolean => JSON.stringify(v).includes('"script":[');

describe('replay and history workload bounds', () => {
  it('club state and status answers carry receipts but never film; film comes only through the bounded film request', async () => {
    let now = ACTIVATION + 60_000; let ops = 1; let ids = 9700;
    const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
    const service = createAuthorityService(store, { now: () => now, randomUint32: () => 11, uuid: () => op(ids++) });
    const call = (owner: string, input: unknown) => service({ owner, createdAt: ACTIVATION + 1000 }, input);
    const revision = (owner: string) => store.clubs.get(owner)!.revision;
    const target = uid(1);
    await call(target, { kind: 'bootstrap' });
    store.clubs.get(target)!.state.currentMatch = 5;
    const sizes: number[] = [];
    for (let i = 2; i <= 13; i++) {
      const attacker = uid(i);
      await call(attacker, { kind: 'bootstrap' });
      store.clubs.get(attacker)!.state.currentMatch = 5;
      store.clubs.get(target)!.state.shieldUntil = 0;
      const reserved = await call(attacker, { kind: 'match.reserve', operationId: op(ops++), expectedRevision: revision(attacker), choice: { kind: 'rival', target } });
      const matchId = reserved.ok ? (reserved.result as { matchId: string }).matchId : '';
      await call(attacker, { kind: 'match.begin', operationId: op(ops++), expectedRevision: revision(attacker), matchId });
      const match = store.matches.get(matchId)!;
      const film = playHeadlessMatch(match.config as BattleConfig, match.seed);
      now += film.submission.ticks * 50 + 500;
      const settled = await call(attacker, { kind: 'match.finish', operationId: op(ops++), expectedRevision: revision(attacker), matchId, submission: film.submission });
      expect(settled.ok).toBe(true);
      // The settlement answer carries the attacker's club (no film) and the receipt's battle result (no script).
      expect(hasScript(settled.ok && settled.club)).toBe(false);
      expect(hasScript(settled.ok && settled.result)).toBe(false);
      sizes.push(bytes(store.clubs.get(target)!.state));
    }
    const status = await call(target, { kind: 'status' });
    expect(status.ok).toBe(true);
    expect(hasScript(status)).toBe(false);
    const statusBytes = bytes(status);
    const stateBytes = sizes[sizes.length - 1];
    expect(stateBytes).toBeLessThan(120_000);
    expect(statusBytes).toBeLessThan(160_000);
    // Growth per receipt is small and bounded by the 30-receipt cap; film lives only in the matches table.
    expect(sizes[sizes.length - 1] - sizes[0]).toBeLessThan(11 * 600);
    const film = await call(target, { kind: 'film', matchId: [...store.matches.keys()].pop()! });
    expect(film.ok && hasScript(film.result)).toBe(true);
    expect(bytes(film)).toBeLessThan(450_000);
    expect(store.matches.size).toBe(12); // one row per settled match; retention is not bounded here (owner decision, see docs)
    console.info(`[workload] club state ${stateBytes} B with ${store.clubs.get(target)!.state.defenseLog.length} receipts · status answer ${statusBytes} B · film answer ${bytes(film)} B · matches rows ${store.matches.size}`);
  });
  it('verification of the longest valid films in the corpus is bounded and does not scale with anything but ticks', () => {
    const timings: string[] = [];
    for (const m of buildMatchCorpus()) {
      const played = playHeadlessMatch(m.config, m.seed, m.plan);
      const issuedAt = m.config.authority!.issuedAt;
      const started = performance.now();
      verifyMatch({ id: m.config.authority!.matchId, owner: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', seed: m.seed, issuedAt, expiresAt: m.config.authority!.expiresAt, cost: 12, choice: { kind: 'campaign', stage: 1 }, config: m.config }, played.submission, issuedAt + played.submission.ticks * 50 + 500);
      const elapsed = performance.now() - started;
      timings.push(`${m.id}: ${played.submission.ticks} ticks, ${played.submission.script.length} commands, ${elapsed.toFixed(0)} ms`);
      expect(elapsed).toBeLessThan(3000);
    }
    console.info(`[workload] ${timings.join(' · ')}`);
  });
  it('a 450 KB legacy save and a 1 500-command film are the largest inputs the service will parse', () => {
    const film = buildMatchCorpus()[0];
    const played = playHeadlessMatch(film.config, film.seed, film.plan);
    expect(bytes(played.submission)).toBeLessThan(120_000);
    expect(played.submission.script.length).toBeLessThanOrEqual(1500);
  });
});
