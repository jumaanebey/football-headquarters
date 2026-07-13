// End-to-end analytics smoke: drives the LIVE production game in a real browser,
// plays through onboarding (and best-effort a raid), and logs every analytics POST to
// Supabase with its HTTP status — proving events land end to end.
//
// REQUIRES the environment's network egress to allow *.vercel.app and *.supabase.co
// (Custom allowlist). It will just time out on page load otherwise.
//
//   node scripts/analytics-smoke.mjs [url]
//   default url: https://football-headquarters.vercel.app
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const URL = process.argv[2] || process.env.FHQ_URL || 'https://football-headquarters.vercel.app';
const EXEC = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const posts = [];
const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

// Capture every hit to the analytics endpoint — both the keepalive fetch and sendBeacon.
page.on('request', req => {
  if (req.url().includes('/rest/v1/fhq_events')) posts.push({ kind: 'sent', method: req.method() });
});
page.on('response', res => {
  if (res.url().includes('/rest/v1/fhq_events')) {
    posts.push({ kind: 'response', status: res.status() });
    console.log(`  analytics POST → HTTP ${res.status()}`);
  }
});
page.on('requestfinished', async req => {
  if (!req.url().includes('/rest/v1/fhq_events')) return;
  try { const r = await req.response(); if (r) console.log(`  (beacon finished → HTTP ${r.status()})`); } catch { /* beacons often have no readable response */ }
});

console.log(`loading ${URL} …`);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3500); // session_start fires on mount

// Onboarding — fires club_created + tutorial_choice.
try {
  await page.getByText("That's my club").click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.getByText(/Look around first|Storm your first rival/i).first().click({ timeout: 8000 });
  console.log('completed onboarding');
} catch (e) { console.log('onboarding step skipped:', e.message); }
await page.waitForTimeout(2000);

// Best-effort: open the raid picker (fires raid_open). Non-fatal if the UI differs.
try {
  await page.getByRole('button', { name: /^Raid|Storm/i }).first().click({ timeout: 5000 });
  console.log('opened raid');
} catch { /* optional */ }

// Flush: the client batches and flushes every 5s AND on tab-hide. Wait past the timer,
// then fire pagehide to force the sendBeacon flush.
await page.waitForTimeout(7000);
await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
await page.waitForTimeout(3000);

console.log('\n=== analytics POSTs observed ===');
if (!posts.length) {
  console.log('NONE — no request to /rest/v1/fhq_events was made.');
  console.log('That means track() was a no-op → VITE_SUPABASE_* likely absent from the deployed build.');
} else {
  for (const p of posts) console.log(p.kind === 'response' ? `  ← HTTP ${p.status}` : `  → ${p.method} sent`);
}
const ok = posts.some(p => p.kind === 'response' && p.status >= 200 && p.status < 300);
const sent = posts.some(p => p.kind === 'sent');
console.log(ok
  ? '\n✅ Supabase accepted the analytics writes (2xx). Rows are landing.'
  : sent
    ? '\n⚠️ Requests were SENT but no 2xx captured (likely sendBeacon — response not readable). Confirm with a row count in Supabase.'
    : '\n❌ No analytics requests were made at all — investigate the build env vars.');

await browser.close();
