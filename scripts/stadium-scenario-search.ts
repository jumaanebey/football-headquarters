// Search for deterministic Stadium scenarios that cover the acceptance checklist, and print them
// as fixture entries. Run once when the checklist changes; the results are committed in
// tests/fixtures/stadiumScenarios.ts and re-verified by the acceptance tests on every run.
//   npm run stadium:search -- [--targets kick-made,tie,...]
import { footballCalls, type StadiumFootballGame } from '../game/stadiumFootball';
import { runScenario, type ClubPreset, type ScenarioStep } from '../tests/fixtures/stadiumHarness';

const PRESETS: ClubPreset[] = ['starter', 'strong', 'weak'];
const ROLLS = [0.0005, 0.02, 0.12, 0.3, 0.45, 0.6, 0.75, 0.88, 0.97];
const STARTS = Array.from({ length: 40 }, (_, i) => (i + 1) / 41);

/** Tags a completed run covers, read from the finished game. */
function tagsOf(final: StadiumFootballGame): Set<string> {
  const tags = new Set<string>();
  tags.add(final.receivesFirst === 'home' ? 'receive-first-home' : 'receive-first-away');
  tags.add(final.home > final.away ? 'outcome-win' : final.home === final.away ? 'outcome-tie' : 'outcome-loss');
  for (const e of final.events) {
    if (e.direction === 1) tags.add('direction-home'); if (e.direction === -1) tags.add('direction-away');
    if (e.phase === 'return' && e.action === 'touchdown') tags.add('return-touchdown');
    else if (e.action === 'return') tags.add('kickoff-return');
    if (e.action === 'kick') tags.add('kickoff-coverage');
    if (e.action === 'run') tags.add('run-power');
    if (e.action === 'pass' && e.play === 'slants') tags.add('pass-short');
    if (e.action === 'pass' && e.play === 'verticals') tags.add('pass-deep');
    if (e.action === 'pass' && e.play === 'flood') tags.add('pass-intermediate');
    if (e.call === 'zone') tags.add('defense-zone');
    if (e.call === 'man') tags.add('defense-man');
    if (e.call === 'stack') tags.add('defense-run');
    if (e.action === 'field-goal') tags.add((e.scored ?? 0) === 3 ? 'kick-made' : 'kick-missed');
    if (e.action === 'conversion' && e.call === 'extra-point') tags.add((e.scored ?? 0) === 1 ? 'extra-point-made' : 'extra-point-missed');
    if (e.action === 'conversion' && e.call === 'two-point') tags.add((e.scored ?? 0) === 2 ? 'two-point-made' : 'two-point-missed');
    if (e.action === 'touchdown' && e.phase === 'offense') tags.add('touchdown-offense');
    if (e.action === 'touchdown' && e.phase === 'finish') tags.add('touchdown-finish');
    if (e.action === 'stop' && (e.yards ?? 0) === 0) tags.add('stop-no-gain');
  }
  // A possession whose touchdown ended the game with no conversion event after it.
  const last = final.events[final.events.length - 1];
  if (last && last.action === 'touchdown' && final.phase === 'final') tags.add('conversion-skipped');
  return tags;
}

/** Sampled playthroughs: at each pending decision pick a legal call and a roll at random from a
 *  seeded generator. Sampling covers the space far better than a truncated depth-first walk, and
 *  the generator is seeded so the search itself is reproducible. */
function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function explore(preset: ClubPreset, startRandom: number, samples = 240): { steps: ScenarioStep[]; final: StadiumFootballGame }[] {
  const rng = mulberry(Math.round(startRandom * 1e6) + preset.length * 7919);
  const results: { steps: ScenarioStep[]; final: StadiumFootballGame }[] = [];
  for (let sample = 0; sample < samples; sample++) {
    const steps: ScenarioStep[] = [];
    for (let depth = 0; depth < 10; depth++) {
      let run;
      try { run = runScenario({ preset, opponent: 'harbor', startRandom, steps }); } catch { break; }
      if (run.final.phase === 'final') { results.push({ steps: [...steps], final: run.final }); break; }
      const legal = footballCalls(run.final).map(c => c.key);
      steps.push({ call: legal[Math.floor(rng() * legal.length)], roll: ROLLS[Math.floor(rng() * ROLLS.length)] });
    }
  }
  return results;
}

const wanted = (process.argv.includes('--targets') ? process.argv[process.argv.indexOf('--targets') + 1].split(',') : [
  'receive-first-home', 'receive-first-away', 'direction-home', 'direction-away', 'kickoff-return', 'return-touchdown', 'kickoff-coverage',
  'run-power', 'pass-short', 'pass-deep', 'pass-intermediate', 'defense-zone', 'defense-man', 'defense-run',
  'kick-made', 'kick-missed', 'extra-point-made', 'extra-point-missed', 'two-point-made', 'two-point-missed',
  'touchdown-offense', 'touchdown-finish', 'stop-no-gain', 'outcome-win', 'outcome-loss', 'outcome-tie', 'conversion-skipped',
]);

const chosen: { id: string; preset: ClubPreset; startRandom: number; steps: ScenarioStep[]; tags: string[] }[] = [];
const covered = new Set<string>();
outer: for (const preset of PRESETS) {
  for (const startRandom of STARTS) {
    if (wanted.every(t => covered.has(t))) break outer;
    for (const candidate of explore(preset, startRandom)) {
      const tags = tagsOf(candidate.final);
      const gained = wanted.filter(t => tags.has(t) && !covered.has(t));
      if (!gained.length) continue;
      gained.forEach(t => covered.add(t));
      chosen.push({ id: `${preset}-${String(startRandom).slice(2, 6)}-${chosen.length}`, preset, startRandom, steps: candidate.steps, tags: [...tags].sort() });
      if (wanted.every(t => covered.has(t))) break outer;
    }
  }
}
console.log(`covered ${covered.size}/${wanted.length} tags with ${chosen.length} scenarios`);
const missing = wanted.filter(t => !covered.has(t));
if (missing.length) console.log(`NOT REACHED: ${missing.join(', ')}`);
for (const s of chosen) {
  const run = runScenario({ preset: s.preset, opponent: 'harbor', startRandom: s.startRandom, steps: s.steps });
  console.log(JSON.stringify({ id: s.id, preset: s.preset, startRandom: s.startRandom, steps: s.steps, tags: s.tags,
    expect: { receivesFirst: run.final.receivesFirst, home: run.final.home, away: run.final.away, reward: run.final.reward,
      actions: run.final.events.map(e => e.action), scores: run.final.events.map(e => e.scored ?? 0) } }));
}
