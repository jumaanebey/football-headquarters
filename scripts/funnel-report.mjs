#!/usr/bin/env node
// Weekly funnel report (read-only). Counts unique players reaching each funnel milestone inside
// a time window, with the denominator (players visible in the window), the window itself, the
// return cohorts that are already observable, and QA traffic separated where a reliable marker
// exists. Reads raw rows from fhq_events with the service-role key supplied at runtime — never
// stored by this script, never logged — or runs against a fixture file for validation. Fixture
// output is banner-marked so it can never be mistaken for real players.
//
//   npm run funnel:weekly                              last 7 days, key from SUPABASE_SERVICE_ROLE_KEY or .env.local
//   SUPABASE_SERVICE_ROLE_KEY=… npm run funnel:weekly  runtime-injected credential (preferred)
//   npm run funnel:weekly -- --days 30 --json          longer window, machine-readable output
//   npm run funnel:weekly -- --fixture tests/fixtures/funnel-events.json --now 2026-09-10T12:00:00Z
//   --no-dotenv   ignore .env.production/.env.local (credentials only from the process environment)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const has = (name) => process.argv.includes(name);
export const DAY = 86_400_000;

// Legacy derivations are honest about what the old event meant: `building_upgrade`/`hero_upgrade`
// fire when an upgrade is requested (and, for protected clubs, accepted) — not when it completes —
// so they derive `upgrade_requested`; `upgrade_meaningful` counts only direct funnel events.
export const FUNNEL = [
  ['visible_start', 'Game visible', ['session_start']],
  ['naming_complete', 'Named the club', ['club_created']],
  ['tutorial_complete', 'Finished the tutorial', ['tutorial_choice']],
  ['first_kickoff', 'Kicked off a first game', ['campaign_start', 'raid_open', 'gauntlet_start']],
  ['result', 'Saw a result', ['battle_result']],
  ['confirmed_reward', 'Reward confirmed', ['battle_confirmed']],
  ['upgrade_requested', 'Requested an upgrade', ['building_upgrade', 'hero_upgrade']],
  ['upgrade_meaningful', 'Meaningful upgrade completed', []],
  ['backup_prompt_viewed', 'Backup prompt viewed', []],
  ['backup_completed', 'Backup completed', []],
  ['return_visit', 'Returned another day', []],
];
export const BACKUP_METHODS = ['export', 'account'];

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
/**
 * Pure: keep only rows the report can trust. A row needs a non-empty string pid, a string event,
 * a parsable ts, and props that are absent/null or a plain object. Everything else is counted
 * by reason and excluded (never guessed). Exported for tests.
 */
export function sanitizeRows(rows) {
  const reasons = { notObject: 0, missingPid: 0, badEvent: 0, badTs: 0, badProps: 0 };
  const clean = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isPlainObject(r)) { reasons.notObject++; continue; }
    if (typeof r.pid !== 'string' || !r.pid.trim()) { reasons.missingPid++; continue; }
    if (typeof r.event !== 'string' || !r.event) { reasons.badEvent++; continue; }
    const t = typeof r.ts === 'string' ? Date.parse(r.ts) : NaN;
    if (!Number.isFinite(t)) { reasons.badTs++; continue; }
    if (r.props !== undefined && r.props !== null && !isPlainObject(r.props)) { reasons.badProps++; continue; }
    clean.push({ pid: r.pid, event: r.event, props: r.props ?? {}, ts: r.ts, t });
  }
  const total = Object.values(reasons).reduce((a, b) => a + b, 0);
  return { rows: clean, malformed: { total, reasons } };
}

