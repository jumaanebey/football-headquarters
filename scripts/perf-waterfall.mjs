// Startup transfer measurement and budget check for the live game or a preview/local build.
//
//   node scripts/perf-waterfall.mjs [--url https://…] [--profile none|slow4g|fast3g] [--cpu 1|4]
//                                   [--block-server] [--budget] [--out docs/evidence/perf.json] [--shots DIR]
//
// Records the request waterfall through four stages — naming (the tutorial card), campus (after
// naming), hero detail (Heroes modal) and first battle — for a COLD context and then a WARM
// return visit in the same context (browser cache primed, tutorial already done). Per stage:
// requests, transfer bytes (what actually crossed the network, 304s count as their header size),
// encoded and decoded body bytes when the browser reports them, wall time, and the largest
// requests. `--budget` turns the documented startup budget into a pass/fail with the offending
// requests listed. `--block-server` aborts the club server so no account or event is created.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const has = (name) => process.argv.includes(name);
const url = arg('--url', 'https://football-headquarters.vercel.app/');
const profile = arg('--profile', 'none');
const cpu = Number(arg('--cpu', '1'));
const blockServer = has('--block-server');
const budget = has('--budget');
const out = arg('--out', '');
const shots = arg('--shots', '');
const viewport = { width: 430, height: 932 };

export const BUDGET = {
  namingTransferBytes: 5 * 1024 * 1024,
  // Sheets that exist only for battle playback: none may be requested before the battle stage.
  battleOnly: /\/assets\/heroes\/(motion|signatures|reactions|elite)\//,
};
const PROFILES = { none: null, slow4g: { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150 }, fast3g: { downloadThroughput: 1.6 * 1024 * 1024 / 8 * 0.9, uploadThroughput: 750 * 1024 / 8, latency: 562 } };

const KB = (n) => `${(n / 1024).toFixed(0)} KB`;
const MB = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

const snapshot = (page) => page.evaluate(() => performance.getEntriesByType('resource').map(e => ({ name: e.name, transfer: e.transferSize || 0, encoded: e.encodedBodySize || 0, decoded: e.decodedBodySize || 0, start: e.startTime, end: e.responseEnd, type: e.initiatorType })));
const stageOf = (all, seen) => { const fresh = all.filter(e => !seen.has(`${e.name}#${e.start}`)); for (const e of fresh) seen.add(`${e.name}#${e.start}`); return fresh; };
const summarize = (name, entries, ms) => ({
  stage: name, requests: entries.length, transferBytes: entries.reduce((a, e) => a + e.transfer, 0), encodedBytes: entries.reduce((a, e) => a + e.encoded, 0), decodedBytes: entries.reduce((a, e) => a + e.decoded, 0), ms,
  largest: [...entries].sort((a, b) => b.transfer - a.transfer).slice(0, 8).map(e => ({ name: e.name.replace(/^https?:\/\/[^/]+/, ''), transfer: e.transfer, decoded: e.decoded })),
  battleOnly: entries.filter(e => BUDGET.battleOnly.test(e.name)).map(e => e.name.replace(/^https?:\/\/[^/]+/, '')),
});

