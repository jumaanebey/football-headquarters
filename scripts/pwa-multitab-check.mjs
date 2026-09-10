// Two-version rehearsal for CURRENT main. Local preview only; dist restored on exit.
// Uses the current boolean applyUpdate API, shell-precached lazy chunks, and bounded
// retention of two previous versions (not per-client acknowledgement eviction).
// Browser result remains unverified until this script is actually run successfully.
import { chromium } from 'playwright';
import { copyFile, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:4191/';
const parsedBase=new URL(base);
if(parsedBase.protocol!=='http:' || !['localhost','127.0.0.1','[::1]'].includes(parsedBase.hostname)) throw Error('local HTTP preview required');
const NEW_VERSION = 'ffffffffffff';
const swPath = 'dist/sw.js', htmlPath = 'dist/index.html';
const originalSw = await readFile(swPath, 'utf8'), originalHtml = await readFile(htmlPath, 'utf8');
const v1 = originalSw.match(/service worker ([0-9a-f]+)/)?.[1] ?? '?';
const oldJs = originalHtml.match(/\/assets\/index-[^"]+\.js/)?.[0];
const newJs = '/assets/index-NEWBUILD9.js';
const newChunk = '/assets/CampusEditor-NEWBUILD9.js';
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
  await rm(`dist${newJs}`, { force: true }); await rm(`dist${newChunk}`, { force: true });
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
await context.route(/supabase\.co/, r => r.abort());

const cacheNames = page => page.evaluate(() => caches.keys());
const cachedUrls = (page, name) => page.evaluate(async n => (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname), name);
// A probe distinguishes a real asset from the preview server's SPA fallback (vite preview answers
// unknown paths with index.html and HTTP 200; Vercel answers 404). `served` = a real asset body.
const probe = (page, url) => page.evaluate(async u => { try { const r = await fetch(u); const type = r.headers.get('content-type') ?? ''; return { status: r.status, ok: r.ok, type, served: r.ok && !/text\/html/.test(type), missing: r.status === 404 || (r.ok && /text\/html/.test(type)) }; } catch (e) { return { status: 0, ok: false, type: '', served: false, missing: false, error: String(e) }; } }, url);
const describe = p => p.error ? `threw ${p.error}` : p.missing && p.ok ? `HTTP ${p.status} SPA fallback (${p.type}; a real host answers 404)` : `HTTP ${p.status} ${p.type}`;
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
  line(await a.evaluate(() => {window.__fhqOldController=navigator.serviceWorker.controller;return !!window.__fhqOldController;}) && (await cacheNames(a)).includes(`fhq-shell-${v1}`), `tab A controlled by worker ${v1} on bundle ${await bundleOf(a)}`);
  // The lazy editor is already in the SHELL precache. Warm one exact campus asset
  // explicitly; do not depend on a particular set of starter heroes/UI button labels.
  const campusSheet=Object.entries(manifest).find(([key])=>key.includes('/heroes/campus/'))?.[1];
  if(!campusSheet) throw Error('fixture: no fingerprinted campus sheet');
  await probe(a,campusSheet);
  await a.waitForFunction(async p=>!!await caches.match(p),campusSheet);
  const artV1=await cachedUrls(a,`fhq-art-${v1}`), shellV1=await cachedUrls(a,`fhq-shell-${v1}`);
  line(artV1.includes(campusSheet)&&shellV1.includes(chunk),'fixture: campus art cached and lazy editor precached in shell');
  line(!(await cachedUrls(a,`fhq-art-${v1}`)).includes(battleSheet),'fixture: elite battle sheet has not been cached');
  if(failures) throw Error('fixture assertions failed; lifecycle not tested');

  // ----- Simulated deploy of build 2 in dist/ -----
  await writeFile(`dist${newJs}`,(await readFile(`dist${oldJs}`,'utf8')).split(chunk.split('/').pop()).join(newChunk.split('/').pop()));
  await copyFile(`dist${chunk}`,`dist${newChunk}`);
  await writeFile(htmlPath, originalHtml.split(oldJs).join(newJs));
  await writeFile(swPath, originalSw.split(v1).join(NEW_VERSION).split(oldJs).join(newJs).split(chunk).join(newChunk));
  await removeFromDist(campusSheet); await removeFromDist(battleSheet); await removeFromDist(chunk);
  info(`deploy simulated: ${oldJs} -> ${newJs}, sw ${v1} -> ${NEW_VERSION}, removed from dist: ${[campusSheet, battleSheet, chunk].join(', ')}`);

  // ----- Tab B on build 2 -----
  const b = await context.newPage();
  await b.goto(base, { waitUntil: 'networkidle' });
  line(await bundleOf(b) === newJs, `tab B loaded the new bundle ${await bundleOf(b)}`);
  await b.evaluate(()=>window.__fhqPwa.checkForUpdate());
  await b.waitForFunction(() => window.__fhqPwa?.update().available === true, null, { timeout: 20000 }).catch(() => {});
  line(await b.evaluate(() => window.__fhqPwa.update().available), 'tab B sees the new worker installed and waiting');
  line(await a.evaluate(()=>navigator.serviceWorker.controller===window.__fhqOldController) && await alive(a), 'tab A is still on the old worker while B has not applied');
  const applied = await b.evaluate(() => window.__fhqPwa.applyUpdate());
  line(applied === true, 'tab B applies the update');
  await b.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15000 }).catch(() => {});
  await a.waitForTimeout(3000);

  // ----- Tab A after B activated the new worker -----
  await a.waitForFunction(()=>!!window.__fhqOldController&&navigator.serviceWorker.controller!==window.__fhqOldController);
  line(await bundleOf(a)===oldJs&&await a.evaluate(()=>!!window.__fhqOldController&&!!navigator.serviceWorker.controller&&navigator.serviceWorker.controller!==window.__fhqOldController), `tab A changed controller while retaining bundle ${await bundleOf(a)}`);
  const namesAfter = await cacheNames(a);
  line(namesAfter.includes(`fhq-shell-${v1}`) && namesAfter.includes(`fhq-art-${v1}`) && namesAfter.includes(`fhq-shell-${NEW_VERSION}`), `the previous version's caches survive activation while tab A is open (${namesAfter.join(', ')})`);
  const cachedProbe = await probe(a, campusSheet);
  line(cachedProbe.served && /image/.test(cachedProbe.type), `tab A's cached old campus sheet still loads through the new worker although the deploy removed it: ${describe(cachedProbe)}`);
  const chunkProbe = await probe(a, chunk);
  line(chunkProbe.served && /javascript/.test(chunkProbe.type), `tab A's cached old campus-editor chunk still loads: ${describe(chunkProbe)}`);
  const uncachedProbe = await probe(a, battleSheet);
  info(`tab A's UNCACHED old battle sheet, removed by the deploy: ${describe(uncachedProbe)} — host limitation: no cache can serve a file the tab never requested and the host no longer ships; the loader keeps the portrait fallback and retries`);
  line(uncachedProbe.missing && !uncachedProbe.error, 'the uncached removed asset fails cleanly (a missing-asset answer, not a thrown fetch)');
  await a.getByRole('button',{name:'Heroes',exact:true}).click();
  await a.waitForTimeout(800);
  const heroesOpen = await a.getByRole('dialog').getByRole('heading',{name:'Hall of Heroes',exact:true}).isVisible();
  await a.keyboard.press('Escape'); await a.waitForTimeout(300);
  line(heroesOpen && await alive(a), 'the old tab keeps working (Heroes opens, campus navigation intact, no error boundary)');
  line(await a.evaluate(() => !window.__fhqPwa.update().applying), 'tab A was not reloaded by B\'s activation (no automatic reload of a tab that did not ask)');

  // Reloading A does not evict old caches: current main deliberately keeps TWO
  // prior versions, independent of how many tabs still use them. Unit tests cover
  // eviction after the third newer version activates.
  await a.reload({waitUntil:'networkidle'});
  const finalNames=await cacheNames(a);
  line(await bundleOf(a)===newJs&&await alive(a),'tab A reloads into the new bundle and renders');
  line(finalNames.includes(`fhq-shell-${v1}`)&&finalNames.includes(`fhq-shell-${NEW_VERSION}`),'prior shell remains under the two-version retention policy');
} finally {
  await restoreDist();
  await browser.close();
}
console.log(failures ? `RESULT: ${failures} multitab check(s) failed` : 'RESULT: two-version tab lifecycle verified (prior caches retained across activation and reload; bounded eviction covered by worker runtime tests)');
process.exitCode = failures ? 1 : 0;
