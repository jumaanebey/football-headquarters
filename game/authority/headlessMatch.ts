// Deterministic headless bot that plays an issued match on the shared engine and packages
// the film the authority verifies (`match.finish` submission). Used by acceptance tests and
// the live evidence script; it is a transparent policy, not a competitive player.
import { UNIT_ORDER, type ReplayAction } from '../../battle';
import type { BattleConfig, BattleResult } from '../combat/contracts';
import { createBattleEngine, type BattleEngine } from '../combat/engine';
import type { MatchSubmission } from './matches';

const MAX_TICKS = 1400;
// Legal deployment ring: coordinates stay inside the 2..98 bound and start on the open apron.
const RING: [number, number][] = Array.from({ length: 24 }, (_, i) => {
  const t = i / 24 * Math.PI * 2;
  const px = 50 + Math.cos(t) * 46, py = 50 + Math.sin(t) * 46;
  const m = Math.max(Math.abs(px - 50), Math.abs(py - 50));
  return [Math.round(50 + (px - 50) / m * 45), Math.round(50 + (py - 50) / m * 45)];
});
const deploy = (engine: BattleEngine, action: Omit<ReplayAction, 'tick' | 'x' | 'y'>, slot: number): boolean => {
  for (let offset = 0; offset < RING.length; offset++) {
    const [x, y] = RING[(slot + offset) % RING.length];
    if (engine.command({ ...action, tick: engine.state.ticks, x, y })) return true;
  }
  return false;
};

export interface HeadlessMatch { submission: MatchSubmission; result: BattleResult; engine: BattleEngine }

/** Plays `config` from kickoff to the whistle with every player and hero deployed at once. */
export function playHeadlessMatch(config: BattleConfig, seed: number, plan = 'balanced'): HeadlessMatch {
  const engine = createBattleEngine(config, seed, plan);
  if (config.mode === 'attack') {
    let slot = 0;
    for (const unit of UNIT_ORDER) for (const player of [...(config.squad ?? [])].filter(p => p.unit === unit).sort((a, b) => a.id.localeCompare(b.id))) { deploy(engine, { k: 't', u: unit }, slot); slot += 3; }
    for (const hero of config.heroes ?? []) { deploy(engine, { k: 'h', key: hero.key }, slot); slot += 3; }
  }
  for (let tick = 0; tick < MAX_TICKS && !engine.state.ended; tick++) {
    if (config.mode === 'attack' && engine.state.ticks % 10 === 0) {
      for (const hero of config.heroes ?? []) {
        const actor = engine.state.troops.find(t => t.heroKey === hero.key);
        if (actor && !actor.dead && !actor.activeAction && (actor.abilityCd ?? 0) <= 0) engine.command({ k: 'a', key: hero.key, tick: engine.state.ticks });
      }
    }
    engine.advance();
    engine.drainAudio();
  }
  if (!engine.state.ended) engine.finish();
  if (!engine.result) throw new Error(`Headless match did not produce a result: ${config.title}`);
  const film = engine.getReplay();
  return { submission: { plan: film.plan, script: film.script, ticks: film.ticks!, finalHash: film.finalHash! }, result: engine.result, engine };
}
