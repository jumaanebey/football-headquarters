// Rendered before/after frame sequences for all nine heroes from the dev fixture
// (art/hero-motion-compare.html): the same scripted path with presentation profiles OFF (base
// profile for everyone) and ON. Captures each hero at phone scale (48 px) and enlarged (256 px)
// at fixed keyframes, writes one strip per hero to docs/evidence/motion/<hero>.webp and a JSON
// summary of frame indices per keyframe, plus a missing-art case (Burner motion sheet blocked).
//   node scripts/motion-clips.mjs            (starts `vite` on a free port in 4193–4199)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const HEROES = ['qb', 'enforcer', 'coach', 'kicker', 'burner', 'medic', 'captain', 'playmaker', 'legend'];
// Keyframe times (s) on the fixture script: idle, start, stride, stride, turn, stride, stop, settle, attack anticipation, contact, recovery, hit, sig Set, Load, Release, idle.
const KEYFRAMES = [0.3, 0.65, 0.73, 1.0, 1.4, 2.25, 2.35, 2.9, 3.9, 4.0, 4.15, 4.63, 4.7, 4.76, 4.84, 5.65, 5.75, 6.75, 7.4, 9.0];
const DENSE_STEP = 0.05; // numeric comparison samples every 50 ms over the whole path
const port = await (async () => { for (let p = 4193; p < 4200; p++) { try { await fetch(`http://127.0.0.1:${p}/`); } catch { return p; } } throw new Error('no free port 4193-4199'); })();
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`vite dev server pid ${server.pid} on port ${port} (stopped at the end)`);
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 80; i++) { try { const r = await fetch(base); if (r.ok) break; } catch { /* not yet */ } await new Promise(r => setTimeout(r, 250)); }
await mkdir('docs/evidence/motion', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function capture(profiles, { blockBurner = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 3200 }, deviceScaleFactor: 1 });
  if (blockBurner) await context.route(/\/assets\/heroes\/motion\/burner/, r => r.fulfill({ status: 500, body: 'blocked' }));
  const page = await context.newPage();
  await page.goto(`${base}art/hero-motion-compare.html?profiles=${profiles ? 'on' : 'off'}&paused=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__fhqMotionFixture && Array.from(document.querySelectorAll('.large canvas.fhq-modern-hero')).every(c => c.dataset.ready === '1' || c.closest('[data-hero="burner"]')), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const frames = {}; const shots = {};
  for (const key of HEROES) { frames[key] = []; shots[key] = { phone: [], large: [] }; }
  const dense = {}; for (const key of HEROES) dense[key] = [];
  let t = 0; const total = await page.evaluate(() => window.__fhqMotionFixture.total);
  const targets = new Set(KEYFRAMES.map(k => k.toFixed(2)));
  while (t < total - 1e-6) {
    const dt = Math.min(DENSE_STEP, total - t);
    await page.evaluate(d => window.__fhqMotionFixture.step(d), dt); t += dt;
    await page.waitForTimeout(25);
    const snap = await page.evaluate(() => window.__fhqMotionFixture.snapshot());
    for (const key of HEROES) dense[key].push(`${snap[key].frame}|${snap[key].beat}|${snap[key].kick}`);
    if (targets.has(t.toFixed(2))) {
      await page.waitForTimeout(80);
      for (const key of HEROES) {
        frames[key].push({ t: Number(t.toFixed(2)), ...snap[key] });
        for (const scale of ['phone', 'large']) shots[key][scale].push(await page.locator(`[data-hero="${key}"] .cell.${scale}`).screenshot({ type: 'png' }));
      }
    }
  }
  await context.close();
  return { frames, shots, dense };
}
const off = await capture(false);
const on = await capture(true);
const missing = await capture(true, { blockBurner: true });

const summary = {};
for (const key of HEROES) {
  const tiles = []; let top = 0;
  const rows = [['before (base profile)', off.shots[key]], ['after (hero profile)', on.shots[key]]];
  if (key === 'burner') rows.push(['after, motion sheet blocked (fallback)', missing.shots[key]]);
  let width = 0;
  for (const [, shot] of rows) {
    let left = 0;
    for (let i = 0; i < KEYFRAMES.length; i++) { const large = shot.large[i], phone = shot.phone[i]; const lm = await sharp(large).metadata(); const pm = await sharp(phone).metadata(); tiles.push({ input: large, left, top }); tiles.push({ input: phone, left: left + (lm.width ?? 256) - (pm.width ?? 48) - 4, top: top + 4 }); left += (lm.width ?? 256) + 4; }
    width = Math.max(width, left); top += 256 + 8;
  }
  const sheet = await sharp({ create: { width, height: top, channels: 3, background: { r: 31, g: 77, b: 28 } } }).composite(tiles).webp({ quality: 82 }).toBuffer();
  await writeFile(`docs/evidence/motion/${key}.webp`, sheet);
  const differing = KEYFRAMES.filter((_, i) => off.frames[key][i]?.frame !== on.frames[key][i]?.frame || off.frames[key][i]?.beat !== on.frames[key][i]?.beat || off.frames[key][i]?.kick !== on.frames[key][i]?.kick).length;
  const denseDiff = on.dense[key].filter((v, i) => v !== off.dense[key][i]).length;
  summary[key] = { keyframes: KEYFRAMES, before: off.frames[key].map(f => f.frame), after: on.frames[key].map(f => f.frame), differingKeyframes: differing, denseSamples: on.dense[key].length, denseDiffering: denseDiff, missingArtFallback: key === 'burner' ? missing.frames[key].map(f => `${f.ready}:${f.frame}`) : undefined };
  console.log(`${key.padEnd(10)} keyframes differing ${String(differing).padStart(2)}/${KEYFRAMES.length} · dense samples differing ${String(denseDiff).padStart(3)}/${on.dense[key].length}  after ${on.frames[key].map(f => f.frame).join(' ')}`);
}
// Pairwise identity among the nine "after" sequences (dense, including kick offsets).
const seqs = HEROES.map(k => on.dense[k].join(','));
const identical = []; for (let i = 0; i < HEROES.length; i++) for (let j = i + 1; j < HEROES.length; j++) if (seqs[i] === seqs[j]) identical.push(`${HEROES[i]}=${HEROES[j]}`);
summary._identicalPairs = identical;
await writeFile('docs/evidence/motion/summary.json', JSON.stringify(summary, null, 2));
console.log(identical.length ? `IDENTICAL after-sequences: ${identical.join(', ')}` : 'all nine after-sequences differ');
await browser.close(); server.kill();
console.log('RESULT: motion clips written to docs/evidence/motion/');
