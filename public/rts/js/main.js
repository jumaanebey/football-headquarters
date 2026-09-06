import { TICK, PLAYER, BASE_POS } from './config.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { saveGame, loadGameData, hasSave, SAVE_KEY, AUTOSAVE_KEY } from './save.js';

const $ = id => document.getElementById(id);

async function boot() {
  await new Promise(r => setTimeout(r, 30));
  const canvas = $('c');
  const game = new Game();
  const audio = new Audio();
  const renderer = new Renderer(canvas, game);
  const ui = new UI(game, renderer, audio);
  const input = new Input(game, renderer, ui, canvas, audio);
  ui.bind(input);

  let started = false, acc = 0, autosaveT = 0;
  game.on(ev => {
    if (ev.type === 'newgame' && game.loading) return;
    renderer.onGameEvent(ev);
    ui.onEvent(ev);
  });

  const focusBase = () => {
    const tc = game.buildings.find(b => b.owner === PLAYER && b.type === 'towncenter');
    const p = tc || BASE_POS[PLAYER];
    renderer.rig.x = p.x + 6; renderer.rig.z = p.z - 4; renderer.rig.yaw = 0; renderer.rig.pitch = 0.82; renderer.rig.dist = 66;
  };

  const startNew = () => {
    const diff = document.querySelector('input[name=diff]:checked').value;
    $('loading').classList.remove('hidden');
    setTimeout(() => {
      game.newGame((Math.random() * 0xffffffff) >>> 0, diff);
      focusBase();
      input.setSelection(game.units.filter(u => u.owner === PLAYER && u.type === 'villager').map(u => u.id));
      ui.hideMenu(); ui.hideGameOver();
      $('loading').classList.add('hidden');
      ui.paused = false; ui.speed = 1; started = true;
      ui.message('The rival program is building in the north-east. Collect, build, recruit — their squad is coming.', 'info', undefined, undefined, 9);
    }, 20);
  };

  const doSave = () => {
    if (!started || game.gameOver) return;
    if (saveGame(game, SAVE_KEY)) ui.message('Season saved', 'good', undefined, undefined, 2.5);
    else ui.message('Save failed', 'alert', undefined, undefined, 3);
  };
  const doLoad = (key = SAVE_KEY) => {
    const data = loadGameData(key) || loadGameData(AUTOSAVE_KEY);
    if (!data) { ui.message('No saved season', 'alert', undefined, undefined, 3); return; }
    $('loading').classList.remove('hidden');
    setTimeout(() => {
      game.loading = true;
      try { game.load(data); } finally { game.loading = false; }
      focusBase();
      input.setSelection([]);
      ui.hideMenu(); ui.hideGameOver();
      $('loading').classList.add('hidden');
      ui.paused = false; started = true;
      ui.message('Season loaded', 'good', undefined, undefined, 2.5);
    }, 20);
  };
  const togglePause = () => { if (!started) return; ui.paused = !ui.paused; ui.updateTop(); };
  const changeSpeed = (d) => { const s = [1, 2, 3]; let i = s.indexOf(ui.speed) + d; i = Math.max(0, Math.min(s.length - 1, i)); ui.speed = s[i]; ui.updateTop(); };
  const openMenu = () => { if (!started) return; ui.paused = true; ui.updateTop(); ui.showMenu(true, hasSave(SAVE_KEY) || hasSave(AUTOSAVE_KEY)); };

  input.hooks = { save: doSave, load: () => doLoad(), pause: togglePause, speed: changeSpeed, menu: openMenu };
  $('btnNew').onclick = startNew;
  $('btnAgain').onclick = () => { ui.hideGameOver(); ui.showMenu(false, false); };
  $('btnContinue').onclick = () => doLoad();
  $('btnResume').onclick = () => { ui.hideMenu(); ui.paused = false; ui.updateTop(); };
  $('btnSave').onclick = doSave;
  $('btnLoad').onclick = () => doLoad();
  $('btnPause').onclick = togglePause;
  $('btnSpeed').onclick = () => { ui.speed = ui.speed >= 3 ? 1 : ui.speed + 1; ui.updateTop(); };
  $('btnMenu').onclick = openMenu;
  $('btnSound').onclick = () => { audio.enabled = !audio.enabled; $('btnSound').textContent = audio.enabled ? '🔊' : '🔇'; if (audio.enabled) audio.ensure(); };

  // debug/test hooks
  window.__game = game; window.__renderer = renderer; window.__ui = ui; window.__input = input;
  window.__startNew = startNew; window.__load = doLoad; window.__save = doSave;

  $('loading').classList.add('hidden');
  ui.showMenu(false, hasSave(SAVE_KEY) || hasSave(AUTOSAVE_KEY));
  const params = new URLSearchParams(location.search);
  if (params.get('autostart')) {
    const d = params.get('diff'); if (d) document.querySelector(`input[name=diff][value=${d}]`).checked = true;
    startNew();
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!started) { renderer.render(dt); return; }
    if (!ui.paused && !game.gameOver) {
      acc += dt * ui.speed;
      let steps = 0;
      while (acc >= TICK && steps < 12) { game.tick(TICK); acc -= TICK; steps++; }
      if (steps >= 12) acc = 0;
      autosaveT += dt;
      if (autosaveT > 90) { autosaveT = 0; saveGame(game, AUTOSAVE_KEY); }
    }
    input.update(dt);
    renderer.updateCamera();
    renderer.syncEntities(dt);
    renderer.updateRings(input.selection, input.hover);
    ui.update(dt);
    renderer.render(dt);
  }
  requestAnimationFrame(frame);
}

boot().catch(err => {
  console.error(err);
  $('loading').innerHTML = '<div style="color:#ff6b5c;max-width:600px;text-align:center">Failed to start: ' + (err.message || err) + '<br><small>A WebGL2-capable browser is required.</small></div>';
});
