// Mouse/keyboard: camera, selection, commands, building placement, hotkeys.
import { MAP_SIZE, CELL, PLAYER, ENEMY, UNITS, BUILDINGS, BUILD_MENU } from './config.js';
import { anchorFor, centerOfAnchor, buildingHalf } from './game.js';
import { BUILDING_HEIGHT, UNIT_HEIGHT } from './models.js';

const HALF = MAP_SIZE / 2;

export class Input {
  constructor(game, renderer, ui, canvas, audio) {
    this.g = game; this.r = renderer; this.ui = ui; this.canvas = canvas; this.audio = audio;
    this.selection = [];
    this.groups = {};
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, inside: true };
    this.drag = null;
    this.placement = null;
    this.attackMove = false;
    this.hover = null;
    this.hoverT = 0;
    this.midDrag = null;
    this.hooks = {};
    this.bind();
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mousedown', e => this.onMouseDown(e));
    window.addEventListener('mousemove', e => this.onMouseMove(e));
    window.addEventListener('mouseup', e => this.onMouseUp(e));
    c.addEventListener('wheel', e => { e.preventDefault(); const r = this.r.rig; r.dist = Math.max(r.minDist, Math.min(r.maxDist, r.dist * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });
    c.addEventListener('dblclick', e => this.onDblClick(e));
    window.addEventListener('keydown', e => this.onKeyDown(e));
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    document.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    document.addEventListener('mouseenter', () => { this.mouse.inside = true; });
    window.addEventListener('blur', () => this.keys.clear());
  }

  ndc(e) { return { x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1 }; }

  // ---------- picking ----------
  pick(clientX, clientY) {
    const g = this.g, r = this.r;
    const cam = r.camera;
    const tanHalf = Math.tan(cam.fov * Math.PI / 360);
    let best = null, bd = Infinity;
    const test = (e, y, radius, ref, prio) => {
      const dist = cam.position.distanceTo({ x: e.x, y, z: e.z });
      const scale = (window.innerHeight / 2) / (dist * tanHalf);
      const p = r.worldToScreen(e.x, y, e.z);
      if (p.z > 1) return;
      const d = Math.hypot(p.x - clientX, p.y - clientY) / Math.max(6, radius * scale);
      if (d < 1 && d + prio < bd) { bd = d + prio; best = ref; }
    };
    for (const u of g.units) {
      if (u.owner === ENEMY && !g.fog.isVisible(u.x, u.z)) continue;
      test(u, g.heightAt(u.x, u.z) + UNIT_HEIGHT[u.type] / 2, u.type === 'knight' ? 1.4 : 0.9, { kind: 'unit', id: u.id }, 0);
    }
    for (const b of g.buildings) {
      if (b.owner === ENEMY && !b.seen) continue;
      const y = (r.buildingViews.get(b.id)?.y ?? g.heightAt(b.x, b.z)) + BUILDING_HEIGHT[b.type] / 2;
      test(b, y, buildingHalf(b) * 1.15 + 0.4, { kind: 'building', id: b.id }, 0.5);
    }
    const gp = r.groundPoint(...Object.values(this.ndc({ clientX, clientY })));
    if (gp) {
      for (const n of g.nodes) {
        if (Math.abs(n.x - gp.x) > 14 || Math.abs(n.z - gp.z) > 14) continue;
        if (!g.fog.isExplored(n.x, n.z)) continue;
        test(n, g.heightAt(n.x, n.z) + (n.type === 'tree' ? 2.4 : 0.8), n.type === 'tree' ? 1.3 : 1.4, { kind: 'node', id: n.id }, 0.8);
      }
    }
    return { ref: best, ground: gp };
  }

  // ---------- mouse ----------
  onMouseDown(e) {
    this.audio.ensure();
    if (e.button === 1) { this.midDrag = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
    if (e.button === 0) {
      if (this.placement) { this.tryPlace(e.shiftKey); return; }
      this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, moved: false, shift: e.shiftKey };
      return;
    }
    if (e.button === 2) {
      if (this.placement) { this.cancelPlacement(); return; }
      if (this.attackMove) { this.attackMove = false; return; }
      this.rightClick(e);
    }
  }
  onMouseMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    if (this.midDrag) {
      const r = this.r.rig;
      r.yaw -= (e.clientX - this.midDrag.x) * 0.006;
      r.pitch = Math.max(0.5, Math.min(1.4, r.pitch + (e.clientY - this.midDrag.y) * 0.004));
      this.midDrag = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.drag) {
      this.drag.x1 = e.clientX; this.drag.y1 = e.clientY;
      if (Math.abs(this.drag.x1 - this.drag.x0) > 6 || Math.abs(this.drag.y1 - this.drag.y0) > 6) this.drag.moved = true;
      const box = document.getElementById('dragbox');
      if (this.drag.moved) {
        box.classList.remove('hidden');
        box.style.left = Math.min(this.drag.x0, this.drag.x1) + 'px'; box.style.top = Math.min(this.drag.y0, this.drag.y1) + 'px';
        box.style.width = Math.abs(this.drag.x1 - this.drag.x0) + 'px'; box.style.height = Math.abs(this.drag.y1 - this.drag.y0) + 'px';
      }
    }
    if (this.placement) this.updatePlacement();
    this.hoverDirty = true;
  }
  onMouseUp(e) {
    if (e.button === 1) { this.midDrag = null; return; }
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag; this.drag = null;
    document.getElementById('dragbox').classList.add('hidden');
    if (e.target !== this.canvas && !d.moved) return;
    if (d.moved) {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      const ids = [];
      for (const u of this.g.units) {
        if (u.owner !== PLAYER) continue;
        const p = this.r.worldToScreen(u.x, this.g.heightAt(u.x, u.z) + 1, u.z);
        if (p.z < 1 && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) ids.push(u.id);
      }
      // prefer military if mixed with villagers? keep all, but drop villagers if any military selected and box is big
      if (ids.length) { this.setSelection(d.shift ? [...new Set([...this.selection, ...ids])] : ids); this.audio.play('select'); }
      else if (!d.shift) this.setSelection([]);
      return;
    }
    if (this.attackMove) {
      const { ref, ground } = this.pick(e.clientX, e.clientY);
      this.attackMove = false;
      const own = this.ownUnits();
      if (!own.length) return;
      if (ref && ref.kind !== 'node') { this.g.cmdInteract(own, ref); }
      else if (ground) this.g.cmdMove(own, ground.x, ground.z, true);
      this.audio.play('command');
      return;
    }
    const { ref } = this.pick(e.clientX, e.clientY);
    if (!ref) { if (!d.shift) this.setSelection([]); return; }
    if (d.shift && this.selection.includes(ref.id)) this.setSelection(this.selection.filter(i => i !== ref.id));
    else if (d.shift && ref.kind === 'unit' && this.ownUnits().length) this.setSelection([...this.selection, ref.id]);
    else this.setSelection([ref.id]);
    this.audio.play('select');
  }
  onDblClick(e) {
    const { ref } = this.pick(e.clientX, e.clientY);
    if (!ref || ref.kind !== 'unit') return;
    const u = this.g.unit(ref.id);
    if (!u || u.owner !== PLAYER) return;
    const ids = this.g.units.filter(o => o.owner === PLAYER && o.type === u.type && Math.hypot(o.x - u.x, o.z - u.z) < 28).map(o => o.id);
    this.setSelection(ids);
  }

