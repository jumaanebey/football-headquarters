#!/usr/bin/env node
// Weekly funnel report (read-only). Counts unique players reaching each funnel milestone inside
// a time window, with the denominator (players visible in the window), the window itself, the
// return cohorts that are already observable, and QA traffic separated where a reliable marker
// exists. Reads raw rows from fhq_events with the service-role key supplied at runtime — never
// stored by this script, never logged — or runs against a fixture file for validation.
//
//   npm run funnel:weekly                              last 7 days, key from SUPABASE_SERVICE_ROLE_KEY or .env.local
//   SUPABASE_SERVICE_ROLE_KEY=… npm run funnel:weekly  runtime-injected credential (preferred)
//   npm run funnel:weekly -- --days 30 --json          longer window, machine-readable output
//   npm run funnel:weekly -- --fixture tests/fixtures/funnel-events.json --now 2026-09-10T12:00:00Z
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const has = (name) => process.argv.includes(name);
const DAY = 86_400_000;

export const FUNNEL = [
  ['visible_start', 'Game visible', ['session_start']],
  ['naming_complete', 'Named the club', ['club_created']],
  ['tutorial_complete', 'Finished the tutorial', ['tutorial_choice']],
  ['first_kickoff', 'Kicked off a first game', ['campaign_start', 'raid_open', 'gauntlet_start']],
  ['result', 'Saw a result', ['battle_result']],
  ['confirmed_reward', 'Reward confirmed', ['battle_confirmed']],
  ['upgrade_meaningful', 'Meaningful upgrade', ['building_upgrade', 'hero_upgrade']],
  ['backup_prompt_viewed', 'Backup prompt viewed', []],
  ['backup_completed', 'Backup completed', []],
  ['return_visit', 'Returned another day', []],
];

/** Pure: compute the report from rows [{pid, event, props, ts}]. Exported for tests. */
export function computeFunnel(rows, { now = Date.now(), days = 7, qaPids = new Set() } = {}) {
  const since = now - days * DAY;
  const isQa = r => qaPids.has(r.pid) || r.props?.qa === true;
  const inWindow = rows.filter(r => { const t = Date.parse(r.ts); return Number.isFinite(t) && t >= since && t <= now; });
  const qaRows = inWindow.filter(isQa), real = inWindow.filter(r => !isQa(r));
  const players = new Set(real.map(r => r.pid));
  const stepCounts = FUNNEL.map(([step, label, legacy]) => {
    const direct = new Set(real.filter(r => r.event === `funnel_${step}`).map(r => r.pid));
    const derived = new Set(real.filter(r => legacy.includes(r.event)).map(r => r.pid));
    const union = new Set([...direct, ...derived]);
    return { step, label, players: union.size, direct: direct.size, legacyDerived: [...derived].filter(p => !direct.has(p)).length, pct: players.size ? Math.round(1000 * union.size / players.size) / 10 : null, source: direct.size ? (derived.size > direct.size ? 'mixed' : 'funnel events') : derived.size ? 'legacy events only' : 'no events' };
  });
  // Return cohorts: first-seen day (over ALL rows, so an older player is not a "new" one) for players first seen in the window; D1/D7 only where the day has already passed.
  const firstSeen = new Map();
  for (const r of rows.filter(r => !isQa(r))) { const t = Date.parse(r.ts); if (Number.isFinite(t) && (!firstSeen.has(r.pid) || t < firstSeen.get(r.pid))) firstSeen.set(r.pid, t); }
  const activeDays = new Map();
  for (const r of rows.filter(r => !isQa(r))) { const t = Date.parse(r.ts); if (!Number.isFinite(t)) continue; const d = Math.floor(t / DAY); if (!activeDays.has(r.pid)) activeDays.set(r.pid, new Set()); activeDays.get(r.pid).add(d); }
  const cohorts = [];
  for (const [pid, t] of firstSeen) if (t >= since) { const d0 = Math.floor(t / DAY); const days_ = activeDays.get(pid); cohorts.push({ pid, day: new Date(d0 * DAY).toISOString().slice(0, 10), d1: Math.floor(now / DAY) > d0 ? days_.has(d0 + 1) : null, d7: Math.floor(now / DAY) > d0 + 6 ? days_.has(d0 + 7) : null }); }
  const byDay = {};
  for (const c of cohorts) { const b = byDay[c.day] ??= { day: c.day, newPlayers: 0, d1Observable: 0, d1: 0, d7Observable: 0, d7: 0 }; b.newPlayers++; if (c.d1 !== null) { b.d1Observable++; if (c.d1) b.d1++; } if (c.d7 !== null) { b.d7Observable++; if (c.d7) b.d7++; } }
  return {
    window: { from: new Date(since).toISOString(), to: new Date(now).toISOString(), days },
    data: inWindow.length ? 'present' : rows.length ? 'no events in window' : 'no events at all',
    denominator: players.size, events: real.length, qa: { rows: qaRows.length, players: new Set(qaRows.map(r => r.pid)).size, marker: 'known QA account ids (scripts/qa-accounts.json) and props.qa === true' },
    steps: stepCounts,
    returnCohorts: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)),
    returningInWindow: new Set(real.filter(r => r.event === 'funnel_return_visit' || (r.event === 'session_start' && r.props?.returning === true)).map(r => r.pid)).size,
  };
}