/** Pure: compute the report from rows [{pid, event, props, ts}]. Window is inclusive at both ends. Exported for tests. */
export function computeFunnel(input, { now = Date.now(), days = 7, qaPids = new Set() } = {}) {
  const { rows, malformed } = sanitizeRows(input);
  const since = now - days * DAY;
  const isQa = r => qaPids.has(r.pid) || r.props?.qa === true;
  const inWindow = rows.filter(r => r.t >= since && r.t <= now);
  const qaRows = inWindow.filter(isQa), real = inWindow.filter(r => !isQa(r));
  const players = new Set(real.map(r => r.pid));
  const pidsOf = pred => new Set(real.filter(pred).map(r => r.pid));
  const stepCounts = FUNNEL.map(([step, label, legacy]) => {
    const direct = pidsOf(r => r.event === `funnel_${step}`);
    const derived = pidsOf(r => legacy.includes(r.event));
    const union = new Set([...direct, ...derived]);
    return { step, label, players: union.size, direct: direct.size, legacyDerived: [...derived].filter(p => !direct.has(p)).length, pct: players.size ? Math.round(1000 * union.size / players.size) / 10 : null, source: direct.size ? (derived.size > direct.size ? 'mixed' : 'funnel events') : derived.size ? 'legacy events only' : 'no events' };
  });
  const stepPids = step => { const [, , legacy] = FUNNEL.find(f => f[0] === step); return pidsOf(r => r.event === `funnel_${step}` || legacy.includes(r.event)); };
  const minus = (a, b) => [...a].filter(p => !b.has(p)).length;
  // Distinctions the funnel keeps: seen ≠ confirmed, requested ≠ completed, viewed ≠ backed up, exported ≠ on the account.
  const distinctions = {
    resultsNotConfirmed: minus(stepPids('result'), stepPids('confirmed_reward')),
    upgradesRequestedNotCompleted: minus(stepPids('upgrade_requested'), stepPids('upgrade_meaningful')),
    backupPromptNotCompleted: minus(stepPids('backup_prompt_viewed'), stepPids('backup_completed')),
    backupMethods: Object.fromEntries(BACKUP_METHODS.map(m => [m, pidsOf(r => r.event === 'funnel_backup_completed' && r.props?.method === m).size])),
    backupUnknownMethod: pidsOf(r => r.event === 'funnel_backup_completed' && !BACKUP_METHODS.includes(r.props?.method)).size,
  };
  // Return cohorts: first-seen UTC day (over ALL valid rows, so an older player is not a "new" one) for players first seen in the window; D1/D7 only where the UTC day has already passed.
  const nonQa = rows.filter(r => !isQa(r));
  const firstSeen = new Map();
  for (const r of nonQa) if (!firstSeen.has(r.pid) || r.t < firstSeen.get(r.pid)) firstSeen.set(r.pid, r.t);
  const activeDays = new Map();
  for (const r of nonQa) { const d = Math.floor(r.t / DAY); if (!activeDays.has(r.pid)) activeDays.set(r.pid, new Set()); activeDays.get(r.pid).add(d); }
  const today = Math.floor(now / DAY);
  const cohorts = [];
  for (const [pid, t] of firstSeen) if (t >= since && t <= now) { const d0 = Math.floor(t / DAY); const days_ = activeDays.get(pid); cohorts.push({ pid, day: new Date(d0 * DAY).toISOString().slice(0, 10), d1: today > d0 ? days_.has(d0 + 1) : null, d7: today > d0 + 6 ? days_.has(d0 + 7) : null }); }
  const byDay = {};
  for (const c of cohorts) { const b = byDay[c.day] ??= { day: c.day, newPlayers: 0, d1Observable: 0, d1: 0, d7Observable: 0, d7: 0 }; b.newPlayers++; if (c.d1 !== null) { b.d1Observable++; if (c.d1) b.d1++; } if (c.d7 !== null) { b.d7Observable++; if (c.d7) b.d7++; } }
  return {
    window: { from: new Date(since).toISOString(), to: new Date(now).toISOString(), days, timezone: 'UTC (cohort days are UTC calendar days)' },
    data: inWindow.length ? 'present' : rows.length ? 'no events in window' : 'no events at all',
    malformed,
    denominator: players.size, events: real.length, qa: { rows: qaRows.length, players: new Set(qaRows.map(r => r.pid)).size, marker: 'known QA account ids (scripts/qa-accounts.json) and props.qa === true' },
    steps: stepCounts,
    distinctions,
    returnCohorts: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)),
    returningInWindow: pidsOf(r => r.event === 'funnel_return_visit' || (r.event === 'session_start' && r.props?.returning === true)).size,
  };
}

