import {expect,it} from 'vitest';
import {createInitialState} from '../game/initialState';
import {applyClubAction} from '../game/authority/clubActions';
import {footballCalls,validStadiumFootball,type StadiumFootballGame} from '../game/stadiumFootball';
import type {GameState} from '../types';
import {downReadout} from '../game/presentation/stadiumReadouts';
const now=1789214400000;
function start(){const r=applyClubAction(createInitialState(now),{type:'stadium.start',format:'four-downs',opponent:'harbor'},{now,random:()=>.8});expect(r.ok).toBe(true);return r.state;}
function game(c:GameState){return c.stadiumFootball!.game!;}
function call(c:GameState,key:string,roll=.99){const g=game(c),r=applyClubAction(c,{type:'stadium.call',gameId:g.id,turn:String(g.turn),call:key},{now,random:()=>roll});expect(r.ok,r.ok?undefined:r.message).toBe(true);expect(validStadiumFootball(r.state.stadiumFootball)).toBe(true);return r.state;}
function at(c:GameState,patch:Partial<StadiumFootballGame>):GameState{return {...c,stadiumFootball:{...c.stadiumFootball!,game:{...game(c),...patch}}};}
it('starts new games on v3 and initializes first and ten after the return',()=>{
 const c=call(start(),'middle');expect(game(c).v).toBe(3);expect(game(c).down).toBe(1);expect(game(c).lineToGain).toBe(Math.min(100,game(c).yardLine+10));expect(downReadout(game(c))).toBe('1st & 10');
});
it('advances every failed down, then ends the first possession on fourth down',()=>{
 let c=call(start(),'middle');
 for(let down=1;down<=4;down++){
  expect(game(c).down).toBe(down);expect(footballCalls(game(c)).some(x=>x.key==='punt')).toBe(false);
  c=call(c,'power');
 }
 expect(game(c).possession).toBe('away');expect(game(c).events.at(-1)?.turnoverOnDowns).toBe(true);expect(game(c).events.at(-1)?.down).toBe(4);
});
it('reaching the line to gain on fourth down earns a fresh set',()=>{
 let c=at(start(),{phase:'offense',down:4,yardLine:40,lineToGain:42});
 c=call(c,'power',.5);expect(game(c).possession).toBe('home');expect(game(c).down).toBe(1);expect(game(c).lineToGain).toBe(game(c).yardLine+10);expect(game(c).events.at(-1)?.firstDown).toBe(true);
});
it('uses goal-to-go and does not grant a first down at the goal line without a score',()=>{
 let c=at(start(),{phase:'offense',down:4,yardLine:98,lineToGain:100});expect(downReadout(game(c))).toBe('4th & Goal');
 c=call(c,'power',0);expect(game(c).home).toBe(6);expect(game(c).events.at(-1)?.turnoverOnDowns).not.toBe(true);
});
it('applies the same four-down possession limit to the visiting team and permits a tie',()=>{
 let c=at(start(),{phase:'offense',possession:'away',possessionIndex:1,down:1,yardLine:80,lineToGain:70});
 for(let n=0;n<4;n++)c=call(c,'stack');
 expect(game(c).phase).toBe('final');expect(game(c).home).toBe(0);expect(game(c).away).toBe(0);expect(game(c).reward).toBe(50);
});
it('keeps down and distance through serialization and rejects malformed series',()=>{
 const c=at(start(),{phase:'offense',down:3,yardLine:40,lineToGain:46});
 expect(validStadiumFootball(JSON.parse(JSON.stringify(c.stadiumFootball)))).toBe(true);
 for(const patch of [{down:5},{down:1.2},{lineToGain:39},{lineToGain:52}])expect(validStadiumFootball(at(c,patch).stadiumFootball)).toBe(false);
});
it('ends a possession on a missed early field goal without spending the remaining downs',()=>{
 const c=call(at(start(),{phase:'offense',down:2,yardLine:60,lineToGain:65}),'field-goal');
 expect(game(c).possession).toBe('away');expect(game(c).events.at(-1)?.action).toBe('field-goal');
});
it('counts a gain crossing the goal line as a touchdown even outside the breakaway roll',()=>{
 const c=call(at(start(),{phase:'offense',down:3,yardLine:99,lineToGain:100}),'power',.5);
 expect(game(c).home).toBe(6);expect(game(c).phase).toBe('conversion');expect(game(c).events.at(-1)?.endYard).toBe(100);
});
it('keeps old client starts on the original rules and requires the explicit new format',()=>{
 const old=applyClubAction(createInitialState(now),{type:'stadium.start',opponent:'harbor'},{now,random:()=>.8});
 expect(old.ok).toBe(true);expect(old.state.stadiumFootball?.game?.v).toBe(2);
 expect(game(start()).v).toBe(3);
});
