// Weekly funnel report: counts per milestone with the visible-player denominator, legacy-derived
// versus direct funnel events, QA exclusion by id and by marker, missing data versus zero, and
// return cohorts that only report D1/D7 once observable.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeFunnel, renderFunnel, FUNNEL } from '../scripts/funnel-report.mjs';

const rows = JSON.parse(readFileSync('tests/fixtures/funnel-events.json', 'utf8'));
const qa = new Set(JSON.parse(readFileSync('scripts/qa-accounts.json', 'utf8')).accounts.map((a: { id: string }) => a.id));
const NOW = Date.parse('2026-09-10T12:00:00Z');

describe('weekly funnel report', () => {
  it('counts unique players per milestone against the visible denominator and excludes QA traffic', () => {
    const r = computeFunnel(rows, { now: NOW, days: 7, qaPids: qa });
    expect(r.data).toBe('present');
    expect(r.denominator).toBe(13); // 12 new players + the old returning one; QA excluded
    expect(r.qa).toMatchObject({ players: 2, rows: 4 });
    const by = Object.fromEntries(r.steps.map(s => [s.step, s]));
    expect(by.visible_start.players).toBe(13);
    expect(by.naming_complete).toMatchObject({ players: 10, pct: 76.9, source: 'funnel events' });
    expect(by.tutorial_complete).toMatchObject({ players: 9, source: 'legacy events only', legacyDerived: 9 });
    expect(by.result.players).toBe(6); expect(by.confirmed_reward.players).toBe(5); expect(by.upgrade_meaningful.players).toBe(3);
    expect(by.backup_completed).toMatchObject({ players: 1, pct: 7.7 });
    expect(by.return_visit.players).toBe(3);
    expect(r.returningInWindow).toBe(4); // three funnel returns + the old player's returning session
    expect(FUNNEL.map(f => f[0])).toContain('backup_prompt_viewed');
  });
  it('separates missing data from zero and keeps return cohorts honest about observability', () => {
    const empty = computeFunnel([], { now: NOW, days: 7, qaPids: qa });
    expect(empty.data).toBe('no events at all'); expect(empty.denominator).toBe(0); expect(empty.steps.every(s => s.pct === null && s.source === 'no events')).toBe(true);
    const outside = computeFunnel(rows, { now: NOW + 40 * 86_400_000, days: 7, qaPids: qa });
    expect(outside.data).toBe('no events in window');
    const r = computeFunnel(rows, { now: NOW, days: 7, qaPids: qa });
    expect(r.returnCohorts.map(c => c.day)).toEqual(['2026-09-04', '2026-09-05', '2026-09-07', '2026-09-09']);
    expect(r.returnCohorts.every(c => c.d7Observable === 0)).toBe(true); // no cohort is seven days old yet
    const later = computeFunnel(rows, { now: NOW + 3 * 86_400_000, days: 10, qaPids: qa });
    expect(later.returnCohorts.find(c => c.day === '2026-09-04')?.d7Observable).toBe(3);
    expect(renderFunnel(r)).toContain('D7 not yet');
    expect(renderFunnel(r)).not.toMatch(/eyJ|@/);
  });
});