export function renderFunnel(report) {
  const lines = [];
  lines.push(`FOOTBALL HEADQUARTERS — WEEKLY FUNNEL   ${report.window.from.slice(0, 10)} → ${report.window.to.slice(0, 10)} (${report.window.days} days, ${report.window.timezone})`);
  lines.push(`data: ${report.data} · players visible: ${report.denominator} · events: ${report.events} · QA excluded: ${report.qa.players} players / ${report.qa.rows} rows (${report.qa.marker})`);
  if (report.malformed.total) lines.push(`malformed rows excluded: ${report.malformed.total} (${Object.entries(report.malformed.reasons).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')})`);
  lines.push('');
  lines.push('  step                            players    % of visible   source');
  for (const s of report.steps) lines.push(`  ${s.label.padEnd(30)} ${String(s.players).padStart(7)}   ${s.pct === null ? '   n/a' : `${String(s.pct).padStart(5)}%`}        ${s.source}${s.legacyDerived ? ` (+${s.legacyDerived} legacy-derived)` : ''}`);
  lines.push('');
  const d = report.distinctions;
  lines.push(`  saw a result but no confirmed reward: ${d.resultsNotConfirmed} · requested an upgrade but none completed: ${d.upgradesRequestedNotCompleted} · saw the backup prompt but did not back up: ${d.backupPromptNotCompleted}`);
  lines.push(`  backups by method: export (file left the device) ${d.backupMethods.export} · account (cloud) ${d.backupMethods.account}${d.backupUnknownMethod ? ` · unknown method ${d.backupUnknownMethod}` : ''}`);
  lines.push(`  returning players in window: ${report.returningInWindow}`);
  lines.push('  return cohorts (new players first seen in window; D1/D7 shown only once observable)');
  if (!report.returnCohorts.length) lines.push('    (none)');
  for (const c of report.returnCohorts) lines.push(`    ${c.day}  new ${String(c.newPlayers).padStart(3)}   D1 ${c.d1Observable ? `${c.d1}/${c.d1Observable}` : 'not yet'}   D7 ${c.d7Observable ? `${c.d7}/${c.d7Observable}` : 'not yet'}`);
  return lines.join('\n');
}

/** Page through fhq_events (ts >= since, ascending) with the service-role key. `fetchImpl` is injectable for tests. */
export async function fetchRows(url, key, since, { fetchImpl = fetch, page = 1000 } = {}) {
  const rows = [];
  for (let offset = 0; ; offset += page) {
    const res = await fetchImpl(`${url}/rest/v1/fhq_events?select=pid,event,props,ts&ts=gte.${encodeURIComponent(since)}&order=ts.asc&limit=${page}&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`fhq_events: HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (is the key the service_role key?)' : ''}`);
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error('fhq_events: unexpected response body');
    rows.push(...batch);
    if (batch.length < page) break;
  }
  return rows;
}

export const FIXTURE_BANNER = (path) => `==== FIXTURE DATA: ${path} — synthetic rows for validating the report, NOT real players ====`;

const main = async () => {
  const days = Number(arg('--days', '7')), now = Date.parse(arg('--now', new Date().toISOString()));
  if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(now)) { console.error('invalid --days or --now'); process.exit(1); }
  const qaPids = new Set(JSON.parse(readFileSync(join(ROOT, 'scripts/qa-accounts.json'), 'utf8')).accounts.map(a => a.id));
  let rows, source, sourceKind;
  const fixture = arg('--fixture', '');
  if (fixture) { rows = JSON.parse(readFileSync(fixture, 'utf8')); source = `fixture ${fixture}`; sourceKind = 'fixture'; }
  else {
    const envFile = (name) => { try { return Object.fromEntries(readFileSync(join(ROOT, name), 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })); } catch { return {}; } };
    const env = has('--no-dotenv') ? { ...process.env } : { ...envFile('.env.production'), ...envFile('.env.local'), ...process.env };
    const key = env.SUPABASE_SERVICE_ROLE_KEY, url = env.VITE_SUPABASE_URL;
    if (!key || !url) { console.error('real-data execution blocked: SUPABASE_SERVICE_ROLE_KEY (runtime env or .env.local) and VITE_SUPABASE_URL are required. Validate with --fixture tests/fixtures/funnel-events.json.'); process.exit(2); }
    const from = new Date(now - (days + 8) * DAY).toISOString(); // 8 extra days so D7 cohorts and first-seen are computable
    rows = await fetchRows(url, key, from);
    source = `fhq_events via REST (service role, ${rows.length} rows since ${from.slice(0, 10)})`; sourceKind = 'real';
  }
  const report = computeFunnel(rows, { now, days, qaPids });
  if (has('--json')) console.log(JSON.stringify({ source, sourceKind, ...report }, null, 2));
  else {
    if (sourceKind === 'fixture') console.log(FIXTURE_BANNER(fixture));
    console.log(renderFunnel(report));
    console.log(`\nsource: ${source}`);
    console.log(sourceKind === 'fixture' ? FIXTURE_BANNER(fixture) : 'source kind: REAL DATA (fhq_events, service role; credentials never logged)');
  }
};
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(`funnel report failed: ${e.message}`); process.exit(1); });
