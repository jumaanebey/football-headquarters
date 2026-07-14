#!/usr/bin/env node
// Football HQ — funnel readout.  `npm run funnel`
//
// Prints the product funnel from fhq_events: where coaches drop off, whether they
// come back, what gets used, and what gems are spent on. Reads the views created in
// supabase/migrations/20260714000001_analytics_funnel.sql.
//
// Needs the SERVICE ROLE key: fhq_events is deliberately write-only to the public
// anon key, so telemetry can never be read back by players (or competitors). Put it
// in .env.local (gitignored) as SUPABASE_SERVICE_ROLE_KEY=... — Supabase dashboard →
// Project Settings → API → service_role. It is a SECRET: never import it into any
// file under src/, and never ship it in the browser bundle.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- config -----------------------------------------------------------------
const readEnvFile = (name) => {
  try {
    return Object.fromEntries(
      readFileSync(join(ROOT, name), 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
};

const env = { ...readEnvFile('.env.production'), ...readEnvFile('.env.local'), ...process.env };
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error(`
  Missing ${!URL_ ? 'VITE_SUPABASE_URL' : 'SUPABASE_SERVICE_ROLE_KEY'}.

  The funnel reads telemetry that players are deliberately not allowed to read,
  so it needs the service role key. One-time setup:

    1. Supabase dashboard → Project Settings → API → service_role → copy
    2. Add to .env.local (already gitignored):

         SUPABASE_SERVICE_ROLE_KEY=eyJ...

  Then re-run: npm run funnel
`);
  process.exit(1);
}

// --- fetch ------------------------------------------------------------------
const view = async (name) => {
  const res = await fetch(`${URL_}/rest/v1/${name}?select=*`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${name}: ${res.status} — is SUPABASE_SERVICE_ROLE_KEY the *service_role* key (not the anon key)?`);
    }
    if (res.status === 404) {
      throw new Error(`${name}: 404 — view missing. Apply supabase/migrations/20260714000001_analytics_funnel.sql.`);
    }
    throw new Error(`${name}: ${res.status} ${body.slice(0, 160)}`);
  }
  return res.json();
};

// --- render -----------------------------------------------------------------
const BAR = 26;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

const head = (t) => console.log(`\n${bold(t)}\n${dim('─'.repeat(58))}`);

// Right-align numbers so columns actually line up at a glance.
const n = (v, w = 5) => String(v ?? 0).padStart(w);

const table = (rows, cols) => {
  if (!rows.length) return console.log(dim('  (no data yet)'));
  const w = cols.map((c) => Math.max(c.label.length, ...rows.map((r) => String(c.get(r) ?? '').length)));
  console.log('  ' + cols.map((c, i) => dim(c.label.padEnd(w[i]))).join('  '));
  for (const r of rows) {
    console.log('  ' + cols.map((c, i) => String(c.get(r) ?? '').padEnd(w[i])).join('  '));
  }
};

const main = async () => {
  const [funnel, retention, engagement, sinks, daily] = await Promise.all(
    ['fhq_funnel', 'fhq_retention', 'fhq_engagement', 'fhq_gem_sinks', 'fhq_daily'].map(view),
  );

  const totalEvents = daily.reduce((s, d) => s + Number(d.events), 0);
  console.log(`\n${bold('FOOTBALL HEADQUARTERS — PRODUCT FUNNEL')}   ${dim(`all-time · ${totalEvents} events`)}`);

  // ── onboarding funnel, as a bar chart ──
  head('ONBOARDING  — unique players reaching each step');
  if (!funnel.length || !Number(funnel[0].players)) {
    console.log(dim('  (no players yet — nothing has been played on the live site)'));
  } else {
    for (const f of funnel) {
      const pct = Number(f.pct_of_loaded) || 0;
      const filled = Math.round((pct / 100) * BAR);
      const bar = '█'.repeat(filled) + dim('░'.repeat(BAR - filled));
      const d = Number(f.delta_from_prev);
      // Only a LOSS is interesting; a later step gaining players just means those
      // people skipped an earlier step (e.g. a returning player who already has a club).
      const delta = !d ? '' : d < 0 ? red(`  ▼ ${d}`) : green(`  ▲ +${d}`);
      console.log(`  ${dim(f.step + '.')} ${String(f.label).padEnd(24)} ${n(f.players)}  ${bar} ${String(pct).padStart(5)}%${delta}`);
    }
    const biggest = funnel
      .filter((f) => Number(f.delta_from_prev) < 0)
      .sort((a, b) => Number(a.delta_from_prev) - Number(b.delta_from_prev))[0];
    if (biggest) console.log(`\n  ${red('Biggest drop-off:')} ${biggest.label} (${biggest.delta_from_prev} players)`);
  }

  head('RETENTION  — by first-seen cohort');
  table(retention, [
    { label: 'cohort', get: (r) => r.cohort_day },
    { label: ' new', get: (r) => n(r.new_players, 4) },
    { label: '  D1', get: (r) => n(r.d1, 4) },
    { label: '  D7', get: (r) => n(r.d7, 4) },
    { label: ' D1%', get: (r) => (r.d1_pct == null ? '   -' : `${r.d1_pct}%`) },
  ]);

  head('ENGAGEMENT  — which systems get used');
  table(engagement, [
    { label: 'event', get: (r) => r.event },
    { label: 'players', get: (r) => n(r.players, 7) },
    { label: 'events', get: (r) => n(r.events, 6) },
    { label: 'per player', get: (r) => n(r.per_player, 10) },
  ]);

  head('GEM SINKS  — what the premium currency buys');
  table(sinks, [
    { label: 'sink', get: (r) => r.sink },
    { label: 'gems', get: (r) => n(r.gems_spent, 6) },
    { label: 'buys', get: (r) => n(r.purchases, 4) },
    { label: 'players', get: (r) => n(r.players, 7) },
  ]);

  head('DAILY  — last 14 days');
  table(daily.slice(0, 14), [
    { label: 'day', get: (r) => r.day },
    { label: 'players', get: (r) => n(r.players, 7) },
    { label: 'sessions', get: (r) => n(r.sessions, 8) },
    { label: 'new clubs', get: (r) => n(r.new_clubs, 9) },
    { label: 'events', get: (r) => n(r.events, 6) },
  ]);
  console.log();
};

main().catch((e) => {
  console.error(`\n  funnel failed: ${e.message}\n`);
  process.exit(1);
});
