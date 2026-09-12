// Capture the Stadium scenario gallery and run the checks a browser can make.
//
//   node scripts/stadium-gallery.mjs [--port 4240] [--shots]
//
// AUTOMATED (pass/fail below): every scenario and play renders; the sequence produces an SVG with
// a finite viewBox; the caption exposes the skip/replay control while a play is animating; and the
// Stadium panel fits its viewport at phone portrait, phone landscape and desktop without the
// document scrolling sideways.
//
// NOT automated: whether a play reads as the thing it claims to be, whether the camera follows the
// right point, whether the art is right. Those are recorded as visual judgments in
// docs/STADIUM-ACCEPTANCE.md against the captured images.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const wantShots = process.argv.includes('--shots');
const OUT = 'docs/evidence/stadium';
const VIEWPORTS = [
  { id: 'phone-portrait', width: 390, height: 844, isMobile: true },
  { id: 'phone-landscape', width: 844, height: 390, isMobile: true },
  { id: 'desktop', width: 1440, height: 900, isMobile: false },
];

let failures = 0;
const line = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) failures++; };

const port = Number(arg('--port', 0)) || await (async () => {
  for (let p = 4240; p < 4260; p++) { try { await fetch(`http://127.0.0.1:${p}/`, { signal: AbortSignal.timeout(700) }); } catch { return p; } }
  throw new Error('no free port in 4240-4259');
})();
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`dev server pid ${server.pid} on port ${port} (stopped at the end)`);
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 250)); }

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const summary = { capturedAt: new Date().toISOString(), scenarios: [], viewports: [] };
try {
  // ---- Gallery: every scenario and play renders ----
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  page.on('response', r => { if (r.status() >= 400 && !/favicon/i.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('console', m => { const where = m.location()?.url ?? ''; if (m.type() === 'error' && !/favicon/i.test(`${m.text()} ${where}`)) errors.push(`${m.text().slice(0, 120)} ${where.slice(-60)}`); });
  await page.goto(`${base}art/stadium-gallery.html?wide=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-scenario]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  const scenarios = await page.$$eval('[data-scenario]', nodes => nodes.map(n => ({
    id: n.dataset.scenario,
    title: n.querySelector('h2')?.textContent?.trim().slice(0, 120) ?? '',
    tags: Array.from(n.querySelectorAll('.tags span')).map(s => s.textContent),
    plays: Array.from(n.querySelectorAll('[data-play]')).map(p => ({
      id: p.dataset.play,
      title: p.querySelector('h3 span')?.textContent ?? '',
      geometry: p.querySelector('.geometry')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      hasSvg: !!p.querySelector('svg'),
      viewBox: p.querySelector('svg')?.getAttribute('viewBox') ?? '',
      caption: p.querySelector('.fhq-performance-caption p')?.textContent ?? '',
      control: p.querySelector('.fhq-performance-caption button')?.textContent ?? null,
      playback: p.querySelector('.fhq-stadium-sequence')?.getAttribute('data-playback') ?? '',
    })),
  })));
  summary.scenarios = scenarios;
  line(scenarios.length >= 13, `gallery renders ${scenarios.length} scenarios`);
  const plays = scenarios.flatMap(s => s.plays);
  line(plays.length >= 60, `gallery renders ${plays.length} individual plays`);
  line(plays.every(p => p.hasSvg), `every play draws a field (${plays.filter(p => p.hasSvg).length}/${plays.length})`);
  const badViewBox = plays.filter(p => !/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/.test(p.viewBox) || p.viewBox.split(' ').some(v => !Number.isFinite(Number(v))));
  line(badViewBox.length === 0, `every camera has a finite viewBox${badViewBox.length ? `; bad: ${badViewBox.slice(0, 3).map(p => `${p.id}="${p.viewBox}"`).join(', ')}` : ''}`);
  const captionless = plays.filter(p => !p.caption.trim());
  line(captionless.length === 0, `every play states what happened${captionless.length ? `; silent: ${captionless.slice(0, 3).map(p => p.id).join(', ')}` : ''}`);
  const animating = plays.filter(p => p.playback === 'playing');
  line(animating.every(p => /skip/i.test(p.control ?? '')), `animating plays offer a skip control (${animating.length} animating)`);
  line(errors.length === 0, `no console errors while rendering the gallery${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);

  if (wantShots) {
    await mkdir(OUT, { recursive: true });
    for (const scenario of scenarios) {
      for (const play of scenario.plays) {
        const node = await page.$(`[data-play="${play.id}"]`);
        if (!node) continue;
        const shot = await node.screenshot({ type: 'png' });
        await writeFile(`${OUT}/${play.id}.webp`, await sharp(shot).webp({ quality: 76 }).toBuffer());
      }
    }
    console.log(`captured ${plays.length} play images into ${OUT}`);
  }
  // ---- Skip, replay and reload behaviour on a real animating play ----
  {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
    const page2 = await ctx.newPage();
    await page2.goto(`${base}art/stadium-gallery.html?tag=touchdown-offense`, { waitUntil: 'networkidle' });
    const card = page2.locator('[data-play]').first();
    await card.waitFor({ timeout: 30000 });
    const sequence = card.locator('.fhq-stadium-sequence');
    const playing = await sequence.getAttribute('data-playback');
    line(playing === 'playing', `a freshly mounted play animates (data-playback=${playing})`);
    const skip = card.getByRole('button', { name: /skip/i });
    line(await skip.count() > 0, 'an animating play offers "Skip animation"');
    await skip.first().click();
    await page2.waitForTimeout(150);
    const afterSkip = await sequence.getAttribute('data-playback');
    line(afterSkip === 'complete', `skip jumps straight to the finished play (data-playback=${afterSkip})`);
    const replay = card.getByRole('button', { name: /replay/i });
    line(await replay.count() > 0, 'a finished play offers "Replay play"');
    await replay.first().click();
    await page2.waitForTimeout(200);
    const afterReplay = await sequence.getAttribute('data-playback');
    line(afterReplay === 'playing', `replay restarts the same play (data-playback=${afterReplay})`);
    const settled = await page2.waitForFunction(() => document.querySelector('[data-play] .fhq-stadium-sequence')?.getAttribute('data-playback') === 'complete', null, { timeout: 15000 }).then(() => true).catch(() => false);
    line(settled, 'a replayed play finishes on its own');
    // A reload rebuilds the same play from the same scenario and settles again.
    await page2.reload({ waitUntil: 'networkidle' });
    const reloaded = await page2.waitForFunction(() => document.querySelector('[data-play] .fhq-stadium-sequence')?.getAttribute('data-playback') === 'complete', null, { timeout: 20000 }).then(() => true).catch(() => false);
    const captionAfterReload = await card.locator('.fhq-performance-caption p').first().textContent();
    line(reloaded && !!captionAfterReload?.trim(), `after a reload the play renders and settles ("${(captionAfterReload ?? '').trim().slice(0, 60)}")`);
    await ctx.close();
  }
  await context.close();

  // ---- Viewport fit: the Stadium panel inside the real game, at three sizes ----
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile, deviceScaleFactor: 1 });
    const cdp = await ctx.newCDPSession(await ctx.newPage());
    await cdp.send('Network.enable');
    await cdp.send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
    const p = ctx.pages()[0];
    await p.goto(`${base}art/stadium-gallery.html`, { waitUntil: 'networkidle' });
    await p.waitForSelector('[data-play]', { timeout: 30000 });
    await p.waitForTimeout(800);
    const fit = await p.evaluate(() => {
      const doc = document.documentElement;
      const cards = Array.from(document.querySelectorAll('[data-play]'));
      const overflowing = cards.filter(c => c.getBoundingClientRect().width > window.innerWidth + 1).length;
      const svgs = Array.from(document.querySelectorAll('.fhq-stadium-sequence > svg'));
      const clipped = svgs.filter(s => { const r = s.getBoundingClientRect(); return r.width < 40 || r.height < 30; }).length;
      const controls = Array.from(document.querySelectorAll('.fhq-performance-caption button'));
      // A control must sit inside the page horizontally and stay a usable tap target. Vertical
      // position is meaningless on a long gallery, so it is not judged here.
      const offscreen = controls.filter(b => { const r = b.getBoundingClientRect(); return r.left < -1 || r.right > window.innerWidth + 1; }).length;
      const tiny = controls.filter(b => { const r = b.getBoundingClientRect(); return r.height < 24 || r.width < 40; }).length;
      return { docWidth: doc.scrollWidth, innerWidth: window.innerWidth, overflowing, clipped, svgs: svgs.length, controls: controls.length, offscreen, tiny };
    });
    summary.viewports.push({ ...vp, ...fit });
    line(fit.docWidth <= fit.innerWidth + 1, `${vp.id} (${vp.width}×${vp.height}): no sideways scrolling (document ${fit.docWidth}px in ${fit.innerWidth}px)`);
    line(fit.overflowing === 0, `${vp.id}: no play card wider than the viewport (${fit.overflowing} of ${fit.svgs})`);
    line(fit.clipped === 0, `${vp.id}: every field is drawn at a usable size (${fit.clipped} clipped of ${fit.svgs})`);
    line(fit.offscreen === 0, `${vp.id}: playback controls stay inside the page width (${fit.controls} controls, ${fit.offscreen} outside)`);
    line(fit.tiny === 0, `${vp.id}: playback controls remain usable tap targets (${fit.tiny} under 24px tall or 40px wide)`);
    if (wantShots) { await mkdir(OUT, { recursive: true }); await writeFile(`${OUT}/viewport-${vp.id}.webp`, await sharp(await p.screenshot({ type: 'png' })).webp({ quality: 76 }).toBuffer()); }
    // The shipped Stadium panel, not only the gallery cards.
    // A club mid-game, so the decision buttons players tap are on screen and measurable.
    await p.goto(`${base}art/stadium-gallery.html?panel=S01&frame=1`, { waitUntil: 'networkidle' });
    await p.waitForSelector('[data-panel]', { timeout: 30000 });
    await p.waitForTimeout(900);
    const panel = await p.evaluate(() => {
      const doc = document.documentElement;
      const section = document.querySelector('.fhq-stadium-football');
      const svg = document.querySelector('.fhq-stadium-sequence > svg');
      const buttons = Array.from(document.querySelectorAll('.fhq-stadium-football button'));
      const wide = buttons.filter(b => { const r = b.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.left < -1; }).length;
      const small = buttons.filter(b => { const r = b.getBoundingClientRect(); return r.height < 30; }).length;
      const rect = section?.getBoundingClientRect();
      const field = svg?.getBoundingClientRect();
      return { docWidth: doc.scrollWidth, innerWidth: window.innerWidth, panelWidth: rect ? Math.round(rect.width) : 0, fieldHeight: field ? Math.round(field.height) : 0, buttons: buttons.length, wide, small };
    });
    summary.viewports.push({ ...vp, panel });
    line(panel.panelWidth > 0 && panel.buttons >= 3, `${vp.id}: the shipped Stadium panel offers its decision (${panel.panelWidth}px wide, ${panel.buttons} controls)`);
    line(panel.docWidth <= panel.innerWidth + 1, `${vp.id}: the panel does not scroll sideways (document ${panel.docWidth}px in ${panel.innerWidth}px)`);
    line(panel.wide === 0, `${vp.id}: every panel control stays inside the page width (${panel.wide} outside)`);
    line(panel.small === 0, `${vp.id}: every panel control is at least 30px tall (${panel.small} smaller)`);
    line(panel.fieldHeight >= 120, `${vp.id}: the field keeps a usable height (${panel.fieldHeight}px)`);
    if (wantShots) await writeFile(`${OUT}/panel-${vp.id}-playing.webp`, await sharp(await p.screenshot({ type: 'png' })).webp({ quality: 76 }).toBuffer());
    // Once the play has finished the panel must frame the next decision: the objective, the context
    // the call answers, and enabled call buttons.
    const skipButton = p.getByRole('button', { name: /skip/i });
    if (await skipButton.count()) await skipButton.first().click();
    await p.waitForTimeout(400);
    const decided = await p.evaluate(() => {
      const objective = document.querySelector('.fhq-football-objective')?.textContent?.trim() ?? '';
      const context = document.querySelector('.fhq-football-context')?.textContent?.trim() ?? '';
      const calls = Array.from(document.querySelectorAll('.fhq-football-calls button'));
      const enabled = calls.filter(b => !b.hasAttribute('disabled')).length;
      const doc = document.documentElement;
      return { objective, context, calls: calls.length, enabled, docWidth: doc.scrollWidth, innerWidth: window.innerWidth };
    });
    line(decided.objective.length > 10, `${vp.id}: the settled panel states the objective ("${decided.objective.slice(0, 70)}")`);
    line(decided.enabled >= 2, `${vp.id}: the settled panel offers ${decided.enabled} enabled calls of ${decided.calls}`);
    line(decided.docWidth <= decided.innerWidth + 1, `${vp.id}: the settled panel still does not scroll sideways (${decided.docWidth}px in ${decided.innerWidth}px)`);
    summary.viewports[summary.viewports.length - 1].decided = decided;
    if (wantShots) await writeFile(`${OUT}/panel-${vp.id}.webp`, await sharp(await p.screenshot({ type: 'png' })).webp({ quality: 76 }).toBuffer());
    await ctx.close();
  }
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/gallery.json`, JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `RESULT: ${failures} gallery check(s) failed` : 'RESULT: every scenario and play renders, and the Stadium fits all three viewports');
process.exitCode = failures ? 1 : 0;
