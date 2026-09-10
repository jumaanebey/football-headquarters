// Regenerates tests/fixtures/determinism-corpus.json. Run only with a deliberate rules change:
//   npm run determinism:corpus
import { writeFileSync } from 'node:fs';
import { runMatchCorpus } from '../game/authority/matchCorpus';
import { COMBAT_RULES_VERSION } from '../game/combat/actions';
const matches: Record<string, unknown> = {};
for (const o of runMatchCorpus()) matches[o.id] = { hash: o.headlessHash, stars: o.stars, pct: o.pct, ticks: o.ticks };
writeFileSync(new URL('../tests/fixtures/determinism-corpus.json', import.meta.url), JSON.stringify({ rules: COMBAT_RULES_VERSION, note: 'Fixed match corpus (game/authority/matchCorpus.ts). Regenerate only with a deliberate rules change.', matches }, null, 2) + '\n');
console.log(JSON.stringify(matches));
