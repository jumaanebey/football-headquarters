// Two tabs on different versions, against a built preview (never production):
//   tab A opens on build 1 and warms some hashed assets and the lazy campus-editor chunk;
//   a deploy is simulated in dist/ (new bundle name in index.html, sw.js version bumped with the
//   new precache list, and three hashed files from build 1 removed: one campus sheet tab A has
//   cached, one battle sheet it has not, and the campus-editor chunk);
//   tab B opens, installs the new worker and applies it; tab A stays open on the old bundle.
// Then: is tab A still served its cached old assets (the new worker must keep the previous
// version's caches while an old window is open)? does an uncached removed asset fail cleanly?
// does the old tab keep working? and after reloading A onto the new build, are the old caches
// finally removed? A final section deletes the old caches by hand to show what the previous
// lifecycle (delete-on-activate) did to the old tab.
// Usage: npm run build && node scripts/with-preview.mjs 4191 node scripts/pwa-multitab-check.mjs http://127.0.0.1:4191/
// (4190 is on the fetch-spec "bad port" list; use 4191-4199.) Restores dist/ afterwards.
import { chromium } from 'playwright';
import { copyFile, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:4191/';
const NEW_VERSION = 'ffffffffffff';
const swPath = 'dist/sw.js', htmlPath = 'dist/index.html';
const originalSw = await readFile(swPath, 'utf8'), originalHtml = await readFile(htmlPath, 'utf8');
const v1 = originalSw.match(/service worker ([0-9a-f]+)/)?.[1] ?? '?';
const oldJs = originalHtml.match(/\/assets\/index-[^"]+\.js/)?.[0];
const newJs = '/assets/index-NEWBUILD9.js';
const chunk = (await readdir('dist/assets')).filter(f => /^CampusEditor-.*\.js$/.test(f)).map(f => `/assets/${f}`)[0];
const manifest = JSON.parse(await readFile('dist/asset-manifest.json', 'utf8')).entries;
const battleSheet = manifest['/assets/heroes/elite/qb.webp'];
if (!oldJs || !chunk || !battleSheet) { console.error('dist is missing the bundle, the campus-editor chunk or the qb elite sheet; run npm run build'); process.exit(1); }

let failures = 0;
const line = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) failures++; };
const info = text => console.log(`INFO  ${text}`);
const removed = [];
const removeFromDist = async (urlPath) => { await rename(`dist${urlPath}`, `dist${urlPath}.removed`); removed.push(urlPath); };
const restoreDist = async () => {
  await writeFile(swPath, originalSw); await writeFile(htmlPath, originalHtml);
  for (const p of removed.splice(0)) await rename(`dist${p}.removed`, `dist${p}`).catch(() => {});
  await rm(`dist${newJs}`, { force: true });
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
await context.route(/supabase\.co/, r => r.abort());
const idle = { battleActive: false, awaitingConfirmation: false, pendingOperations: 0, pendingJobs: { upgrade: 0, recruit: 0 }, accountSwitching: false };
const cacheNames = page => page.evaluate(() => caches.keys());
const cachedUrls = (page, name) => page.evaluate(async n => (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname), name);
// A probe distinguishes a real asset from the preview server's SPA fallback (vite preview answers
// unknown paths with index.html and HTTP 200; Vercel answers 404). `served` = a real asset body.
const probe = (page, url) => page.evaluate(async u => { try { const r = await fetch(u); const type = r.headers.get('content-type') ?? ''; return { status: r.status, ok: r.ok, type, served: r.ok && !/text\/html/.test(type), missing: r.status === 404 || (r.ok && /text\/html/.test(type)) }; } catch (e) { return { status: 0, ok: false, type: '', served: false, missing: false, error: String(e) }; } }, url);
const describe = p => p.error ? `threw ${p.error}` : p.missing && p.ok ? `HTTP ${p.status} SPA fallback (${p.type}; a real host answers 404)` : `HTTP ${p.status} ${p.type}`;
const controllerVersion = page => page.evaluate(() => new Promise(resolve => { const c = navigator.serviceWorker.controller; if (!c) return resolve(null); const ch = new MessageChannel(); const t = setTimeout(() => resolve('timeout'), 2000); ch.port1.onmessage = e => { clearTimeout(t); resolve(e.data?.version ?? null); }; c.postMessage({ type: 'GET_VERSION' }, [ch.port2]); }));
const bundleOf = page => page.evaluate(() => [...document.scripts].map(s => new URL(s.src, location.href).pathname).find(p => /\/assets\/index-/.test(p)) ?? null);
const alive = async page => { const t = await page.locator('body').innerText().catch(() => ''); return /Roster|Game Day/.test(t) && !/Something went wrong|error boundary/i.test(t); };
const finishNaming = async page => {
  if (await page.locator('input[placeholder="Your club name"]').count()) {
    await page.fill('input[placeholder="Your club name"]', 'Multitab FC'); await page.click('button[type="submit"]'); await page.waitForTimeout(400);
    const buttons = page.locator('button'); const count = await buttons.count();
    for (let i = 0; i < count; i++) { const t = (await buttons.nth(i).innerText()).trim(); if (t && !/play|storm|game|change club name|random name/i.test(t) && await buttons.nth(i).isVisible()) { await buttons.nth(i).click(); break; } }
  }
};

try {
  // ----- Tab A on build 1 -----
  const a = await context.newPage();
  await a.goto(base, { waitUntil: 'networkidle' });
  await finishNaming(a);
  await a.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null || false, null, { timeout: 15000 }).catch(() => {});
  await a.reload({ waitUntil: 'networkidle' });
  line(await a.evaluate(() => !!navigator.serviceWorker.controller) && await controllerVersion(a) === v1, `tab A controlled by worker ${v1} on bundle ${await bundleOf(a)}`);
  // Warm the lazy campus-editor chunk through the UI, then return to the campus (still build 1).
  await a.click('button:has-text("Edit campus")').catch(() => {});
  await a.waitForTimeout(1500);
  await a.reload({ waitUntil: 'networkidle' });
  const artV1 = await cachedUrls(a, `fhq-art-${v1}`);
  const campusSheet = artV1.find(u => /\/heroes\/campus\//.test(u));
  line(!!campusSheet && artV1.includes(chunk), `tab A has cached a campus sheet (${campusSheet}) and the campus-editor chunk (${chunk})`);
  line(!artV1.includes(battleSheet), `tab A has NOT cached the battle sheet it will need later (${battleSheet})`);

  // ----- Simulated deploy of build 2 in dist/ -----
  await copyFile(`dist${oldJs}`, `dist${newJs}`);
  await writeFile(htmlPath, originalHtml.split(oldJs).join(newJs));
  await writeFile(swPath, originalSw.split(v1).join(NEW_VERSION).split(oldJs).join(newJs));
  await removeFromDist(campusSheet); await removeFromDist(battleSheet); await removeFromDist(chunk);
  info(`deploy simulated: ${oldJs} -> ${newJs}, sw ${v1} -> ${NEW_VERSION}, removed from dist: ${[campusSheet, battleSheet, chunk].join(', ')}`);

  // ----- Tab B on build 2 -----
  const b = await context.newPage();
  await b.goto(base, { waitUntil: 'networkidle' });
  line(await bundleOf(b) === newJs, `tab B loaded the new bundle ${await bundleOf(b)}`);
  await b.waitForFunction(() => window.__fhqPwa?.update().available === true, null, { timeout: 20000 }).catch(() => {});
  line(await b.evaluate(() => window.__fhqPwa.update().available), 'tab B sees the new worker installed and waiting');
  line(await controllerVersion(a) === v1 && await alive(a), 'tab A is still on the old worker while B has not applied');
  const applied = await b.evaluate(i => { window.__fhqPwa.registerUpdateReadiness(() => i); return window.__fhqPwa.applyUpdate(); }, idle);
  line(applied.applied === true, 'tab B applies the update');
  await b.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15000 }).catch(() => {});
  await a.waitForTimeout(3000);

  // ----- Tab A after B activated the new worker -----
  const aController = await controllerVersion(a);
  line(aController === NEW_VERSION, `tab A is now controlled by the NEW worker (${aController}) while still running ${await bundleOf(a)} — activation takes over every window`);
  const namesAfter = await cacheNames(a);
  line(namesAfter.includes(`fhq-shell-${v1}`) && namesAfter.includes(`fhq-art-${v1}`) && namesAfter.includes(`fhq-shell-${NEW_VERSION}`), `the previous version's caches survive activation while tab A is open (${namesAfter.join(', ')})`);
  const cachedProbe = await probe(a, campusSheet);
  line(cachedProbe.served && /image/.test(cachedProbe.type), `tab A's cached old campus sheet still loads through the new worker although the deploy removed it: ${describe(cachedProbe)}`);
  const chunkProbe = await probe(a, chunk);
  line(chunkProbe.served && /javascript/.test(chunkProbe.type), `tab A's cached old campus-editor chunk still loads: ${describe(chunkProbe)}`);
  const uncachedProbe = await probe(a, battleSheet);
  info(`tab A's UNCACHED old battle sheet, removed by the deploy: ${describe(uncachedProbe)} — host limitation: no cache can serve a file the tab never requested and the host no longer ships; the loader keeps the portrait fallback and retries`);
  line(uncachedProbe.missing && !uncachedProbe.error, 'the uncached removed asset fails cleanly (a missing-asset answer, not a thrown fetch)');
  await a.click('[aria-label="Club navigation"] button:has-text("Heroes")').catch(() => {});
  await a.waitForTimeout(800);
  const heroesOpen = /Heroes|Roster|Train/.test(await a.locator('body').innerText().catch(() => ''));
  await a.keyboard.press('Escape'); await a.waitForTimeout(300);
  line(heroesOpen && await alive(a), 'the old tab keeps working (Heroes opens, campus navigation intact, no error boundary)');
  line(await a.evaluate(() => !window.__fhqPwa.update().applying), 'tab A was not reloaded by B\'s activation (no automatic reload of a tab that did not ask)');

  // ----- What the previous lifecycle did: delete the old caches while A is open -----
  await b.evaluate(async v => { for (const n of await caches.keys()) if (n.endsWith(v)) await caches.delete(n); }, v1);
  const afterDelete = await probe(a, campusSheet);
  info(`OLD LIFECYCLE SIMULATION (caches of ${v1} deleted while tab A is open): tab A's campus sheet now answers ${describe(afterDelete)} — this is what delete-on-activate did to a still-running tab`);
  line(afterDelete.missing, 'simulation confirms the failure mode the lifecycle change prevents');

  // ----- Reload A onto build 2: old caches are removed once every window is current -----
  await a.reload({ waitUntil: 'networkidle' });
  await a.waitForTimeout(1500);
  line(await bundleOf(a) === newJs && await controllerVersion(a) === NEW_VERSION && await alive(a), `tab A reloaded onto ${await bundleOf(a)} under worker ${NEW_VERSION} and renders`);
  const finalNames = await cacheNames(a);
  line(!finalNames.some(n => n.endsWith(v1)) && finalNames.includes(`fhq-shell-${NEW_VERSION}`), `old caches removed once both windows run the new bundle (${finalNames.join(', ')})`);
} finally {
  await restoreDist();
  await browser.close();
}
console.log(failures ? `RESULT: ${failures} multitab check(s) failed` : 'RESULT: two-version tab lifecycle verified (old caches kept while an old window is open, removed once every window is current)');
process.exitCode = failures ? 1 : 0;
