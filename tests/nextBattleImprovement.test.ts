import {describe,it,expect} from 'vitest';
import {nextBattleImprovement} from '../game/battleDebrief';
describe('result recommendations',()=>{
 it('routes defensive outcomes to defense instead of attacking upgrades',()=>expect(nextBattleImprovement({defense:true,won:false,countered:true,lost:8}).destination).toBe('defense'));
 it('prioritizes the known formation matchup over a speculative loss cause',()=>expect(nextBattleImprovement({defense:false,won:false,countered:true,lost:8}).title).toBe('Try a different game plan'));
 it('suggests preparation after observed substitutions and a loss',()=>expect(nextBattleImprovement({defense:false,won:false,countered:false,lost:3}).reason).toContain('3 players'));
 it('does not prescribe training after a win with substitutions',()=>expect(nextBattleImprovement({defense:false,won:true,countered:false,lost:3}).destination).toBe('games'));
});
