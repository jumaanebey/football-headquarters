import {expect,it} from 'vitest';
import {actorReadout,fieldPositionReadout,kickOutlook} from '../game/presentation/stadiumReadouts';
import {STADIUM_SCENARIOS} from './fixtures/stadiumScenarios';
import {runScenario,SCENARIO_NOW} from './fixtures/stadiumHarness';
import {applyClubAction} from '../game/authority/clubActions';
import {PlayerRole} from '../types';
it('does not present a lineup average as the named player’s stat',()=>{
 expect(actorReadout({slot:'QB',name:'Ace',role:PlayerRole.QB,attribute:'iq',value:13})).toBe('Ace · QB · lineup IQ average 13');
});
it('makes the threatened endzone explicit',()=>{
 const game=runScenario(STADIUM_SCENARIOS[0]).final;
 expect(fieldPositionReadout({...game,possession:'away',yardLine:43})).toBe('They are 43 yards from your endzone, at your 43.');
});
it('advertised kick odds agree with the existing resolver across the frozen scenarios',()=>{
 let checked=0;
 for(const scenario of STADIUM_SCENARIOS)for(const frame of runScenario(scenario).frames){
  if(frame.before.phase!=='finish'||frame.before.possession!=='home')continue;
  const chance=parseInt(kickOutlook(frame.before),10)/100;
  for(const [roll,scored] of [[Math.max(0,chance-.02),3],[Math.min(.999,chance+.02),0]]){
   const state={...frame.state,stadiumFootball:{...frame.state.stadiumFootball!,game:frame.before}};
   const result=applyClubAction(state,{type:'stadium.call',gameId:frame.before.id,turn:String(frame.before.turn),call:'field-goal'},{now:SCENARIO_NOW,random:()=>roll});
   expect(result.ok).toBe(true);expect(result.state.stadiumFootball?.game?.events.at(-1)?.scored).toBe(scored);checked++;
  }
 }
 expect(checked).toBeGreaterThan(10);
});
