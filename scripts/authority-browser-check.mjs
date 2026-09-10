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
  for (let i = 0; i < count; i++) { const t = (await buttons.nth(i).innerText()).trim(); if (/build|tour|later|first|not now|later/i.test(t) && !/storm/i.test(t)) { await buttons.nth(i).click(); clicked = true; console.log('tutorial secondary:', t); break; } }
  if (!clicked) throw new Error('tutorial secondary button not found');
  await page.waitForTimeout(800);
  await shot('campus');
  // Settings → protect.
  await page.click('button:has(svg.lucide-settings)');
  await waitText('Online protection');
  await page.waitForFunction(() => !document.body.innerText.includes('checking…'), null, { timeout: 20000 });
  await shot('settings-before');
  await page.click('button:has-text("Protect this club online")');
  await waitText('protected', 30000);
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
  const heroButtons = page.locator('button[title*="Franchise"], button:has-text("Franchise")');
  if (await heroButtons.count()) { await heroButtons.first().click(); await page.waitForTimeout(200); await page.mouse.click(box.x + box.width * 0.08, box.y + box.height * 0.5); }
  await page.waitForTimeout(6000);
  await shot('battle-playing');
  await page.click('button[title="Blow the whistle — see the result"]');
  await page.waitForTimeout(1500);
  await shot('battle-result');
  // Leave the result screen (any return/continue button).
  for (const label of ['Return', 'Back to campus', 'Continue', 'Done', 'Collect', 'Home']) { const b = page.locator(`button:has-text("${label}")`); if (await b.count()) { await b.first().click(); break; } }
  await page.waitForFunction(() => !document.querySelector('[aria-label="Battlefield"]'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
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
