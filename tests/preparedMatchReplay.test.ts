import { describe, it, expect } from 'vitest';
import { createInitialState } from '../game/initialState';
import { issueMatch, verifyMatch } from '../game/authority/matches';
import { createBattleEngine, replayMatch } from '../game/combat/engine';

describe('prepared match playback', () => {
  it.each(['air', 'ground', 'balanced'])('verifies a selected %s plan and an Enforcer opening', plan => {
    const now = 1800000000000;
    const { match } = issueMatch({ state: createInitialState(), owner:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', seed: 71, now, choice:{kind:'campaign',stage:1} });
    const engine = createBattleEngine(match.config, match.seed);
    engine.setPlan(plan);
    expect(engine.command({k:'h',key:'enforcer',x:20,y:80,tick:0})).toBe(true);
    for(let i=0;i<1400&&!engine.state.ended;i++) {
      if (i===10) engine.command({k:'a',key:'enforcer',tick:engine.state.ticks});
      if (i===30) engine.command({k:'h',key:'qb',x:20,y:80,tick:engine.state.ticks});
      if (i===40) engine.command({k:'a',key:'qb',tick:engine.state.ticks});
      engine.advance();
    }
    const film=engine.getReplay();
    expect(replayMatch(film).matches).toBe(true);
    expect(() => verifyMatch(match,{plan:film.plan,script:film.script,ticks:film.ticks,finalHash:film.finalHash},now+70000)).not.toThrow();
  });
});
