// Weekly funnel report: counts per milestone with the visible-player denominator, legacy-derived
// versus direct funnel events, the seen/confirmed, requested/completed and export/account
// distinctions, QA exclusion by id and by marker, malformed rows excluded by reason, inclusive
// window boundaries, UTC cohort days, pagination, and fixture output that can never pass for
// real data. Real-data runs are blocked without credentials; nothing here touches the network.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { computeFunnel, DAY, fetchRows, FIXTURE_BANNER, renderFunnel, sanitizeRows, FUNNEL } from '../scripts/funnel-report.mjs';

const rows = JSON.parse(readFileSync('tests/fixtures/funnel-events.json', 'utf8'));
const malformedRows = JSON.parse(readFileSync('tests/fixtures/funnel-events-malformed.json', 'utf8'));
const qa = new Set<string>(JSON.parse(readFileSync('scripts/qa-accounts.json', 'utf8')).accounts.map((a: { id: string }) => a.id));
const NOW = Date.parse('2026-09-10T12:00:00Z');
const row = (pid: string, event: string, ts: string, props: Record<string, unknown> = {}) => ({ pid, event, props, ts });

describe('weekly funnel report', () => {
  it('counts unique players per milestone against the visible denominator and excludes QA traffic', () => {
    const r = computeFunnel(rows, { now: NOW, days: 7, qaPids: qa });
    expect(r.data).toBe('present');
    expect(r.denominator).toBe(13); // 12 new players + the old returning one; QA excluded
    expect(r.qa).toMatchObject({ players: 2, rows: 4 });
    expect(r.malformed.total).toBe(0);
    const by = Object.fromEntries(r.steps.map(s => [s.step, s]));
    expect(by.visible_start.players).toBe(13);
    expect(by.naming_complete).toMatchObject({ players: 10, pct: 76.9, source: 'funnel events' });
    expect(by.tutorial_complete).toMatchObject({ players: 9, source: 'legacy events only', legacyDerived: 9 });
    expect(by.result.players).toBe(6); expect(by.confirmed_reward).toMatchObject({ players: 5, source: 'legacy events only' });
    expect(by.upgrade_requested).toMatchObject({ players: 3, direct: 1, legacyDerived: 2, source: 'mixed' }); // building_upgrade means requested, not completed
    expect(by.upgrade_meaningful).toMatchObject({ players: 1, legacyDerived: 0, source: 'funnel events' });
    expect(by.backup_completed).toMatchObject({ players: 2, pct: 15.4 });
    expect(by.return_visit.players).toBe(3);
    expect(r.returningInWindow).toBe(4); // three funnel returns + the old player's returning session
    expect(FUNNEL.map(f => f[0])).toEqual(['visible_start', 'naming_complete', 'tutorial_complete', 'first_kickoff', 'result', 'confirmed_reward', 'upgrade_requested', 'upgrade_meaningful', 'backup_prompt_viewed', 'backup_completed', 'return_visit']);
  });
  it('keeps seen ≠ confirmed, requested ≠ completed, prompt ≠ backup and export ≠ account apart', () => {
    const r = computeFunnel(rows, { now: NOW, days: 7, qaPids: qa });
    expect(r.distinctions).toEqual({ resultsNotConfirmed: 1, upgradesRequestedNotCompleted: 2, backupPromptNotCompleted: 1, backupMethods: { export: 1, account: 1 }, backupUnknownMethod: 0 });
    const text = renderFunnel(r);
    expect(text).toContain('result recorded without a reward event in this window: 1');
    expect(text).toContain('export (download requested) 1 · account (cloud) 1');
    const odd = computeFunnel([row('p1', 'funnel_backup_completed', '2026-09-09T10:00:00Z', { method: 'cloud' })], { now: NOW, days: 7 });
    expect(odd.distinctions.backupUnknownMethod).toBe(1); expect(odd.distinctions.backupMethods).toEqual({ export: 0, account: 0 });
  });
  it('separates missing data from zero and keeps return cohorts honest about observability', () => {
    const empty = computeFunnel([], { now: NOW, days: 7, qaPids: qa });
    expect(empty.data).toBe('no events at all'); expect(empty.denominator).toBe(0); expect(empty.steps.every(s => s.pct === null && s.source === 'no events')).toBe(true);
    expect(empty.distinctions).toEqual({ resultsNotConfirmed: 0, upgradesRequestedNotCompleted: 0, backupPromptNotCompleted: 0, backupMethods: { export: 0, account: 0 }, backupUnknownMethod: 0 });
    expect(empty.returnCohorts).toEqual([]); expect(renderFunnel(empty)).toContain('(none)');
    expect(computeFunnel(null as unknown as [], { now: NOW }).data).toBe('no events at all'); // not even an array
    const outside = computeFunnel(rows, { now: NOW + 40 * DAY, days: 7, qaPids: qa });
    expect(outside.data).toBe('no events in window');
    const r = computeFunnel(rows, { now: NOW, days: 7, qaPids: qa });
    expect(r.returnCohorts.map(c => c.day)).toEqual(['2026-09-04', '2026-09-05', '2026-09-07', '2026-09-09']);
    expect(r.returnCohorts.every(c => c.d7Observable === 0)).toBe(true); // no cohort is seven days old yet
    const later = computeFunnel(rows, { now: NOW + 3 * DAY, days: 10, qaPids: qa });
    expect(later.returnCohorts.find(c => c.day === '2026-09-04')?.d7Observable).toBe(3);
    expect(renderFunnel(r)).toContain('D7 not yet');
    expect(renderFunnel(r)).not.toMatch(/eyJ|@/);
  });
  it('excludes malformed rows by reason (bad ts, missing pid, non-object props, bad event, non-object rows) and reports them', () => {
    const { rows: clean, malformed } = sanitizeRows(malformedRows);
    expect(malformed).toEqual({ total: 10, reasons: { notObject: 2, missingPid: 2, badEvent: 2, badTs: 2, badProps: 2 } });
    expect(clean.map(r => r.event)).toEqual(['session_start', 'funnel_visible_start', 'club_created', 'session_start']);
    expect(clean[1].props).toEqual({}); // null props are fine and normalised
    const r = computeFunnel(malformedRows, { now: NOW, days: 7 });
    expect(r.malformed.total).toBe(10); expect(r.denominator).toBe(2); expect(r.events).toBe(4);
    expect(renderFunnel(r)).toContain('malformed rows excluded: 10 (notObject 2, missingPid 2, badEvent 2, badTs 2, badProps 2)');
    expect(sanitizeRows('nonsense').rows).toEqual([]); expect(sanitizeRows(undefined).malformed.total).toBe(0);
  });
  it('window boundaries are inclusive at exactly `since` and exactly `now`, and exclusive one millisecond outside', () => {
    const since = NOW - 7 * DAY;
    const data = [
      row('at-since', 'session_start', new Date(since).toISOString()),
      row('before-since', 'session_start', new Date(since - 1).toISOString()),
      row('at-now', 'session_start', new Date(NOW).toISOString()),
      row('after-now', 'session_start', new Date(NOW + 1).toISOString()),
    ];
    const r = computeFunnel(data, { now: NOW, days: 7 });
    expect(r.denominator).toBe(2); expect(r.events).toBe(2);
    expect(r.window).toMatchObject({ from: new Date(since).toISOString(), to: new Date(NOW).toISOString(), days: 7 });
    expect(r.returnCohorts.map(c => c.day)).toEqual(['2026-09-03', '2026-09-10']);
  });
  it('cohort days and D1/D7 use UTC calendar days; a player first seen a millisecond before midnight belongs to the earlier day', () => {
    const data = [
      row('late', 'session_start', '2026-09-04T23:59:59.999Z'), row('late', 'session_start', '2026-09-05T00:00:00.000Z'), // returned "the next day" one ms later
      row('early', 'session_start', '2026-09-05T00:00:00.000Z'),
      row('week', 'session_start', '2026-09-02T10:00:00Z'), row('week', 'session_start', '2026-09-09T23:59:59.999Z'), // D7 = day 2 + 7 = the 9th (UTC)
    ];
    const r = computeFunnel(data, { now: Date.parse('2026-09-10T00:00:00.000Z'), days: 9 });
    expect(r.window.timezone).toMatch(/UTC/);
    const byDay = Object.fromEntries(r.returnCohorts.map(c => [c.day, c]));
    expect(byDay['2026-09-04']).toMatchObject({ newPlayers: 1, d1Observable: 1, d1: 1 });
    expect(byDay['2026-09-05']).toMatchObject({ newPlayers: 1, d1Observable: 1, d1: 0 });
    expect(byDay['2026-09-02']).toMatchObject({ newPlayers: 1, d7Observable: 1, d7: 1 });
    // D1 not yet observable when the cohort day is today (UTC), even late in the day.
    const today = computeFunnel([row('new', 'session_start', '2026-09-10T00:10:00Z')], { now: Date.parse('2026-09-10T23:59:00Z'), days: 1 });
    expect(today.returnCohorts[0]).toMatchObject({ day: '2026-09-10', d1Observable: 0, d7Observable: 0 });
  });
  it('excludes QA traffic by known id and by props.qa, from counts and from cohorts alike', () => {
    const qaId = [...qa][0];
    const data = [row(qaId, 'session_start', '2026-09-09T10:00:00Z'), row('marker', 'session_start', '2026-09-09T10:00:00Z', { qa: true }), row('real', 'session_start', '2026-09-09T10:00:00Z')];
    const r = computeFunnel(data, { now: NOW, days: 7, qaPids: qa });
    expect(r.denominator).toBe(1); expect(r.qa).toMatchObject({ rows: 2, players: 2 });
    expect(r.returnCohorts).toEqual([{ day: '2026-09-09', newPlayers: 1, d1Observable: 0, d1: 0, d7Observable: 0, d7: 0 }]);
    const noQa = computeFunnel(data, { now: NOW, days: 7 });
    expect(noQa.denominator).toBe(2); // without the id list only the marker excludes
  });
  it('an older player is not a new cohort member even when only their return falls in the window', () => {
    const data = [row('old', 'session_start', '2026-08-01T10:00:00Z'), row('old', 'session_start', '2026-09-09T10:00:00Z', { returning: true })];
    const r = computeFunnel(data, { now: NOW, days: 7 });
    expect(r.denominator).toBe(1); expect(r.returnCohorts).toEqual([]); expect(r.returningInWindow).toBe(1);
  });
  it('pages through fhq_events until a short page, sends the key only in headers, and fails clearly on HTTP errors', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const page = (n: number, offset: number) => Array.from({ length: n }, (_, i) => row(`p${offset + i}`, 'session_start', '2026-09-09T10:00:00Z'));
    const fetchImpl = async (url: string, init?: RequestInit) => { calls.push({ url, init: init ?? {} }); const offset = Number(new URL(url).searchParams.get('offset')); return { ok: true, status: 200, json: async () => offset === 0 ? page(1000, 0) : page(3, 1000) }; };
    const got = await fetchRows('https://example.supabase.co', 'service-key', '2026-09-01T00:00:00.000Z', { fetchImpl });
    expect(got.length).toBe(1003);
    expect(calls.map(c => new URL(c.url).searchParams.get('offset'))).toEqual(['0', '1000']);
    expect(calls[0].url).toContain('ts=gte.2026-09-01T00%3A00%3A00.000Z'); expect(calls[0].url).not.toContain('service-key');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer service-key');
    await expect(fetchRows('https://example.supabase.co', 'k', '2026-09-01T00:00:00Z', { fetchImpl: async () => ({ ok: false, status: 401, json: async () => [] }) })).rejects.toThrow(/HTTP 401.*service_role/);
    await expect(fetchRows('https://example.supabase.co', 'k', '2026-09-01T00:00:00Z', { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ message: 'nope' }) }) })).rejects.toThrow(/unexpected response body/);
    // A page boundary that lands exactly on the row count: the next page is empty and the loop stops there.
    const exact: string[] = [];
    const small = await fetchRows('https://example.supabase.co', 'k', '2026-09-01T00:00:00Z', { fetchImpl: async (url: string) => { const offset = Number(new URL(url).searchParams.get('offset')); exact.push(String(offset)); return { ok: true, status: 200, json: async () => offset < 4 ? page(2, offset) : [] }; }, page: 2 });
    expect(small.length).toBe(4); expect(exact).toEqual(['0', '2', '4']);
  });
  it('CLI: fixture runs carry an unmistakable banner and source line; real-data runs are blocked without credentials', () => {
    const fixture = spawnSync(process.execPath, ['scripts/funnel-report.mjs', '--fixture', 'tests/fixtures/funnel-events.json', '--now', '2026-09-10T12:00:00Z'], { encoding: 'utf8' });
    expect(fixture.status).toBe(0);
    expect(fixture.stdout.startsWith(FIXTURE_BANNER('tests/fixtures/funnel-events.json'))).toBe(true);
    expect(fixture.stdout.trim().endsWith(FIXTURE_BANNER('tests/fixtures/funnel-events.json'))).toBe(true);
    expect(fixture.stdout).toContain('source: fixture tests/fixtures/funnel-events.json');
    expect(fixture.stdout).not.toMatch(/REAL DATA/);
    const json = spawnSync(process.execPath, ['scripts/funnel-report.mjs', '--fixture', 'tests/fixtures/funnel-events.json', '--now', '2026-09-10T12:00:00Z', '--json'], { encoding: 'utf8' });
    expect(JSON.parse(json.stdout)).toMatchObject({ sourceKind: 'fixture', source: 'fixture tests/fixtures/funnel-events.json', denominator: 13 });
    const env = { ...process.env }; delete env.SUPABASE_SERVICE_ROLE_KEY; delete env.VITE_SUPABASE_URL;
    const blocked = spawnSync(process.execPath, ['scripts/funnel-report.mjs', '--no-dotenv'], { encoding: 'utf8', env });
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain('real-data execution blocked');
    expect(blocked.stdout).toBe('');
  });
});

