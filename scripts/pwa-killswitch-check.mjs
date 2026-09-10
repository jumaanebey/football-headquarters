// Kill-switch rehearsal against a built preview (never production). From a controlled
// old-worker fixture (the normal worker active, shell and art cached, club data in localStorage,
// a non-fhq cache of our own), dist/sw.js is replaced with pwa/sw-killswitch.js and an update is
// triggered. Verified: every fhq-* cache is deleted, the worker is unregistered, the open page is
// re-navigated and works from the network, localStorage club data survives, the non-fhq cache
// stays, and club-server/auth requests were never cached by either worker. Then the normal
// worker is restored and re-registration is verified.
// Usage: npm run build && node scripts/with-preview.mjs 4191 node scripts/pwa-killswitch-check.mjs http://127.0.0.1:4191/
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:4191/';
if (/vercel\.app|football-headquarters\.(app|com)/.test(base)) { console.error('refusing to run the kill-switch against a deployed host'); process.exit(1); }
const swPath = 'dist/sw.js';
const original = await readFile(swPath, 'utf8');
const killswitch = await readFile('pwa/sw-killswitch.js', 'utf8');
const version = original.match(/service worker ([0-9a-f]+)/)?.[1] ?? '?';
const MARKER_KEY = 'fhq_killswitch_marker', MARKER = `survived-${Date.now()}`;
const OTHER_CACHE = 'not-fhq-cache';
let failures = 0;
const line = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) failures++; };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
await context.route(/supabase\.co/, r => r.abort());
// Same-origin club-server-shaped paths (network-only by policy): answer them so the page can request them.
await context.route(/\/(functions|rest|auth)\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"secret":"never-cache-me"}' }));
const page = await context.newPage();
const cacheNames = () => page.evaluate(() => caches.keys());
const registrations = () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
const alive = async () => /Roster|Game Day/.test(await page.locator('body').innerText().catch(() => ''));
const anyCacheHas = url => page.evaluate(async u => !!(await caches.match(u, { ignoreVary: true })), url);
try {
  // ----- Fixture: normal worker controlling the page -----
  await page.goto(base, { waitUntil: 'networkidle' });
  if (await page.locator('input[placeholder="Your club name"]').count()) {
    await page.fill('input[placeholder="Your club name"]', 'Killswitch FC'); await page.click('button[type="submit"]'); await page.waitForTimeout(400);
    const buttons = page.locator('button'); const count = await buttons.count();
    for (let i = 0; i < count; i++) { const t = (await buttons.nth(i).innerText()).trim(); if (t && !/play|storm|game|change club name|random name/i.test(t) && await buttons.nth(i).isVisible()) { await buttons.nth(i).click(); break; } }
  }
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null || false, null, { timeout: 15000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  const before = await cacheNames();
  line(await page.evaluate(() => !!navigator.serviceWorker.controller) && before.includes(`fhq-shell-${version}`), `fixture: page controlled by worker ${version}, caches ${before.join(', ')}`);
  await page.evaluate(async ([k, v, other]) => { localStorage.setItem(k, v); const c = await caches.open(other); await c.put('/not-ours.json', new Response('{"mine":true}')); }, [MARKER_KEY, MARKER, OTHER_CACHE]);
  const save = await page.evaluate(() => localStorage.getItem('fhq_save_v1'));
  line(!!save && /Killswitch FC/.test(save), 'fixture: club save present in localStorage');
  // Network/auth requests through the NORMAL worker are never cached.
  await page.evaluate(async () => { await fetch('/functions/v1/club-authority', { method: 'POST', body: '{}' }); await fetch('/rest/v1/fhq_events?select=1'); await fetch('/auth/v1/token'); });
  await page.waitForTimeout(500);
  line(!(await anyCacheHas('/rest/v1/fhq_events?select=1')) && !(await anyCacheHas('/auth/v1/token')) && !(await anyCacheHas('/functions/v1/club-authority')), 'normal worker: club-server, REST and auth requests are not in any cache');

  // ----- Deploy the kill switch and trigger the update -----
  await writeFile(swPath, killswitch);
  const navigations = [];
  page.on('framenavigated', f => { if (f === page.mainFrame()) navigations.push(f.url()); });
  await page.evaluate(() => window.__fhqPwa.checkForUpdate());
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 0, null, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  const after = await cacheNames();
  line(!after.some(n => n.startsWith('fhq-')), `all fhq-* caches deleted (remaining: ${after.join(', ') || 'none'})`);
  line(after.includes(OTHER_CACHE) && await page.evaluate(async o => !!(await (await caches.open(o)).match('/not-ours.json')), OTHER_CACHE), 'a cache that is not ours was left alone');
  line(await registrations() === 0 && await page.evaluate(() => navigator.serviceWorker.controller === null), 'worker unregistered; the page has no controller');
  line(navigations.length >= 1, `the open page was re-navigated by the kill switch (${navigations.length} navigation(s))`);
  line(await alive(), 'the page works from the network without a worker');
  line(await page.evaluate(k => localStorage.getItem(k), MARKER_KEY) === MARKER && /Killswitch FC/.test(await page.evaluate(() => localStorage.getItem('fhq_save_v1') ?? '')), 'localStorage club data and the marker survived');
  await page.evaluate(async () => { await fetch('/functions/v1/club-authority', { method: 'POST', body: '{}' }); await fetch('/rest/v1/fhq_events?select=2'); });
  line(!(await anyCacheHas('/rest/v1/fhq_events?select=2')) && !(await anyCacheHas('/functions/v1/club-authority')), 'kill switch: club-server and REST requests are not cached either');
  // A second visit while the kill switch is deployed installs it again and tears itself down at once.
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  line(await registrations() === 0 && !(await cacheNames()).some(n => n.startsWith('fhq-')) && await alive(), 'while the kill switch is deployed, a fresh visit installs nothing lasting and the app still runs');

  // ----- Restore the normal worker and verify re-registration -----
  await writeFile(swPath, original);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).some(r => r.active), null, { timeout: 20000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  const restored = await cacheNames();
  line(await page.evaluate(() => !!navigator.serviceWorker.controller) && restored.includes(`fhq-shell-${version}`), `normal worker ${version} re-registered and controlling; caches ${restored.join(', ')}`);
  line(await alive() && await page.evaluate(k => localStorage.getItem(k), MARKER_KEY) === MARKER, 'app renders and club data is still intact after re-registration');
} finally {
  await writeFile(swPath, original);
  await browser.close();
}
console.log(failures ? `RESULT: ${failures} kill-switch check(s) failed` : 'RESULT: kill switch removes caches and worker, keeps club data and foreign caches, and the normal worker re-registers');
process.exitCode = failures ? 1 : 0;