  rightClick(e) {
    const own = this.ownUnits();
    const { ref, ground } = this.pick(e.clientX, e.clientY);
    if (own.length) {
      if (ref && !(ref.kind === 'unit' && own.includes(ref.id))) this.g.cmdInteract(own, ref);
      else if (ground) this.g.cmdMove(own, ground.x, ground.z, false);
      this.audio.play('command');
      return;
    }
    // own building selected: set rally
    const b = this.selection.length === 1 ? this.g.building(this.selection[0]) : null;
    if (b && b.owner === PLAYER && BUILDINGS[b.type].trains && ground) {
      this.g.cmdSetRally(b.id, ground.x, ground.z);
      this.ui.message('Huddle point set', 'info', undefined, undefined, 2);
    }
  }
  commandAt(x, z) {
    const own = this.ownUnits();
    if (own.length) { this.g.cmdMove(own, x, z, this.attackMove); this.attackMove = false; this.audio.play('command'); }
  }

  ownUnits() { return this.selection.filter(id => { const u = this.g.unit(id); return u && u.owner === PLAYER; }); }
  ownVillagers() { return this.ownUnits().filter(id => this.g.unit(id).type === 'villager'); }

  setSelection(ids) {
    this.selection = ids.filter(id => this.g.unit(id) || this.g.building(id) || this.g.node(id));
    this.ui.setSelection(this.selection);
    if (this.placement && !this.ownVillagers().length) this.cancelPlacement();
  }
  setAttackMove(v) { this.attackMove = v; this.canvas.style.cursor = v ? 'crosshair' : ''; }

