import type { BattleConfig } from './combat/contracts';

/** Recorded and reserved games must use their issued randomness on every client. */
export function battleSeed(config: BattleConfig, randomSeed: () => number) {
  return config.replay?.seed ?? config.authority?.seed ?? randomSeed();
}
