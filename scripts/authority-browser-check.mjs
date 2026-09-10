// Browser journey for a protected club on a local preview: fresh guest → tutorial → enable
// online protection → play Season game 1 through the authority → confirmed reward → upgrade.
// Usage: node scripts/authority-browser-check.mjs [baseUrl] [shotDir]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const dir = process.argv[3] ?? '/tmp/claude-501/shots';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const logs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
let step = 0;
const shot = async (name) => { step++; await page.screenshot({ path: `${dir}/${String(step).padStart(2, '0')}-${name}.png` }); console.log(`shot ${step} ${name}`); };
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const waitText = async (needle, ms = 30000) => { await page.waitForFunction(n => document.body.innerText.includes(n), needle, { timeout: ms }); };
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await shot('boot');
  // Tutorial: name the club, build first (no game yet, so the club stays pristine for admission).
  await page.fill('input[placeholder="Your club name"]', 'Protected Preview FC');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(500);
  await shot('tutorial-step2');
  const buttons = page.locator('button');
  const count = await buttons.count();
  let clicked = false;
  // The secondary tutorial button skips the first game so the club stays pristine for admission.
  for (let i = 0; i < count; i++) { const t = (await buttons.nth(i).innerText()).trim(); if (t && !/play|storm|game|change club name|random name/i.test(t) && await buttons.nth(i).isVisible()) { await buttons.nth(i).click(); clicked = true; console.log('tutorial secondary:', t); break; } }
  if (!clicked) throw new Error('tutorial secondary button not found');
  await page.waitForTimeout(800);
  await shot('campus');
  // Settings → protect.
  await page.click('button:has(svg.lucide-settings)');
  await waitText('Online protection');
  await page.waitForFunction(() => !document.body.innerText.includes('checking…'), null, { timeout: 20000 });
  await shot('settings-before');
  await page.click('button:has-text("Protect this club online")');
  await page.waitForFunction(() => /\bprotected\b/i.test(document.querySelector('span.uppercase.font-black')?.textContent ?? '') || document.body.innerText.includes('Your club is now protected') || document.body.innerText.includes('fresh protected club'), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await shot('settings-protected');
  console.log('settings:', (await text()).match(/Online protection.{0,260}/)?.[0]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // Game Day → Season game 1 (reserved on the server).
  await page.click('[aria-label="Club navigation"] button:has-text("Game Day"), [aria-label="Club navigation"] button:has-text("Play")').catch(async () => { await page.click('[aria-label="Club navigation"] button >> nth=2'); });
  await page.waitForTimeout(800);
  await shot('game-day');
  await page.click('button:has-text("Next")').catch(async () => { await page.click('text=Preseason Opener'); });
  await page.waitForSelector('[aria-label="Battlefield"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot('battle-deploy');
  const field = page.locator('[aria-label="Battlefield"]');
  const box = await field.boundingBox();
  // Tap along the left edge to deploy squad, then the hero button(s), then let the clock run.
  for (let i = 0; i < 8; i++) { await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * (0.15 + i * 0.09)); await page.waitForTimeout(120); }
  await shot('battle-kickoff');
  // Heroes/squad are already on the field from the sideline taps; let the drive run, then blow the whistle if it is still going.
  await page.waitForTimeout(8000);
  await shot('battle-playing');
  const whistle = page.locator('button[title="Blow the whistle — see the result"]');
  if (await whistle.count()) await whistle.first().click({ timeout: 5000, force: true }).catch(() => {});
  await page.waitForFunction(() => /Your team|standouts|Return|Continue|Back to|Collect/i.test(document.body.innerText), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('battle-result');
  // Leave the result screen: any visible button whose label reads like a return/continue.
  const dialogButtons = page.locator('[role="dialog"] button');
  const n = await dialogButtons.count();
  for (let i = n - 1; i >= 0; i--) { const b = dialogButtons.nth(i); const t = ((await b.innerText().catch(() => '')) || (await b.getAttribute('aria-label')) || '').trim(); if (/return|back to|continue|done|collect|campus|home|next/i.test(t) && await b.isVisible()) { console.log('leaving result via:', t); await b.click({ force: true }); break; } }
  await page.waitForFunction(() => !document.querySelector('[aria-label="Battlefield"]'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await shot('after-result');
  const body = await text();
  console.log('confirmation notice present:', /Confirmed|Confirming|Result not confirmed|will not count/.test(body));
  await page.click('button:has(svg.lucide-settings)');
  await waitText('Online protection');
  await page.waitForTimeout(500);
  await shot('settings-after-match');
  console.log('settings after match:', (await text()).match(/Online protection.{0,320}/)?.[0]);
  await page.keyboard.press('Escape');
  // Upgrade the Stadium through the authority (tap the stadium → Upgrade).
  const stadium = page.locator('text=Stadium').first();
  if (await stadium.count()) { await stadium.click({ force: true }); await page.waitForTimeout(600); await shot('stadium-selected'); const up = page.locator('button:has-text("Upgrade")'); if (await up.count()) { await up.first().click(); await page.waitForTimeout(1500); await shot('stadium-upgrade'); } }
  console.log('console problems:', logs.slice(0, 10));
} catch (error) {
  await shot('failure');
  console.error('journey failed:', error.message);
  console.log('body:', (await text()).slice(0, 600));
  console.log('console problems:', logs.slice(0, 10));
  process.exitCode = 1;
} finally { await browser.close(); }
