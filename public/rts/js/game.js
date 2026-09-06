// Core simulation: entities, orders, movement, combat, economy, win/lose, save data.
import {
  MAP_SIZE, CELL, GRID, PLAYER, ENEMY, MAX_POP, UNITS, BUILDINGS, NODE_TYPES, FARM_RATE,
  BASE_POS, START_RES, DIFFICULTY, RES_TYPES, RES_NAMES,
} from './config.js';
import { World } from './world.js';
import { NavGrid } from './pathfinding.js';
import { FogOfWar } from './fog.js';
import { mulberry32 } from './noise.js';
import { AI } from './ai.js';

const HALF = MAP_SIZE / 2;
const UNIT_RADIUS = 0.55;

export function anchorFor(x, z, size) {
  return { cx: Math.round((x + HALF) / CELL - size / 2), cz: Math.round((z + HALF) / CELL - size / 2) };
}
export function centerOfAnchor(cx, cz, size) {
  return { x: (cx + size / 2) * CELL - HALF, z: (cz + size / 2) * CELL - HALF };
}
export function buildingHalf(b) { return BUILDINGS[b.type].size * CELL / 2; }
export function distToBuilding(x, z, b) {
  const h = buildingHalf(b);
  const dx = Math.max(Math.abs(x - b.x) - h, 0), dz = Math.max(Math.abs(z - b.z) - h, 0);
  return Math.hypot(dx, dz);
}

export class Game {
  constructor() {
    this.listeners = [];
    this.state = null;
  }
  on(fn) { this.listeners.push(fn); }
  emit(ev) { for (const fn of this.listeners) fn(ev); }

  // ---------- setup ----------
  newGame(seed, difficulty = 'normal') {
    this.seed = seed >>> 0;
    this.difficulty = difficulty;
    this.rnd = mulberry32(this.seed ^ 0x51ed);
    this.world = new World(this.seed);
    this.nav = new NavGrid(this.world.terrainBlocked);
    this.placeGrid = new Uint8Array(GRID * GRID);
    this.fog = new FogOfWar();
    this.time = 0;
    this.nextId = 1000;
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.nodes = this.world.nodes;
    this.nodeById = new Map(this.nodes.map(n => [n.id, n]));
    for (const n of this.nodes) this.nav.setDynamic(n.cx, n.cz, 1);
    this.players = [0, 1].map(() => ({ res: { ...START_RES }, popCap: 0, pop: 0, kills: 0, losses: 0, razed: 0 }));
    this.gameOver = null;
    this.lastAlert = -100;
    this.stats = { attacksSurvived: 0 };
    this.ai = new AI(this, ENEMY, DIFFICULTY[difficulty]);
    this.ais = [this.ai];

    for (const owner of [PLAYER, ENEMY]) {
      const b = BASE_POS[owner];
      const tc = this.placeBuilding(owner, 'towncenter', b.x, b.z, true);
      tc.progress = 1; tc.complete = true;
      const dir = Math.atan2(-b.z, -b.x); // towards map centre
      for (let i = 0; i < 4; i++) {
        const a = dir + (i - 1.5) * 0.45;
        this.spawnUnit(owner, 'villager', b.x + Math.cos(a) * 6.5, b.z + Math.sin(a) * 6.5);
      }
    }
    this.recomputePop();
    // the player knows the land around home
    this.fog.update([{ x: BASE_POS[PLAYER].x, z: BASE_POS[PLAYER].z, r: 40 }]);
    this.updateFog();
    this.emit({ type: 'newgame' });
  }

  // ---------- helpers ----------
  id() { return this.nextId++; }
  cellOf(x, z) { return { cx: Math.floor((x + HALF) / CELL), cz: Math.floor((z + HALF) / CELL) }; }
  cellCenter(cx, cz) { return { x: cx * CELL - HALF + CELL / 2, z: cz * CELL - HALF + CELL / 2 }; }
  heightAt(x, z) { return this.world.heightAt(x, z); }
  unit(id) { return this.units.find(u => u.id === id); }
  building(id) { return this.buildings.find(b => b.id === id); }
  node(id) { return this.nodeById.get(id); }
  getEntity(ref) {
    if (!ref) return null;
    if (ref.kind === 'unit') return this.unit(ref.id);
    if (ref.kind === 'building') return this.building(ref.id);
    if (ref.kind === 'node') return this.node(ref.id);
    return null;
  }
  canAfford(owner, cost) {
    const r = this.players[owner].res;
    return Object.entries(cost).every(([k, v]) => r[k] >= v);
  }
  pay(owner, cost) { const r = this.players[owner].res; for (const [k, v] of Object.entries(cost)) r[k] -= v; }
  refund(owner, cost, frac = 1) { const r = this.players[owner].res; for (const [k, v] of Object.entries(cost)) r[k] += v * frac; }
  missing(owner, cost) {
    const r = this.players[owner].res;
    return Object.entries(cost).filter(([k, v]) => r[k] < v).map(([k]) => RES_NAMES[k]);
  }
  recomputePop() {
    for (const p of [PLAYER, ENEMY]) {
      const pl = this.players[p];
      let cap = 0;
      for (const b of this.buildings) if (b.owner === p && b.complete && BUILDINGS[b.type].pop) cap += BUILDINGS[b.type].pop;
      pl.popCap = Math.min(MAX_POP, cap);
      let pop = 0;
      for (const u of this.units) if (u.owner === p) pop++;
      for (const b of this.buildings) if (b.owner === p) pop += b.queue.length;
      pl.pop = pop;
    }
  }

