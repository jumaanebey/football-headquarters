// Weekly funnel report: counts per milestone with the visible-player denominator, legacy-derived
// versus direct funnel events, QA exclusion by id and by marker, missing data versus zero, and
// return cohorts that only report D1/D7 once observable.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeFunnel, renderFunnel, FUNNEL } from '../scripts/funnel-report.mjs';

const rows = JSON.parse(readFileSync('tests/fixtures/funnel-events.json', 'utf8'));
const qa = new Set<string>(JSON.parse(readFileSync('scripts/qa-accounts.json', 'utf8')).accounts.map((a: { id: string }) => a.id));
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
    expect(by.tutorial_complete).toMatchObject({ players: 0, source: 'no events', legacyDerived: 0 });
    expect(by.result.players).toBe(6); expect(by.confirmed_reward.players).toBe(5); expect(by.upgrade_meaningful.players).toBe(0);
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

it('rejects bad windows, ignores malformed/future events and does not count requests as completion',()=>{
 const extra=[null,{pid:'x',event:'funnel_result',ts:'bad'},{pid:'future',event:'funnel_visible_start',ts:'2030-01-01'},...['tutorial_choice','hero_upgrade','building_upgrade'].map(event=>({pid:'x',event,ts:'2026-09-10T01:00:00Z'}))];
 const r=computeFunnel(extra as never,{now:NOW});expect(r.ignoredRows).toBe(3);
 expect(r.steps.find(s=>s.step==='upgrade_meaningful')?.players).toBe(0);expect(r.returnCohorts.map(c=>c.day)).toEqual(['2026-09-10']);
 expect(()=>computeFunnel([],{days:NaN})).toThrow();expect(()=>computeFunnel([],{days:-1})).toThrow();
});
it('waits for a full UTC return day and reports disjoint direct/legacy sources as mixed',()=>{
 const rows=[{pid:'a',event:'funnel_visible_start',ts:'2026-09-09T23:00:00Z'},{pid:'b',event:'session_start',ts:'2026-09-09T23:00:00Z'},{pid:'a',event:'funnel_return_visit',ts:'2026-09-10T01:00:00Z'}];
 const r=computeFunnel(rows,{now:NOW});expect(r.steps[0].source).toBe('mixed');expect(r.returnCohorts[0].d1Observable).toBe(0);
 expect(computeFunnel(rows,{now:Date.parse('2026-09-11T00:00:00Z')}).returnCohorts[0]).toMatchObject({d1Observable:2,d1:1});
});

it('fetches stable bounded pages and stops at a short page',async()=>{
 const {fetchRows}=await import('../scripts/funnel-report.mjs');const {vi}=await import('vitest');
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>Array.from({length:1000},(_,id)=>({id}))}).mockResolvedValueOnce({ok:true,json:async()=>[{id:1000}]});vi.stubGlobal('fetch',fetch);
 try{const rows=await fetchRows('https://fixture.invalid','fixture-key','2026-09-01T00:00:00Z','2026-09-10T00:00:00Z');expect(rows).toHaveLength(1001);expect(fetch.mock.calls[0][0]).toContain('order=ts.asc,id.asc');expect(fetch.mock.calls[1][0]).toContain('offset=1000');expect(fetch.mock.calls[0][0]).toContain('ts=lte.2026-09-10');}finally{vi.unstubAllGlobals();}
});
