// Funnel helper: once per player per milestone, per match for results, per day for returns; only
// allow-listed scalar props; tokens/emails/club state never leave; storage failures degrade safely.
import { describe, expect, it } from 'vitest';
import { FUNNEL_STEPS, FUNNEL_STORAGE_KEY, trackFunnel } from '../game/funnel';

const memory = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, values }; };
const sink = () => { const events: Array<[string, Record<string, unknown>]> = []; return { events, emit: (e: string, p: Record<string, unknown> = {}) => { events.push([e, p]); } }; };

describe('funnel milestones', () => {
  it('defines the stable ordered funnel', () => {
    expect(FUNNEL_STEPS.map(s => s.step)).toEqual(['visible_start', 'naming_complete', 'tutorial_complete', 'first_kickoff', 'result', 'confirmed_reward', 'upgrade_meaningful', 'backup_prompt_viewed', 'backup_completed', 'return_visit']);
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
});