  // ---------- entity creation ----------
  spawnUnit(owner, type, x, z) {
    const def = UNITS[type];
    const u = {
      id: this.id(), owner, type, x, z, rot: 0, hp: def.hp,
      order: { kind: 'idle' }, path: null, wp: 0, carry: null, gather: 0, cooldown: 0,
      anim: 'idle', animT: this.rnd() * 6, stuck: 0, lastX: x, lastZ: z, scanT: this.rnd() * 0.5, replanT: 0,
      moving: false,
    };
    this.units.push(u);
    return u;
  }

  footprint(cx, cz, size, fn) {
    for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) fn(cx + dx, cz + dz);
  }

  canPlace(type, x, z, owner) {
    const def = BUILDINGS[type];
    const { cx, cz } = anchorFor(x, z, def.size);
    let ok = true;
    this.footprint(cx, cz, def.size, (ax, az) => {
      if (ax < 1 || az < 1 || ax >= GRID - 1 || az >= GRID - 1) ok = false;
      else if (this.nav.blocked(ax, az) || this.placeGrid[az * GRID + ax]) ok = false;
    });
    if (!ok) return { ok: false, reason: 'Blocked terrain or objects' };
    // Farms must be near a food drop-off, keeps things sensible.
    if (owner !== undefined && def.farm) {
      const c = centerOfAnchor(cx, cz, def.size);
      const near = this.buildings.some(b => b.owner === owner && b.complete && BUILDINGS[b.type].dropoff?.includes('food') && distToBuilding(c.x, c.z, b) < 16);
      if (!near) return { ok: false, reason: 'Fan Zones must be within reach of a Stadium or Fan Club Tent' };
    }
    // Enemy buildings too close? (no building inside enemy TC vision)
    return { ok: true, cx, cz };
  }

  placeBuilding(owner, type, x, z, force = false) {
    const def = BUILDINGS[type];
    const { cx, cz } = anchorFor(x, z, def.size);
    const c = centerOfAnchor(cx, cz, def.size);
    const b = {
      id: this.id(), owner, type, x: c.x, z: c.z, cx, cz, hp: force ? def.hp : Math.max(1, def.hp * 0.1),
      progress: 0, complete: false, queue: [], trainT: 0, rally: null, cooldown: 0, farmerId: null,
      seen: owner === PLAYER, builders: 0, rot: 0, smokeT: 0, placedAt: this.time,
    };
    this.footprint(cx, cz, def.size, (ax, az) => {
      if (!def.walkable) this.nav.setDynamic(ax, az, 2);
      this.placeGrid[az * GRID + ax] = 1;
    });
    this.buildings.push(b);
    return b;
  }

  removeBuilding(b) {
    const def = BUILDINGS[b.type];
    this.footprint(b.cx, b.cz, def.size, (ax, az) => {
      if (!def.walkable) this.nav.setDynamic(ax, az, 0);
      this.placeGrid[az * GRID + ax] = 0;
    });
    // refund queued units
    for (const t of b.queue) this.refund(b.owner, UNITS[t].cost);
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    for (const u of this.units) {
      if (u.order.target && u.order.target.kind === 'building' && u.order.target.id === b.id) this.setIdle(u);
      if (u.order.dropoff === b.id) u.order.dropoff = null;
    }
    this.emit({ type: 'buildingRemoved', id: b.id });
  }

  removeNode(n) {
    this.nav.setDynamic(n.cx, n.cz, 0);
    this.nodeById.delete(n.id);
    const i = this.nodes.indexOf(n);
    if (i >= 0) this.nodes.splice(i, 1);
    this.emit({ type: 'nodeRemoved', id: n.id });
  }

  // ---------- commands ----------
  setIdle(u) { u.order = { kind: 'idle' }; u.path = null; u.moving = false; }

  cmdMove(ids, x, z, attackMove = false) {
    const units = ids.map(id => this.unit(id)).filter(Boolean);
    if (!units.length) return;
    // spread formation
    const n = units.length, cols = Math.ceil(Math.sqrt(n));
    units.forEach((u, i) => {
      const ox = ((i % cols) - (cols - 1) / 2) * 1.6, oz = (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * 1.6;
      u.order = { kind: attackMove ? 'attackmove' : 'move', x: x + ox, z: z + oz };
      this.planPath(u, x + ox, z + oz);
    });
  }
  cmdStop(ids) { for (const id of ids) { const u = this.unit(id); if (u) this.setIdle(u); } }

  cmdInteract(ids, ref) {
    const target = this.getEntity(ref);
    if (!target) return;
    for (const id of ids) {
      const u = this.unit(id); if (!u) continue;
      if (ref.kind === 'node') {
        if (u.type === 'villager') { u.order = { kind: 'gather', target: ref, dropoff: null }; u.path = null; }
        else { u.order = { kind: 'move', x: target.x, z: target.z }; this.planPath(u, target.x, target.z); }
      } else if (target.owner !== u.owner) {
        u.order = { kind: 'attack', target: ref }; u.path = null;
      } else if (ref.kind === 'building') {
        if (u.type === 'villager' && !target.complete) { u.order = { kind: 'build', target: ref }; u.path = null; }
        else if (u.type === 'villager' && BUILDINGS[target.type].farm) { u.order = { kind: 'farm', target: ref, dropoff: null }; u.path = null; }
        else if (u.type === 'villager' && target.hp < BUILDINGS[target.type].hp) { u.order = { kind: 'repair', target: ref }; u.path = null; }
        else { u.order = { kind: 'move', x: target.x, z: target.z }; this.planPath(u, target.x, target.z); }
      } else if (ref.kind === 'unit') {
        u.order = { kind: 'follow', target: ref }; u.path = null;
      }
    }
  }

  cmdBuild(ids, type, x, z) {
    const villagers = ids.map(id => this.unit(id)).filter(u => u && u.type === 'villager');
    if (!villagers.length) return { ok: false, reason: 'Need a staffer' };
    const owner = villagers[0].owner;
    const def = BUILDINGS[type];
    const p = this.canPlace(type, x, z, owner);
    if (!p.ok) return p;
    if (!this.canAfford(owner, def.cost)) return { ok: false, reason: 'Not enough ' + this.missing(owner, def.cost).join(', ') };
    this.pay(owner, def.cost);
    const b = this.placeBuilding(owner, type, x, z);
    for (const u of villagers) { u.order = { kind: 'build', target: { kind: 'building', id: b.id } }; u.path = null; }
    this.emit({ type: 'placed', building: b });
    return { ok: true, building: b };
  }

  cmdTrain(buildingId, unitType) {
    const b = this.building(buildingId); if (!b || !b.complete) return { ok: false, reason: 'Facility not ready' };
    const bdef = BUILDINGS[b.type];
    if (!bdef.trains || !bdef.trains.includes(unitType)) return { ok: false, reason: 'Cannot recruit that here' };
    const udef = UNITS[unitType];
    const pl = this.players[b.owner];
    if (b.queue.length >= 8) return { ok: false, reason: 'Pipeline full' };
    if (pl.pop >= pl.popCap) return { ok: false, reason: 'Roster full – build Locker Rooms' };
    if (!this.canAfford(b.owner, udef.cost)) return { ok: false, reason: 'Not enough ' + this.missing(b.owner, udef.cost).join(', ') };
    this.pay(b.owner, udef.cost);
    b.queue.push(unitType);
    this.recomputePop();
    return { ok: true };
  }
  cmdCancelTrain(buildingId) {
    const b = this.building(buildingId); if (!b || !b.queue.length) return;
    const t = b.queue.pop();
    if (!b.queue.length) b.trainT = 0;
    this.refund(b.owner, UNITS[t].cost);
    this.recomputePop();
  }
  cmdSetRally(buildingId, x, z) { const b = this.building(buildingId); if (b) b.rally = { x, z }; }
  cmdDeleteBuilding(buildingId, owner) {
    const b = this.building(buildingId);
    if (!b || b.owner !== owner || b.type === 'towncenter') return;
    if (!b.complete) this.refund(owner, BUILDINGS[b.type].cost, 0.75);
    this.removeBuilding(b);
    this.recomputePop();
  }

  // ---------- pathing ----------
  planPath(u, x, z) {
    const s = this.cellOf(u.x, u.z), g = this.cellOf(x, z);
    const path = this.nav.findPath(s.cx, s.cz, g.cx, g.cz);
    if (!path) { u.path = null; u.moving = false; return false; }
    const pts = path.map(c => this.cellCenter(c.cx, c.cz));
    // final exact point if free
    const gc = this.cellOf(x, z);
    if (!this.nav.blocked(gc.cx, gc.cz)) { if (pts.length) pts[pts.length - 1] = { x, z }; else pts.push({ x, z }); }
    u.path = pts; u.wp = 0; u.moving = true; u.stuck = 0;
    return true;
  }

  // Approach point for interacting with a building/node.
  approachTarget(u, target, kind) {
    if (kind === 'node') return { x: target.x, z: target.z };
    // nearest point on building edge towards unit
    const h = buildingHalf(target) + 0.9;
    const dx = Math.max(-h, Math.min(h, u.x - target.x)), dz = Math.max(-h, Math.min(h, u.z - target.z));
    return { x: target.x + dx, z: target.z + dz };
  }

  moveAlongPath(u, dt, speed) {
    if (!u.path || u.wp >= u.path.length) { u.moving = false; return true; }
    const p = u.path[u.wp];
    let dx = p.x - u.x, dz = p.z - u.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step + 0.05) {
      u.x = p.x; u.z = p.z; u.wp++;
      if (u.wp >= u.path.length) { u.moving = false; return true; }
      return false;
    }
    dx /= d; dz /= d;
    u.rot = Math.atan2(dx, dz);
    this.tryMove(u, dx * step, dz * step, true);
    u.moving = true;
    return false;
  }

  tryMove(u, mx, mz, escape = false) {
    const nx = u.x + mx, nz = u.z + mz;
    const c = this.cellOf(nx, nz);
    if (!this.nav.blocked(c.cx, c.cz)) { u.x = nx; u.z = nz; return true; }
    const cx = this.cellOf(nx, u.z);
    if (!this.nav.blocked(cx.cx, cx.cz)) { u.x = nx; return true; }
    const cz = this.cellOf(u.x, nz);
    if (!this.nav.blocked(cz.cx, cz.cz)) { u.z = nz; return true; }
    if (!escape) return false;
    // Escape: head for the centre of the current cell (or the nearest free cell) so the
    // next straight segment no longer clips a blocked corner.
    const cur = this.cellOf(u.x, u.z);
    const target = this.nav.blocked(cur.cx, cur.cz) ? this.nav.nearestFree(cur.cx, cur.cz, 4) : cur;
    if (!target) return false;
    const w = this.cellCenter(target.cx, target.cz);
    const dx = w.x - u.x, dz = w.z - u.z, d = Math.hypot(dx, dz);
    if (d < 0.02) return false;
    const step = Math.min(Math.hypot(mx, mz), d);
    u.x += dx / d * step; u.z += dz / d * step;
    return true;
  }

  // ---------- main tick ----------
  tick(dt) {
    if (this.gameOver) return;
    this.time += dt;
    this.buildSpatial();
    for (const b of this.buildings) b.builders = 0;
    for (const u of this.units) this.updateUnit(u, dt);
    this.separate(dt);
    for (const b of [...this.buildings]) this.updateBuilding(b, dt);
    this.updateProjectiles(dt);
    // deaths
    for (const u of [...this.units]) if (u.hp <= 0) this.killUnit(u);
    for (const b of [...this.buildings]) if (b.hp <= 0) this.destroyBuilding(b);
    this.ai.tick(dt);
    this.fogT = (this.fogT || 0) + dt;
    if (this.fogT > 0.25) { this.fogT = 0; this.updateFog(); }
    this.checkGameOver();
  }

  buildSpatial() {
    const map = new Map();
    for (const u of this.units) {
      const k = (Math.floor(u.x / 4) + 1000) * 4000 + Math.floor(u.z / 4) + 1000;
      let a = map.get(k); if (!a) { a = []; map.set(k, a); }
      a.push(u);
    }
    this.spatial = map;
  }
  nearbyUnits(x, z, r, fn) {
    const r2 = r * r;
    const x0 = Math.floor((x - r) / 4), x1 = Math.floor((x + r) / 4), z0 = Math.floor((z - r) / 4), z1 = Math.floor((z + r) / 4);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const a = this.spatial.get((cx + 1000) * 4000 + cz + 1000);
      if (!a) continue;
      for (const u of a) { const dx = u.x - x, dz = u.z - z; if (dx * dx + dz * dz <= r2) fn(u, Math.sqrt(dx * dx + dz * dz)); }
    }
  }

  separate(dt) {
    for (const u of this.units) {
      let px = 0, pz = 0;
      this.nearbyUnits(u.x, u.z, UNIT_RADIUS * 2.2, (o, d) => {
        if (o === u) return;
        if (d < 0.001) { px += (this.rnd() - 0.5); pz += (this.rnd() - 0.5); return; }
        const overlap = UNIT_RADIUS * 2.2 - d;
        const w = (o.moving && !u.moving) ? 1.0 : (u.moving && !o.moving) ? 0.15 : 0.5;
        px += (u.x - o.x) / d * overlap * w; pz += (u.z - o.z) / d * overlap * w;
      });
      if (px || pz) {
        const m = Math.hypot(px, pz), maxStep = 3.5 * dt;
        if (m > maxStep) { px *= maxStep / m; pz *= maxStep / m; }
        this.tryMove(u, px, pz);
      }
    }
  }

  findEnemyNear(u, r, includeBuildings = true) {
    let best = null, bd = Infinity;
    this.nearbyUnits(u.x, u.z, r, (o, d) => {
      if (o.owner === u.owner) return;
      const prio = o.type === 'villager' ? d + 2 : d;
      if (prio < bd) { bd = prio; best = { kind: 'unit', id: o.id }; }
    });
    if (!best && includeBuildings) {
      for (const b of this.buildings) {
        if (b.owner === u.owner) continue;
        const d = distToBuilding(u.x, u.z, b);
        if (d <= r && d < bd) { bd = d; best = { kind: 'building', id: b.id }; }
      }
    }
    return best;
  }

  // Move towards (px,pz). Returns 'moving' | 'arrived' | 'fail'.
  moveTo(u, dt, def, px, pz) {
    if (!u.path) { if (!this.planPath(u, px, pz)) return 'fail'; }
    if (this.moveAlongPath(u, dt, def.speed)) { u.path = null; return 'arrived'; }
    return 'moving';
  }

  // Approach helper for "walk there, then act" states. Returns true when in range.
  // On repeated arrivals out of range, calls onFail(distance) and returns false.
  approach(u, dt, def, d, range, px, pz, onFail) {
    if (d <= range) { u.fails = 0; return true; }
    const r = this.moveTo(u, dt, def, px, pz);
    if (r === 'fail') { onFail(d); return false; }
    if (r === 'arrived') {
      u.fails = (u.fails || 0) + 1;
      if (u.fails >= 2) { u.fails = 0; onFail(d); }
      return false;
    }
    u.anim = 'walk'; u.walking = true;
    return false;
  }

  nodeAccessible(n) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      if (!this.nav.blocked(n.cx + dx, n.cz + dz)) return true;
    }
    return false;
  }

  updateUnit(u, dt) {
    const def = UNITS[u.type];
    u.cooldown = Math.max(0, u.cooldown - dt);
    u.animT += dt;
    u.replanT -= dt;
    const o = u.order;
    u.anim = 'idle'; u.walking = false;

    // stuck detection
    if (u.moving) {
      const moved = Math.hypot(u.x - u.lastX, u.z - u.lastZ);
      u.stuck = moved < 0.3 * def.speed * dt ? u.stuck + dt : 0;
      if (u.stuck > 1.2 && u.path && u.replanT <= 0) {
        const last = u.path[u.path.length - 1];
        this.planPath(u, last.x, last.z); u.replanT = 1.5; u.stuck = 0;
      }
    }
    u.lastX = u.x; u.lastZ = u.z;

    switch (o.kind) {
      case 'idle': {
        if (u.type !== 'villager') {
          u.scanT -= dt;
          if (u.scanT <= 0) {
            u.scanT = 0.5;
            const t = this.findEnemyNear(u, def.los);
            if (t) u.order = { kind: 'attack', target: t };
          }
        }
        break;
      }
      case 'move': {
        const r = this.moveTo(u, dt, def, o.x, o.z);
        if (r !== 'moving') {
          if (o.resume) { u.order = { kind: 'hide', resume: o.resume, t: 0 }; }
          else this.setIdle(u);
        } else u.anim = 'walk';
        break;
      }
      case 'hide': {
        // fled villager waits near the town centre, then goes back to work once it is safe
        o.t += dt;
        if (o.t > 4) {
          o.t = 0;
          let danger = false;
          this.nearbyUnits(u.x, u.z, 22, (e) => { if (e.owner !== u.owner) danger = true; });
          if (!danger) { u.order = { ...o.resume }; u.path = null; u.carry = u.carry; }
        }
        break;
      }
      case 'attackmove': {
        u.scanT -= dt;
        if (u.scanT <= 0) {
          u.scanT = 0.4;
          const t = this.findEnemyNear(u, def.los, true);
          if (t) { u.order = { kind: 'attack', target: t, resume: { x: o.x, z: o.z } }; u.path = null; break; }
        }
        const r = this.moveTo(u, dt, def, o.x, o.z);
        if (r !== 'moving') this.setIdle(u); else u.anim = 'walk';
        break;
      }
      case 'follow': {
        const t = this.getEntity(o.target);
        if (!t) { this.setIdle(u); break; }
        const d = Math.hypot(t.x - u.x, t.z - u.z);
        if (d > 2.5) {
          if (u.replanT <= 0) { u.path = null; u.replanT = 0.8; }
          if (this.moveTo(u, dt, def, t.x, t.z) === 'moving') u.anim = 'walk';
        }
        break;
      }
      case 'attack': {
        const t = this.getEntity(o.target);
        if (!t || t.hp <= 0) {
          if (o.resume) { u.order = { kind: 'attackmove', x: o.resume.x, z: o.resume.z }; u.path = null; }
          else this.setIdle(u);
          break;
        }
        const isB = o.target.kind === 'building';
        const d = isB ? distToBuilding(u.x, u.z, t) : Math.hypot(t.x - u.x, t.z - u.z) - UNIT_RADIUS;
        // ranged units get a little leniency; melee crowds around buildings need it too
        const range = def.range + (isB ? 0.6 : 0) + (u.fails ? 1.2 * u.fails : 0);
        if (d > range) {
          if (!isB && u.replanT <= 0) { u.path = null; u.replanT = 0.7; }
          const ap = isB ? this.approachTarget(u, t, 'building') : { x: t.x, z: t.z };
          const r = this.moveTo(u, dt, def, ap.x, ap.z);
          if (r === 'moving') u.anim = 'walk';
          else if (r === 'arrived') { u.fails = (u.fails || 0) + 1; if (u.fails > 3) { u.fails = 0; if (o.resume) { u.order = { kind: 'attackmove', x: o.resume.x, z: o.resume.z }; } else this.setIdle(u); } }
          else { if (o.resume) { u.order = { kind: 'attackmove', x: o.resume.x, z: o.resume.z }; } else this.setIdle(u); }
        } else {
          u.path = null; u.moving = false;
          u.rot = Math.atan2(t.x - u.x, t.z - u.z);
          u.anim = 'attack';
          if (u.cooldown <= 0) {
            u.cooldown = def.cooldown;
            if (def.ranged) this.fireProjectile(u, t, o.target, def.attack);
            else this.applyDamage(t, o.target.kind, def.attack, u);
          }
        }
        break;
      }
      case 'gather': {
        if (u.carry && u.carry.amt >= def.carry) { this.goDropoff(u, o); break; }
        const n = this.node(o.target.id);
        if (!n || n.amount <= 0) {
          const res = o.resType || (n && NODE_TYPES[n.type].res) || 'wood';
          const alt = this.findNodeNear(u.x, u.z, res, 40);
          if (alt) { o.target = { kind: 'node', id: alt.id }; u.path = null; }
          else { if (u.carry && u.carry.amt > 0) { o.final = true; this.goDropoff(u, o); } else this.setIdle(u); }
          break;
        }
        o.resType = NODE_TYPES[n.type].res; o.lastNodeType = n.type;
        const d = Math.hypot(n.x - u.x, n.z - u.z);
        const ok = this.approach(u, dt, def, d, 2.9, n.x, n.z, () => {
          // unreachable node: pick another one (excluding this)
          const alt = this.findNodeNear(u.x, u.z, o.resType, 40, n.id);
          if (alt) { o.target = { kind: 'node', id: alt.id }; u.path = null; }
          else if (u.carry && u.carry.amt > 0) { o.final = true; this.goDropoff(u, o); }
          else this.setIdle(u);
        });
        if (!ok) break;
        u.moving = false;
        u.rot = Math.atan2(n.x - u.x, n.z - u.z);
        u.anim = n.type === 'tree' ? 'chop' : 'gather';
        const res = NODE_TYPES[n.type].res;
        if (!u.carry || u.carry.res !== res) u.carry = { res, amt: 0 };
        const rate = NODE_TYPES[n.type].rate * def.gatherRate * (u.owner === ENEMY ? this.ai.diff.resMult : 1);
        const take = Math.min(rate * dt, n.amount, def.carry - u.carry.amt);
        u.carry.amt += take; n.amount -= take;
        if (n.amount <= 0.01) { n.amount = 0; this.removeNode(n); }
        break;
      }
      case 'farm': {
        const f = this.building(o.target.id);
        if (!f || !f.complete) { this.setIdle(u); break; }
        if (f.farmerId && f.farmerId !== u.id && this.unit(f.farmerId)) {
          const alt = this.buildings.find(b => b.owner === u.owner && b.complete && BUILDINGS[b.type].farm && (!b.farmerId || !this.unit(b.farmerId)) && distToBuilding(u.x, u.z, b) < 30);
          if (alt) { o.target = { kind: 'building', id: alt.id }; u.path = null; } else this.setIdle(u);
          break;
        }
        f.farmerId = u.id;
        o.resType = 'food';
        if (u.carry && u.carry.amt >= def.carry) { this.goDropoff(u, o); break; }
        const d = Math.hypot(f.x - u.x, f.z - u.z);
        if (!this.approach(u, dt, def, d, 2.4, f.x + 0.5, f.z + 0.5, () => this.setIdle(u))) break;
        u.moving = false;
        u.anim = 'gather';
        if (!u.carry || u.carry.res !== 'food') u.carry = { res: 'food', amt: 0 };
        u.carry.amt += FARM_RATE * def.gatherRate * dt * (u.owner === ENEMY ? this.ai.diff.resMult : 1);
        u.rot += dt * 0.3;
        break;
      }
      case 'dropoff': {
        const b = this.building(o.dropoff);
        if (!b || !b.complete) { o.dropoff = null; this.goDropoff(u, o); break; }
        const d = distToBuilding(u.x, u.z, b);
        const ap = this.approachTarget(u, b, 'building');
        const ok = this.approach(u, dt, def, d, 1.9, ap.x, ap.z, (dist) => {
          if (dist < 5) { u.forceDeposit = true; }
          else { o.exclude = (o.exclude || []).concat(b.id); this.goDropoff(u, o); }
        });
        if (!ok && !u.forceDeposit) break;
        u.forceDeposit = false;
        if (u.carry) { this.players[u.owner].res[u.carry.res] += u.carry.amt; u.carry = null; }
        u.path = null; u.moving = false;
        if (o.final) { this.setIdle(u); break; }
        if (o.prev === 'farm') u.order = { kind: 'farm', target: o.target, dropoff: null };
        else u.order = { kind: 'gather', target: o.target, dropoff: null, resType: o.resType, lastNodeType: o.lastNodeType };
        break;
      }
      case 'build': case 'repair': {
        const b = this.building(o.target.id);
        if (!b || (o.kind === 'build' && b.complete) || (o.kind === 'repair' && b.hp >= BUILDINGS[b.type].hp)) {
          if (b && b.complete && BUILDINGS[b.type].farm && (!b.farmerId || !this.unit(b.farmerId))) { u.order = { kind: 'farm', target: o.target, dropoff: null }; u.path = null; }
          else this.setIdle(u);
          break;
        }
        const d = distToBuilding(u.x, u.z, b);
        const ap = this.approachTarget(u, b, 'building');
        const ok = this.approach(u, dt, def, d, 1.7 + (u.lenient || 0), ap.x, ap.z, (dist) => {
          if (dist < 5) u.lenient = 4; else this.setIdle(u);
        });
        if (!ok) break;
        u.lenient = 0;
        u.moving = false;
        u.rot = Math.atan2(b.x - u.x, b.z - u.z);
        u.anim = 'build';
        b.builders++;
        if (o.kind === 'repair') b.hp = Math.min(BUILDINGS[b.type].hp, b.hp + BUILDINGS[b.type].hp / BUILDINGS[b.type].buildTime * 0.5 * dt);
        break;
      }
    }
  }

  goDropoff(u, o) {
    const res = u.carry ? u.carry.res : 'food';
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (b.owner !== u.owner || !b.complete) continue;
      if (o.exclude && o.exclude.includes(b.id)) continue;
      const dd = BUILDINGS[b.type].dropoff; if (!dd || !dd.includes(res)) continue;
      const d = distToBuilding(u.x, u.z, b);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) { this.setIdle(u); return; }
    u.order = { kind: 'dropoff', dropoff: best.id, target: o.target, prev: o.kind === 'dropoff' ? o.prev : o.kind, resType: o.resType, lastNodeType: o.lastNodeType, final: o.final, exclude: o.exclude };
    u.path = null;
  }

  findNodeNear(x, z, res, maxD, excludeId) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (NODE_TYPES[n.type].res !== res || n.amount <= 0 || n.id === excludeId) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd && d < maxD && this.nodeAccessible(n)) { bd = d; best = n; }
    }
    return best;
  }

  // ---------- combat ----------
  fireProjectile(from, target, ref, dmg) {
    const dist = Math.hypot(target.x - from.x, target.z - from.z);
    const kind = (from.type in UNITS ? UNITS[from.type].projectile : BUILDINGS[from.type].projectile) || 'football';
    this.projectiles.push({
      id: this.id(), owner: from.owner, kind, x: from.x, z: from.z, y: this.heightAt(from.x, from.z) + (from.type in UNITS ? 1.6 : 6),
      sx: from.x, sz: from.z, target: ref, tx: target.x, tz: target.z, t: 0, dur: Math.max(0.25, dist / 28), dmg, attacker: from.id,
    });
  }
  updateProjectiles(dt) {
    for (const p of [...this.projectiles]) {
      p.t += dt;
      const tgt = this.getEntity(p.target);
      if (tgt) { p.tx = tgt.x; p.tz = tgt.z; }
      if (p.t >= p.dur) {
        if (tgt && tgt.hp > 0) this.applyDamage(tgt, p.target.kind, p.dmg, this.unit(p.attacker) || this.building(p.attacker));
        this.projectiles.splice(this.projectiles.indexOf(p), 1);
      }
    }
  }
  applyDamage(target, kind, dmg, attacker) {
    const armor = kind === 'unit' ? UNITS[target.type].armor : 0;
    const real = Math.max(1, dmg - armor) * (kind === 'building' && attacker && attacker.type === 'villager' ? 1.5 : 1);
    target.hp -= real;
    target.lastHit = this.time;
    if (attacker) target.lastAttacker = { kind: attacker.type in UNITS ? 'unit' : 'building', id: attacker.id };
    this.emit({ type: 'hit', x: target.x, z: target.z, kind, target, amount: real });
    // retaliation for idle/working units
    if (kind === 'unit' && attacker && attacker.type in UNITS) {
      const o = target.order;
      if (target.type !== 'villager' && (o.kind === 'idle' || o.kind === 'move' || o.kind === 'follow')) {
        target.order = { kind: 'attack', target: { kind: 'unit', id: attacker.id } }; target.path = null;
      }
      if (target.type === 'villager' && target.owner === PLAYER && this.villagerFlee !== false && o.kind !== 'attack' && !o.fled) {
        // villagers flee to the town centre
        const tc = this.buildings.find(b => b.owner === target.owner && b.type === 'towncenter');
        if (tc && Math.hypot(tc.x - target.x, tc.z - target.z) > 9) { target.order = { kind: 'move', x: tc.x + 4, z: tc.z + 4, fled: true, resume: o }; target.path = null; }
      }
    }
    if (target.owner === PLAYER && attacker && attacker.owner === ENEMY && this.time - this.lastAlert > 10) {
      this.lastAlert = this.time;
      this.emit({ type: 'alert', text: kind === 'building' ? 'They are working your ' + BUILDINGS[target.type].name + '!' : 'Your squad is getting pressured!', x: target.x, z: target.z });
    }
    if (attacker && attacker.owner !== target.owner) for (const ai of this.ais) if (ai.owner === target.owner) ai.onAttacked(target, kind, attacker);
  }

  killUnit(u) {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    this.players[u.owner].losses++;
    this.players[1 - u.owner].kills++;
    for (const b of this.buildings) if (b.farmerId === u.id) b.farmerId = null;
    for (const o of this.units) if (o.order.target && o.order.target.kind === 'unit' && o.order.target.id === u.id) {
      if (o.order.resume) { o.order = { kind: 'attackmove', x: o.order.resume.x, z: o.order.resume.z }; o.path = null; }
      else this.setIdle(o);
    }
    this.recomputePop();
    this.emit({ type: 'death', unit: u });
  }
  destroyBuilding(b) {
    this.players[1 - b.owner].razed++;
    this.removeBuilding(b);
    this.recomputePop();
    this.emit({ type: 'destroyed', building: b });
    if (b.owner === PLAYER) this.emit({ type: 'alert', text: 'Your ' + BUILDINGS[b.type].name + ' got SACKED!', x: b.x, z: b.z });
  }

  updateBuilding(b, dt) {
    const def = BUILDINGS[b.type];
    if (!b.complete) {
      if (b.builders > 0) {
        const rate = (1 + 0.6 * (b.builders - 1)) / def.buildTime;
        b.progress = Math.min(1, b.progress + rate * dt);
        b.hp = Math.min(def.hp, b.hp + def.hp * 0.9 * rate * dt);
        if (b.progress >= 1) {
          b.complete = true; b.hp = Math.max(b.hp, def.hp * 0.95);
          this.recomputePop();
          this.emit({ type: 'complete', building: b });
        }
      }
      return;
    }
    // training
    if (b.queue.length) {
      const pl = this.players[b.owner];
      if (pl.pop <= pl.popCap) {
        const t = b.queue[0];
        b.trainT += dt * (b.owner === ENEMY ? 1 / this.ai.diff.trainMult : 1);
        if (b.trainT >= UNITS[t].trainTime) {
          b.trainT = 0; b.queue.shift();
          const h = buildingHalf(b) + 1.2;
          const side = b.rally ? Math.atan2(b.rally.x - b.x, b.rally.z - b.z) : Math.atan2(-b.x, -b.z);
          const sx = b.x + Math.sin(side) * h, sz = b.z + Math.cos(side) * h;
          const c = this.cellOf(sx, sz);
          const free = this.nav.nearestFree(c.cx, c.cz, 6) || c;
          const w = this.cellCenter(free.cx, free.cz);
          const u = this.spawnUnit(b.owner, t, w.x, w.z);
          if (b.rally) { u.order = { kind: 'move', x: b.rally.x, z: b.rally.z }; }
          this.recomputePop();
          this.emit({ type: 'trained', unit: u, building: b });
        }
      } else b.stalled = true;
    }
    // defensive attack
    if (def.attack) {
      b.cooldown -= dt;
      if (b.cooldown <= 0) {
        b.cooldown = def.cooldown;
        let best = null, bd = Infinity;
        this.nearbyUnits(b.x, b.z, def.range + buildingHalf(b), (o, d) => {
          if (o.owner !== b.owner && distToBuilding(o.x, o.z, b) <= def.range && d < bd) { bd = d; best = o; }
        });
        if (best) this.fireProjectile(b, best, { kind: 'unit', id: best.id }, def.attack);
      }
    }
  }

  // ---------- fog ----------
  updateFog() {
    const src = [];
    for (const u of this.units) if (u.owner === PLAYER) src.push({ x: u.x, z: u.z, r: UNITS[u.type].los });
    for (const b of this.buildings) if (b.owner === PLAYER) src.push({ x: b.x, z: b.z, r: b.complete ? BUILDINGS[b.type].los : 6 });
    this.fog.update(src);
    for (const b of this.buildings) {
      if (b.owner === ENEMY && !b.seen) {
        const h = buildingHalf(b);
        if (this.fog.isVisible(b.x, b.z) || this.fog.isVisible(b.x - h, b.z - h) || this.fog.isVisible(b.x + h, b.z + h) || this.fog.isVisible(b.x - h, b.z + h) || this.fog.isVisible(b.x + h, b.z - h)) {
          b.seen = true;
          this.emit({ type: 'spotted', building: b });
        }
      }
    }
  }

  checkGameOver() {
    const myTC = this.buildings.some(b => b.owner === PLAYER && b.type === 'towncenter');
    const enemyTC = this.buildings.some(b => b.owner === ENEMY && b.type === 'towncenter');
    if (!myTC) { this.gameOver = 'lose'; this.emit({ type: 'gameover', result: 'lose' }); }
    else if (!enemyTC) { this.gameOver = 'win'; this.emit({ type: 'gameover', result: 'win' }); }
  }

  // ---------- save / load ----------
  serialize() {
    return {
      version: 1, seed: this.seed, difficulty: this.difficulty, time: this.time, nextId: this.nextId,
      players: this.players, units: this.units, buildings: this.buildings, projectiles: this.projectiles,
      nodes: this.nodes.map(n => ({ id: n.id, amount: n.amount })),
      fog: this.fog.serialize(), ai: this.ai.serialize(), gameOver: this.gameOver, lastAlert: this.lastAlert,
    };
  }
  load(data) {
    this.newGame(data.seed, data.difficulty);
    this.time = data.time; this.nextId = data.nextId;
    this.players = data.players;
    this.lastAlert = data.lastAlert || -100;
    // nodes: remove depleted ones, restore amounts
    const amounts = new Map(data.nodes.map(n => [n.id, n.amount]));
    for (const n of [...this.nodes]) {
      if (!amounts.has(n.id)) this.removeNode(n); else n.amount = amounts.get(n.id);
    }
    // clear starting entities
    for (const b of [...this.buildings]) this.removeBuilding(b);
    this.units = [];
    this.buildings = [];
    for (const b of data.buildings) {
      const def = BUILDINGS[b.type];
      this.footprint(b.cx, b.cz, def.size, (ax, az) => {
        if (!def.walkable) this.nav.setDynamic(ax, az, 2);
        this.placeGrid[az * GRID + ax] = 1;
      });
      this.buildings.push({ ...b });
    }
    for (const u of data.units) this.units.push({ ...u, path: null, moving: false });
    this.projectiles = data.projectiles || [];
    this.fog.load(data.fog);
    this.ai.load(data.ai);
    this.gameOver = data.gameOver;
    this.recomputePop();
    this.updateFog();
    this.emit({ type: 'loaded' });
  }
}
