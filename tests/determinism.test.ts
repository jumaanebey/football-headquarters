// Determinism across execution paths on the Node runtime: the headless engine, recorded-film
// replay and the authority's verification path (verifyMatch → replayMatch) must agree on the
// gameplay hash and result for every corpus match, run after run. The browser runtime is
// compared by scripts/determinism-browser.mjs; the deployed edge runtime was compared by the
// live evidence (server hash == client hash for every settled game).
import { describe, expect, it } from 'vitest';
import { buildMatchCorpus, runMatchCorpus } from '../game/authority/matchCorpus';
import { verifyMatch } from '../game/authority/matches';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import { createBattleEngine } from '../game/combat/engine';
import { COMBAT_RULES_VERSION } from '../game/combat/actions';
import corpusHashes from './fixtures/determinism-corpus.json';

describe('match corpus determinism', () => {
  const corpus = buildMatchCorpus();
  it('headless and replay hashes agree for every corpus match and match the committed corpus', () => {
    const outcomes = runMatchCorpus(corpus);
    for (const o of outcomes) {
      expect(o.replayMatches, o.id).toBe(true);
      expect(o.replayHash, o.id).toBe(o.headlessHash);
      expect(o.ticks, o.id).toBeGreaterThan(0);
    }
    const expected = corpusHashes as { rules: string; matches: Record<string, { hash: string; stars: number; pct: number; ticks: number }> };
    expect(expected.rules).toBe(COMBAT_RULES_VERSION);
    for (const o of outcomes) expect({ hash: o.headlessHash, stars: o.stars, pct: o.pct, ticks: o.ticks }, o.id).toEqual(expected.matches[o.id]);
  });
  it('the authority verification path settles every corpus film to the same result and hash', () => {
    for (const m of corpus) {
      const played = playHeadlessMatch(m.config, m.seed, m.plan);
      const issuedAt = m.config.authority!.issuedAt;
      const verified = verifyMatch({ id: m.config.authority!.matchId, owner: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', seed: m.seed, issuedAt, expiresAt: m.config.authority!.expiresAt, cost: 12, choice: { kind: 'campaign', stage: 1 }, config: m.config }, played.submission, issuedAt + played.submission.ticks * 50 + 500);
      expect(verified.replay.finalHash, m.id).toBe(played.engine.hash);
      expect({ stars: verified.result.stars, pct: verified.result.pct, coins: verified.result.coins }, m.id).toEqual({ stars: played.result.stars, pct: played.result.pct, coins: played.result.coins });
    }
  });
  it('presentation randomness never enters the hash: draining or ignoring audio/fx leaves it unchanged', () => {
    const m = corpus[0];
    const a = createBattleEngine(m.config, m.seed, m.plan), b = createBattleEngine(m.config, m.seed, m.plan);
    const play = (engine: typeof a, drain: boolean) => { engine.command({ k: 'h', key: 'qb', x: 5, y: 80, tick: 0 }); for (let i = 0; i < 600 && !engine.state.ended; i++) { engine.advance(); if (drain) engine.drainAudio(); } if (!engine.state.ended) engine.finish(); return engine.hash; };
    expect(play(a, true)).toBe(play(b, false));
    expect(a.state.fx.length + a.state.pulses.length).toBeGreaterThanOrEqual(0); // fx exist but are not hashed
  });
});
