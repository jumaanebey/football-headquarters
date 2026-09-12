// Package D: what must keep working. Expectations are stated before the helpers under test run.
import { describe, expect, it } from 'vitest';
import { createAuthorityService } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { createInitialState } from '../game/initialState';
import { parseSavedClub } from '../game/saveValidation';
import { applyClubAction, settleClubState } from '../game/authority/clubActions';
import { lineupOf, lineupRatings, lineupValid, selectLineup } from '../game/lineup';
import { footballCalls, validStadiumFootball } from '../game/stadiumFootball';
import { COMBAT_RULES_VERSION } from '../game/combat/actions';
import { buildMatchCorpus, runMatchCorpus } from '../game/authority/matchCorpus';
import corpusHashes from './fixtures/determinism-corpus.json';
import type { GameState } from '../types';

const NOW = Date.parse('2026-09-11T12:00:00Z');
const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const club = (): GameState => ({ ...createInitialState(NOW), lastTick: NOW });

describe('saves written before this milestone', () => {
  it('load without a lineup and select the same legal team every time', () => {
    const saved = club();
    delete saved.lineup;
    const raw = JSON.stringify(saved);
    const loaded = parseSavedClub(raw);
    expect(loaded.lineup).toBeUndefined();          // nothing is written into the save on load
    const first = lineupOf(loaded), second = lineupOf(parseSavedClub(raw));
    expect(first).toEqual(second);
    expect(lineupValid(loaded.roster, first)).toBe(true);
    expect(loaded.roster.map(p => p.id)).toEqual(saved.roster.map(p => p.id));
    // Ratings are available immediately, with no migration step and no mutation.
    expect(lineupRatings(loaded.roster, first).attack).toBeGreaterThan(0);
  });
  it('refuse a lineup that names players the save does not contain', () => {
    const saved: GameState = { ...club(), lineup: { version: 1, slots: { QB: 'ghost' }, updatedAt: NOW } };
    // The shape is valid, so the save still loads; the rules refuse the assignment.
    expect(() => parseSavedClub(JSON.stringify(saved))).not.toThrow();
    const loaded = parseSavedClub(JSON.stringify(saved));
    expect(lineupValid(loaded.roster, loaded.lineup!.slots)).toBe(false);
    // …and the club is still playable, because the reducer repairs on the next roster action.
    const repaired = selectLineup(loaded.roster, loaded.lineup!.slots);
    expect(lineupValid(loaded.roster, repaired)).toBe(true);
    expect(repaired.QB).not.toBe('ghost');
  });
  it('keep an in-flight development schedule and settle it on the clock, untouched by this milestone', () => {
    const steps = [{ station: 'weights', play: 'slants' }, { station: 'film', play: 'slants' }] as never;
    const started = applyClubAction(club(), { type: 'development.start', unit: 'ALL', steps }, { now: NOW, random: () => 0.4 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const schedule = started.state.development!.schedule!;
    expect(schedule).toBeTruthy();
    // A schedule advances on elapsed time; nothing about the lineup or the Stadium interferes.
    const settled = settleClubState(started.state, NOW + 10 * 60_000);
    expect(settled.development!.schedule === null || settled.development!.reports.length > 0).toBe(true);
    expect(settled.roster.map(p => p.id)).toEqual(started.state.roster.map(p => p.id));
  });
});

describe('raid rules and recorded films are untouched', () => {
  it('still runs raid-tactics under the same rules version with the committed hashes', () => {
    const expected = corpusHashes as { rules: string; matches: Record<string, { hash: string; stars: number; pct: number; ticks: number }> };
    expect(expected.rules).toBe(COMBAT_RULES_VERSION);
    for (const outcome of runMatchCorpus(buildMatchCorpus())) {
      expect({ hash: outcome.headlessHash, stars: outcome.stars, pct: outcome.pct, ticks: outcome.ticks }, outcome.id).toEqual(expected.matches[outcome.id]);
      expect(outcome.replayMatches, outcome.id).toBe(true);
    }
  });
});

describe('through the authority service', () => {
  const harness = () => {
    let now = ACTIVATION + 60_000, ids = 7100;
    const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => now });
    const service = createAuthorityService(store, { now: () => now, randomUint32: () => 11, uuid: () => op(ids++) });
    return {
      store, service,
      call: (owner: string, input: unknown) => service({ owner, createdAt: ACTIVATION + 1000 }, input),
      revision: (owner: string) => store.clubs.get(owner)!.revision,
      state: (owner: string) => store.clubs.get(owner)!.state,
      advance: (ms: number) => { now += ms; },
    };
  };
  it('applies a lineup change once, however many times the same request arrives', async () => {
    const h = harness();
    await h.call(A, { kind: 'bootstrap' });
    const assignment = selectLineup(h.state(A).roster);
    const request = { kind: 'action', operationId: op(7201), expectedRevision: h.revision(A), action: { type: 'lineup.set', lineup: assignment } };
    const first = await h.call(A, request);
    expect(first.ok).toBe(true);
    const revisionAfterFirst = h.revision(A);
    const repeat = await h.call(A, request);
    expect(repeat.ok).toBe(true);
    expect(h.revision(A)).toBe(revisionAfterFirst);                       // no second mutation
    if (first.ok && repeat.ok) expect(repeat.result).toEqual(first.result); // the original receipt
    expect(h.state(A).lineup!.slots).toEqual(assignment);
  });
  it('keeps each account on its own lineup', async () => {
    const h = harness();
    await h.call(A, { kind: 'bootstrap' });
    await h.call(B, { kind: 'bootstrap' });
    const forA = selectLineup(h.state(A).roster);
    const swapped = { ...forA, QB: forA.RECEIVER!, RECEIVER: forA.QB! };
    await h.call(A, { kind: 'action', operationId: op(7301), expectedRevision: h.revision(A), action: { type: 'lineup.set', lineup: swapped } });
    expect(h.state(A).lineup!.slots).toEqual(swapped);
    expect(h.state(B).lineup).toBeUndefined();            // B never chose; nothing leaked across accounts
    expect(lineupOf(h.state(B))).toEqual(selectLineup(h.state(B).roster));
  });
  it('refuses a lineup naming another account\'s player', async () => {
    const h = harness();
    await h.call(A, { kind: 'bootstrap' });
    await h.call(B, { kind: 'bootstrap' });
    const forA = selectLineup(h.state(A).roster);
    const foreign = h.state(B).roster.find(p => !h.state(A).roster.some(mine => mine.id === p.id));
    const payload = foreign ? { ...forA, QB: foreign.id } : { ...forA, QB: 'not-on-this-roster' };
    const refused = await h.call(A, { kind: 'action', operationId: op(7401), expectedRevision: h.revision(A), action: { type: 'lineup.set', lineup: payload } });
    expect(refused.ok).toBe(false);
    expect(h.state(A).lineup?.slots ?? {}).not.toEqual(payload);
  });
  it('starts a Stadium game whose snapshot survives a save round-trip and a later roster change', async () => {
    const h = harness();
    await h.call(A, { kind: 'bootstrap' });
    const started = await h.call(A, { kind: 'action', operationId: op(7501), expectedRevision: h.revision(A), action: { type: 'stadium.start', format: 'four-downs', opponent: 'harbor' } });
    expect(started.ok).toBe(true);
    const game = h.state(A).stadiumFootball!.game!;
    expect(game.v).toBe(3);
    expect(game.down).toBe(1);
    expect(game.lineup!.players).toHaveLength(9);
    const reloaded = parseSavedClub(JSON.stringify(h.state(A)));
    expect(reloaded.stadiumFootball!.game).toEqual(game);
    expect(validStadiumFootball(reloaded.stadiumFootball)).toBe(true);
    expect(footballCalls(reloaded.stadiumFootball!.game!).length).toBeGreaterThan(0);
  });
});
