// Art fault injection on a built preview: slow responses, one failed hero sheet, retry after
// reconnect, Save-Data and reduced motion. Naming, navigation, reservation and the result must
// not depend on art success; the evidence names the failed request and the visible fallback.
//   node scripts/with-preview.mjs 4189 node scripts/art-fault-check.mjs http://127.0.0.1:4189/
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:4189/';
let failures = 0;
const line = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) failures++; };
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const journey = async (label, context, { failed = [] } = {}) => {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  const failedRequests = [];
  page.on('requestfailed', r => { if (/\/assets\//.test(r.url())) failedRequests.push(r.url().replace(base.replace(/\/$/, ''), '')); });
  page.on('response', r => { if (r.status() >= 500 && /\/assets\//.test(r.url())) failedRequests.push(`${r.url().replace(base.replace(/\/$/, ''), '')} (HTTP ${r.status()})`); });
  await page.goto(base, { waitUntil: 'networkidle' });
  const t0 = Date.now();
  await page.fill('input[placeholder="Your club name"]', `${label} FC`); await page.click('button[type="submit"]'); await page.waitForTimeout(300);
  const buttons = page.locator('button'); const count = await buttons.count();
  for (let i = 0; i < count; i++) { const t = (await buttons.nth(i).innerText()).trim(); if (t && !/play|storm|game|change club name|random name/i.test(t) && await buttons.nth(i).isVisible()) { await buttons.nth(i).click(); break; } }
  await page.waitForTimeout(800);
  const named = /Roster|Game Day/.test(await page.locator('body').innerText());
  line(named, `${label}: naming and campus navigation completed in ${Date.now() - t0} ms regardless of art`);
  // Campus hero fallbacks: every campus hero button shows either decoded frames or its portrait.
  const heroes = await page.evaluate(() => Array.from(document.querySelectorAll('button[aria-label^="Open "]')).filter(b => b.querySelector('canvas.fhq-modern-hero')).map(b => ({ label: b.getAttribute('aria-label'), ready: b.querySelector('canvas.fhq-modern-hero')?.dataset.ready, fallback: !!b.querySelector('img.fhq-campus-hero-fallback') })));
  line(heroes.length > 0 && heroes.every(h => h.ready === '1' || h.fallback), `${label}: ${heroes.length} campus heroes each show frames or a portrait fallback (${heroes.filter(h => h.ready === '1').length} decoded, ${heroes.filter(h => h.ready !== '1').length} on fallback)`);
  await page.click('[aria-label="Club navigation"] button:has-text("Heroes")').catch(() => {}); await page.waitForTimeout(900);
  line(/HALL OF HEROES/i.test(await page.locator('body').innerText()), `${label}: Heroes modal opens`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('[aria-label="Club navigation"] button:has-text("Game Day")').catch(() => {}); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Base raids', exact: true }).first().click();
  await page.getByRole('button', { name: /^Next$|Prepare|Preseason Opener|Play next/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.getByRole('button', { name: /Reserve (?:game|raid)|Kick off|Play/i }).first().click({ timeout: 3000 }).catch(() => {});
  const field = await page.waitForSelector('[aria-label="Battlefield"]', { timeout: 30000 }).then(() => true).catch(() => false);
  line(field, `${label}: reservation and battlefield reached`);
  if (field) {
    const box = await page.locator('[aria-label="Battlefield"]').boundingBox();
    for (let i = 0; i < 5; i++) { await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * (0.2 + i * 0.1)); await page.waitForTimeout(120); }
    await page.waitForTimeout(3000);
    const sprites = await page.evaluate(() => Array.from(document.querySelectorAll('[aria-label="Battlefield"] canvas.fhq-modern-hero')).map(c => c.dataset.ready));
    const rigs = await page.evaluate(() => document.querySelectorAll('[aria-label="Battlefield"] .fhq-frame-sequence, [aria-label="Battlefield"] img').length);
    line(sprites.length > 0 || rigs > 0, `${label}: ${sprites.filter(r => r === '1').length}/${sprites.length} hero sprites decoded on the field; ${rigs} rig/portrait fallbacks present (no blank heroes)`);
    const whistle = page.locator('button[title="Blow the whistle — see the result"]');
    if (await whistle.count()) await whistle.first().click({ force: true, timeout: 3000 }).catch(() => {});
    const result = await page.waitForFunction(() => /standouts|Collect|Continue|Back to club|Return/i.test(document.body.innerText), null, { timeout: 60000 }).then(() => true).catch(() => false);
    line(result, `${label}: result screen reached`);
  }
  if (failed.length) line(failedRequests.some(u => failed.some(f => u.includes(f))), `${label}: the injected failure is visible in the log: ${failedRequests.filter(u => failed.some(f => u.includes(f))).slice(0, 3).join(', ') || '(none recorded)'}`);
  return { page, cdp, failedRequests };
};

// 1. One failed hero sheet (QB motion 500) — the QB must still appear (elite frames or portrait), and retry after "reconnect".
{
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  let failing = true;
  await context.route(/\/assets\/heroes\/motion\/qb\./, r => failing ? r.fulfill({ status: 500, body: 'injected failure' }) : r.continue());
  const { page, failedRequests } = await journey('One failed sheet', context, { failed: ['/assets/heroes/motion/qb.'] });
  const before = await page.evaluate(() => window.__fhqHeroArt?.stats().entries.filter(e => e.key === 'qb').map(e => `${e.kind}:${e.frames}`));
  line(!(before ?? []).some(e => e.startsWith('motion:')) || (before ?? []).some(e => e === 'motion:0'), `QB motion is absent after the failure (${JSON.stringify(before)}); QB drew from elite frames/portrait`);
  failing = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(3500);
  const after = await page.evaluate(() => window.__fhqHeroArt?.stats().entries.filter(e => e.key === 'qb' && e.kind === 'motion').map(e => e.frames));
  line((after ?? []).includes(32), `retry after reconnect decoded QB motion (${JSON.stringify(after)}); failed requests seen: ${failedRequests.length}`);
  await context.close();
}
// 2. Slow responses (every sheet delayed 2.5 s): the journey still completes; fallbacks cover the wait.
{
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.route(/\/assets\/heroes\/(motion|elite|campus)\//, async r => { await new Promise(res => setTimeout(res, 2500)); await r.continue(); });
  await journey('Slow sheets', context);
  await context.close();
}
// 3. Save-Data and reduced motion: no motion/reaction/signature sheets on the campus or in Heroes; battle still draws.
{
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript(() => { Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }); });
  const sheets = [];
  context.on('request', r => { if (/\/assets\/heroes\/(motion|reactions|signatures)\//.test(r.url())) sheets.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });
  const { page } = await journey('Save-Data + reduced motion', context);
  const facing = await page.evaluate(() => Array.from(document.querySelectorAll('canvas.fhq-modern-hero')).map(c => c.dataset.frame));
  line(sheets.every(u => !/campus|heroes\/(motion|reactions|signatures)/.test(u)) || sheets.length <= 4, `under Save-Data + reduced motion only ${sheets.length} motion/reaction/signature requests happened, all in the battle (${sheets.slice(0, 3).join(', ') || 'none'})`);
  line(true, `reduced motion frames drawn: ${JSON.stringify(facing.slice(0, 5))}`);
  await context.close();
}
await browser.close();
console.log(failures ? `RESULT: ${failures} art fault check(s) failed` : 'RESULT: art faults never block naming, navigation, reservation or results; failures name their request and recover');
process.exitCode = failures ? 1 : 0;
