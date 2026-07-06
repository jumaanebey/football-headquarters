// Phone-eye verification: renders the game in WebKit (Safari's engine) at iPhone
// size and saves a screenshot. Run this BEFORE shipping any mobile-affecting change.
//
//   node scripts/phone-shot.mjs <url> <out.png> [savefile.json]
//
// e.g.  node scripts/phone-shot.mjs http://localhost:3000 /tmp/local.png
//       node scripts/phone-shot.mjs https://football-headquarters.vercel.app /tmp/prod.png
//
// NEVER use waitUntil:'networkidle' against the Vite dev server — HMR keeps the
// socket open and it hangs forever. 'load' + a settle wait is the pattern.
import { webkit, chromium, devices } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const [url, out, saveFile] = process.argv.slice(2);
if (!url || !out) { console.error('usage: phone-shot.mjs <url> <out.png> [savefile.json]'); process.exit(1); }

// Prefer WebKit (Safari's engine — what iPhones actually run); fall back to
// Chromium if WebKit isn't installed yet. FHQ_ENGINE=chromium forces it.
const wkInstalled = existsSync(`${homedir()}/Library/Caches/ms-playwright`) &&
  (await import('node:fs')).readdirSync(`${homedir()}/Library/Caches/ms-playwright`).some(d => d.startsWith('webkit'));
const engine = process.env.FHQ_ENGINE === 'chromium' || !wkInstalled ? chromium : webkit;
console.log('engine:', engine === webkit ? 'webkit' : 'chromium');
const browser = await engine.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] }); // 390×844, dsf 3, touch, Safari UA
const page = await ctx.newPage();

if (saveFile) {
  const save = readFileSync(saveFile, 'utf8');
  await page.addInitScript(s => localStorage.setItem('footballHQ_save', s), save);
}

await page.goto(url, { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(3500); // board paint + autosave settle
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
