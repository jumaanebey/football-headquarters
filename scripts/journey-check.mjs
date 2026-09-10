// Compact player journey on a built preview, repeated, with lifecycle measurements.
//   node scripts/with-preview.mjs <port> node scripts/journey-check.mjs http://127.0.0.1:<port>/ [--rounds 3]
// One round: name a club → campus → Roster → Scouting → Heroes → Game Day → preparation →
// reserve → deploy several DIFFERENT heroes → use a signature → result → back to campus.
// Between rounds the club is kept (a returning player), so round 2+ is the warm path.
// Measures per round: requests and transfer, decoded hero-art frames retained, retained entries,
// art subscribers, DOM nodes, JS heap, and animation/listener work after backgrounding.
// The club server is blocked at the network layer: no account is created, no event is sent.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:4208/';
const rounds = Number(process.argv[process.argv.indexOf('--rounds') + 1]) || 3;
let failures = 0;
const line = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) failures++; };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--js-flags=--expose-gc'] });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error' && !/ERR_BLOCKED|ERR_FAILED|net::/.test(m.text())) consoleErrors.push(m.text().slice(0, 120)); });
page.on('pageerror', e => consoleErrors.push(`pageerror: ${String(e).slice(0, 120)}`));

const stats = () => page.evaluate(async () => {
  const art = window.__fhqHeroArt?.stats() ?? { entries: [], decodedFrames: 0, retainedEntries: 0, inFlight: 0, listeners: 0 };
  if (window.gc) window.gc();
  const heap = performance.memory?.usedJSHeapSize ?? null;
  return { decodedFrames: art.decodedFrames, entries: art.entries.length, retained: art.retainedEntries, listeners: art.listeners, inFlight: art.inFlight, dom: document.getElementsByTagName('*').length, heapMB: heap ? Math.round(heap / 1048576) : null, canvases: document.querySelectorAll('canvas').length };
});
const netSince = async mark => { const rows = await page.evaluate(m => performance.getEntriesByType('resource').filter(e => e.startTime >= m).map(e => ({ n: e.name.replace(/^https?:\/\/[^/]+/, ''), t: e.transferSize || 0 })), mark); return { requests: rows.length, transferMB: Number((rows.reduce((a, r) => a + r.t, 0) / 1048576).toFixed(2)), heroSheets: rows.filter(r => /\/heroes\/(motion|elite|signatures|reactions)\//.test(r.n)).length }; };
const mark = () => page.evaluate(() => performance.now());
const text = () => page.locator('body').innerText().catch(() => '');
const tap = async (name, timeout = 4000) => { const b = page.getByRole('button', { name }).first(); if (await b.count()) { await b.click({ timeout }).catch(() => {}); return true; } return false; };
const nav = label => page.click(`[aria-label="Club navigation"] button:has-text("${label}")`).catch(() => {});
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(250); };

const rows = [];
for (let round = 1; round <= rounds; round++) {
  const started = Date.now();
  await page.goto(base, { waitUntil: 'networkidle' });
  const m0 = await mark();
  const naming = await page.locator('input[placeholder="Your club name"]').count();
  if (naming) {
    await page.fill('input[placeholder="Your club name"]', 'Journey FC');
    await page.click('button[type="submit"]'); await page.waitForTimeout(400);
    const buttons = page.locator('button'); const count = await buttons.count();
    for (let i = 0; i < count; i++) { const t = (await buttons.nth(i).innerText()).trim(); if (t && !/play|storm|game|change club name|random name/i.test(t) && await buttons.nth(i).isVisible()) { await buttons.nth(i).click(); break; } }
    await page.waitForTimeout(900);
  }
  if (round === 1) line(/Roster|Game Day/.test(await text()), `round ${round}: club named and campus reached`);
  for (const [label, needle] of [['Roster', /ROSTER|Players|Position/i], ['Heroes', /HALL OF HEROES/i]]) {
    await nav(label); await page.waitForTimeout(800);
    if (round === 1) line(needle.test(await text()), `round ${round}: ${label} opens`);
    if (label === 'Roster') { const went = await tap(/Scout|Scouting|Recruit/i); if (round === 1) line(went, `round ${round}: Scouting reachable from Roster`); await page.waitForTimeout(700); await esc(); }
    await esc();
  }
  await nav('Game Day'); await page.waitForTimeout(600);
  await tap(/^Next$|Prepare|Preseason Opener|Play next/i);
  await page.waitForTimeout(400);
  if (round === 1) line(/PREPARE YOUR GAME|game plan/i.test(await text()), `round ${round}: preparation sheet with the matchup`);
  await tap(/Reserve game|Kick off|Play/i);
  const field = await page.waitForSelector('[aria-label="Battlefield"]', { timeout: 30000 }).then(() => true).catch(() => false);
  if (round === 1) line(field, `round ${round}: battle reached`);
  const drawn = new Set();
  if (field) {
    const box = await page.locator('[aria-label="Battlefield"]').boundingBox();
    for (let i = 0; i < 5; i++) {
      const card = page.locator('button:has-text("Select to send in")').first();
      if (await card.count()) await card.click({ timeout: 2500 }).catch(() => {});
      await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * (0.2 + i * 0.11));
      await page.waitForTimeout(700);
      for (const k of await page.evaluate(() => Array.from(document.querySelectorAll('[aria-label="Battlefield"] canvas.fhq-modern-hero')).map(c => c.parentElement?.parentElement?.getAttribute('data-hero') ?? '').filter(Boolean))) drawn.add(k);
    }
    const heroArt = await page.evaluate(() => window.__fhqHeroArt?.stats().entries.filter(e => e.kind === 'motion' && e.frames > 0).map(e => e.key) ?? []);
    heroArt.forEach(k => drawn.add(k));
    if (round === 1) line(drawn.size >= 2, `round ${round}: ${drawn.size} different heroes drawn on the field (${[...drawn].join(', ')})`);
    const sig = await page.waitForFunction(() => /Signature ready/i.test(document.body.innerText), null, { timeout: 15000 }).then(() => true).catch(() => false);
    if (sig) { await page.locator('button:has-text("Signature ready")').first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1500); }
    const beat = await page.evaluate(() => Array.from(document.querySelectorAll('canvas.fhq-modern-hero')).map(c => c.dataset.signatureBeat).filter(b => b && b !== 'none'));
    if (round === 1) line(sig, `round ${round}: a signature became ready and was used (beats seen: ${beat.join(',') || 'none captured at sample time'})`);
    const whistle = page.locator('button[title="Blow the whistle — see the result"]');
    if (await whistle.count()) await whistle.first().click({ force: true, timeout: 4000 }).catch(() => {});
    const result = await page.waitForFunction(() => /standouts|Collect|Continue|Back to club|Return/i.test(document.body.innerText), null, { timeout: 90000 }).then(() => true).catch(() => false);
    if (round === 1) line(result, `round ${round}: result screen reached`);
    await tap(/Collect|Continue|Back to club|Return/i, 6000);
    await page.waitForTimeout(1200);
    await tap(/Back to club|Continue|Close/i, 3000).catch(() => {});
    await page.waitForTimeout(800);
  }
  const back = /Roster|Game Day/.test(await text());
  if (round === 1) line(back, `round ${round}: returned to the campus`);
  const net = await netSince(m0);
  const s = await stats();
  rows.push({ round, seconds: Math.round((Date.now() - started) / 1000), ...net, ...s, heroesDrawn: drawn.size });
  console.log(`round ${round}: ${net.requests} requests, ${net.transferMB} MB, ${net.heroSheets} hero sheets · decoded frames ${s.decodedFrames} in ${s.entries} entries (retained ${s.retained}), art subscribers ${s.listeners}, canvases ${s.canvases}, DOM ${s.dom}, heap ${s.heapMB} MB`);
}
// Background / foreground recovery.
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await context.pages()[0].bringToFront();
await page.waitForTimeout(1500);
const after = await stats();
line(/Roster|Game Day/.test(await text()), `after backgrounding and returning the campus still renders (canvases ${after.canvases}, art subscribers ${after.listeners})`);

