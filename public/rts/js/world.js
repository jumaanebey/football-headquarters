// Deterministic world generation: heightmap, walkability, resource nodes.
import { MAP_SIZE, CELL, GRID, WATER_LEVEL, BASE_POS, NODE_TYPES } from './config.js';
import { Noise, mulberry32 } from './noise.js';

export const HRES = MAP_SIZE + 1; // heightmap vertices per side (1 unit spacing)
const HALF = MAP_SIZE / 2;

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export class World {
  constructor(seed) {
    this.seed = seed;
    this.noise = new Noise(seed);
    this.heights = new Float32Array(HRES * HRES);
    this.terrainBlocked = new Uint8Array(GRID * GRID); // 1 = water/steep
    this.nodes = [];
    this.generateHeights();
    this.computeTerrainBlocked();
    this.ensureConnectivity();
    this.computeTerrainBlocked();
    this.placeResources();
  }

  rawHeight(x, z) {
    const n = this.noise;
    let h = n.fbm(x * 0.0055 + 3.1, z * 0.0055 - 7.7, 5) * 17 + n.fbm(x * 0.021, z * 0.021, 3) * 2.2 + 4.0;
    // flatten bases
    for (const b of BASE_POS) {
      const d = Math.hypot(x - b.x, z - b.z);
      const w = 1 - smoothstep(28, 58, d);
      h = h + (2.6 - h) * w;
    }
    // gentle land corridor between bases so armies can always march
    const a = BASE_POS[0], b = BASE_POS[1];
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2; t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t, pz = a.z + dz * t;
    const wobble = n.simplex(t * 6.0, 0.5) * 14;
    const dl = Math.hypot(x - px - wobble, z - pz + wobble);
    const w2 = 1 - smoothstep(12, 26, dl);
    if (h < 2.0) h = h + (2.0 + (2.0 - h) * 0.2 - h) * w2;
    // map edge falls off into sea
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const ew = smoothstep(HALF - 26, HALF - 4, edge);
    h = h + (WATER_LEVEL - 5 - h) * ew;
    return h;
  }

  generateHeights() {
    for (let j = 0; j < HRES; j++) {
      for (let i = 0; i < HRES; i++) {
        this.heights[j * HRES + i] = this.rawHeight(i - HALF, j - HALF);
      }
    }
  }

  heightAt(x, z) {
    const fx = x + HALF, fz = z + HALF;
    const i = Math.max(0, Math.min(HRES - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(HRES - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const h = this.heights;
    const h00 = h[j * HRES + i], h10 = h[j * HRES + i + 1], h01 = h[(j + 1) * HRES + i], h11 = h[(j + 1) * HRES + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  cellBlockedByTerrain(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID) return true;
    return this.terrainBlocked[cz * GRID + cx] === 1;
  }

  computeTerrainBlocked() {
    const h = this.heights;
    for (let cz = 0; cz < GRID; cz++) {
      for (let cx = 0; cx < GRID; cx++) {
        const i = cx * CELL, j = cz * CELL;
        let mn = Infinity, mx = -Infinity;
        for (let dj = 0; dj <= CELL; dj++) for (let di = 0; di <= CELL; di++) {
          const v = h[(j + dj) * HRES + (i + di)];
          if (v < mn) mn = v; if (v > mx) mx = v;
        }
        const blocked = mn < WATER_LEVEL + 0.35 || (mx - mn) > 3.4;
        this.terrainBlocked[cz * GRID + cx] = blocked ? 1 : 0;
      }
    }
  }

  // BFS from base 0 to base 1; if unreachable, raise a straight corridor.
  ensureConnectivity() {
    const start = this.worldToCell(BASE_POS[0].x, BASE_POS[0].z);
    const goal = this.worldToCell(BASE_POS[1].x, BASE_POS[1].z);
    const seen = new Uint8Array(GRID * GRID);
    const q = [start.cx + start.cz * GRID];
    seen[q[0]] = 1;
    let found = false;
    while (q.length) {
      const c = q.pop();
      const cx = c % GRID, cz = (c - cx) / GRID;
      if (cx === goal.cx && cz === goal.cz) { found = true; break; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
        const ni = nz * GRID + nx;
        if (seen[ni] || this.terrainBlocked[ni]) continue;
        seen[ni] = 1; q.push(ni);
      }
    }
    if (found) return;
    // brute-force corridor
    const a = BASE_POS[0], b = BASE_POS[1];
    const steps = 400;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) {
        const i = Math.round(x + HALF + dx), j = Math.round(z + HALF + dz);
        if (i < 0 || j < 0 || i >= HRES || j >= HRES) continue;
        const d = Math.hypot(dx, dz);
        const w = 1 - smoothstep(5, 10, d);
        const idx = j * HRES + i;
        const target = 2.2;
        this.heights[idx] = this.heights[idx] + (target - this.heights[idx]) * w * (this.heights[idx] < target ? 1 : 0.6);
      }
    }
  }

  worldToCell(x, z) {
    return { cx: Math.floor((x + HALF) / CELL), cz: Math.floor((z + HALF) / CELL) };
  }
  cellToWorld(cx, cz) {
    return { x: cx * CELL - HALF + CELL / 2, z: cz * CELL - HALF + CELL / 2 };
  }

  placeResources() {
    const rnd = mulberry32(this.seed ^ 0x9e3779b9);
    const occupied = new Set();
    const nodes = [];
    let id = 1;
    const tryPlace = (type, x, z) => {
      const { cx, cz } = this.worldToCell(x, z);
      if (cx < 1 || cz < 1 || cx >= GRID - 1 || cz >= GRID - 1) return false;
      if (this.terrainBlocked[cz * GRID + cx]) return false;
      const key = cz * GRID + cx;
      if (occupied.has(key)) return false;
      for (const b of BASE_POS) {
        if (Math.abs(x - b.x) < 9 && Math.abs(z - b.z) < 9) return false; // keep TC clear
      }
      occupied.add(key);
      const w = this.cellToWorld(cx, cz);
      const def = NODE_TYPES[type];
      nodes.push({
        id: id++, type, x: w.x + (rnd() - 0.5) * 0.6, z: w.z + (rnd() - 0.5) * 0.6, cx, cz,
        amount: def.amount, max: def.amount, rot: rnd() * Math.PI * 2, scale: 0.85 + rnd() * 0.35,
      });
      return true;
    };
    const cluster = (type, cx, cz, count, radius) => {
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 12) {
        tries++;
        const ang = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius;
        if (tryPlace(type, cx + Math.cos(ang) * r, cz + Math.sin(ang) * r)) placed++;
      }
      return placed;
    };

    // Symmetric starting resources for both bases.
    const layouts = [
      { type: 'berry', ang: 0.35, dist: 16, count: 6, radius: 3.5 },
      { type: 'tree', ang: 1.6, dist: 26, count: 38, radius: 10 },
      { type: 'gold', ang: -0.9, dist: 22, count: 4, radius: 3 },
      { type: 'stone', ang: -1.9, dist: 25, count: 3, radius: 2.6 },
      { type: 'tree', ang: 2.9, dist: 32, count: 22, radius: 8 },
    ];
    BASE_POS.forEach((b, side) => {
      const dirToCenter = Math.atan2(-b.z, -b.x);
      for (const L of layouts) {
        const a = dirToCenter + L.ang + (side === 1 ? Math.PI * 0 : 0);
        cluster(L.type, b.x + Math.cos(a) * L.dist, b.z + Math.sin(a) * L.dist, L.count, L.radius);
      }
    });

    // Neutral forests and mines across the map.
    const farFromBases = (x, z, d) => BASE_POS.every(b => Math.hypot(x - b.x, z - b.z) > d);
    let forests = 0, tries = 0;
    while (forests < 16 && tries < 400) {
      tries++;
      const x = (rnd() - 0.5) * (MAP_SIZE - 60), z = (rnd() - 0.5) * (MAP_SIZE - 60);
      if (!farFromBases(x, z, 48)) continue;
      if (cluster('tree', x, z, 14 + Math.floor(rnd() * 26), 7 + rnd() * 8) > 6) forests++;
    }
    let mines = 0; tries = 0;
    while (mines < 5 && tries < 300) {
      tries++;
      const x = (rnd() - 0.5) * (MAP_SIZE - 70), z = (rnd() - 0.5) * (MAP_SIZE - 70);
      if (!farFromBases(x, z, 55)) continue;
      if (cluster(rnd() < 0.6 ? 'gold' : 'stone', x, z, 3 + Math.floor(rnd() * 3), 3.2) >= 3) mines++;
    }
    let bushes = 0; tries = 0;
    while (bushes < 4 && tries < 200) {
      tries++;
      const x = (rnd() - 0.5) * (MAP_SIZE - 70), z = (rnd() - 0.5) * (MAP_SIZE - 70);
      if (!farFromBases(x, z, 50)) continue;
      if (cluster('berry', x, z, 5, 3.5) >= 4) bushes++;
    }
    // Scattered lone trees for looks (and a little wood).
    for (let i = 0; i < 260; i++) {
      const x = (rnd() - 0.5) * (MAP_SIZE - 40), z = (rnd() - 0.5) * (MAP_SIZE - 40);
      if (!farFromBases(x, z, 34)) continue;
      tryPlace('tree', x, z);
    }
    this.nodes = nodes;
  }
}
