import { dist, nearestBuilding, RECEIVER_BONUS, UNIT_PREF, type BBuilding, type BTroop, type ReplayAction } from '../../battle';
import { UnitGroup } from '../../types';
import { applyBuildingYardage, applyTroopPressure, type CombatEvent } from './actions';
import { counterRole } from './defenseCounters';
import { createRaidNavigator, footprint, laneClear } from './raidNavigation';
import { spriteFacing } from '../spriteFacing';

export { RAID_TACTICS_RULES } from './defenseCounters';
export type RaidOrder = Pick<ReplayAction, 'key' | 'u' | 'x' | 'y' | 'targetId'> & { serial: number };
const coordinate = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 2 && n <= 98;
export function validRaidOrder(a: ReplayAction): boolean {
  if (a.u !== undefined && !Object.values(UnitGroup).includes(a.u)) return false;
  if (a.key === 'auto') return a.x === undefined && a.y === undefined && a.targetId === undefined;
  if (a.key === 'push') return coordinate(a.x) && coordinate(a.y) && a.targetId === undefined;
  return ['focus', 'protect'].includes(a.key ?? '') && typeof a.targetId === 'string' && a.targetId.length > 0 && a.targetId.length <= 100 && a.x === undefined && a.y === undefined;
}
export const isBlocker = (t: BTroop) => counterRole(t) === 'OL';
export const isPasser = (t: BTroop) => counterRole(t) === 'QB' && t.heroKey !== 'kicker';
export function supportingPasser(t: BTroop, troops: BTroop[], buildings: BBuilding[]): BTroop | undefined {
  if (!['WR', 'TE'].includes(counterRole(t))) return;
  return troops.find(q => q !== t && !q.dead && !q.activeAction && !q.engagementId && (q.flagT??0)<=0 && isPasser(q) && dist(t.x, t.y, q.x, q.y) <= 18 && laneClear(q, t, buildings));
}

interface Strike { sourceId: string; targetId: string; guard: boolean; damage: number; remaining: number; catch: boolean }
interface TacticsState { troops: BTroop[]; guards: BTroop[]; buildings: BBuilding[]; ticks: number }
interface Feedback {
  events: (events: CombatEvent[]) => void;
  hit: (source: BTroop, target: BBuilding | BTroop, damage: number, caught: boolean) => void;
  release: (source: BTroop, target: BBuilding | BTroop, seconds: number) => void;
  guardDown: (guard: BTroop, actor: BTroop) => void;
  playerDown: (actor: BTroop) => void;
}

/** Versioned raid rules. Decisions, navigation, contacts and orders run identically in
 * the renderer, replay and authority; CSS never decides whether a hit connected. */