  selectIdleVillager() {
    const idle = this.g.units.filter(u => u.owner === PLAYER && u.type === 'villager' && u.order.kind === 'idle');
    if (!idle.length) { this.ui.message('No idle staffers', 'info', undefined, undefined, 2); return; }
    this.idleIdx = ((this.idleIdx ?? -1) + 1) % idle.length;
    const u = idle[this.idleIdx];
    this.setSelection([u.id]);
    this.r.rig.x = u.x; this.r.rig.z = u.z;
  }
  selectArmy() {
    const ids = this.g.units.filter(u => u.owner === PLAYER && u.type !== 'villager').map(u => u.id);
    if (!ids.length) { this.ui.message('No squad yet – build a Weight Room and recruit Linemen', 'info', undefined, undefined, 3); return; }
    this.setSelection(ids);
    const u = this.g.unit(ids[0]); this.r.rig.x = u.x; this.r.rig.z = u.z;
  }
  goHome() {
    const tc = this.g.buildings.find(b => b.owner === PLAYER && b.type === 'towncenter');
    if (tc) { this.r.rig.x = tc.x; this.r.rig.z = tc.z; this.setSelection([tc.id]); }
  }

  // ---------- placement ----------
  startPlacement(type) {
    if (!this.ownVillagers().length) return;
    const def = BUILDINGS[type];
    if (!this.g.canAfford(PLAYER, def.cost)) { this.ui.message('Not enough ' + this.g.missing(PLAYER, def.cost).join(', '), 'alert', undefined, undefined, 3); this.audio.play('error'); return; }
    this.placement = { type };
    this.r.setGhost(type, PLAYER);
    this.updatePlacement();
  }
  updatePlacement() {
    if (!this.placement) return;
    const n = this.ndc({ clientX: this.mouse.x, clientY: this.mouse.y });
    const gp = this.r.groundPoint(n.x, n.y);
    if (!gp) return;
    const def = BUILDINGS[this.placement.type];
    const a = anchorFor(gp.x, gp.z, def.size);
    const c = centerOfAnchor(a.cx, a.cz, def.size);
    const ok = this.g.canPlace(this.placement.type, c.x, c.z, PLAYER);
    this.placement.x = c.x; this.placement.z = c.z; this.placement.ok = ok.ok; this.placement.reason = ok.reason;
    this.r.updateGhost(c.x, c.z, ok.ok);
  }
  tryPlace(keep) {
    const p = this.placement;
    if (!p || p.x === undefined) return;
    if (!p.ok) { this.ui.message(p.reason || 'Cannot build here', 'alert', undefined, undefined, 2.5); this.audio.play('error'); return; }
    const r = this.g.cmdBuild(this.ownVillagers(), p.type, p.x, p.z);
    if (!r.ok) { this.ui.message(r.reason, 'alert', undefined, undefined, 3); this.audio.play('error'); return; }
    if (!keep || !this.g.canAfford(PLAYER, BUILDINGS[p.type].cost)) this.cancelPlacement();
    else this.updatePlacement();
    this.ui.renderSelection();
  }
  cancelPlacement() { this.placement = null; this.r.clearGhost(); }

