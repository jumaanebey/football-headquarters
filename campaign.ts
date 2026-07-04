import { EnemyBase, BattleBuildingDef, ENEMY_BASES, HERO_DEFS } from './battle';

// --- SEASON CAMPAIGN: a 12-game ladder from preseason scrubs to the Championship. ---
// The Castle Clash "dungeon" spine: each stage is 3-Game-Ball-rateable, first clears pay
// gems + hero shards (feeding star-ups), and beating a stage unlocks the next. Stages are
// DETERMINISTIC (no RNG) so a loss is a puzzle to solve with a better roster/heroes, not a
// dice re-roll.

export interface CampaignStage {
  stage: number;
  name: string;
  opponent: string;
  mult: number;                              // difficulty multiplier on the template base
  reward: { coins: number; fans: number };   // loot (every run, scaled by destruction)
  firstClear: { gems: number; shardHero: string; shards: number }; // one-time bounty
}

const SCHEDULE: [string, string][] = [
  ['Preseason Opener', 'Dust Bowl Prospects'],
  ['Week 2', 'Valley State'],
  ['Week 3', 'Harbor Hawks'],
  ['Week 4', 'Tech University'],
  ['Week 5', 'Prairie Pumas'],
  ['Midseason Clash', 'North Sharks'],
  ['Week 7', 'Bayou Bandits'],
  ['Week 8', 'Iron City'],
  ['Week 9', 'Metro Mustangs'],
  ['Divisional Round', 'Golden Knights'],
  ['Conference Final', 'Crimson Empire'],
  ['THE CHAMPIONSHIP', 'The Dynasty'],
];

export const CAMPAIGN_STAGES: CampaignStage[] = SCHEDULE.map(([name, opponent], i) => {
  const stage = i + 1;
  const mult = Math.round((0.55 + i * 0.22) * 100) / 100; // 0.55 → 2.97
  return {
    stage, name, opponent, mult,
    reward: { coins: Math.round(300 + 260 * mult), fans: Math.round(10 + 14 * mult) },
    firstClear: {
      gems: 6 + stage * 2,                                    // 8 → 30 gems across the season
      shardHero: HERO_DEFS[i % HERO_DEFS.length].key,          // every hero gets fed across 12 weeks
      shards: 8 + stage * 2,
    },
  };
});

/** Build the deterministic battle layout for a stage: scaled template + extra defenses late. */
export const campaignBase = (stage: number): EnemyBase => {
  const st = CAMPAIGN_STAGES[stage - 1];
  const template = ENEMY_BASES[(stage - 1) % ENEMY_BASES.length];
  const buildings: BattleBuildingDef[] = template.buildings.map(b => ({
    ...b,
    hp: Math.round(b.hp * st.mult),
    damage: b.damage ? Math.round(b.damage * st.mult) : b.damage,
  }));
  // Late-season teams field extra coverage — more turrets, not just bigger HP bars.
  if (stage >= 5) buildings.push({ id: 'cd1', kind: 'defense', x: 30, y: 50, hp: Math.round(230 * st.mult), size: 5, damage: Math.round(16 * st.mult), range: 23 });
  if (stage >= 9) buildings.push({ id: 'cd2', kind: 'defense', x: 70, y: 50, hp: Math.round(230 * st.mult), size: 5, damage: Math.round(16 * st.mult), range: 23 });
  return { id: `camp_${stage}`, name: st.opponent, difficulty: st.mult, reward: st.reward, buildings };
};
