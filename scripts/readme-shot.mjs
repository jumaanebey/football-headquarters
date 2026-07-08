// README beauty shot: loads the game in headless Chromium with a staged demo save
// (rich board: full wall ring, all 4 equipment kinds, bus, fans for patrol density)
// and screenshots the viewport. Run: node scripts/readme-shot.mjs
import { webkit } from 'playwright';

// FIXED-BASE era: geometry comes from the formation (loadState snaps buildings to
// anchors and derives the wall ring) — the save only stages LEVELS + slot levels.
const demoSave = {
  resources: { COINS: 148200, GEMS: 140, ENERGY: 100, FANS: 2600 },
  teamName: 'Beck Dynasty',
  trophies: 342,
  level: 9,
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

console.log('launching chromium…');
const browser = await webkit.launch();
console.log('launched');
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
await page.addInitScript(save => {
  localStorage.setItem('fhq_save_v1', JSON.stringify(save));
  localStorage.setItem('fhq_tutorial_done_v1', '1');
  localStorage.setItem('fhq_chalk_intro_v1', '1');
  localStorage.setItem('fhq_exported_v1', '1');
  localStorage.setItem('fhq_muted_v1', '1');
}, demoSave);
// NOTE: never 'networkidle' against a Vite dev server — the HMR websocket keeps the
// network busy forever and the wait hangs.
await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(6000); // patrols fan out, collectors tick, sprites load
await page.screenshot({ path: 'docs/screenshot.png' });
await browser.close();
console.log('saved docs/screenshot.png');
