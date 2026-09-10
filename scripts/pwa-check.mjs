// Behavioural proof for the offline shell and update flow against a built preview:
//   1. registration + shell precache only (no hero sheets cached before use)
//   2. offline return visit renders from the shell, online return works again
//   3. an update installs as "waiting", is never applied by itself, applies on request,
//      and old caches are cleaned up
//   4. a failed update (sw.js 500) leaves the running app untouched
// Usage: npm run build && node scripts/pwa-check.mjs [http://127.0.0.1:4181/]
// (start `npx vite preview --port 4181` first; rewrites dist/sw.js in place for step 3 and restores it)
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:4181/';
const swPath = 'dist/sw.js';
const original = await readFile(swPath, 'utf8');
const version = original.match(/service worker ([0-9a-f]+)/)?.[1] ?? '?';
let failures = 0;
const line = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) failures++; };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
await context.route(/supabase\.co/, r => r.abort());
const page = await context.newPage();
const cacheNames = () => page.evaluate(() => caches.keys());
const cachedUrls = async (name) => page.evaluate(async n => (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname), name);
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  // Finish naming so a return visit is a returning player (campus, not the tutorial card).
  if (await page.locator('input[placeholder="Your club name"]').count()) {
    await page.fill('input[placeholder="Your club name"]', 'PWA Check FC'); await page.click('button[type="submit"]'); await page.waitForTimeout(400);
    const buttons = page.locator('button'); const count = await buttons.count();
    for (let i = 0; i < count; i++) { const t = (await buttons.nth(i).innerText()).trim(); if (t && !/play|storm|game|change club name|random name/i.test(t) && await buttons.nth(i).isVisible()) { await buttons.nth(i).click(); break; } }
  }
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null || false, null, { timeout: 15000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' }); // first load is not controlled; the reload is
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  line(controlled, `page controlled by service worker ${version}`);
  const names = await cacheNames();
  line(names.includes(`fhq-shell-${version}`), `shell cache present: ${names.join(', ')}`);
  const shell = await cachedUrls(`fhq-shell-${version}`);
  line(shell.includes('/') && shell.some(u => /\/assets\/index-.*\.js$/.test(u)) && shell.includes('/manifest.webmanifest'), `shell precache holds the app shell (${shell.length} entries)`);
  const art = names.includes(`fhq-art-${version}`) ? await cachedUrls(`fhq-art-${version}`) : [];
  line(!art.some(u => /\/heroes\/(motion|elite|signatures|reactions)\//.test(u)), `no battle sheets cached before a battle (${art.length} art entries: campus/scenery only)`);
  line(await page.evaluate(() => window.__fhqPwa?.connection().online === true && window.__fhqPwa.connection().settlesOffline === false), 'connection state exposed; never claims offline settlement');

  // 2. offline return
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  const offlineText = await page.locator('body').innerText().catch(() => '');
  line(/Football Headquarters/.test(offlineText) && /Roster|Game Day/.test(offlineText), 'offline return visit renders the shell and the campus navigation from cache');
  line(await page.evaluate(() => window.__fhqPwa?.connection().online === false), 'connection state reports offline');
  await context.setOffline(false);
  await page.reload({ waitUntil: 'networkidle' });
  line(/Roster|Game Day/.test(await page.locator('body').innerText()), 'online return visit works again');

  // 3. update flow
  const bumped = original.replace(version, 'ffffffffffff').split(version).join('ffffffffffff');
  await writeFile(swPath, bumped);
  await page.evaluate(() => window.__fhqPwa.checkForUpdate());
  await page.waitForFunction(() => window.__fhqPwa.update().available === true, null, { timeout: 15000 }).catch(() => {});
  line(await page.evaluate(() => window.__fhqPwa.update().available), 'new worker installed and reported as waiting');
  await page.waitForTimeout(800);
  line((await cacheNames()).includes(`fhq-shell-${version}`) && await page.evaluate(() => !!navigator.serviceWorker.controller), 'old worker still controls the page until the app applies the update (no automatic reload)');
  line(await page.evaluate(() => window.__fhqPwa.update().version === 'ffffffffffff'), 'the waiting worker reported its version to the page');
  // Readiness gate: without a provider, and while busy, the attempt is refused, recorded, and nothing reloads.
  const refusedBlind = await page.evaluate(() => window.__fhqPwa.applyUpdate());
  line(refusedBlind.applied === false && refusedBlind.reasons.includes('no_readiness_provider'), `applyUpdate without a readiness provider is refused (${refusedBlind.reasons.join(', ')})`);
  const refusedBusy = await page.evaluate(() => { window.__fhqPwa.registerUpdateReadiness(() => ({ battleActive: true, awaitingConfirmation: false, pendingOperations: 0, pendingJobs: { upgrade: 0, recruit: 0 }, accountSwitching: false })); return window.__fhqPwa.applyUpdate(); });
  await page.waitForTimeout(800);
  const keptState = await page.evaluate(() => ({ ...window.__fhqPwa.update(), controlled: !!navigator.serviceWorker.controller }));
  line(refusedBusy.applied === false && refusedBusy.reasons.includes('battle_active') && keptState.available && keptState.deferred && keptState.rejectedAttempts === 2 && !!keptState.lastRejection && keptState.controlled && (await cacheNames()).includes(`fhq-shell-${version}`), `applyUpdate during a battle is refused, recorded (${keptState.rejectedAttempts} attempts) and the waiting worker is kept`);
  const applied = await page.evaluate(() => { window.__fhqPwa.registerUpdateReadiness(() => ({ battleActive: false, awaitingConfirmation: false, pendingOperations: 0, pendingJobs: { upgrade: 0, recruit: 0 }, accountSwitching: false })); return window.__fhqPwa.retryDeferredUpdate(); });
  line(applied.applied === true, 'the deferred update applies once the app reports idle');
  await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const after = await cacheNames();
  line(after.includes('fhq-shell-ffffffffffff') && !after.includes(`fhq-shell-${version}`) && !after.includes(`fhq-art-${version}`), `after applyUpdate and reload: new shell cache active, old caches removed once every window is current (${after.join(', ')})`);
  line(/Roster|Game Day/.test(await page.locator('body').innerText()), 'app renders on the updated worker');

  // 4. failed update
  await context.route('**/sw.js', r => r.fulfill({ status: 500, body: 'deploy in progress' }));
  const stillFine = await page.evaluate(async () => { await window.__fhqPwa.checkForUpdate(); return document.body.innerText.length > 100; });
  line(stillFine, 'a failing sw.js fetch leaves the running app and its worker untouched');
  await context.unroute('**/sw.js');
} finally {
  await writeFile(swPath, original);
  await browser.close();
}
console.log(failures ? `RESULT: ${failures} PWA check(s) failed` : 'RESULT: offline shell, update, cleanup and failed-update behaviour verified');
process.exitCode = failures ? 1 : 0;
