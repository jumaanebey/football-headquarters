// Existing-club protection: the carry-over policy as deployed (unchanged), interrupted
// bootstraps, refusals that keep local progress recoverable, and a second signed-in session
// adopting the protected state. Account-age boundaries use fixtures around the activation stamp.
import { describe, expect, it } from 'vitest';
import { createAuthorityService } from '../server/authorityService';
import { MemoryAuthorityStore } from '../server/memoryAuthorityStore';
import { AuthorityClient, type AuthorityTransport } from '../game/online/authorityClient';
import { createInitialState } from '../game/initialState';
import type { GameState } from '../types';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTIVATION = Date.parse('2026-09-10T00:47:31.056Z');
const NOW = ACTIVATION + 3_600_000;
const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
const played = (): GameState => { const s = createInitialState(ACTIVATION - 86_400_000); s.trophies = 250; s.currentMatch = 6; s.resources = { ...s.resources, COINS: 7777, GEMS: 42 }; s.teamName = 'Legacy Lions'; return s; };
const pristineNamed = (): GameState => ({ ...createInitialState(NOW - 5000), teamName: 'Fresh Foxes' });

const world = () => {
  const store = new MemoryAuthorityStore({ activationAt: ACTIVATION, now: () => NOW });
  const service = createAuthorityService(store, { now: () => NOW });
  const device = (createdAt: number, faults: { dropAnswer?: boolean } = {}) => {
    const transport: AuthorityTransport = async body => {
      const answer = await service({ owner: A, createdAt }, body);
      if (faults.dropAnswer) return { status: 'offline' };
      return { status: 'ok', owner: A, body: answer };
    };
    return { client: new AuthorityClient(transport, memory()), faults };
  };
  return { store, service, device };
};

describe('carry-over policy as deployed', () => {
  it('an account created before activation carries its played save (origin legacy, progress intact)', async () => {
    const w = world(); const d = w.device(ACTIVATION - 60_000);
    const answer = await d.client.query(A, { kind: 'bootstrap', legacy: played() });
    expect(answer.ok && answer.club).toMatchObject({ origin: 'legacy', revision: 0 });
    expect(answer.ok && answer.club?.state).toMatchObject({ trophies: 250, currentMatch: 6, teamName: 'Legacy Lions' });
    expect(answer.ok && answer.club?.state.resources.COINS).toBe(7777);
  });
  it('an account created at or after activation is admitted only when pristine, keeping its chosen name', async () => {
    const w = world();
    const fresh = await w.device(ACTIVATION).client.query(A, { kind: 'bootstrap', legacy: pristineNamed() });
    expect(fresh.ok && fresh.club).toMatchObject({ origin: 'new', revision: 0 });
    expect(fresh.ok && fresh.club?.state.teamName).toBe('Fresh Foxes');
    expect(fresh.ok && fresh.club?.state.resources.COINS).toBe(500);
  });
  it('a played save on a post-activation account is refused with legacy_ineligible and no club is created', async () => {
    const w = world(); const d = w.device(ACTIVATION + 1);
    const refused = await d.client.query(A, { kind: 'bootstrap', legacy: played() });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.code).toBe('legacy_ineligible');
    expect(w.store.clubs.size).toBe(0);
    expect(d.client.club(A)).toBeNull(); // the local club is untouched: nothing was adopted
  });
  it('a malformed save is refused with invalid_legacy and no club is created', async () => {
    const w = world(); const d = w.device(ACTIVATION - 60_000);
    const refused = await d.client.query(A, { kind: 'bootstrap', legacy: { resources: { COINS: 'lots' } } });
    expect(!refused.ok && refused.code).toBe('invalid_legacy');
    expect(w.store.clubs.size).toBe(0);
  });
  it('one millisecond before activation still carries over; the activation instant does not', async () => {
    const before = world();
    expect((await before.device(ACTIVATION - 1).client.query(A, { kind: 'bootstrap', legacy: played() })).ok).toBe(true);
    const at = world();
    const refused = await at.device(ACTIVATION).client.query(A, { kind: 'bootstrap', legacy: played() });
    expect(!refused.ok && refused.code).toBe('legacy_ineligible');
  });
});

describe('interrupted bootstrap and second sessions', () => {
  it('a bootstrap whose answer was lost already created the club; the retry finds it and never replaces it', async () => {
    const w = world(); const d = w.device(ACTIVATION - 60_000, { dropAnswer: true });
    const lost = await d.client.query(A, { kind: 'bootstrap', legacy: played() });
    expect(lost.ok).toBe(false);
    expect(w.store.clubs.get(A)?.state.trophies).toBe(250);
    d.faults.dropAnswer = false;
    // The retry might carry a different local save (the player kept playing); the server keeps the admitted club.
    const retry = await d.client.query(A, { kind: 'bootstrap', legacy: { ...played(), trophies: 999 } });
    expect(retry.ok && retry.club?.state.trophies).toBe(250);
    expect(retry.ok && retry.club?.revision).toBe(0);
    expect(w.store.clubs.size).toBe(1);
  });
  it('a status check on any device detects the protected club, so protection follows the account', async () => {
    const w = world();
    await w.device(ACTIVATION - 60_000).client.query(A, { kind: 'bootstrap', legacy: played() });
    const other = w.device(ACTIVATION - 60_000);
    const status = await other.client.query(A, { kind: 'status' });
    expect(status.ok && status.club?.owner).toBe(A);
    expect(other.client.club(A)?.state.teamName).toBe('Legacy Lions');
    const change = await other.client.operate(A, 'action', { action: { type: 'club.rename', name: 'Legacy Lions II' } });
    expect(change.status).toBe('confirmed');
    const first = w.device(ACTIVATION - 60_000);
    const refreshed = await first.client.query(A, { kind: 'status' });
    expect(refreshed.ok && refreshed.club?.state.teamName).toBe('Legacy Lions II');
  });
  it('status for an account without a club reports no club, and operations stay refused until bootstrap', async () => {
    const w = world(); const d = w.device(ACTIVATION);
    const status = await d.client.query(A, { kind: 'status' });
    expect(status.ok && status.club).toBeNull();
    expect((await d.client.operate(A, 'action', { action: { type: 'rally' } })).status).toBe('failed');
  });
});
