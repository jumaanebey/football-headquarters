// Marketing shot pipeline: drives the LIVE game headlessly with a staged demo save and
// captures a matrix of store/landing/social stills — desktop beauty board, phone app-
// store frames, and key screens (Heroes, Ranks, Defense) — in one run.
//
// The hard parts (headless boot + localStorage save injection + tutorial suppression)
// are the same trick readme-shot.mjs proved; this generalizes them into a scene matrix
// so every release re-shoots the whole set deterministically instead of by hand.
//
//   1. start the app:   npm run dev      (or: npm run preview, or point at prod)
//   2. shoot:           npm run shots    (or: node scripts/marketing-shots.mjs <url>)
//
// NEVER use waitUntil:'networkidle' against the Vite dev server — HMR keeps the socket
// open forever. 'load' + a settle wait is the pattern.
import { chromium, webkit, devices } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = process.argv[2] || process.env.FHQ_URL || 'http://localhost:3000';
const OUT_DIR = process.env.FHQ_SHOTS_DIR || 'marketing';
// Chromium is the portable default (and what's pre-installed in CI/sandboxes); set
// FHQ_ENGINE=webkit for true Safari-engine phone frames when WebKit is installed.
const engine = process.env.FHQ_ENGINE === 'webkit' ? webkit : chromium;

// A rich, staged board — full facilities, healthy economy, trophies for rank flavor.
// FIXED-BASE era: geometry derives from the formation; the save only stages LEVELS.
const demoSave = {
  resources: { COINS: 148200, GEMS: 140, ENERGY: 100, FANS: 2600 },
  teamName: 'Beck Dynasty',
  trophies: 342,
  formation: 'goalline',
  formationMastery: { goalline: 4 },
  parkingLot: 2,
  defenseSlots: { D1: 6, D2: 6, D3: 5, D4: 5, D5: 4, D6: 4 },
  buildings: [
    { id: 'pitch-1', type: 'TRAINING_PITCH', level: 8, gridX: 2, gridY: 2, activeDrillId: null, targetUnit: null, startTime: null, finishTime: null, state: 'IDLE' },
    { id: 'academy-1', type: 'YOUTH_ACADEMY', level: 9, gridX: 7, gridY: 2, activeDrillId: null, targetUnit: null, startTime: null, finishTime: null, state: 'IDLE' },
    { id: 'med-1', type: 'MEDICAL_CENTER', level: 7, gridX: 3, gridY: 5, activeDrillId: null, targetUnit: null, startTime: null, finishTime: null, state: 'IDLE' },
    { id: 'stadium-1', type: 'STADIUM', level: 11, gridX: 6, gridY: 6, activeDrillId: null, targetUnit: null, startTime: null, finishTime: null, state: 'IDLE', accrued: 120 },
    { id: 'tactics-1', type: 'TACTICS_ROOM', level: 6, gridX: 3, gridY: 8, activeDrillId: null, targetUnit: null, startTime: null, finishTime: null, state: 'IDLE' },
  ],
};

// Suppress every first-run overlay so the board is camera-ready.
const primeLocalStorage = save => {
  localStorage.setItem('fhq_save_v1', JSON.stringify(save));
  localStorage.setItem('fhq_tutorial_done_v1', '1');
  localStorage.setItem('fhq_chalk_intro_v1', '1');
  localStorage.setItem('fhq_exported_v1', '1');
  localStorage.setItem('fhq_muted_v1', '1');
};

// Tap a bottom-nav item by its label; resolve false (don't throw) if it isn't found so
// one flaky scene never kills the batch. The labels render uppercase via CSS but the DOM
// text is mixed-case ("Heroes"), so match the button's accessible name case-insensitively.
const tapNav = async (page, label) => {
  try {
    await page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first().click({ timeout: 4000 });
    await page.waitForTimeout(1400);
    return true;
  } catch { console.warn(`  ! could not open "${label}" — shooting current view`); return false; }
};

// { id, viewport|device, out, settleMs, prep? }
const DESKTOP = { width: 1440, height: 860, deviceScaleFactor: 2 };
const scenes = [
  { id: 'beauty-desktop', viewport: DESKTOP, settleMs: 6000 },                       // README / OG / landing hero
  { id: 'beauty-phone',   device: 'iPhone 13', settleMs: 6000 },                     // app-store phone frame
  { id: 'screen-heroes',  device: 'iPhone 13', settleMs: 3500, prep: p => tapNav(p, 'Heroes') },
  { id: 'screen-ranks',   device: 'iPhone 13', settleMs: 3500, prep: p => tapNav(p, 'Ranks') },
  { id: 'screen-defense', device: 'iPhone 13', settleMs: 3500, prep: p => tapNav(p, 'Defense') },
];

// Normally Playwright finds its own downloaded browser. Some environments (CI images,
// sandboxes) ship a system browser at a fixed path instead — honor an explicit override
// so the pipeline runs anywhere without `npx playwright install`.
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

console.log(`engine=${engine === webkit ? 'webkit' : 'chromium'}  url=${URL}  out=${OUT_DIR}/${executablePath ? `  browser=${executablePath}` : ''}`);
const browser = await engine.launch(executablePath ? { executablePath } : {});

for (const s of scenes) {
  const ctxOpts = s.device ? { ...devices[s.device] } : { viewport: s.viewport, deviceScaleFactor: s.viewport.deviceScaleFactor ?? 2 };
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.addInitScript(primeLocalStorage, demoSave);
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(s.settleMs ?? 4000);
    if (s.prep) await s.prep(page);
    const out = `${OUT_DIR}/${s.id}.png`;
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    console.log(`  ✓ ${out}`);
  } catch (e) {
    console.error(`  ✗ ${s.id}: ${e.message}`);
  } finally {
    await ctx.close();
  }
}

await browser.close();
console.log('done.');