it('does not treat a saved club or an opened raid menu as a next-day return or kickoff', () => {
  const rows=[{pid:'a',event:'session_start',props:{returning:true},ts:'2026-09-10T08:00:00Z'},{pid:'a',event:'raid_open',props:{},ts:'2026-09-10T08:01:00Z'}];
  const r=computeFunnel(rows,{now:Date.parse('2026-09-10T12:00:00Z')});
  expect(r.returningInWindow).toBe(0);
  expect(r.steps.find(s=>s.step==='first_kickoff')?.players).toBe(0);
  rows.push({pid:'a',event:'session_start',props:{returning:true},ts:'2026-09-11T08:00:00Z'});
  expect(computeFunnel(rows,{now:Date.parse('2026-09-11T12:00:00Z')}).returningInWindow).toBe(1);
});
it('keeps future events out of cohorts and excludes all rows for explicitly marked QA identities', () => {
  const r=computeFunnel([
    {pid:'qa',event:'session_start',props:{},ts:'2026-09-09T12:00:00Z'},
    {pid:'qa',event:'test',props:{qa:true},ts:'2026-09-10T10:00:00Z'},
    {pid:'future',event:'session_start',props:{},ts:'2026-09-12T10:00:00Z'}
  ],{now:Date.parse('2026-09-10T12:00:00Z')});
  expect(r.denominator).toBe(0);expect(r.qa.rows).toBe(2);expect(r.returnCohorts).toEqual([]);
});
