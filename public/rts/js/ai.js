// Enemy AI: economy management, build order, army training and attack waves.
import { UNITS, BUILDINGS, NODE_TYPES, BASE_POS, PLAYER, MAX_POP, CELL, GRID, MAP_SIZE } from './config.js';
import { distToBuilding, centerOfAnchor, anchorFor } from './game.js';

const HALF = MAP_SIZE / 2;

export class AI {
  constructor(game, owner, diff) {
    this.g = game; this.owner = owner; this.diff = diff;
    this.t = 0; this.tickT = 0;
    this.nextAttackAt = diff.firstAttack;
    this.waveSize = diff.waveSize;
    this.waveN = 0;
    this.attacking = false;
    this.attackStart = 0;
    this.launchSize = 0;
    this.defendUntil = 0;
    this.defendTarget = null;
    this.lastBuild = -100;
  }
  serialize() {
    return { t: this.t, nextAttackAt: this.nextAttackAt, waveSize: this.waveSize, waveN: this.waveN, attacking: this.attacking, attackStart: this.attackStart, launchSize: this.launchSize, defendUntil: this.defendUntil, lastBuild: this.lastBuild };
  }
  load(d) { if (d) Object.assign(this, d); }

  get base() { return BASE_POS[this.owner]; }
  get enemyBase() { return BASE_POS[1 - this.owner]; }
  mine() { return this.g.buildings.filter(b => b.owner === this.owner); }
  myUnits() { return this.g.units.filter(u => u.owner === this.owner); }
  tc() { return this.g.buildings.find(b => b.owner === this.owner && b.type === 'towncenter'); }

  onAttacked(target, kind, attacker) {
    const d = Math.hypot(target.x - this.base.x, target.z - this.base.z);
    if (d < 70) {
      this.defendUntil = this.t + 25;
      this.defendTarget = { kind: 'unit', id: attacker.id, x: attacker.x, z: attacker.z };
    }
  }

  tick(dt) {
    this.t += dt; this.tickT += dt;
    if (this.tickT < 1) return;
    this.tickT = 0;
    const tc = this.tc();
    if (!tc) return;
    this.tc_ = tc;
    this.manageEconomy();
    this.manageBuildings();
    this.manageTraining();
    this.manageArmy();
  }

  // ---------- economy ----------
  manageEconomy() {
    const g = this.g, vils = this.myUnits().filter(u => u.type === 'villager');
    const counts = { food: 0, wood: 0, gold: 0, stone: 0, build: 0, idle: 0 };
    for (const v of vils) {
      const o = v.order;
      if (o.kind === 'gather' || o.kind === 'dropoff' || o.kind === 'farm') counts[o.resType || 'food']++;
      else if (o.kind === 'build') counts.build++;
      else counts.idle++;
    }
    const minutes = this.t / 60;
    const want = minutes < 4 ? { food: 0.42, wood: 0.43, gold: 0.1, stone: 0.05 } : minutes < 9 ? { food: 0.4, wood: 0.3, gold: 0.22, stone: 0.08 } : { food: 0.38, wood: 0.27, gold: 0.28, stone: 0.07 };
    const res = g.players[this.owner].res;
    // steer by shortages
    if (res.wood < 80) want.wood += 0.15;
    if (res.food < 80) want.food += 0.15;
    if (res.gold < 60 && minutes > 3) want.gold += 0.12;
    const total = vils.length || 1;
    const idle = vils.filter(v => v.order.kind === 'idle');
    for (const v of idle) {
      let best = null, bd = -Infinity;
      for (const r of ['food', 'wood', 'gold', 'stone']) {
        const deficit = want[r] - counts[r] / total;
        if (deficit > bd) { bd = deficit; best = r; }
      }
      if (this.assignGather(v, best)) counts[best]++;
      else {
        for (const r of ['wood', 'food', 'gold', 'stone']) if (r !== best && this.assignGather(v, r)) { counts[r]++; break; }
      }
    }
    // every so often, rebalance one worker if far off target
    if (Math.floor(this.t) % 15 === 0) {
      for (const r of ['gold', 'stone', 'food', 'wood']) {
        const deficit = want[r] - counts[r] / total;
        if (deficit > 0.15) {
          const surplusRes = ['wood', 'food', 'gold', 'stone'].find(s => counts[s] / total - want[s] > 0.1);
          if (surplusRes) {
            const v = vils.find(u => (u.order.kind === 'gather' || u.order.kind === 'farm') && u.order.resType === surplusRes && !u.carry?.amt);
            if (v && this.assignGather(v, r)) { counts[r]++; counts[surplusRes]--; }
          }
          break;
        }
      }
    }
  }