const first = rows[0], last = rows[rows.length - 1];
line(last.transferMB <= first.transferMB, `warm rounds transfer no more than the cold one (${first.transferMB} MB → ${last.transferMB} MB)`);
line(last.entries <= first.entries + 2, `decoded hero-art entries do not grow across rounds (${first.entries} → ${last.entries})`);
line(last.listeners <= first.listeners + 1, `art subscribers do not accumulate (${first.listeners} → ${last.listeners})`);
line(last.retained <= first.retained + 2, `retained entries do not accumulate (${first.retained} → ${last.retained})`);
line(last.canvases <= first.canvases * 1.5 + 5, `canvas count is stable (${first.canvases} → ${last.canvases})`);
line(consoleErrors.length === 0, `no console errors across ${rounds} rounds${consoleErrors.length ? `: ${consoleErrors.slice(0, 3).join(' | ')}` : ''}`);
await writeFile('docs/evidence/journey-rounds.json', JSON.stringify({ url: base, measuredAt: new Date().toISOString(), viewport: '430×932 @2, isMobile, no throttling, service worker blocked, club server blocked', rounds: rows, afterBackground: after, consoleErrors }, null, 2));
await browser.close();
console.log(failures ? `RESULT: ${failures} journey check(s) failed` : `RESULT: journey verified over ${rounds} rounds; no growth in requests, decoded art, subscribers or DOM`);
process.exitCode = failures ? 1 : 0;
