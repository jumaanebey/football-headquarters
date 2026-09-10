import type { BBuilding, BTroop } from '../../battle';
import { ABILITY_CD, dist, nearestBuilding } from '../../battle';
import { signatureFrameAt } from './actionTiming';

export const COMBAT_RULES_VERSION = 'defense-counters-4';
export type HeroAction = {
  id: string; actorId: string; heroKey: string; ability: NonNullable<BTroop['ability']>;
  elapsed: number; windup: number; travel: number; recovery: number; released: boolean; resolved: boolean;
  sx: number; sy: number; tx: number; ty: number; targetId?: string;
};
export type CombatEvent =
  | { type: 'yardage'; actorId: string; targetId: string; amount: number; x: number; y: number }
  | { type: 'sacked'; actorId: string; targetId: string; kind: BBuilding['kind']; x: number; y: number }
  | { type: 'signature-release' | 'signature-impact'; actorId: string; heroKey: string; ability: HeroAction['ability']; x: number; y: number }
  | { type: 'recovery'; actorId: string; targetId: string; amount: number; x: number; y: number }
  | { type: 'reinforcements'; actorId: string; x: number; y: number };

/** One accounting boundary for every facility hit, including signature plays. */
export function applyBuildingYardage(actor: BTroop, target: BBuilding, requested: number): CombatEvent[] {
  if (target.dead || !Number.isFinite(requested) || requested <= 0) return [];
  const amount = Math.min(Math.max(0, target.hp), requested);
  target.hp = Math.max(0, target.hp - amount);
  actor.dmg = (actor.dmg ?? 0) + amount;
  const events: CombatEvent[] = [{ type: 'yardage', actorId: actor.id, targetId: target.id, amount, x: target.x, y: target.y }];
  if (target.hp <= 0) {
    target.dead = true;
    actor.targetId = null;
    events.push({ type: 'sacked', actorId: actor.id, targetId: target.id, kind: target.kind, x: target.x, y: target.y });
  }
  return events;
}

/** Commands start an action; they never apply a projectile's result ahead of contact. */
export function beginHeroAction(actor: BTroop, buildings: BBuilding[], tick: number): HeroAction | null {
  if (actor.dead || !actor.ability || (actor.abilityCd ?? 0) > 0 || actor.activeAction) return null;
  const projectile = actor.ability === 'hailmary' || actor.ability === 'onside_bomb';
  const target = projectile || actor.ability === 'burner_dash' || actor.ability === 'truckstick' ? nearestBuilding(actor.x, actor.y, buildings) : undefined;
  if ((projectile || actor.ability === 'burner_dash') && !target) return null;
  const action: HeroAction = {
    id: `${actor.id}:signature:${tick}`, actorId: actor.id, heroKey: actor.heroKey ?? '', ability: actor.ability,
    elapsed: 0, windup: projectile ? 0.35 : 0.2,
    travel: projectile && target ? Math.max(0.45, Math.min(0.85, dist(actor.x, actor.y, target.x, target.y) / 65)) : 0,
    recovery: projectile ? 0.3 : 0.25, released: false, resolved: false,
    sx: actor.x, sy: actor.y, tx: target?.x ?? actor.x, ty: target?.y ?? actor.y, targetId: target?.id,
  };
  actor.activeAction = action.id;
  actor.signatureFrame = 0;
  actor.abilityCd = ABILITY_CD;
  actor.abilityPoseT = 0; // windup holds the planted stance; contact pose starts at release
  return action;
}

export function recover(actor: BTroop, target: BTroop, amount: number, events: CombatEvent[] = []) {
  if (target.dead || !Number.isFinite(amount) || amount <= 0) return;
  const actual = Math.min(Math.max(0, target.maxHp - target.hp), amount);
  if (actual <= 0) return;
  target.hp += actual;
  actor.healingDone = (actor.healingDone ?? 0) + actual;
  events.push({ type: 'recovery', actorId: actor.id, targetId: target.id, amount: actual, x: target.x, y: target.y });
}