  assignGather(v, res) {
    const g = this.g;
    if (res === 'food') {
      // free farm first
      const farm = g.buildings.find(b => b.owner === this.owner && b.complete && BUILDINGS[b.type].farm && (!b.farmerId || !g.unit(b.farmerId)));
      if (farm) { farm.farmerId = v.id; g.cmdInteract([v.id], { kind: 'building', id: farm.id }); return true; }
      const berry = this.findNode('food', v);
      if (berry) { g.cmdInteract([v.id], { kind: 'node', id: berry.id }); return true; }
      // build a farm
      if (g.players[this.owner].res.wood >= 60) {
        const spot = this.findFarmSpot();
        if (spot) { const r = g.cmdBuild([v.id], 'farm', spot.x, spot.z); if (r.ok) return true; }
      }
      return false;
    }
    const n = this.findNode(res, v);
    if (!n) return false;
    g.cmdInteract([v.id], { kind: 'node', id: n.id });
    // drop-off camp near this resource if far from any drop-off
    this.considerCamp(res, n);
    return true;
  }

  findNode(res, v) {
    const g = this.g, base = this.base, eb = this.enemyBase;
    let best = null, bd = Infinity;
    for (const n of g.nodes) {
      if (NODE_TYPES[n.type].res !== res || n.amount <= 0) continue;
      if (Math.hypot(n.x - eb.x, n.z - eb.z) < 70) continue; // avoid the player's base
      if (!g.nodeAccessible(n)) continue;
      // prefer nodes near own drop-offs
      let d = Math.hypot(n.x - base.x, n.z - base.z);
      for (const b of g.buildings) if (b.owner === this.owner && b.complete && BUILDINGS[b.type].dropoff?.includes(res)) d = Math.min(d, distToBuilding(n.x, n.z, b) + 6);
      // spread workers a little
      let crowd = 0;
      for (const u of g.units) if (u.owner === this.owner && u.order.target?.kind === 'node' && u.order.target.id === n.id) crowd++;
      d += crowd * 4;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  considerCamp(res, node) {
    const g = this.g;
    const camp = res === 'wood' ? 'lumbercamp' : 'miningcamp';
    let nearest = Infinity;
    for (const b of g.buildings) if (b.owner === this.owner && BUILDINGS[b.type].dropoff?.includes(res)) nearest = Math.min(nearest, distToBuilding(node.x, node.z, b));
    if (nearest < 16) return;
    if (g.players[this.owner].res.wood < BUILDINGS[camp].cost.wood + 40) return;
    if (this.t - this.lastBuild < 8) return;
    const spot = this.findSpot(camp, node.x, node.z, 4, 12);
    if (spot) this.build(camp, spot);
  }

  // ---------- buildings ----------
  manageBuildings() {
    const g = this.g, pl = g.players[this.owner], res = pl.res, mine = this.mine();
    const has = t => mine.filter(b => b.type === t).length;
    const pending = mine.filter(b => !b.complete);
    const pendingType = t => pending.some(b => b.type === t);
    if (this.t - this.lastBuild < 4) return;
    if (pending.length >= 3) { this.assignBuilders(pending); return; }
    const fa = this.diff.firstAttack;

    if (pl.popCap - pl.pop <= 4 && pl.popCap < MAX_POP && res.wood >= 30 && !pendingType('house')) {
      const spot = this.findSpot('house', this.base.x, this.base.z, 8, 30);
      if (spot) return this.build('house', spot);
    }
    if (has('barracks') === 0 && this.t > fa * 0.3 && res.wood >= 175) {
      const spot = this.findSpotTowards('barracks', 14, 30);
      if (spot) return this.build('barracks', spot);
    }
    if (has('archeryrange') === 0 && this.t > fa * 0.55 && res.wood >= 175 && has('barracks') > 0) {
      const spot = this.findSpotTowards('archeryrange', 14, 30);
      if (spot) return this.build('archeryrange', spot);
    }
    if (has('stable') === 0 && this.t > fa * 1.1 && res.wood >= 175 && res.gold >= 50) {
      const spot = this.findSpotTowards('stable', 14, 30);
      if (spot) return this.build('stable', spot);
    }
    if (has('tower') < 2 && this.t > fa * 0.8 && res.stone >= 125 && res.wood >= 50) {
      const spot = this.findSpotTowards('tower', 16, 24);
      if (spot) return this.build('tower', spot);
    }
    if (has('barracks') === 1 && this.t > fa * 1.6 && res.wood >= 250) {
      const spot = this.findSpotTowards('barracks', 14, 30);
      if (spot) return this.build('barracks', spot);
    }
    if (has('farm') < 8 && res.wood >= 60 + 100 && this.t > 120 && !pendingType('farm')) {
      const spot = this.findFarmSpot();
      if (spot) return this.build('farm', spot);
    }
    if (has('mill') === 0 && has('farm') >= 5 && res.wood >= 100 && !this.findFarmSpot()) {
      const spot = this.findSpot('mill', this.base.x, this.base.z, 18, 34);
      if (spot) return this.build('mill', spot);
    }
    this.assignBuilders(pending);
  }

  assignBuilders(pending) {
    const g = this.g;
    for (const b of pending) {
      // a site that has made no progress for a long time is probably unreachable: give up on it
      if (b.progress < 0.02 && g.time - (b.placedAt || 0) > 75) { g.cmdDeleteBuilding(b.id, this.owner); continue; }
      const builders = g.units.filter(u => u.owner === this.owner && u.order.kind === 'build' && u.order.target.id === b.id);
      const want = BUILDINGS[b.type].size >= 3 ? 2 : 1;
      if (builders.length >= want) continue;
      const v = this.pickBuilder(b.x, b.z);
      if (v) g.cmdInteract([v.id], { kind: 'building', id: b.id });
    }
  }

  pickBuilder(x, z) {
    const vils = this.myUnits().filter(u => u.type === 'villager' && u.order.kind !== 'build');
    vils.sort((a, b) => {
      const pa = a.order.kind === 'idle' ? 0 : (a.order.resType === 'wood' ? 1 : 2), pb = b.order.kind === 'idle' ? 0 : (b.order.resType === 'wood' ? 1 : 2);
      if (pa !== pb) return pa - pb;
      return Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z);
    });
    return vils[0] || null;
  }

  build(type, spot) {
    const v = this.pickBuilder(spot.x, spot.z);
    if (!v) return false;
    const r = this.g.cmdBuild([v.id], type, spot.x, spot.z);
    if (r.ok) { this.lastBuild = this.t; return true; }
    return false;
  }

  spotOk(type, x, z) {
    const g = this.g, def = BUILDINGS[type];
    const p = g.canPlace(type, x, z, this.owner);
    if (!p.ok) return false;
    if (def.farm) return true;
    // keep a one-cell gap to other non-farm buildings so units can pass
    const { cx, cz } = anchorFor(x, z, def.size);
    for (let dz = -1; dz <= def.size; dz++) for (let dx = -1; dx <= def.size; dx++) {
      const ax = cx + dx, az = cz + dz;
      if (ax < 0 || az < 0 || ax >= GRID || az >= GRID) return false;
      if (g.nav.dynamic[az * GRID + ax] === 2) return false;
    }
    return true;
  }

  findSpot(type, nx, nz, rMin, rMax) {
    const g = this.g;
    for (let r = rMin; r <= rMax; r += 2.5) {
      const steps = Math.max(8, Math.floor(r * 1.5));
      const off = g.rnd() * Math.PI * 2;
      for (let i = 0; i < steps; i++) {
        const a = off + i / steps * Math.PI * 2;
        const x = nx + Math.cos(a) * r, z = nz + Math.sin(a) * r;
        if (Math.abs(x) > HALF - 10 || Math.abs(z) > HALF - 10) continue;
        if (this.spotOk(type, x, z)) {
          const c = anchorFor(x, z, BUILDINGS[type].size);
          return centerOfAnchor(c.cx, c.cz, BUILDINGS[type].size);
        }
      }
    }
    return null;
  }

  // Spot biased towards the player's base (military buildings face the front).
  findSpotTowards(type, rMin, rMax) {
    const b = this.base, e = this.enemyBase;
    const ang = Math.atan2(e.z - b.z, e.x - b.x);
    for (let r = rMin; r <= rMax; r += 3) {
      for (let k = 0; k < 9; k++) {
        const a = ang + (k - 4) * 0.28;
        const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
        if (this.spotOk(type, x, z)) {
          const c = anchorFor(x, z, BUILDINGS[type].size);
          return centerOfAnchor(c.cx, c.cz, BUILDINGS[type].size);
        }
      }
    }
    return this.findSpot(type, b.x, b.z, rMin, rMax + 10);
  }

  findFarmSpot() {
    const g = this.g;
    const drops = g.buildings.filter(b => b.owner === this.owner && b.complete && BUILDINGS[b.type].dropoff?.includes('food'));
    for (const d of drops) {
      const spot = this.findSpot('farm', d.x, d.z, 6, 14);
      if (spot) return spot;
    }
    return null;
  }

  // ---------- training ----------
  manageTraining() {
    const g = this.g, pl = g.players[this.owner], res = pl.res;
    const mine = this.mine().filter(b => b.complete);
    const units = this.myUnits();
    const vils = units.filter(u => u.type === 'villager').length;
    const wantVils = this.t < 300 ? 18 : this.t < 600 ? 24 : 28;
    const tc = this.tc_;
    if (tc && vils + tc.queue.length < wantVils && tc.queue.length < 2 && res.food >= 50) g.cmdTrain(tc.id, 'villager');
    // military
    const army = units.filter(u => u.type !== 'villager').length;
    const wantArmy = this.attacking ? MAX_POP : Math.max(this.waveSize + 4, 8);
    if (army >= wantArmy && pl.popCap - pl.pop < 6) return;
    const prodBuildings = mine.filter(b => BUILDINGS[b.type].trains && b.type !== 'towncenter');
    for (const b of prodBuildings) {
      if (b.queue.length >= 2) continue;
      const type = BUILDINGS[b.type].trains[0];
      const cost = UNITS[type].cost;
      // keep a small reserve for houses/farms
      if ((cost.wood || 0) + 40 > res.wood && this.t > 200 && type !== 'archer') continue;
      if (g.canAfford(this.owner, cost)) g.cmdTrain(b.id, type);
    }
  }

  // ---------- army ----------
  manageArmy() {
    const g = this.g;
    const army = this.myUnits().filter(u => u.type !== 'villager');
    const base = this.base;

    // 1. Base defence: intruders near any of our buildings
    let intruder = null, bd = Infinity;
    for (const u of g.units) {
      if (u.owner === this.owner) continue;
      for (const b of this.mine()) {
        const d = distToBuilding(u.x, u.z, b);
        if (d < 24 && d < bd) { bd = d; intruder = u; }
      }
    }
    if (intruder) { this.defendUntil = this.t + 12; this.defendTarget = { kind: 'unit', id: intruder.id, x: intruder.x, z: intruder.z }; }

    if (this.t < this.defendUntil && this.defendTarget) {
      const tgt = g.unit(this.defendTarget.id);
      const defenders = this.attacking ? army.filter(u => Math.hypot(u.x - base.x, u.z - base.z) < 80) : army;
      for (const u of defenders) {
        if (u.order.kind === 'attack') continue;
        if (tgt) g.cmdInteract([u.id], { kind: 'unit', id: tgt.id });
        else g.cmdMove([u.id], this.defendTarget.x, this.defendTarget.z, true);
      }
      if (!tgt) this.defendUntil = 0;
      // villagers flee from intruders next to them
      if (tgt) for (const v of this.myUnits()) {
        if (v.type === 'villager' && Math.hypot(v.x - tgt.x, v.z - tgt.z) < 7 && v.order.kind !== 'move') g.cmdMove([v.id], base.x + 3, base.z + 3);
      }
      return;
    }

    // 2. Attack waves
    const rally = this.rallyPoint();
    if (!this.attacking) {
      const overdue = this.t > this.nextAttackAt + 120;
      if (this.t >= this.nextAttackAt && (army.length >= this.waveSize || (overdue && army.length >= 3))) {
        // send a group of roughly waveSize (closest to the rally point); the rest stay home to defend
        const cap = Math.max(this.waveSize + 2, Math.floor(army.length * 0.6));
        const group = [...army].sort((a, b) => Math.hypot(a.x - rally.x, a.z - rally.z) - Math.hypot(b.x - rally.x, b.z - rally.z)).slice(0, cap);
        this.attacking = true; this.attackStart = this.t; this.launchSize = group.length; this.waveN++;
        this.attackGroup = group.map(u => u.id);
        this.sendAttack(group);
        g.emit({ type: 'aiAttack', wave: this.waveN, size: group.length });
      } else {
        // idle army gathers at the rally point
        for (const u of army) {
          if (u.order.kind === 'idle' && Math.hypot(u.x - rally.x, u.z - rally.z) > 10) g.cmdMove([u.id], rally.x, rally.z);
        }
      }
    } else {
      const group = army.filter(u => this.attackGroup?.includes(u.id));
      // keep pressure: idle attackers push on to the next target
      for (const u of group) {
        if (u.order.kind === 'idle') this.sendAttack([u]);
      }
      const targetsLeft = g.buildings.some(b => b.owner !== this.owner);
      if (group.length <= Math.max(2, this.launchSize * 0.25) || this.t - this.attackStart > 300 || !targetsLeft) {
        this.attacking = false;
        this.nextAttackAt = this.t + Math.max(90, 200 - this.waveN * 15);
        this.waveSize += this.diff.waveGrowth;
        for (const u of group) g.cmdMove([u.id], rally.x, rally.z);
      }
    }
  }

  rallyPoint() {
    const b = this.base, e = this.enemyBase;
    const ang = Math.atan2(e.z - b.z, e.x - b.x);
    return { x: b.x + Math.cos(ang) * 22, z: b.z + Math.sin(ang) * 22 };
  }

  sendAttack(units) {
    const g = this.g;
    // target: nearest player building to the group's centre, TC as fallback
    let cx = 0, cz = 0;
    for (const u of units) { cx += u.x; cz += u.z; }
    cx /= units.length || 1; cz /= units.length || 1;
    const targets = g.buildings.filter(b => b.owner !== this.owner);
    if (!targets.length) return;
    let best = null, bd = Infinity;
    for (const b of targets) {
      let d = Math.hypot(b.x - cx, b.z - cz);
      if (b.type === 'towncenter') d -= 15; // prefer the town centre
      if (b.type === 'farm') d += 30;
      if (d < bd) { bd = d; best = b; }
    }
    g.cmdMove(units.map(u => u.id), best.x, best.z, true);
  }
}
