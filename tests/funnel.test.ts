// Funnel helper: once per player per milestone, per match for results and confirmations, per
// method for backups, per day for returns; markers scoped per account; only allow-listed scalar
// props; tokens/emails/club state never leave; storage failures degrade safely. Semantics: a
// viewed result is not a confirmed reward, a requested upgrade is not a completed one, showing
// backup UI is not a backup, and an exported file is not a cloud backup.
import { describe, expect, it } from 'vitest';
import { BACKUP_METHODS, FUNNEL_STEPS, FUNNEL_STORAGE_KEY, funnelStorageKey, trackFunnel } from '../game/funnel';

const memory = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, values }; };
const sink = () => { const events: Array<[string, Record<string, unknown>]> = []; return { events, emit: (e: string, p: Record<string, unknown> = {}) => { events.push([e, p]); } }; };

describe('funnel milestones', () => {
  it('defines the stable ordered funnel with request/complete and view/complete kept apart', () => {
    expect(FUNNEL_STEPS.map(s => s.step)).toEqual(['visible_start', 'naming_complete', 'tutorial_complete', 'first_kickoff', 'result', 'confirmed_reward', 'upgrade_requested', 'upgrade_meaningful', 'backup_prompt_viewed', 'backup_completed', 'return_visit']);
    expect(BACKUP_METHODS).toEqual(['export', 'account']);
  });
  it('emits each ever-milestone once, per-match milestones once per match, and return visits once per day', () => {
    const storage = memory(), { events, emit } = sink();
    let now = Date.parse('2026-09-10T10:00:00Z');
    const o = { storage, emit, now: () => now };
    expect(trackFunnel('naming_complete', { nameLen: 12 }, o)).toBe(true);
    expect(trackFunnel('naming_complete', { nameLen: 12 }, o)).toBe(false);
    expect(trackFunnel('result', { matchId: 'm1', won: true, stars: 3 }, o)).toBe(true);
    expect(trackFunnel('result', { matchId: 'm1', won: true, stars: 3 }, o)).toBe(false); // retried settlement
    expect(trackFunnel('result', { matchId: 'm2', won: false, stars: 0 }, o)).toBe(true);
    expect(trackFunnel('result', { won: true }, o)).toBe(false); // no match id: refuse rather than double count
    expect(trackFunnel('return_visit', { daysSinceFirst: 1 }, o)).toBe(true);
    expect(trackFunnel('return_visit', { daysSinceFirst: 1 }, o)).toBe(false);
    now += 86_400_000;
    expect(trackFunnel('return_visit', { daysSinceFirst: 2 }, o)).toBe(true);
    expect(events.map(e => e[0])).toEqual(['funnel_naming_complete', 'funnel_result', 'funnel_result', 'funnel_return_visit', 'funnel_return_visit']);
    expect(JSON.parse(storage.values.get(FUNNEL_STORAGE_KEY)!)).toMatchObject({ naming_complete: '1', 'result:m1': 'm1', 'result:m2': 'm2', return_visit: '2026-09-11' });
  });
  it('a viewed result is not a confirmed reward: the two are separate milestones keyed by the same match', () => {
    const storage = memory(), { events, emit } = sink(); const o = { storage, emit };
    // Result screen rendered three times (re-renders, back/forward) — one result event.
    for (let i = 0; i < 3; i++) trackFunnel('result', { matchId: 'm9', won: true, stars: 2 }, o);
    expect(events.filter(e => e[0] === 'funnel_result').length).toBe(1);
    expect(events.some(e => e[0] === 'funnel_confirmed_reward')).toBe(false); // seeing it confirms nothing
    // Receipt arrives, and the settlement is retried once by the outbox — one confirmation event.
    expect(trackFunnel('confirmed_reward', { matchId: 'm9', won: true }, o)).toBe(true);
    expect(trackFunnel('confirmed_reward', { matchId: 'm9', won: true }, o)).toBe(false);
    expect(trackFunnel('confirmed_reward', { won: true }, o)).toBe(false); // no match id: refused
    expect(events.map(e => e[0])).toEqual(['funnel_result', 'funnel_confirmed_reward']);
  });
  it('a requested upgrade is not a completed upgrade', () => {
    const storage = memory(), { events, emit } = sink(); const o = { storage, emit };
    expect(trackFunnel('upgrade_requested', { kind: 'building', toLevel: 2, protected: true }, o)).toBe(true);
    expect(trackFunnel('upgrade_requested', { kind: 'hero', toLevel: 2 }, o)).toBe(false); // once per player: the first request is the milestone
    expect(events.some(e => e[0] === 'funnel_upgrade_meaningful')).toBe(false);
    expect(trackFunnel('upgrade_meaningful', { kind: 'building', toLevel: 2, protected: true }, o)).toBe(true);
    expect(events.map(e => e[0])).toEqual(['funnel_upgrade_requested', 'funnel_upgrade_meaningful']);
  });
  it('showing backup UI is not a backup, an export is not a cloud backup, and a backup without a method is refused', () => {
    const storage = memory(), { events, emit } = sink(); const o = { storage, emit };
    expect(trackFunnel('backup_prompt_viewed', { reason: 'first_reward' }, o)).toBe(true);
    expect(trackFunnel('backup_prompt_viewed', { reason: 'settings' }, o)).toBe(false);
    expect(events.some(e => e[0] === 'funnel_backup_completed')).toBe(false);
    expect(trackFunnel('backup_completed', {}, o)).toBe(false); // no method: refused
    expect(trackFunnel('backup_completed', { method: 'cloud' }, o)).toBe(false); // unknown method: refused
    expect(trackFunnel('backup_completed', { method: 'export' }, o)).toBe(true);
    expect(trackFunnel('backup_completed', { method: 'export' }, o)).toBe(false); // second export is not a new milestone
    expect(trackFunnel('backup_completed', { method: 'account' }, o)).toBe(true); // the cloud backup is its own milestone
    expect(events.filter(e => e[0] === 'funnel_backup_completed').map(e => e[1])).toEqual([{ method: 'export' }, { method: 'account' }]);
    expect(JSON.parse(storage.values.get(FUNNEL_STORAGE_KEY)!)).toMatchObject({ 'backup_completed:export': 'export', 'backup_completed:account': 'account' });
  });
  it('scopes markers per account: an account switch neither repeats nor suppresses another account\'s milestones', () => {
    const storage = memory(), { events, emit } = sink();
    expect(funnelStorageKey(null)).toBe(FUNNEL_STORAGE_KEY); expect(funnelStorageKey(undefined)).toBe(FUNNEL_STORAGE_KEY); expect(funnelStorageKey('acc-1')).toBe(`${FUNNEL_STORAGE_KEY}:acc-1`);
    const guest = { storage, emit, accountId: null }, a = { storage, emit, accountId: 'acc-a' }, b = { storage, emit, accountId: 'acc-b' };
    expect(trackFunnel('first_kickoff', { mode: 'attack' }, guest)).toBe(true);
    expect(trackFunnel('first_kickoff', { mode: 'attack' }, guest)).toBe(false);
    expect(trackFunnel('result', { matchId: 'm1', won: true }, a)).toBe(true);
    expect(trackFunnel('result', { matchId: 'm1', won: true }, a)).toBe(false); // repeat render, same account
    expect(trackFunnel('result', { matchId: 'm1', won: true }, b)).toBe(true); // a different owner's match id space
    expect(trackFunnel('result', { matchId: 'm1', won: true }, a)).toBe(false); // switching back does not re-emit
    expect(trackFunnel('first_kickoff', { mode: 'attack' }, a)).toBe(true); // the account's own first kickoff, once
    expect(events.map(e => e[0])).toEqual(['funnel_first_kickoff', 'funnel_result', 'funnel_result', 'funnel_first_kickoff']);
    expect([...storage.values.keys()].sort()).toEqual([FUNNEL_STORAGE_KEY, `${FUNNEL_STORAGE_KEY}:acc-a`, `${FUNNEL_STORAGE_KEY}:acc-b`]);
  });
  it('drops anything outside the allow-list or non-scalar, including tokens, emails and club state', () => {
    const storage = memory(), { events, emit } = sink();
    trackFunnel('first_kickoff', { mode: 'attack', protected: true, email: 'coach@example.invalid', token: 'eyJhbGciOiJIUzI1NiJ9.x.y', club: { coins: 500 }, teamName: 'Very Private FC', note: 'has spaces so it is not an identifier' }, { storage, emit });
    expect(events).toEqual([['funnel_first_kickoff', { mode: 'attack', protected: true }]]);
    expect(JSON.stringify(events)).not.toMatch(/example|eyJ|coins|Private/);
  });
  it('unknown steps emit nothing and a broken storage still emits (at worst a repeat, never silence)', () => {
    const { events, emit } = sink();
    expect(trackFunnel('made_up' as never, {}, { storage: memory(), emit })).toBe(false);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(trackFunnel('backup_completed', { method: 'export' }, { storage: broken, emit })).toBe(true);
    expect(events).toEqual([['funnel_backup_completed', { method: 'export' }]]);
  });
  it('bounds the keyed markers so storage does not grow with every match', () => {
    const storage = memory(), { emit } = sink(); const o = { storage, emit };
    for (let i = 0; i < 100; i++) trackFunnel('result', { matchId: `m${i}` }, o);
    const seen = JSON.parse(storage.values.get(FUNNEL_STORAGE_KEY)!);
    expect(Object.keys(seen).filter(k => k.startsWith('result:')).length).toBe(60);
    expect(seen['result:m99']).toBe('m99'); expect(seen['result:m0']).toBeUndefined();
  });
});
