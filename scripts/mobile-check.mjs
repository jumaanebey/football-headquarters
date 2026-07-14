#!/usr/bin/env node
// Phone-truth harness. `node scripts/mobile-check.mjs [url]`
//
// Chrome's minimum window width makes real phone testing impossible by hand, so this
// drives an actual emulated iPhone through a brand-new player's first session and
// reports what a real phone user would hit: console errors, horizontal overflow,
// touch targets under 44px (Apple's minimum), text under 12px, and whether the
// player can actually reach a game. Screenshots land in .mobile-shots/.

import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL_ = process.argv[2] || 'https://football-headquarters.vercel.app/?src=mobile-check';
const OUT = '.mobile-shots';
mkdirSync(OUT, { recursive: true });

const phone = devices['iPhone 14'];

const audit = async (page, label) => {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    // Horizontal overflow: the page body must never scroll sideways.
    const overflow = [...document.querySelectorAll('*')]
      .filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > vw + 1 || b.left < -1); })
      .slice(0, 8)
      .map(e => ({ tag: e.tagName.toLowerCase(), cls: (e.className || '').toString().slice(0, 40), right: Math.round(e.getBoundingClientRect().right) }));
    // Touch targets: anything tappable smaller than 44x44 is a miss-tap on a phone.
    const small = [...document.querySelectorAll('button, [role="button"], a')]
      .map(e => ({ e, b: e.getBoundingClientRect() }))
      .filter(({ b }) => b.width > 0 && b.height > 0 && (b.width < 44 || b.height < 44))
      .slice(0, 10)
      .map(({ e, b }) => ({ txt: (e.innerText || e.getAttribute('aria-label') || '?').replace(/\s+/g, ' ').trim().slice(0, 24), w: Math.round(b.width), h: Math.round(b.height) }));
    // Unreachable explanations: title= tooltips do not exist on touch.
    const titleOnly = document.querySelectorAll('[title]').length;
    const tiny = [...document.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && e.textContent.trim())
      .filter(e => parseFloat(getComputedStyle(e).fontSize) < 12)
      .length;
    return {
      vw,
      docScrollW: document.documentElement.scrollWidth,
      bodyScrollsSideways: document.documentElement.scrollWidth > vw + 1,
      overflow, small, titleOnly, tinyText: tiny,
      // Decide this against the FULL text, in-page. (Deciding it from a truncated
      // copy out here reported "first session is broken" when it wasn't.)
      inBattle: /GAME PLAN|HOUSE TAKEN|\d:\d\d/i.test(document.body.innerText),
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 90),
    };
  });
  await page.screenshot({ path: `${OUT}/${label}.png` });
  return r;
};

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...phone });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 160)));

  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: 'load', timeout: 45000 });
  const loadMs = Date.now() - t0;

  // A brand-new player: no save, no session. Clear, then reload so nothing persists back.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const steps = {};
  steps['1-name-screen'] = await audit(page, '1-name-screen');

  // Tap through the two onboarding modals the way a thumb would.
  const clubBtn = page.getByRole('button', { name: /that's my club/i });
  if (await clubBtn.count()) { await clubBtn.first().click(); await page.waitForTimeout(1200); }
  steps['2-tutorial'] = await audit(page, '2-tutorial');

  const stormBtn = page.getByRole('button', { name: /storm your first rival|play your first game/i });
  if (await stormBtn.count()) { await stormBtn.first().click(); await page.waitForTimeout(3000); }
  steps['3-after-storm'] = await audit(page, '3-after-storm');

  const inBattle = steps['3-after-storm'].inBattle;

  await browser.close();

  const line = (s) => '─'.repeat(s);
  console.log(`\nPHONE TRUTH — iPhone 14 (${phone.viewport.width}x${phone.viewport.height})  ${URL_}`);
  console.log(line(78));
  console.log(`load: ${loadMs}ms`);
  console.log(`reached a game from a cold start: ${inBattle ? 'YES' : 'NO  <-- FIRST SESSION IS BROKEN'}`);
  console.log(`console errors: ${errors.length}`);
  errors.slice(0, 6).forEach(e => console.log(`   ! ${e}`));

  for (const [name, s] of Object.entries(steps)) {
    console.log(`\n${name}`);
    console.log(`  sideways scroll: ${s.bodyScrollsSideways ? `YES (${s.docScrollW}px > ${s.vw}px)  <-- BREAKS LAYOUT` : 'no'}`);
    if (s.overflow.length) s.overflow.forEach(o => console.log(`     overflows: <${o.tag}> .${o.cls} right=${o.right}`));
    console.log(`  touch targets under 44px: ${s.small.length}`);
    s.small.slice(0, 5).forEach(t => console.log(`     "${t.txt}" ${t.w}x${t.h}`));
    console.log(`  text under 12px: ${s.tinyText} elements`);
    console.log(`  title= tooltips (unreachable on touch): ${s.titleOnly}`);
  }
  console.log(`\nscreenshots: ${OUT}/\n`);
};

main().catch(e => { console.error('mobile-check failed:', e.message); process.exit(1); });
