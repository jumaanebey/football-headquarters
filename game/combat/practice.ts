import type { BattleConfig, BattleResult } from '../../components/BattleScreen';
import { HERO_DEFS, heroForBattle, armyFromRoster } from '../../battle';
import { INITIAL_ROSTER } from '../../constants';
import { rosterPreparation } from './roster';

/** Fresh, owned-state-independent fixtures. No save, account or reward APIs. */
export function heroPracticeConfig(heroKey: string): BattleConfig {
  const hero = HERO_DEFS.find(h => h.key === heroKey) ?? HERO_DEFS[0];
  const partner = HERO_DEFS.find(h => h.key === (hero.key === 'enforcer' ? 'qb' : 'enforcer'))!;
  const squad = structuredClone(INITIAL_ROSTER.filter(p => ['ol1', 'ol2', 'qb1', 'wr1'].includes(p.id)));
  return {
    mode: 'attack', practice: true, title: `${hero.name} · Practice`, attackerName: 'Practice squad',
    heroes: [heroForBattle(hero, 1), heroForBattle(partner, 1)], squad,
    playerArmy: armyFromRoster(squad), preparation: rosterPreparation(squad), specials: [],
    loot: { coins: 0, fans: 0 },
    buildings: [
      { id: 'practice-hq', kind: 'hq', x: 56, y: 42, size: 14, hp: 1500 },
      { id: 'practice-target', kind: 'building', x: 35, y: 57, size: 9, hp: 900 },
      { id: 'practice-jugs', kind: 'defense', x: 63, y: 62, size: 8, hp: 850, damage: 5, range: 23, flavor: 'jugs' },
      { id: 'practice-wall-1', kind: 'wall', x: 44, y: 61, size: 5, hp: 240 },
      { id: 'practice-wall-2', kind: 'wall', x: 49, y: 64, size: 5, hp: 240 },
    ],
  };
}

/** Both result flag and active mode defend the persistence boundary. */
export const isNonProgressionBattle = (result: Pick<BattleResult, 'isReplay' | 'isPractice'>, config: Pick<BattleConfig, 'practice' | 'replay'> | null) =>
  !!(result.isReplay || result.isPractice || config?.practice || config?.replay);

export const canRefundRaidEnergy = (beforeKickoff: boolean | undefined, config: Pick<BattleConfig, 'practice' | 'replay' | 'mode'>) =>
  !!beforeKickoff && config.mode === 'attack' && !config.practice && !config.replay;
