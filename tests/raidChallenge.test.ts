import { describe, it, expect } from 'vitest';
import { generateRaidTargets, mulberry32, hashDefenseFlavor, type ReplayData } from '../battle';
import { createInitialState } from '../game/initialState';
import { authorityRoadTargets, issueMatch, verifyMatch } from '../game/authority/matches';
import { playHeadlessMatch } from '../game/authority/headlessMatch';
import { createBattleEngine, replayMatch } from '../game/combat/engine';
import { COMBAT_RULES_VERSION } from '../game/combat/actions';
import { scoutRaid } from '../game/raidScouting';
import coachedFortress from './fixtures/coached-fortress.json';
import oldFortress from './fixtures/pre-challenge-fortress.json';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const now = 1_789_143_000_000;
describe('road challenge issuance', () => {
  it('preserves a pre-release fortress film with its original buildings, rewards and hash', () => {
    expect(oldFortress.rules).toBe(COMBAT_RULES_VERSION);
    expect(replayMatch(oldFortress as ReplayData).matches).toBe(true);
  });
  it('reproduces the coached top-tier fortress film', () => {
    const replayed = replayMatch(coachedFortress as ReplayData);
    expect(replayed.matches).toBe(true);
    expect(replayed.result).toMatchObject({won:true,pct:62,stars:1});
  });
  it('keeps daily offers deterministic and their strength independent of team upgrades', () => {
    const state = createInitialState(now); state.trophies = 1800;
    const before = authorityRoadTargets(state, owner, now);
    state.roster = state.roster.map(p => ({ ...p, stats: { strength: 80, speed: 80, iq: 80 } }));
    expect(authorityRoadTargets(state, owner, now)).toEqual(before);
    expect(before.map(b => b.challenge)).toEqual(['open', 'contested', 'fortress']);
    expect(before[2].reward.coins).toBeGreaterThan(before[1].reward.coins);
  });
  it('makes fortresses grow and introduces power equipment only at the advertised threshold', () => {
    let hp = 0;
    for (const trophies of [0, 150, 450, 1000, 1799, 1800]) {
      const targets = generateRaidTargets(trophies, mulberry32(77));
      const fortress = targets[2];
      const next = fortress.buildings.reduce((sum,b) => sum+b.hp,0);
      expect(next).toBeGreaterThan(hp); hp = next;
      const report = scoutRaid(fortress.buildings);
      expect(report.powerMoves).toBe(trophies < 1800 ? 0 : report.equipment);
      expect(targets.slice(0,2).every(t => scoutRaid(t.buildings).powerMoves === 0)).toBe(true);
      expect(report.lanes).toHaveLength(4);
      expect(report.lighterApproaches.length).toBeGreaterThan(0);
    }
  });
  it('reserves the advertised fortress, then verifies its immutable snapshot after daily offers change', () => {
    const state = createInitialState(now); state.trophies = 1800;
    const offered = authorityRoadTargets(state, owner, now)[2];
    const {match} = issueMatch({state,owner,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',seed:771,now,choice:{kind:'road',choice:2,rules:COMBAT_RULES_VERSION}});
    expect(match.config.buildings).toEqual(offered.buildings);
    expect(match.config.loot).toEqual(offered.reward);
    expect(match.config.roadChallenge).toBe('fortress');
    const played = playHeadlessMatch(match.config, match.seed, 'balanced', true);
    state.trophies = 2500;
    expect(authorityRoadTargets(state,owner,now+86_400_000)[2].buildings).not.toEqual(match.config.buildings);
    const verified = verifyMatch(match, played.submission, now+played.submission.ticks*50+500);
    expect(verified.replay.finalHash).toBe(played.engine.hash);
    expect(verified.result.pct).toBe(played.result.pct);
  });
  it('scouting equipment matches the engine fallback for every generated defense', () => {
    for (const target of generateRaidTargets(1800,mulberry32(77))) {
      const engine = createBattleEngine({mode:'attack',title:'Equipment parity',buildings:target.buildings,loot:target.reward},771);
      for (const b of target.buildings.filter(b=>b.kind==='defense')) {
        expect(b.flavor ?? hashDefenseFlavor(b.id) ?? 'jugs').toBe(engine.state.buildings.find(x=>x.id===b.id)!.flavor ?? 'jugs');
      }
    }
  });
  it('does not promise a clear lane through blocking facilities', () => {
    const report = scoutRaid([{id:'d',kind:'defense',x:50,y:50,hp:100,size:5,range:50}, {id:'w',kind:'wall',x:32,y:50,hp:100,size:12}]);
    expect(report.lanes.find(l=>l.label==='West')!.coverage).toBeLessThan(report.lanes.find(l=>l.label==='East')!.coverage);
  });
});