export function renderFunnel(report) {
  const lines = [];
  lines.push(`FOOTBALL HEADQUARTERS — WEEKLY FUNNEL   ${report.window.from.slice(0, 10)} → ${report.window.to.slice(0, 10)} (${report.window.days} days)`);
  lines.push(`data: ${report.data} · players visible: ${report.denominator} · events: ${report.events} · QA excluded: ${report.qa.players} players / ${report.qa.rows} rows (${report.qa.marker})`);
  lines.push('');
  lines.push('  step                        players    % of visible   source');
  for (const s of report.steps) lines.push(`  ${s.label.padEnd(26)} ${String(s.players).padStart(7)}   ${s.pct === null ? '   n/a' : `${String(s.pct).padStart(5)}%`}        ${s.source}${s.legacyDerived ? ` (+${s.legacyDerived} legacy-derived)` : ''}`);
  lines.push('');
  lines.push(`  returning players in window: ${report.returningInWindow}`);
  lines.push('  return cohorts (new players first seen in window; D1/D7 shown only once observable)');
  if (!report.returnCohorts.length) lines.push('    (none)');
  for (const c of report.returnCohorts) lines.push(`    ${c.day}  new ${String(c.newPlayers).padStart(3)}   D1 ${c.d1Observable ? `${c.d1}/${c.d1Observable}` : 'not yet'}   D7 ${c.d7Observable ? `${c.d7}/${c.d7Observable}` : 'not yet'}`);
  return lines.join('\n');
}

async function fetchRows(url, key, since) {
  const rows = []; const page = 1000;
  for (let offset = 0; ; offset += page) {
    const res = await fetch(`${url}/rest/v1/fhq_events?select=pid,event,props,ts&ts=gte.${encodeURIComponent(since)}&order=ts.asc&limit=${page}&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`fhq_events: HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (is the key the service_role key?)' : ''}`);
    const batch = await res.json(); rows.push(...batch);
    if (batch.length < page) break;
  }
  return rows;
}

const main = async () => {
  const days = Number(arg('--days', '7')), now = Date.parse(arg('--now', new Date().toISOString()));
  const qaPids = new Set(JSON.parse(readFileSync(join(ROOT, 'scripts/qa-accounts.json'), 'utf8')).accounts.map(a => a.id));
  let rows, source;
  const fixture = arg('--fixture', '');
  if (fixture) { rows = JSON.parse(readFileSync(fixture, 'utf8')); source = `fixture ${fixture}`; }
  else {
    const envFile = (name) => { try { return Object.fromEntries(readFileSync(join(ROOT, name), 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })); } catch { return {}; } };
    const env = { ...envFile('.env.production'), ...envFile('.env.local'), ...process.env };
    const key = env.SUPABASE_SERVICE_ROLE_KEY, url = env.VITE_SUPABASE_URL;
    if (!key || !url) { console.error('real-data execution blocked: SUPABASE_SERVICE_ROLE_KEY (runtime env or .env.local) and VITE_SUPABASE_URL are required. Validate with --fixture tests/fixtures/funnel-events.json.'); process.exit(2); }
    rows = await fetchRows(url, key, new Date(now - (days + 8) * DAY).toISOString()); // 8 extra days so D7 cohorts and first-seen are computable
    source = `fhq_events via REST (service role, ${rows.length} rows since ${new Date(now - (days + 8) * DAY).toISOString().slice(0, 10)})`;
  }
  const report = computeFunnel(rows, { now, days, qaPids });
  if (has('--json')) console.log(JSON.stringify({ source, ...report }, null, 2));
  else { console.log(renderFunnel(report)); console.log(`\nsource: ${source}`); }
};
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(`funnel report failed: ${e.message}`); process.exit(1); });
