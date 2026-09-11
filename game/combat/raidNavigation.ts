import { dist, type BBuilding, type BTroop } from '../../battle';
import { spriteFacing } from '../spriteFacing';

export interface RaidPoint { x: number; y: number }
export const footprint = (b: BBuilding) => Math.max(1.3, b.size * .46) + .65;

/** Segment/circle geometry is shared by passing lanes, movement and target visibility. */
export function laneClear(from: RaidPoint, to: RaidPoint, buildings: BBuilding[], ignore?: string): boolean {
  // Aim at the near face, not through the centre of the target. Older published
  // layouts can contain overlapping structures; the outer face must stay hittable.
  const target = ignore ? buildings.find(b=>b.id===ignore) : undefined;
  if (target) {
    const d=distance(from,to),r=footprint(target)+.02;
    to=d>r?{x:to.x+(from.x-to.x)/d*r,y:to.y+(from.y-to.y)/d*r}:from;
  }
  const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
  return !buildings.some(b => {
    if (b.dead || b.id === ignore) return false;
    const r = footprint(b);
    // A defender emerging from a facility may leave its footprint, never re-enter it.
    if (dist(from.x, from.y, b.x, b.y) < r) return dist(to.x, to.y, b.x, b.y) < dist(from.x, from.y, b.x, b.y);
    const u = length2 ? Math.max(0, Math.min(1, ((b.x - from.x) * dx + (b.y - from.y) * dy) / length2)) : 0;
    return dist(from.x + u * dx, from.y + u * dy, b.x, b.y) < r;
  });
}

const N = 25, CELL = 4;
const point = (i: number): RaidPoint => ({ x: 2 + (i % N) * CELL, y: 2 + Math.floor(i / N) * CELL });
const index = (p: RaidPoint) => Math.max(0, Math.min(24, Math.round((p.y - 2) / CELL))) * N + Math.max(0, Math.min(24, Math.round((p.x - 2) / CELL)));
const distance = (a: RaidPoint, b: RaidPoint) => dist(a.x, a.y, b.x, b.y);

/** Fine routing around every live footprint. An unreachable enclosure returns null, so
 * attackers can breach a wall instead of walking through it or stalling indefinitely. */
export function raidRoute(from: RaidPoint, to: RaidPoint, buildings: BBuilding[], stop = 1, targetId?: string, occupied?: Uint8Array): RaidPoint[] | null {
  if (distance(from, to) <= stop && laneClear(from, to, buildings, targetId)) return [];
  const emerging = new Set(buildings.filter(b=>!b.dead&&distance(from,b)<footprint(b)).map(b=>b.id));
  const start = index(from), blocked = occupied?.slice() ?? new Uint8Array(N * N);
  if (!occupied || emerging.size) for (let i = 0; i < blocked.length; i++) {
    const p = point(i);
    blocked[i] = buildings.some(b => !b.dead && !emerging.has(b.id) && distance(p, b) < footprint(b)) ? 1 : 0;
  }
  blocked[start] = 0;
  const cost = new Float64Array(N * N).fill(Infinity), parent = new Int16Array(N * N).fill(-1);
  const heap: { id: number; score: number }[] = [];
  const push = (id: number, score: number) => {
    let i = heap.length; heap.push({ id, score });
    while (i) { const p = (i - 1) >> 1; if (heap[p].score <= score) break; heap[i] = heap[p]; i = p; } heap[i] = { id, score };
  };
  const pop = () => {
    const best = heap[0], last = heap.pop()!; if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++; if (heap[child].score >= last.score) break; heap[i] = heap[child]; i = child; } heap[i] = last;
    } return best.id;
  };
  cost[start] = 0; push(start, 0);
  const closed = new Uint8Array(N * N);
  while (heap.length) {
    const current = pop(); if (closed[current]) continue; closed[current] = 1;
    const p = point(current);
    if (distance(p, to) <= Math.max(stop, 3) && laneClear(p, to, buildings, targetId)) {
      const route: RaidPoint[] = []; let i = current;
      while (i !== start && i >= 0) { route.unshift(point(i)); i = parent[i]; }
      if (!route.length && distance(from, to) > stop) route.push(p);
      return route;
    }
    for (const [dx, dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]]) {
      const x = current % N + dx, y = Math.floor(current / N) + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const next = y * N + x; if (blocked[next] || closed[next]) continue;
      const q = point(next);
      if (!laneClear(current === start ? from : p, q, buildings)) continue;
      const nextCost = cost[current] + (dx && dy ? Math.SQRT2 : 1) * CELL;
      if (nextCost >= cost[next]) continue;
      cost[next] = nextCost; parent[next] = current;
      push(next, nextCost + Math.max(0, distance(q, to) - stop));
    }
  }
  return null;
}

interface RouteMemory { key: string; until: number; points: RaidPoint[] | null }
export function createRaidNavigator(buildings: BBuilding[]) {
  const routes = new Map<string, RouteMemory>();
  let topology = '', occupied: Uint8Array;
  const occupancy = () => {
    const next = buildings.filter(b=>!b.dead).map(b=>b.id).join('|');
    if (!occupied || next !== topology) {
      topology = next; occupied = new Uint8Array(N*N);
      for(let i=0;i<occupied.length;i++) { const p=point(i); occupied[i]=buildings.some(b=>!b.dead&&distance(p,b)<footprint(b))?1:0; }
      routes.clear();
    }
    return occupied;
  };
  const move = (actor: BTroop, to: RaidPoint, speed: number, dt: number, tick: number, stop = 1, targetId?: string, teammates: BTroop[] = []): boolean => {
    const grid = occupancy();
    const d = distance(actor, to);
    if (d <= stop) return true;
    const key = `${targetId ?? ''}:${Math.round(to.x / 3)}:${Math.round(to.y / 3)}:${stop}`;
    let route = routes.get(actor.id);
    if (!route || route.key !== key || tick >= route.until) {
      route = { key, until: tick + 16, points: laneClear(actor, to, buildings, targetId) ? [] : raidRoute(actor, to, buildings, stop, targetId, grid) };
      routes.set(actor.id, route);
    }
    if (!route.points) return false;
    while (route.points.length && distance(actor, route.points[0]) < 1) route.points.shift();
    while (route.points.length > 1 && laneClear(actor, route.points[1], buildings)) route.points.shift();
    const wp = route.points[0] ?? to, md = Math.max(.001, distance(actor, wp));
    const step = Math.min(speed * dt, route.points.length ? md : Math.max(0, d - stop));
    let dx = (wp.x - actor.x) / md, dy = (wp.y - actor.y) / md;
    // Soft separation opens individual running lanes; it never adds forward speed.
    for (const other of teammates) {
      if (other === actor || other.dead) continue;
      const dd = distance(actor, other);
      if (dd > 0 && dd < 1.7) { dx += (actor.x - other.x) / dd * (1.7 - dd) * .6; dy += (actor.y - other.y) / dd * (1.7 - dd) * .6; }
    }
    const length = Math.hypot(dx, dy) || 1; dx = dx / length * step; dy = dy / length * step;
    const candidate = { x: Math.max(2, Math.min(98, actor.x + dx)), y: Math.max(2, Math.min(98, actor.y + dy)) };
    if (!laneClear(actor, candidate, buildings)) { routes.delete(actor.id); return false; }
    actor.face = spriteFacing(actor.x, actor.y, candidate.x, candidate.y, actor.face);
    actor.x = candidate.x; actor.y = candidate.y;
    return true;
  };
  return { move, clear: (id: string) => routes.delete(id) };
}
