// Grid A* with binary heap, string-pulling smoothing, and nearest-free-cell search.
import { GRID } from './config.js';

class Heap {
  constructor() { this.a = []; }
  push(node) {
    const a = this.a; a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

export class NavGrid {
  constructor(terrainBlocked) {
    this.terrain = terrainBlocked;           // 1 = impassable terrain
    this.dynamic = new Uint8Array(GRID * GRID); // buildings & resource nodes
    this.gScore = new Float32Array(GRID * GRID);
    this.closed = new Uint8Array(GRID * GRID);
    this.parent = new Int32Array(GRID * GRID);
    this.stamp = 0;
  }
  blocked(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID) return true;
    const i = cz * GRID + cx;
    return this.terrain[i] === 1 || this.dynamic[i] !== 0;
  }
  setDynamic(cx, cz, v) {
    if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID) return;
    this.dynamic[cz * GRID + cx] = v;
  }

  nearestFree(cx, cz, maxR = 12) {
    if (!this.blocked(cx, cz)) return { cx, cz };
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx, z = cz + dz;
        if (!this.blocked(x, z)) {
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = { cx: x, cz: z }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  lineFree(x0, z0, x1, z1) {
    // Bresenham over cells; also check corner cutting
    let dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    let x = x0, z = z0;
    for (;;) {
      if (this.blocked(x, z)) return false;
      if (x === x1 && z === z1) return true;
      const e2 = 2 * err;
      const stepX = e2 > -dz, stepZ = e2 < dx;
      // supercover: when stepping diagonally, both intermediate cells must be free
      if (stepX && stepZ && (this.blocked(x + sx, z) || this.blocked(x, z + sz))) return false;
      if (stepX) { err -= dz; x += sx; }
      if (stepZ) { err += dx; z += sz; }
    }
  }

  // Returns array of {cx, cz} from start (exclusive) to goal (inclusive), or null.
  findPath(sx, sz, gx, gz, maxExpand = 24000) {
    if (sx === gx && sz === gz) return [];
    if (this.blocked(gx, gz)) {
      const nf = this.nearestFree(gx, gz);
      if (!nf) return null;
      gx = nf.cx; gz = nf.cz;
    }
    if (this.blocked(sx, sz)) {
      const nf = this.nearestFree(sx, sz, 4);
      if (nf) { sx = nf.cx; sz = nf.cz; }
    }
    if (this.lineFree(sx, sz, gx, gz)) return [{ cx: gx, cz: gz }];

    const closed = this.closed, g = this.gScore, parent = this.parent;
    closed.fill(0); g.fill(Infinity);
    const heap = new Heap();
    const si = sz * GRID + sx, gi = gz * GRID + gx;
    g[si] = 0; parent[si] = -1;
    const h = (x, z) => { const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
    heap.push({ i: si, f: h(sx, sz) });
    let expanded = 0, bestI = si, bestH = h(sx, sz);
    while (heap.size) {
      const cur = heap.pop();
      const ci = cur.i;
      if (closed[ci]) continue;
      closed[ci] = 1;
      if (ci === gi) { bestI = gi; break; }
      if (++expanded > maxExpand) break;
      const cx = ci % GRID, cz = (ci - cx) / GRID;
      const hc = h(cx, cz);
      if (hc < bestH) { bestH = hc; bestI = ci; }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (this.blocked(nx, nz)) continue;
        if (dx && dz && (this.blocked(cx + dx, cz) || this.blocked(cx, cz + dz))) continue; // no corner cutting
        const ni = nz * GRID + nx;
        if (closed[ni]) continue;
        const ng = g[ci] + ((dx && dz) ? 1.4142 : 1);
        if (ng < g[ni]) { g[ni] = ng; parent[ni] = ci; heap.push({ i: ni, f: ng + h(nx, nz) }); }
      }
    }
    if (bestI === si) return null;
    // reconstruct
    const raw = [];
    let i = bestI;
    while (i !== -1 && i !== si) { raw.push(i); i = parent[i]; }
    raw.reverse();
    // string pulling
    const pts = [{ cx: sx, cz: sz }];
    for (const idx of raw) pts.push({ cx: idx % GRID, cz: Math.floor(idx / GRID) });
    const out = [];
    let anchor = 0;
    while (anchor < pts.length - 1) {
      let far = anchor + 1;
      for (let k = pts.length - 1; k > anchor + 1; k--) {
        if (this.lineFree(pts[anchor].cx, pts[anchor].cz, pts[k].cx, pts[k].cz)) { far = k; break; }
      }
      out.push(pts[far]);
      anchor = far;
    }
    return out;
  }
}