export function createRaidTactics(s: TacticsState, feedback: Feedback) {
  const navigator = createRaidNavigator(s.buildings);
  const orders = new Map<string, RaidOrder>(), arrived = new Map<string, number>();
  const cooldowns = new Map<string, number>();
  const strikes: Strike[] = [];
  let serial = 0;
  const orderFor = (t: BTroop) => orders.get(t.isHero || t.special ? 'all' : t.unit) ?? orders.get('all');
  const command = (a: ReplayAction) => {
    if (!validRaidOrder(a)) return false;
    if (a.key === 'push' && s.buildings.some(b=>!b.dead&&dist(a.x!,a.y!,b.x,b.y)<footprint(b))) return false;
    if (a.key === 'focus' && !s.buildings.some(b => b.id === a.targetId && !b.dead)) return false;
    if (a.key === 'protect' && !s.troops.some(t => t.id === a.targetId && t.isHero && !t.dead)) return false;
    if (!a.u) orders.clear();
    orders.set(a.u ?? 'all', { key: a.key, u: a.u, x: a.x, y: a.y, targetId: a.targetId, serial: ++serial });
    for (const t of s.troops) if (!a.u || (!t.isHero && !t.special && t.unit === a.u)) { navigator.clear(t.id); t.targetId = null; }
    return true;
  };
  const hurtGuard = (guard: BTroop, actor: BTroop, damage: number) => {
    const actual = Math.min(Math.max(0, guard.hp), damage);
    guard.hp -= actual; guard.hitFlash = .18;
    actor.dmg = (actor.dmg ?? 0) + actual;
    if (guard.hp <= 0 && !guard.dead) { guard.hp = 0; guard.dead = true; actor.kills = (actor.kills ?? 0) + 1; feedback.guardDown(guard, actor); }
    return actual;
  };
  const step = (dt: number) => {
    for (const [id, cooldown] of cooldowns) cooldowns.set(id, Math.max(0, cooldown - dt));
    for (let i = strikes.length - 1; i >= 0; i--) {
      const strike = strikes[i]; strike.remaining -= dt; if (strike.remaining > 0) continue;
      strikes.splice(i, 1);
      const source = s.troops.find(t => t.id === strike.sourceId);
      const target = strike.guard ? s.guards.find(g => g.id === strike.targetId) : s.buildings.find(b => b.id === strike.targetId);
      if (!source || !target || target.dead || (strike.catch && source.dead)) continue;
      // A released ball remains live even if its passer is tackled before contact.
      const damage = Math.min(Math.max(0, target.hp), strike.damage);
      if (strike.guard) hurtGuard(target as BTroop, source, damage);
      else feedback.events(applyBuildingYardage(source, target as BBuilding, damage));
      if (strike.catch) source.catches = (source.catches ?? 0) + 1;
      feedback.hit(source, target, damage, strike.catch);
    }
  };
  const attack = (t: BTroop, target: BTroop | BBuilding, dps: number, guard: boolean) => {
    t.attacking = true; t.targetId = target.id; t.face = spriteFacing(t.x, t.y, target.x, target.y, t.face);
    if (guard && (t.truckT ?? 0) > 0) { t.truckT = 0; hurtGuard(target as BTroop, t, 100 + t.dps * 2); if (target.dead) return; }
    if ((cooldowns.get(t.id) ?? 0) > 0) return;
    const passer = supportingPasser(t, s.troops, s.buildings);
    const ranged = isPasser(t) || t.heroKey === 'kicker';
    const beat = ranged ? .9 : .7;
    cooldowns.set(t.id, beat); t.actionPoseT = ranged ? .34 : .25;
    const damage = dps * beat * (passer ? RECEIVER_BONUS : 1);
    if (ranged || passer) {
      const flight = .12 + Math.min(.45, dist(t.x, t.y, target.x, target.y) / 65);
      strikes.push({ sourceId: t.id, targetId: target.id, guard, damage, remaining: flight, catch: !!passer });
      feedback.release(passer ?? t, passer ? t : target, flight);
    } else {
      const actual = Math.min(Math.max(0, target.hp), damage);
      if (guard) hurtGuard(target as BTroop, t, damage); else feedback.events(applyBuildingYardage(t, target as BBuilding, damage));
      feedback.hit(t, target, actual, false);
    }
  };
  const troop = (t: BTroop, dps: number, speed: number, dt: number) => {
    t.engagementId = undefined;
    const order = orderFor(t);
    const anchor = order?.key === 'protect' ? s.troops.find(p => p.id === order.targetId && !p.dead && p !== t) : undefined;
    const movingOrder = order?.key === 'push' && arrived.get(t.id) !== order.serial;
    const nearby = s.guards.filter(g => !g.dead && laneClear(t, g, s.buildings)).sort((a,b) => dist(t.x,t.y,a.x,a.y)-dist(t.x,t.y,b.x,b.y));
    const threat = nearby.find(g => dist(t.x,t.y,g.x,g.y) <= (movingOrder ? 2.4 : isBlocker(t) ? 11 : 4.5) || (anchor && isBlocker(t) && dist(g.x,g.y,anchor.x,anchor.y) < 13));
    if (threat && !movingOrder) {
      t.engagementId = threat.id; t.targetId = threat.id;
      t.raidActivity = isBlocker(t) ? 'Blocking a defender' : 'Fighting through a tackle';
      const reach = isPasser(t) ? Math.min(t.range, 10) : 3;
      if (dist(t.x,t.y,threat.x,threat.y) > reach) navigator.move(t, threat, speed, dt, s.ticks, reach, undefined, s.troops);
      else { if (isBlocker(t)) t.blockSeconds = (t.blockSeconds ?? 0) + dt; attack(t, threat, dps * (isBlocker(t) ? 1.35 : .8), true); }
      return;
    }
    if (movingOrder) {
      const point = { x: order.x!, y: order.y! };
      t.raidActivity = 'Moving to rally point'; t.targetId = null;
      if (dist(t.x,t.y,point.x,point.y) > 3) { navigator.move(t, point, speed, dt, s.ticks, 2.5, undefined, s.troops); return; }
      arrived.set(t.id, order.serial);
    }
    if (anchor && dist(t.x,t.y,anchor.x,anchor.y) > 5) {
      t.raidActivity = 'Moving to protect hero'; t.targetId = anchor.id;
      navigator.move(t, anchor, speed, dt, s.ticks, 4, undefined, s.troops); return;
    }
    let goal = order?.key === 'focus' ? s.buildings.find(b => b.id === order.targetId && !b.dead) : undefined;
    goal ??= s.buildings.find(b => b.id === t.targetId && !b.dead && b.kind !== 'wall');
    goal ??= nearestBuilding(t.x, t.y, s.buildings, t.special ? undefined : UNIT_PREF[t.unit]) ?? undefined;
    if (!goal) { t.raidActivity = 'Holding position'; return; }
    t.raidActivity = anchor ? 'Protecting hero' : order?.key === 'focus' && goal.id === order.targetId ? 'Pressuring called target' : 'Advancing on a facility';
    if (anchor && dist(t.x,t.y,goal.x,goal.y) > t.range + goal.size * .5 + .02) { t.targetId = anchor.id; return; }
    let target = goal;
    const stop = t.range + target.size * .5;
    if (!laneClear(t, target, s.buildings, target.id)) {
      // Breach an obstructing wall only when no walking route is available.
      if (!navigator.move(t, target, speed, dt, s.ticks, stop, target.id, s.troops)) {
        const wall = s.buildings.filter(b => !b.dead && b.id !== goal.id && laneClear(t, b, s.buildings, b.id)).sort((a,b) => dist(t.x,t.y,a.x,a.y)-dist(t.x,t.y,b.x,b.y))[0];
        if (wall) target = wall;
      } else return;
    }
    t.targetId = target.id;
    if (dist(t.x,t.y,target.x,target.y) > t.range + target.size * .5 + .02) {
      if (!anchor) navigator.move(t, target, speed, dt, s.ticks, t.range + target.size * .5, target.id, s.troops);
      return;
    }
    if (!laneClear(t, target, s.buildings, target.id)) return;
    if ((t.truckT ?? 0) > 0) { t.truckT = 0; feedback.events(applyBuildingYardage(t, target, 100 + t.dps * 2)); }
    attack(t, target, dps, false);
  };
  const guards = (dt: number) => {
    for (const g of s.guards) {
      if (g.dead) continue;
      g.hitFlash = Math.max(0, g.hitFlash - dt); g.rageT = Math.max(0, g.rageT - dt);
      const targets = s.troops.filter(t => !t.dead);
      // A committed block occupies this defender. Several linemen cannot all farm it.
      const blocker = targets.filter(t => isBlocker(t) && t.engagementId === g.id && dist(g.x,g.y,t.x,t.y) <= 3.8 && laneClear(g,t,s.buildings)).sort((a,b)=>dist(g.x,g.y,a.x,a.y)-dist(g.x,g.y,b.x,b.y))[0];
      const prey = blocker ?? targets.sort((a,b) => {
        const score = (t:BTroop) => dist(g.x,g.y,t.x,t.y) * (isPasser(t) ? .78 : 1);
        return score(a)-score(b);
      })[0];
      if (!prey) continue;
      g.targetId = prey.id; g.raidActivity = blocker ? 'Tied up by a blocker' : isPasser(prey) ? 'Rushing the passer' : 'Closing for a tackle';
      if (dist(g.x,g.y,prey.x,prey.y) > 3.2 || !laneClear(g,prey,s.buildings)) {
        navigator.move(g, prey, g.speed * (blocker ? .65 : 1), dt, s.ticks, 3, undefined, s.guards); continue;
      }
      g.attacking = true; g.face = spriteFacing(g.x,g.y,prey.x,prey.y,g.face);
      if ((cooldowns.get(g.id) ?? 0) > 0) continue;
      cooldowns.set(g.id, .75); g.actionPoseT = .28;
      const raw = g.dps * 1.25 * (g.rageT > 0 ? 1.35 : 1) * .75 * (blocker ? 1 : isPasser(prey) ? 1.3 : ['WR','RB'].includes(counterRole(prey)) ? 1.15 : 1);
      const pressure = raw * (blocker ? .65 : 1);
      if (blocker) blocker.protectionDone = (blocker.protectionDone ?? 0) + Math.min(prey.hp, raw) - Math.min(prey.hp, pressure);
      applyTroopPressure(prey, pressure, s.troops); prey.hitFlash = .18;
      feedback.hit(g, prey, pressure, false);
      if (prey.hp <= 0) { prey.hp = 0; prey.dead = true; feedback.playerDown(prey); }
    }
  };
  return { command, troop, guards, step, orderFor, orders,
    get ballInPlay() { return strikes.length > 0; },
    hashState: () => [serial, [...orders], [...arrived], [...cooldowns], strikes],
  };
}