async function run(browser, label, { warmFrom } = {}) {
  const context = warmFrom ?? await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (blockServer && !warmFrom) await context.route(/supabase\.co/, r => r.abort());
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (PROFILES[profile]) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, ...PROFILES[profile] }); }
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const seen = new Set(); const stages = []; let shot = 0;
  const snap = async (name) => { if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: `${shots}/${label}-${String(++shot).padStart(2, '0')}-${name}.png` }); } };
  const stage = async (name, t0) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(600); const s = summarize(name, stageOf(await snapshot(page), seen), Date.now() - t0); stages.push(s); await snap(name); return s; };
  let t = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  const isNaming = await page.locator('input[placeholder="Your club name"]').count();
  await stage(isNaming ? 'naming' : 'return-campus', t);
  if (isNaming) {
    t = Date.now();
    await page.fill('input[placeholder="Your club name"]', 'Perf Check FC');
    await page.click('button[type="submit"]'); await page.waitForTimeout(400);
    const buttons = page.locator('button'); const count = await buttons.count();
    for (let i = 0; i < count; i++) { const txt = (await buttons.nth(i).innerText()).trim(); if (txt && !/play|storm|game|change club name|random name/i.test(txt) && await buttons.nth(i).isVisible()) { await buttons.nth(i).click(); break; } }
    await stage('campus', t);
  }
  t = Date.now();
  await page.click('[aria-label="Club navigation"] button:has-text("Heroes")').catch(() => {});
  await stage('hero-detail', t);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  t = Date.now();
  await page.click('[aria-label="Club navigation"] button:has-text("Game Day")').catch(() => {});
  await page.waitForTimeout(500);
  await page.click('button:has-text("Next")').catch(async () => { await page.click('text=Preseason Opener').catch(() => {}); });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Reserve game|Kick off|Play/i }).first().click().catch(() => {});
  await page.waitForSelector('[aria-label="Battlefield"]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const field = page.locator('[aria-label="Battlefield"]');
  if (await field.count()) { const box = await field.boundingBox(); for (let i = 0; i < 3; i++) { await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * (0.2 + i * 0.1)); await page.waitForTimeout(150); } }
  await stage('first-battle', t);
  const ua = await page.evaluate(() => navigator.userAgent);
  await page.close();
  return { label, stages, context, ua };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const cold = await run(browser, 'cold');
const warm = await run(browser, 'warm', { warmFrom: cold.context });
await cold.context.close();
await browser.close();

const report = { url, measuredAt: new Date().toISOString(), viewport, deviceScaleFactor: 2, network: profile, cpuThrottle: cpu, clubServer: blockServer ? 'blocked (no account created)' : 'reachable', userAgent: cold.ua, cold: cold.stages, warm: warm.stages };
const print = (label, stages) => { console.log(`\n${label}`); for (const s of stages) { console.log(`  ${s.stage.padEnd(14)} ${String(s.requests).padStart(4)} req  transfer ${MB(s.transferBytes).padStart(9)}  encoded ${MB(s.encodedBytes).padStart(9)}  decoded ${MB(s.decodedBytes).padStart(9)}  ${(s.ms / 1000).toFixed(1)} s`); for (const l of s.largest.slice(0, 4)) console.log(`      ${KB(l.transfer).padStart(8)}  ${l.name}`); } };
print(`COLD  (${profile} network, cpu ×${cpu}, server ${report.clubServer})`, cold.stages);
print('WARM  (same context, return visit)', warm.stages);
const cumulative = (stages, upto) => stages.slice(0, stages.findIndex(s => s.stage === upto) + 1).reduce((a, s) => a + s.transferBytes, 0);
console.log(`\ncold cumulative through naming ${MB(cumulative(cold.stages, 'naming'))}, through campus ${MB(cumulative(cold.stages, 'campus'))}, through first battle ${MB(cold.stages.reduce((a, s) => a + s.transferBytes, 0))}`);

if (out) { await writeFile(out, JSON.stringify(report, null, 2) + '\n'); console.log(`wrote ${out}`); }
if (budget) {
  const failures = [];
  const naming = cold.stages.find(s => s.stage === 'naming');
  if (naming && naming.transferBytes > BUDGET.namingTransferBytes) failures.push(`naming transfer ${MB(naming.transferBytes)} exceeds ${MB(BUDGET.namingTransferBytes)}; largest: ${naming.largest.slice(0, 5).map(l => `${l.name} (${KB(l.transfer)})`).join(', ')}`);
  for (const s of cold.stages) if (s.stage !== 'first-battle' && s.battleOnly.length) failures.push(`${s.stage} requested battle-only sheets before use: ${s.battleOnly.join(', ')}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(failures.length ? `RESULT: startup budget FAILED (${failures.length})` : `RESULT: startup budget holds (naming ≤ ${MB(BUDGET.namingTransferBytes)}, no battle sheets before the battle)`);
  process.exitCode = failures.length ? 1 : 0;
}