  // ---------- keyboard ----------
  onKeyDown(e) {
    if (e.target.tagName === 'INPUT') return;
    const k = e.code;
    this.keys.add(k);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F5', 'F9'].includes(k)) e.preventDefault();
    if (k === 'F5') { this.hooks.save?.(); return; }
    if (k === 'F9') { this.hooks.load?.(); return; }
    if (k === 'Escape') { if (this.placement) this.cancelPlacement(); else if (this.attackMove) this.setAttackMove(false); else this.hooks.menu?.(); return; }
    if (k === 'KeyP') { this.hooks.pause?.(); return; }
    if (k === 'Equal' || k === 'NumpadAdd') { this.hooks.speed?.(1); return; }
    if (k === 'Minus' || k === 'NumpadSubtract') { this.hooks.speed?.(-1); return; }
    if (k === 'Home') { this.goHome(); return; }
    if (k === 'Space') { if (this.ui.lastAlert) { this.r.rig.x = this.ui.lastAlert.x; this.r.rig.z = this.ui.lastAlert.z; } return; }
    if (k === 'Period') { this.selectIdleVillager(); return; }
    if (e.ctrlKey && k === 'KeyA') { e.preventDefault(); this.selectArmy(); return; }
    // control groups
    const num = k.startsWith('Digit') ? parseInt(k.slice(5)) : null;
    if (num !== null && num >= 1 && num <= 5) {
      if (e.ctrlKey) { this.groups[num] = [...this.selection]; e.preventDefault(); }
      else if (this.groups[num]) this.setSelection(this.groups[num]);
      return;
    }
    if (k === 'Delete') {
      const b = this.selection.length === 1 ? this.g.building(this.selection[0]) : null;
      if (b && b.owner === PLAYER) { this.g.cmdDeleteBuilding(b.id, PLAYER); this.setSelection([]); }
      return;
    }
    const own = this.ownUnits();
    const key = e.key.toUpperCase();
    if (own.length) {
      if (k === 'KeyS') { this.g.cmdStop(own); return; }
      if (k === 'KeyA') { if (own.some(id => this.g.unit(id).type !== 'villager')) this.setAttackMove(true); return; }
      if (this.ownVillagers().length === own.length) {
        const t = BUILD_MENU.find(t => BUILDINGS[t].hotkey === key);
        if (t) { this.startPlacement(t); return; }
      }
    } else if (this.selection.length === 1) {
      const b = this.g.building(this.selection[0]);
      if (b && b.owner === PLAYER && b.complete && BUILDINGS[b.type].trains) {
        const t = BUILDINGS[b.type].trains.find(t => UNITS[t].hotkey === key);
        if (t) { this.ui.train(b.id, t); return; }
      }
    }
  }

  // ---------- per frame ----------
  update(dt) {
    const r = this.r.rig;
    const speed = 0.9 * r.dist * dt;
    let mx = 0, mz = 0;
    if (this.keys.has('ArrowUp')) mz -= 1;
    if (this.keys.has('ArrowDown')) mz += 1;
    if (this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('ArrowRight')) mx += 1;
    // edge scroll
    if (this.mouse.inside && !this.drag && !this.midDrag && document.hasFocus()) {
      const m = 14, w = window.innerWidth, h = window.innerHeight;
      if (this.mouse.x < m) mx -= 1; else if (this.mouse.x > w - m) mx += 1;
      if (this.mouse.y < m) mz -= 1; else if (this.mouse.y > h - m) mz += 1;
    }
    if (mx || mz) {
      const s = Math.sin(r.yaw), c = Math.cos(r.yaw);
      // camera looks along +yaw direction; forward = (sin yaw, cos yaw)
      r.x += (mx * c + -mz * s) * speed;
      r.z += (-mx * s + -mz * c) * speed;
    }
    if (this.keys.has('KeyQ')) r.yaw += dt * 1.6;
    if (this.keys.has('KeyE')) r.yaw -= dt * 1.6;

    this.hoverT += dt;
    if (this.hoverDirty && this.hoverT > 0.08) {
      this.hoverT = 0; this.hoverDirty = false;
      if (!this.drag && !this.placement) {
        const overHud = document.elementFromPoint(this.mouse.x, this.mouse.y) !== this.canvas;
        this.hover = overHud ? null : this.pick(this.mouse.x, this.mouse.y).ref;
      } else this.hover = null;
    }
    if (!this.attackMove) {
      let cur = '';
      if (this.hover) {
        const e = this.g.getEntity(this.hover);
        const own = this.ownUnits().length;
        if (own && e && (this.hover.kind === 'node' || e.owner === ENEMY)) cur = 'pointer';
        else cur = 'pointer';
      }
      this.canvas.style.cursor = cur;
    }
  }
}