/** Actual prevented pressure, capped at the grit the target still has. */
export function applyTroopPressure(target: BTroop, raw: number, troops: BTroop[]): number {
  if (target.dead || !Number.isFinite(raw) || raw <= 0) return 0;
  const shield = (target.shieldT ?? 0) > 0;
  const amount = Math.min(target.hp, raw * (shield ? 0.5 : 1));
  if (shield && target.shieldSource) {
    const source = troops.find(t => t.id === target.shieldSource);
    if (source) source.protectionDone = (source.protectionDone ?? 0) + Math.max(0, Math.min(target.hp, raw) - amount);
  }
  target.hp = Math.max(0, target.hp - amount);
  return amount;
}

/** Pure fixed-step action timeline. Rendering and sound consume the returned events. */
export function stepHeroActions(actions: HeroAction[], troops: BTroop[], buildings: BBuilding[], dt: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (const action of actions) {
    const actor = troops.find(t => t.id === action.actorId);
    if (!actor) { action.elapsed = 99; continue; }
    // A released ball remains in play if the passer is subbed out. An interrupted windup does not.
    if (actor.dead && !action.released) { actor.activeAction = undefined; actor.signatureFrame = undefined; action.elapsed = 99; continue; }
    action.elapsed += dt;
    actor.signatureFrame = actor.dead ? undefined : signatureFrameAt(action.elapsed, action.windup, action.recovery);
    if (!action.released && action.elapsed + 1e-9 >= action.windup) {
      action.released = true;
      if (!actor.dead) actor.actionPoseT = action.recovery;
      events.push({ type: 'signature-release', actorId: actor.id, heroKey: action.heroKey, ability: action.ability, x: action.sx, y: action.sy });
    }
    if (!action.resolved && action.elapsed + 1e-9 >= action.windup + action.travel) {
      action.resolved = true;
      const target = buildings.find(b => b.id === action.targetId);
      if (action.ability === 'hailmary' && target) events.push(...applyBuildingYardage(actor, target, 300 + actor.dps * 4));
      else if (action.ability === 'onside_bomb' && target) {
        events.push(...applyBuildingYardage(actor, target, 500));
        for (const b of buildings) if (b.id !== target.id && dist(target.x, target.y, b.x, b.y) <= 12) events.push(...applyBuildingYardage(actor, b, 250));
      } else if (action.ability === 'truckstick') {
        actor.rageT = 6; actor.truckT = 1.8; recover(actor, actor, actor.maxHp, events);
      } else if (action.ability === 'burner_dash') {
        // Keep normal wall-aware pathing; increased speed creates a continuous jet sweep.
        actor.sprintT = 2.5; actor.rageT = 2.5;
      } else if (action.ability === 'trick_play') events.push({ type: 'reinforcements', actorId: actor.id, x: actor.x, y: actor.y });
      else for (const t of troops) {
        if (t.dead) continue;
        const distance = dist(actor.x, actor.y, t.x, t.y);
        if (action.ability === 'motivation' && distance <= 20) t.rageT = Math.max(t.rageT, 4);
        if (action.ability === 'field_medic' && distance <= 18) { recover(actor, t, t.maxHp * 0.35, events); t.healT = Math.max(t.healT, 5); t.healingSource = actor.id; }
        if (action.ability === 'shield_wall' && distance <= 16) { t.shieldT = Math.max(t.shieldT ?? 0, 5); t.shieldSource = actor.id; }
        if (action.ability === 'hall_of_fame') { t.rageT = Math.max(t.rageT, 6); recover(actor, t, t.maxHp, events); }
      }
      events.push({ type: 'signature-impact', actorId: actor.id, heroKey: action.heroKey, ability: action.ability, x: action.tx, y: action.ty });
    }
    if (action.elapsed + 1e-9 >= action.windup + action.recovery) actor.activeAction = undefined;
  }
  return events;
}

export const actionFinished = (action: HeroAction) => action.elapsed + 1e-9 >= action.windup + action.travel + action.recovery;
export const actionFlight = (action: HeroAction) => Math.max(0, Math.min(1, (action.elapsed - action.windup) / Math.max(0.001, action.travel)));
