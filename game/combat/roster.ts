import { UnitGroup, type Player } from '../../types';
import { TENDENCIES, type TendencyKey } from '../../constants';
import { unitCombatStats, type BTroop } from '../../battle';

/** Group preparation is separate from each player's own rarity, level and trained stats. */
export function rosterPreparation(roster: Player[], readiness = 0): Record<UnitGroup, number> {
  return Object.fromEntries(Object.values(UnitGroup).map(unit => {
    const bonus = roster.filter(p => p.unit === unit).reduce((sum, p) => {
      const side = TENDENCIES[p.tendency as TendencyKey]?.side;
      return sum + (side === 'offense' ? 0.06 : side === 'balanced' ? 0.03 : 0);
    }, 0);
    return [unit, (1 + bonus) * (readiness >= 100 ? 1.15 : 1)];
  })) as Record<UnitGroup, number>;
}

export function rosterTroop(player: Player, id: string, x: number, y: number, boost = 1, jersey = 1): BTroop {
  const stats = unitCombatStats(player);
  const hp = Math.round(stats.hp * boost);
  return { id, unit: player.unit, x, y, hp, maxHp: hp, dps: stats.dps * boost, speed: stats.speed, range: stats.range,
    chargeRate: stats.chargeRate, role: player.role, nameTag: player.name,
    targetId: null, dead: false, hitFlash: 0, rageT: 0, healT: 0, jersey };
}

/** IQ is route awareness for ordinary players: stronger awareness refreshes a stale route sooner. */
export const routeRefreshSeconds = (actor: Pick<BTroop, 'chargeRate'>) => 1.1 / Math.max(0.6, actor.chargeRate ?? 1);
