// HUD: resources, selection panel, actions, minimap, alerts, tutorial, health bars, menus.
import { MAP_SIZE, FOG_GRID, FOG_CELL, PLAYER, ENEMY, UNITS, BUILDINGS, BUILD_MENU, RES_ICONS, RES_NAMES, DIFFICULTY, NODE_TYPES } from './config.js';
import { buildingHalf } from './game.js';
import { BUILDING_HEIGHT, UNIT_HEIGHT } from './models.js';

const HALF = MAP_SIZE / 2;
const $ = id => document.getElementById(id);
const ICONS = {
  villager: '🧢', militia: '🛡️', archer: '🏈', knight: '💪',
  towncenter: '🏟️', house: '🚪', farm: '📣', mill: '⛺', lumbercamp: '📦', miningcamp: '🪙', barracks: '🏋️', archeryrange: '🎯', stable: '⚡', tower: '🤖',
  tree: '📦', gold: '⛺', stone: '🟩', berry: '🌭',
};
export const ICON = ICONS;

function costStr(cost) { return Object.entries(cost).map(([k, v]) => `${RES_ICONS[k]}${v}`).join(' '); }
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`; }

const TUTORIAL = [
  { id: 'gather', text: 'Collect: select staffers and right-click a gear pallet or tailgate', hint: 'Your staffers are selected. <b>Right-click a gear pallet 📦 or tailgate 🌭</b> to start collecting.' },
  { id: 'house', text: 'Build a Locker Room (select a staffer → 🚪 Locker Room)', hint: 'Select a staffer, click <b>🚪 Locker Room</b> in the panel below, then click the ground to place it.' },
  { id: 'barracks', text: 'Build a Weight Room and recruit Linemen', hint: 'Build a <b>🏋️ Weight Room</b> (175 gear), select it and recruit <b>Linemen</b>. The rival squad is coming soon.' },
  { id: 'scout', text: 'Scout the rival program (north-east)', hint: 'Send a player north-east to <b>find the rival Stadium</b>. Keep your squad home until you are ready.' },
  { id: 'win', text: 'Sack the rival Stadium', hint: 'Blitz-move (<b>A</b> + click) your squad onto the rival <b>Stadium</b> and silence their crowd.' },
];

export class UI {
  constructor(game, renderer, audio) {
    this.g = game; this.r = renderer; this.audio = audio;
    this.input = null;
    this.selection = [];
    this.panelT = 0; this.miniT = 0;
    this.pings = [];
    this.tutorialDone = new Set();
    this.hintDismissed = false;
    this.speed = 1; this.paused = false;
    this.minimap = $('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.hbPool = [];
    this.lastAlert = null;
    this.bindStatic();
  }
  bind(input) { this.input = input; }

  bindStatic() {
    $('hintClose').onclick = () => { this.hintDismissed = true; $('hint').classList.add('hidden'); };
    $('btnIdle').onclick = () => this.input.selectIdleVillager();
    $('btnArmy').onclick = () => this.input.selectArmy();
    $('btnHome').onclick = () => this.input.goHome();
    this.minimap.addEventListener('mousedown', e => {
      e.preventDefault();
      const rect = this.minimap.getBoundingClientRect();
      const s = MAP_SIZE / rect.width;
      const x = (e.clientX - rect.left) * s - HALF, z = (e.clientY - rect.top) * s - HALF;
      if (e.button === 2) this.input.commandAt(x, z);
      else { this.r.rig.x = x; this.r.rig.z = z; }
    });
    this.minimap.addEventListener('contextmenu', e => e.preventDefault());
    this.minimap.addEventListener('mousemove', e => {
      if (e.buttons === 1) {
        const rect = this.minimap.getBoundingClientRect();
        const s = MAP_SIZE / rect.width;
        this.r.rig.x = (e.clientX - rect.left) * s - HALF; this.r.rig.z = (e.clientY - rect.top) * s - HALF;
      }
    });
    const tip = $('tooltip');
    document.addEventListener('mouseover', e => {
      const el = e.target.closest?.('[data-tip]');
      if (el) { tip.innerHTML = el.dataset.tip; tip.classList.remove('hidden'); this.placeTip(e); } else tip.classList.add('hidden');
    });
    document.addEventListener('mousemove', e => { if (!tip.classList.contains('hidden')) this.placeTip(e); });
  }
  placeTip(e) {
    const tip = $('tooltip');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY - h - 12;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 8;
    if (y < 50) y = e.clientY + 18;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  // ---------- messages ----------
  message(text, kind = 'info', x, z, ttl = 6) {
    const box = $('alerts');
    const el = document.createElement('div');
    el.className = 'msg ' + kind; el.textContent = text;
    if (x !== undefined) el.onclick = () => { this.r.rig.x = x; this.r.rig.z = z; };
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('fade'), ttl * 1000);
    setTimeout(() => el.remove(), ttl * 1000 + 700);
    if (x !== undefined) this.pings.push({ x, z, t: 0, kind });
  }

  onEvent(ev) {
    const g = this.g;
    switch (ev.type) {
      case 'alert': this.message(ev.text, 'alert', ev.x, ev.z, 8); this.lastAlert = { x: ev.x, z: ev.z }; this.audio.play('alert'); break;
      case 'complete': if (ev.building.owner === PLAYER) { this.message(`${BUILDINGS[ev.building.type].name} complete`, 'good', ev.building.x, ev.building.z, 4); this.audio.play('complete'); } break;
      case 'trained': if (ev.unit.owner === PLAYER) this.audio.play('trained'); break;
      case 'destroyed': if (ev.building.owner === ENEMY) { this.message(`Rival ${BUILDINGS[ev.building.type].name} SACKED!`, 'good', ev.building.x, ev.building.z, 5); } this.audio.play('destroyed'); break;
      case 'spotted': this.message(`Rival ${BUILDINGS[ev.building.type].name} scouted!`, 'info', ev.building.x, ev.building.z, 5); break;
      case 'hit': if (g.fog.isVisible(ev.x, ev.z)) { this.audio.play('hit'); if (ev.kind === 'building' && ev.amount >= 1) this.floatYards(ev); } break;
      case 'aiAttack': break; // no free warning; the alert comes when they hit you
      case 'gameover': this.showGameOver(ev.result); break;
      case 'placed': if (ev.building.owner === PLAYER) this.audio.play('place'); break;
      case 'newgame': case 'loaded': this.pings = []; this.tutorialDone.clear(); this.hintDismissed = false; this.selection = []; this.renderSelection(); break;
    }
    if (ev.type === 'death' || ev.type === 'destroyed' || ev.type === 'buildingRemoved') {
      const id = ev.unit?.id ?? ev.building?.id ?? ev.id;
      if (this.selection.includes(id)) { this.selection = this.selection.filter(s => s !== id); this.renderSelection(); }
    }
  }

  // ---------- selection panel ----------
  setSelection(ids) { this.selection = ids; this.renderSelection(); }

  renderSelection() {
    this.renderInfo();
    this.renderActions();
  }

  renderInfo() {
    const g = this.g, info = $('selInfo');
    const ents = this.selection.map(id => g.unit(id) || g.building(id)).filter(Boolean);
    if (!ents.length) {
      const n = this.selection.length === 1 ? g.node(this.selection[0]) : null;
      if (n) {
        const def = NODE_TYPES[n.type];
        info.innerHTML = `<div class="name">${ICONS[n.type]} ${def.name}</div><div class="sub">${RES_NAMES[def.res]} left: ${Math.ceil(n.amount)}</div><div class="task">Select staffers and right-click to collect.</div>`;
      } else info.innerHTML = '<div class="empty">Nothing selected. Left-click a player or drag a box. Right-click to send them.</div>';
      return;
    }
    if (ents.length === 1) {
      const e = ents[0];
      const isU = e.type in UNITS, def = isU ? UNITS[e.type] : BUILDINGS[e.type];
      const hpMax = def.hp, low = e.hp < hpMax * 0.35;
      let task = '';
      if (isU) {
        const o = e.order;
        task = { idle: 'Idle', move: 'Moving', hide: 'Waiting out the pressure', attackmove: 'Blitzing', attack: 'Working a target', gather: 'Collecting ' + (RES_NAMES[o.resType] || ''), farm: 'Running the fan zone', dropoff: 'Dropping off ' + (RES_NAMES[e.carry?.res] || ''), build: 'Building', repair: 'Repairing', follow: 'Following' }[o.kind] || o.kind;
        if (e.carry?.amt) task += ` · carrying ${Math.floor(e.carry.amt)} ${RES_ICONS[e.carry.res]}`;
      } else {
        task = e.complete ? (BUILDINGS[e.type].farm ? (e.farmerId && g.unit(e.farmerId) ? 'Run by a staffer' : 'Nobody running it – right-click it with a staffer') : '') : `Under construction ${Math.floor(e.progress * 100)}%` + (e.builders ? '' : ' – no builders! Right-click it with a staffer');
        if (e.complete && def.trains && e.owner === PLAYER) task += (task ? ' · ' : '') + 'Right-click the ground to set a huddle point';
      }
      info.innerHTML = `<div class="name">${ICONS[e.type]} ${def.name}</div><div class="sub">${e.owner === PLAYER ? 'Home' : 'Rival'}${isU ? ` · 🏈${def.attack} yds · 🛡${def.armor} · 🏃${def.speed}` : ''}</div>
        <div class="hp"><i class="${low ? 'low' : ''}" style="width:${Math.max(0, e.hp / hpMax * 100)}%"></i></div><div class="sub">Down Meter ${Math.ceil(e.hp)} / ${hpMax}</div><div class="task">${task}</div>`;
    } else {
      const counts = {};
      for (const e of ents) counts[e.type] = (counts[e.type] || 0) + 1;
      const key = JSON.stringify(counts);
      if (info.dataset.key === key) return;
      info.dataset.key = key;
      info.innerHTML = `<div class="name">${ents.length} selected</div><div class="multi">${Object.entries(counts).map(([t, c]) => `<button data-sub="${t}" title="Select only ${t}">${ICONS[t]} ${c}</button>`).join('')}</div>`;
      info.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => this.input.setSelection(ents.filter(e => e.type === b.dataset.sub).map(e => e.id)));
    }
  }

  // Buttons are only rebuilt when their set changes; affordability and queue progress update in place.
  renderActions() {
    const g = this.g, acts = $('actions');
    const ents = this.selection.map(id => g.unit(id) || g.building(id)).filter(Boolean);
    const own = ents.length && ents.every(e => e.owner === PLAYER);
    const units = ents.filter(e => e.type in UNITS), buildings = ents.filter(e => e.type in BUILDINGS);
    const single = buildings.length === 1 && !units.length ? buildings[0] : null;
    const key = own ? [units.map(u => u.type).sort().join(','), single ? `${single.id}:${single.complete}:${single.queue.join(',')}` : ''].join('|') : '';
    if (key !== this.actionsKey) {
      this.actionsKey = key;
      acts.innerHTML = '';
      this.actionButtons = [];
      this.queueEl = null;
      if (!own) return;
      const mk = (html, tip, onclick, cost, popCheck) => {
        const b = document.createElement('button'); b.className = 'act'; b.innerHTML = html;
        if (tip) b.dataset.tip = tip;
        b.onclick = onclick; acts.appendChild(b);
        if (cost) this.actionButtons.push({ el: b, cost, popCheck });
        return b;
      };
      if (units.length && units.every(u => u.type === 'villager')) {
        for (const t of BUILD_MENU) {
          const def = BUILDINGS[t];
          mk(`<span class="key">${def.hotkey}</span><span class="ico">${ICONS[t]}</span>${def.name}<span class="cost">${costStr(def.cost)}</span>`,
            `<b>${def.name}</b> · ${costStr(def.cost)}<div class="d">${def.desc}</div>${def.pop ? `<div class="d">+${def.pop} roster spots</div>` : ''}`,
            () => this.input.startPlacement(t), def.cost, false);
        }
      }
      if (units.length) {
        mk('<span class="key">S</span><span class="ico">✋</span>Stop', '<b>Stop</b> current order', () => { g.cmdStop(units.map(u => u.id)); this.renderInfo(); });
        if (units.some(u => u.type !== 'villager')) mk('<span class="key">A</span><span class="ico">🔥</span>Blitz-move', '<b>Blitz-move</b><div class="d">Run to a spot and take on any rival found on the way. Press A, then click the ground.</div>', () => this.input.setAttackMove(true));
      }
      if (single) {
        const b = single, def = BUILDINGS[b.type];
        if (b.complete && def.trains) {
          for (const t of def.trains) {
            const u = UNITS[t];
            mk(`<span class="key">${u.hotkey}</span><span class="ico">${ICONS[t]}</span>${u.name}<span class="cost">${costStr(u.cost)}</span>`,
              `<b>${u.name}</b> · ${costStr(u.cost)} · ${u.trainTime}s<div class="d">${u.desc}</div><div class="d">Down Meter ${u.hp} · Yards ${u.attack} · Toughness ${u.armor} · Range ${u.range}</div>`,
              () => this.train(b.id, t), u.cost, true);
          }
          const q = document.createElement('div'); q.className = 'queue';
          q.innerHTML = b.queue.length ? 'Recruiting: ' + b.queue.map((t, i) => `<div class="q" data-i="${i}" title="Click to cancel last">${i === 0 ? '<i class="prog" style="width:0%"></i>' : ''}<span>${ICONS[t]}</span></div>`).join('') + '<span class="popwarn" style="color:#ff8a7a"></span>' : 'Queue empty';
          q.querySelectorAll('.q').forEach(el => el.onclick = () => { g.cmdCancelTrain(b.id); this.renderActions(); });
          q.innerHTML = q.innerHTML.replace('Queue empty', 'Nobody in the pipeline');
          acts.appendChild(q);
          this.queueEl = { el: q, building: b };
        }
        if (b.type !== 'towncenter') mk('<span class="key">Del</span><span class="ico">🚧</span>Tear down', '<b>Tear down</b> this facility', () => { g.cmdDeleteBuilding(b.id, PLAYER); this.input.setSelection([]); });
        if (!b.complete) { const n = document.createElement('div'); n.className = 'note'; n.textContent = 'Right-click this site with staffers to (help) build it.'; acts.appendChild(n); }
      }
    }
    // in-place updates
    const pl = g.players[PLAYER];
    for (const ab of this.actionButtons || []) {
      const can = g.canAfford(PLAYER, ab.cost) && (!ab.popCheck || pl.pop < pl.popCap);
      ab.el.classList.toggle('cant', !can);
    }
    if (this.queueEl) {
      const b = this.queueEl.building;
      const prog = this.queueEl.el.querySelector('.prog');
      if (prog && b.queue.length) prog.style.width = Math.floor(b.trainT / UNITS[b.queue[0]].trainTime * 100) + '%';
      const warn = this.queueEl.el.querySelector('.popwarn');
      if (warn) warn.textContent = pl.pop >= pl.popCap && b.queue.length ? ' Roster full – build Locker Rooms' : '';
    }
  }

  train(bid, t) {
    const r = this.g.cmdTrain(bid, t);
    if (!r.ok) { this.message(r.reason, 'alert', undefined, undefined, 3); this.audio.play('error'); } else this.audio.play('click');
    this.renderActions();
  }

  floatYards(ev) {
    if (this.yardsLive > 24) return;
    this.yardsLive = (this.yardsLive || 0) + 1;
    const y = (this.r.buildingViews.get(ev.target.id)?.y ?? this.g.heightAt(ev.x, ev.z)) + BUILDING_HEIGHT[ev.target.type] + 0.8;
    const p = this.r.worldToScreen(ev.x + (Math.random() - 0.5) * 2, y, ev.z);
    if (p.z > 1) { this.yardsLive--; return; }
    const el = document.createElement('div');
    el.className = 'yds' + (ev.target.owner === PLAYER ? ' vs' : '');
    el.textContent = '+' + Math.round(ev.amount) + ' YDS';
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    $('healthbars').appendChild(el);
    setTimeout(() => { el.remove(); this.yardsLive--; }, 900);
  }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.g;
    this.panelT += dt; this.miniT += dt;
    if (this.panelT > 0.2) {
      this.panelT = 0;
      this.updateTop();
      this.updateTutorial();
      // refresh selection panel if it shows dynamic info
      if (this.selection.length) { this.renderInfo(); this.renderActions(); }
      $('idleCount').textContent = g.units.filter(u => u.owner === PLAYER && u.type === 'villager' && u.order.kind === 'idle').length || '';
      $('armyCount').textContent = g.units.filter(u => u.owner === PLAYER && u.type !== 'villager').length || '';
    }
    if (this.miniT > 0.12) { this.miniT = 0; this.drawMinimap(); }
    for (const p of this.pings) p.t += dt;
    this.pings = this.pings.filter(p => p.t < 6);
    this.updateHealthBars();
  }

  updateTop() {
    const g = this.g, pl = g.players[PLAYER];
    const workers = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const u of g.units) if (u.owner === PLAYER && u.type === 'villager' && (u.order.kind === 'gather' || u.order.kind === 'farm' || u.order.kind === 'dropoff') && u.order.resType) workers[u.order.resType]++;
    document.querySelectorAll('#topbar .res[data-res]').forEach(el => {
      const r = el.dataset.res;
      el.querySelector('.amt').textContent = Math.floor(pl.res[r]);
      el.querySelector('.workers').textContent = workers[r] ? `(${workers[r]})` : '';
      el.dataset.tip = `<b>${RES_NAMES[r]}</b>: ${Math.floor(pl.res[r])}<div class="d">${workers[r]} staffer${workers[r] === 1 ? '' : 's'} collecting</div>`;
    });
    const pop = $('pop');
    pop.querySelector('.amt').textContent = `${pl.pop}/${pl.popCap}`;
    pop.classList.toggle('flash', pl.pop >= pl.popCap);
    $('clock').textContent = fmtTime(g.time);
    $('difficultyTag').textContent = DIFFICULTY[g.difficulty].name;
    $('btnSpeed').textContent = this.speed + '×';
    $('btnPause').textContent = this.paused ? '▶' : '⏸';
    $('pausedBanner').classList.toggle('hidden', !this.paused);
  }

  updateTutorial() {
    const g = this.g;
    const done = this.tutorialDone;
    if (g.units.some(u => u.owner === PLAYER && ['gather', 'farm', 'dropoff'].includes(u.order.kind))) done.add('gather');
    if (g.buildings.some(b => b.owner === PLAYER && b.type === 'house')) done.add('house');
    if (g.units.some(u => u.owner === PLAYER && u.type !== 'villager')) done.add('barracks');
    if (g.buildings.some(b => b.owner === ENEMY && b.seen)) done.add('scout');
    if (g.gameOver === 'win') done.add('win');
    const ul = $('tutorial');
    let current = null;
    ul.innerHTML = TUTORIAL.map(t => {
      const d = done.has(t.id);
      const cls = d ? 'done' : (!current ? (current = t, 'current') : '');
      return `<li class="${cls}">${t.text}</li>`;
    }).join('');
    const hint = $('hint');
    if (current && !this.hintDismissed && g.time < 600 && !g.gameOver) {
      hint.classList.remove('hidden');
      const txt = $('hintText');
      if (txt.dataset.id !== current.id) { txt.dataset.id = current.id; txt.innerHTML = current.hint; }
    } else hint.classList.add('hidden');
  }

  drawMinimap() {
    const g = this.g, c = this.mctx, W = this.minimap.width, s = W / MAP_SIZE;
    if (!this.r.minimapBase) return;
    c.clearRect(0, 0, W, W);
    c.drawImage(this.r.minimapBase, 0, 0, W, W);
    // nodes
    for (const n of g.nodes) {
      if (!g.fog.isExplored(n.x, n.z)) continue;
      c.fillStyle = n.type === 'tree' ? '#c8a165' : n.type === 'gold' ? '#60a5fa' : n.type === 'stone' ? '#4ade80' : '#facc15';
      c.fillRect((n.x + HALF) * s - 1, (n.z + HALF) * s - 1, 2, 2);
    }
    // buildings
    for (const b of g.buildings) {
      if (b.owner === ENEMY && !b.seen) continue;
      const h = buildingHalf(b) * s;
      c.fillStyle = b.owner === PLAYER ? '#f97316' : '#dc2626';
      c.fillRect((b.x + HALF) * s - h, (b.z + HALF) * s - h, h * 2, h * 2);
      if (b.type === 'towncenter') { c.strokeStyle = '#fff'; c.lineWidth = 1; c.strokeRect((b.x + HALF) * s - h - 1, (b.z + HALF) * s - h - 1, h * 2 + 2, h * 2 + 2); }
    }
    // units
    for (const u of g.units) {
      if (u.owner === ENEMY && !g.fog.isVisible(u.x, u.z)) continue;
      c.fillStyle = u.owner === PLAYER ? (u.type === 'villager' ? '#fdba74' : '#f97316') : '#ef4444';
      c.fillRect((u.x + HALF) * s - 1.2, (u.z + HALF) * s - 1.2, 2.4, 2.4);
    }
    // fog
    const cs = FOG_CELL * s;
    for (let z = 0; z < FOG_GRID; z++) for (let x = 0; x < FOG_GRID; x++) {
      const i = z * FOG_GRID + x;
      if (g.fog.revealAll) continue;
      if (!g.fog.explored[i]) { c.fillStyle = 'rgba(0,0,0,0.88)'; c.fillRect(x * cs, z * cs, cs + 0.5, cs + 0.5); }
      else if (!g.fog.visible[i]) { c.fillStyle = 'rgba(0,0,0,0.38)'; c.fillRect(x * cs, z * cs, cs + 0.5, cs + 0.5); }
    }
    // pings
    for (const p of this.pings) {
      const r = 4 + (p.t % 1) * 8;
      c.strokeStyle = p.kind === 'alert' ? `rgba(255,70,50,${1 - (p.t % 1)})` : `rgba(255,255,255,${1 - (p.t % 1)})`;
      c.lineWidth = 2; c.beginPath(); c.arc((p.x + HALF) * s, (p.z + HALF) * s, r, 0, Math.PI * 2); c.stroke();
    }
    // camera frustum
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([nx, ny]) => this.r.groundPoint(nx, ny));
    if (pts.every(Boolean)) {
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1; c.beginPath();
      pts.forEach((p, i) => { const px = Math.max(0, Math.min(W, (p.x + HALF) * s)), pz = Math.max(0, Math.min(W, (p.z + HALF) * s)); i ? c.lineTo(px, pz) : c.moveTo(px, pz); });
      c.closePath(); c.stroke();
    }
  }

  updateHealthBars() {
    const g = this.g, box = $('healthbars');
    let i = 0;
    const hover = this.input?.hover;
    const use = (e, isB, cls) => {
      if (i >= 140) return;
      const def = isB ? BUILDINGS[e.type] : UNITS[e.type];
      const h = isB ? BUILDING_HEIGHT[e.type] : UNIT_HEIGHT[e.type];
      const y = (isB ? (this.r.buildingViews.get(e.id)?.y ?? g.heightAt(e.x, e.z)) : g.heightAt(e.x, e.z)) + h + 0.4;
      const p = this.r.worldToScreen(e.x, y, e.z);
      if (p.z > 1 || p.x < -50 || p.x > window.innerWidth + 50 || p.y < 0 || p.y > window.innerHeight) return;
      let el = this.hbPool[i];
      if (!el) { el = document.createElement('div'); el.innerHTML = '<i></i><span class="lbl"></span>'; box.appendChild(el); this.hbPool.push(el); }
      el.className = 'hb ' + cls + (isB ? ' big' : '');
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      el.style.display = 'block';
      const frac = Math.max(0, Math.min(1, e.hp / def.hp));
      el.firstChild.style.width = frac * 100 + '%';
      el.firstChild.style.background = frac > 0.5 ? (cls === 'enemy' ? '#e0433a' : '#4ad35a') : frac > 0.25 ? '#e6b53a' : '#e0433a';
      el.lastChild.textContent = isB && !e.complete ? Math.floor(e.progress * 100) + '%' : '';
      i++;
    };
    const sel = new Set(this.selection);
    for (const u of g.units) {
      const vis = u.owner === PLAYER || g.fog.isVisible(u.x, u.z);
      if (!vis) continue;
      if (sel.has(u.id) || u.hp < UNITS[u.type].hp || (hover && hover.id === u.id) || (g.time - (u.lastHit || -99) < 3)) use(u, false, u.owner === PLAYER ? 'own' : 'enemy');
    }
    for (const b of g.buildings) {
      if (b.owner === ENEMY && !b.seen) continue;
      if (sel.has(b.id) || !b.complete || b.hp < BUILDINGS[b.type].hp || (hover && hover.id === b.id)) use(b, true, b.owner === PLAYER ? 'own' : 'enemy');
    }
    for (; i < this.hbPool.length; i++) this.hbPool[i].style.display = 'none';
  }

  // ---------- menus ----------
  showMenu(inGame, hasSave) {
    $('menu').classList.remove('hidden');
    $('btnResume').classList.toggle('hidden', !inGame);
    $('btnContinue').classList.toggle('hidden', !hasSave);
  }
  hideMenu() { $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); }
  showGameOver(result) {
    const g = this.g, me = g.players[PLAYER];
    $('goTitle').textContent = result === 'win' ? '🏈 You silenced the crowd!' : '📣 Your house got stormed.';
    $('goTitle').style.color = result === 'win' ? '#f97316' : '#ff6b5c';
    $('goText').textContent = result === 'win' ? 'You rolled into their house, sacked the Stadium, and their crowd went dead silent. Road win.' : 'The rival squad sacked your Stadium. Season over. Run it back and hold your house this time.';
    $('goStats').innerHTML = `<div><b>${fmtTime(g.time)}</b>Game clock</div><div><b>${me.kills}</b>Rivals subbed out</div><div><b>${me.losses}</b>Your subs</div><div><b>${me.razed}</b>Facilities sacked</div>`;
    $('gameover').classList.remove('hidden');
    this.audio.play(result === 'win' ? 'victory' : 'defeat');
  }
  hideGameOver() { $('gameover').classList.add('hidden'); }
}
