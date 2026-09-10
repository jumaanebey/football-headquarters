// Runtime-neutral entry bundled for both Node and the browser by scripts/determinism-browser.mjs.
import { runMatchCorpus } from '../game/authority/matchCorpus';
import { COMBAT_RULES_VERSION } from '../game/combat/actions';

export function runCorpusForRuntime() {
  const matches: Record<string, { hash: string; replayHash: string; stars: number; pct: number; ticks: number; commands: number }> = {};
  for (const o of runMatchCorpus()) matches[o.id] = { hash: o.headlessHash, replayHash: o.replayHash, stars: o.stars, pct: o.pct, ticks: o.ticks, commands: o.commands };
  return { rules: COMBAT_RULES_VERSION, matches };
}
