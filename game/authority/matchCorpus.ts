// A fixed, self-contained corpus of matches used to prove that every execution path (headless
// engine, recorded-film replay, the authority's verification path, and the browser runtime)
// reaches the same result and gameplay hash. Everything here is deterministic: seeded configs,
// seeded bot, no wall clock. Presentation randomness is derived from a separate stream inside
// the engine and never enters the hash.
import { createInitialState } from '../initialState';
import { campaignBase, coachForStage, CAMPAIGN_STAGES } from '../../campaign';
import { armyFromRoster, armyStrength, generateRaidTargets, gauntletWaves, heroesForBattle, mulberry32, specialsForBattle } from '../../battle';
import { rosterPreparation } from '../combat/roster';
import { createDefenseSnapshot, defenseBattleFields } from '../defenseSnapshot';
import { COMBAT_RULES_VERSION } from '../combat/actions';
import { playHeadlessMatch } from './headlessMatch';
import { replayMatch } from '../combat/engine';
import { validateReplay } from '../combat/replay';
import type { BattleConfig } from '../combat/contracts';
import { BuildingType, type GameState } from '../../types';

export interface CorpusMatch { id: string; seed: number; plan: string; config: BattleConfig }

const attacker = (): GameState => {
  const s = createInitialState(1_700_000_000_000);
  s.teamName = 'Corpus Attackers';
  s.resources.FANS = 1500;
  s.heroes = s.heroes.map(h => h.key === 'qb' ? { ...h, level: 4, stars: 2 } : h);
  return s;
};
const defender = (): GameState => {
  const s = createInitialState(1_700_000_000_000);
  s.teamName = 'Corpus Defenders';
  s.buildings = s.buildings.map(b => b.type === BuildingType.STADIUM ? { ...b, level: 3 } : b);
  s.defenseSlots = { D1: 3, D3: 2, D2: 1 };
  s.heroGates = { south: 'kicker' };
  s.resources.FANS = 2500;
  s.parkingLot = 1;
  s.formationMastery = { goalline: 4 };
  return s;
};
const common = (s: GameState) => {
  const power = armyStrength(s.roster);
  return { attackerName: s.teamName, squad: structuredClone(s.roster), playerArmy: armyFromRoster(s.roster), power, preparation: rosterPreparation(s.roster, s.teamReadiness), heroes: heroesForBattle(s.heroes), specials: specialsForBattle(s.resources.FANS) };
};

/** Eight matches: three Season stages, two seeded road targets, two rival raids on a snapshot, one Gauntlet night. */
export function buildMatchCorpus(): CorpusMatch[] {
  const a = attacker(), d = defender();
  const base = common(a);
  const corpus: CorpusMatch[] = [];
  for (const stage of [1, 4, 7]) {
    const st = CAMPAIGN_STAGES[stage - 1], b = campaignBase(stage);
    corpus.push({ id: `campaign-${stage}`, seed: 1000 + stage, plan: stage === 4 ? 'air' : 'balanced', config: { ...base, mode: 'attack', title: `${st.name} — ${st.opponent}`, buildings: b.buildings, loot: b.reward, campaignStage: stage, rival: coachForStage(stage) } });
  }
  const targets = generateRaidTargets(450, mulberry32(77));
  targets.slice(0, 2).forEach((t, i) => corpus.push({ id: `road-${i}`, seed: 2000 + i, plan: i ? 'ground' : 'balanced', config: { ...base, mode: 'attack', title: `Attacking ${t.name}`, buildings: t.buildings, loot: t.reward } }));
  const snapshot = createDefenseSnapshot(d);
  for (const [i, plan] of ['balanced', 'air'].entries()) corpus.push({ id: `rival-${i}`, seed: 3000 + i, plan, config: { ...base, ...defenseBattleFields(snapshot), mode: 'attack', title: `Raiding ${d.teamName}`, loot: { coins: 500, fans: 25 }, pvpTarget: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } });
  corpus.push({ id: 'gauntlet-1', seed: 4000, plan: 'balanced', config: { ...defenseBattleFields(createDefenseSnapshot(d)), mode: 'defense', title: 'The Gauntlet — Night 1', gauntlet: { tier: 1, waves: gauntletWaves(1) }, loot: { coins: 0, fans: 0 } } });
  return corpus.map(m => ({ ...m, config: JSON.parse(JSON.stringify({ ...m.config, authority: { matchId: '00000000-0000-4000-8000-000000000001', seed: m.seed, rules: COMBAT_RULES_VERSION, issuedAt: 1_700_000_000_000, expiresAt: 1_700_000_900_000 } })) }));
}

export interface CorpusOutcome { id: string; headlessHash: string; replayHash: string; stars: number; pct: number; ticks: number; commands: number; replayMatches: boolean }

/** Runs the corpus through the headless engine and through recorded-film replay on this runtime. */
export function runMatchCorpus(corpus = buildMatchCorpus()): CorpusOutcome[] {
  return corpus.map(m => {
    const played = playHeadlessMatch(m.config, m.seed, m.plan);
    const film = validateReplay(played.engine.getReplay());
    if (!film) throw new Error(`corpus ${m.id}: recording failed validation`);
    const replayed = replayMatch(film);
    return { id: m.id, headlessHash: played.engine.hash, replayHash: replayed.hash, stars: played.result.stars, pct: played.result.pct, ticks: played.submission.ticks, commands: played.submission.script.length, replayMatches: replayed.matches };
  });
}
