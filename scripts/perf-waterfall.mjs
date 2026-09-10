// Startup transfer measurement and budget check for the live game or a preview/local build.
//
//   node scripts/perf-waterfall.mjs [--url https://…] [--profile none|slow4g|fast3g] [--cpu 1|4]
//                                   [--block-server] [--budget] [--with-sw] [--out docs/evidence/perf.json] [--shots DIR]
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
  // Per-stage cold transfer budgets (bytes) beyond naming, measured on the integrated build with the derived atlases and rounded up with ~25 % headroom.
  stageTransferBytes: { campus: 2.25 * 1024 * 1024, 'hero-inspection': 1.6 * 1024 * 1024, roster: 0.8 * 1024 * 1024, scouting: 0.8 * 1024 * 1024, prep: 2.6 * 1024 * 1024, 'first-deployed-hero': 7.5 * 1024 * 1024, 'first-signature': 2 * 1024 * 1024, result: 6 * 1024 * 1024 },
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
    // Service workers are blocked by default: a worker-served response reports transferSize 0, which
  // would hide real bytes. Pass --with-sw to measure what an installed player actually transfers.
  const context = warmFrom ?? await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: has('--with-sw') ? 'allow' : 'block' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  // Block the club server through CDP rather than context.route(): Playwright's request interception
  // disables the HTTP cache, which would make every warm visit look like a cold one.
  if (blockServer) { await cdp.send('Network.enable'); await cdp.send('Network.setBlockedURLs', { urls: ['*supabase.co*'] }); }
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
  const nav = (label) => page.click(`[aria-label="Club navigation"] button:has-text("${label}")`).catch(() => {});
  const clickText = async (pattern) => { const b = page.getByRole('button', { name: pattern }).first(); if (await b.count()) { await b.click({ timeout: 4000 }).catch(() => {}); return true; } return false; };
  const escape = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(250); };
  // Hero inspection: the Heroes modal (nine cards + Film Room idle).
  t = Date.now(); await nav('Heroes'); await stage('hero-inspection', t); await escape();
  // Roster (player-first view) and Scouting (reachable from the roster).
  t = Date.now(); await nav('Roster'); await stage('roster', t);
  t = Date.now(); const scouting = await clickText(/Scout|Scouting|Recruit/i); await stage(scouting ? 'scouting' : 'scouting-unreachable', t); await escape(); await escape();
  // Preparation sheet.
  t = Date.now(); await nav('Game Day'); await page.waitForTimeout(400);
  await clickText(/^Next$|Prepare|Preseason Opener|Play next/i); await stage('prep', t);
  // First deployed hero: reserve, wait for the field, select the first hero card and tap the sideline.
  t = Date.now();
  await page.getByRole('button', { name: /Reserve game|Kick off|Play/i }).first().click().catch(() => {});
  await page.waitForSelector('[aria-label="Battlefield"]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const field = page.locator('[aria-label="Battlefield"]');
  // Select the first hero card explicitly so the sideline tap deploys a hero, not a squad unit.
  await page.locator('button:has-text("Select to send in")').first().click({ timeout: 3000 }).catch(() => {});
  if (await field.count()) { const box = await field.boundingBox(); await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * 0.25); await page.waitForTimeout(1500); }
  await stage('first-deployed-hero', t);
  // First signature: tap the ready signature card when it appears (bounded wait).
  t = Date.now();
  await page.waitForFunction(() => /Signature ready/i.test(document.body.innerText), null, { timeout: 12000 }).catch(() => {});
  await page.locator('button:has-text("Signature ready")').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await stage('first-signature', t);
  // Result: deploy the rest and let the clock run or blow the whistle.
  t = Date.now();
  if (await field.count()) { const box = await field.boundingBox(); for (let i = 1; i < 6; i++) { await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * (0.2 + i * 0.1)); await page.waitForTimeout(120); } }
  await page.waitForTimeout(6000);
  const whistle = page.locator('button[title="Blow the whistle — see the result"]');
  if (await whistle.count()) await whistle.first().click({ timeout: 5000, force: true }).catch(() => {});
  await page.waitForFunction(() => /standouts|Collect|Continue|Back to club|Return/i.test(document.body.innerText), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await stage('result', t);
  await clickText(/Collect|Continue|Back to club|Return/i); await page.waitForTimeout(800);
  const ua = await page.evaluate(() => navigator.userAgent);
  await page.close();
  return { label, stages, context, ua };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const cold = await run(browser, 'cold');
const warm = await run(browser, 'warm', { warmFrom: cold.context });
await cold.context.close();
await browser.close();

const report = { url, measuredAt: new Date().toISOString(), viewport, deviceScaleFactor: 2, network: profile, cpuThrottle: cpu, serviceWorker: has('--with-sw') ? 'allowed' : 'blocked (bytes are real network transfers)', clubServer: blockServer ? 'blocked (no account created)' : 'reachable', userAgent: cold.ua, cold: cold.stages, warm: warm.stages };
const print = (label, stages) => { console.log(`\n${label}`); for (const s of stages) { console.log(`  ${s.stage.padEnd(14)} ${String(s.requests).padStart(4)} req  transfer ${MB(s.transferBytes).padStart(9)}  encoded ${MB(s.encodedBytes).padStart(9)}  decoded ${MB(s.decodedBytes).padStart(9)}  ${(s.ms / 1000).toFixed(1)} s`); for (const l of s.largest.slice(0, 4)) console.log(`      ${KB(l.transfer).padStart(8)}  ${l.name}`); } };
print(`COLD  (${profile} network, cpu ×${cpu}, server ${report.clubServer})`, cold.stages);
print('WARM  (same context, return visit)', warm.stages);
const cumulative = (stages, upto) => stages.slice(0, stages.findIndex(s => s.stage === upto) + 1).reduce((a, s) => a + s.transferBytes, 0);
console.log(`\ncold cumulative through naming ${MB(cumulative(cold.stages, 'naming'))}, through campus ${MB(cumulative(cold.stages, 'campus'))}, through result ${MB(cold.stages.reduce((a, s) => a + s.transferBytes, 0))}`);

if (out) { await writeFile(out, JSON.stringify(report, null, 2) + '\n'); console.log(`wrote ${out}`); }
if (budget) {
  const failures = [];
  const naming = cold.stages.find(s => s.stage === 'naming');
  if (naming && naming.transferBytes > BUDGET.namingTransferBytes) failures.push(`naming transfer ${MB(naming.transferBytes)} exceeds ${MB(BUDGET.namingTransferBytes)}; largest: ${naming.largest.slice(0, 5).map(l => `${l.name} (${KB(l.transfer)})`).join(', ')}`);
  const battleStages = new Set(['first-deployed-hero', 'first-signature', 'result']);
  for (const s of cold.stages) if (!battleStages.has(s.stage) && s.battleOnly.length) failures.push(`${s.stage} requested battle-only sheets before use: ${s.battleOnly.join(', ')}`);
  // Measured stage budgets (transfer, cold). Established from the integrated build with derived atlases; a regression fails loudly.
  // `first-deployed-hero` scales with how many heroes the deployment taps put on the field: each drawn hero costs its authored elite + motion (+ reaction, + signature) sheets, ~2.7 MB. Two heroes plus battle scenery measured 6.09 MB.
  for (const [stage, limit] of Object.entries(BUDGET.stageTransferBytes)) { const st = cold.stages.find(x => x.stage === stage); if (st && st.transferBytes > limit) failures.push(`${stage} transfer ${MB(st.transferBytes)} exceeds its budget ${MB(limit)}; largest: ${st.largest.slice(0, 4).map(l => `${l.name} (${KB(l.transfer)})`).join(', ')}`); }
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(failures.length ? `RESULT: startup budget FAILED (${failures.length})` : `RESULT: startup budget holds (naming ≤ ${MB(BUDGET.namingTransferBytes)}, no battle sheets before the battle)`);
  process.exitCode = failures.length ? 1 : 0;
}
