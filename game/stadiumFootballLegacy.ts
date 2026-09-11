// FROZEN legacy Stadium resolver. A club that was mid-game when the two-possession rules shipped
// keeps playing and collecting under the exact rules it started with, so nothing in this file may
// change. New games never reach it: applyStadiumFootball routes only games without `v` here, and
// `stadium.start` always creates a v2 game.
import {progressClubDaily} from './dailyProgress';
import type {GameState} from '../types';
import {FOOTBALL_PLAYS,type FootballPlay} from './development';
import {STADIUM_OPPONENTS,type StadiumAction,type StadiumFootballGame,type StadiumFootballState} from './stadiumFootball';

export function legacyFootballCalls(game: StadiumFootballGame): {key:string;name:string;detail:string}[] {
 switch(game.phase){
 case 'return':return [{key:'left',name:'Return left',detail:'A safe sideline lane.'},{key:'middle',name:'Return up the middle',detail:'Trust speed and the lead block.'},{key:'right',name:'Return right',detail:'Challenge the outside coverage.'}];
 case 'offense':return [{key:'slants',name:'Quick slants',detail:'IQ and timing against the blitz.'},{key:'flood',name:'Flood right',detail:'Three route depths stretch zone coverage.'},{key:'verticals',name:'Hail Mary · four verticals',detail:'Speed against man coverage; more risk.'},{key:'power',name:'Power run',detail:'Strength against a light box.'}];
 case 'finish':return [{key:'field-goal',name:`Kick a ${Math.max(18,117-game.yardLine)}-yard field goal`,detail:'Take three if your range allows it.'},{key:'goal-line',name:'Go for the touchdown',detail:'One final run against their goal-line front.'}];
 case 'conversion':return [{key:'extra-point',name:'Kick the extra point',detail:'Safer · one point.'},{key:'two-point',name:'Go for two',detail:'A talent matchup at the goal line.'}];
 case 'kickoff':return [{key:'deep',name:'Kick deep',detail:'Trust your coverage speed.'},{key:'squib',name:'Squib kick',detail:'Limits a big return; gives up field position.'}];
 case 'defense':return [{key:'zone',name:'Zone · protect the deep ball',detail:'Counters vertical passes; leaves room to run.'},{key:'man',name:'Man · take away quick passes',detail:'Counters quick routes; vulnerable to deep speed.'},{key:'stack',name:'Stack the box',detail:'Stops power runs; opens the passing lanes.'}];
 case 'defend-finish':return [{key:'block',name:'Pressure the kick',detail:'Try to block the extra point.'},{key:'contain',name:'Protect against two points',detail:'Keep the runner in front of you.'}];
 default:return [];
 }
}

const bounded=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
/** Resolve one call on a pre-rewrite game. `collect` and `abandon` are handled by the caller. */
export function applyLegacyStadiumCall(club:GameState,action:Extract<StadiumAction,{type:'stadium.call'}>,state:StadiumFootballState,old:StadiumFootballGame,random:()=>number):GameState|string{
 if(old.phase==='final'||String(old.turn)!==action.turn||!legacyFootballCalls(old).some(c=>c.key===action.call))return 'That play call is out of date. Use the current decision.';
 const opponent=STADIUM_OPPONENTS[old.opponent],r=old.ratings,advantage=(r.attack-opponent.power)/Math.max(25,opponent.power),defAdv=(r.defense-opponent.power)/Math.max(25,opponent.power);
 const roll=random(),call=action.call;let game={...old,turn:old.turn+1},title='',detail='',yards=0,play:FootballPlay|undefined;
 const theirTurn=()=>{game.phase='kickoff';game.yardLine=20;};
 switch(old.phase){
 case 'return':{
  const lane=call==='middle'?.04:call==='left'?.01:-.01;
  if(advantage>1.05&&roll<bounded(.65+(r.speed-15)/100+lane,.2,.95)){game.home+=6;game.phase='conversion';yards=100;title='Kickoff return touchdown!';detail='Your return speed and blocking overwhelmed their coverage.';}
  else{yards=Math.round(bounded(23+advantage*12+r.speed*.2+roll*12,15,65));game.yardLine=yards;game.phase='offense';title=`Return to your ${yards}`;detail=`${call==='middle'?'The central lane':`The ${call} sideline`} sets up your offensive possession.`;}break;
 }
 case 'offense':{
  play=call as FootballPlay;const coverage=opponent.style,beats=(play==='slants'&&coverage==='stack')||(play==='verticals'&&coverage==='man')||(play==='flood'&&coverage==='zone')||(play==='power'&&coverage==='man');
  const talent=play==='power'?r.power:play==='verticals'?r.speed:r.iq;
  const probability=bounded(.38+advantage*.28+(beats?.16:-.06)+(talent-15)*.004+r.readiness*.001+(r.mastery[play]??0)*.008,.08,.96);
  if(roll<probability){yards=100-game.yardLine;game.home+=6;game.phase='conversion';title='Touchdown!';}
  else{yards=Math.round(bounded(12+advantage*10+roll*12,0,45));game.yardLine=Math.min(98,game.yardLine+yards);game.phase='finish';title=`${yards} yards · one decision left`;}
  detail=`${play==='verticals'?'Four verticals':FOOTBALL_PLAYS[play].name} against ${coverage} coverage. ${beats?'Your call found the matchup.':'Their scheme challenged the call.'} Attack ${r.attack} vs ${opponent.power}; mastery ${r.mastery[play]??0}/20.`;break;
 }
 case 'finish':{
  if(call==='field-goal'){const distance=Math.max(18,117-game.yardLine),chance=bounded(.99-(distance-20)*.016+(r.iq-15)*.004,.03,.98);const made=roll<chance;if(made)game.home+=3;title=made?'Field goal is good':'Field goal missed';detail=`${distance}-yard attempt. Distance and team timing determined the kick.`;}
  else{play='power';const made=roll<bounded(.28+advantage*.22+(r.power-15)*.005+(game.yardLine-70)*.005,.05,.9);if(made){game.home+=6;game.phase='conversion';title='Goal-line touchdown';detail='The runner followed the lead block through the front.';break;}title='Goal-line stand';detail='The defense held. Your possession ends without a score.';}
  theirTurn();break;
 }
 case 'conversion':{const two=call==='two-point',made=roll<bounded(two?.48+advantage*.2:.94+(r.iq-15)*.001,.1,.99);if(made)game.home+=two?2:1;title=made?(two?'Two points!':'Extra point is good'):'Conversion stopped';detail=two?'One run-pass matchup from the two-yard line.':'The kick completes your scoring possession.';theirTurn();break;}
 case 'kickoff':{const squib=call==='squib';if(!squib&&defAdv<-.5&&roll<.22){game.away+=6;game.phase='defend-finish';title='They return it for a touchdown';detail='Their return team broke your coverage.';}else{yards=Math.round(bounded((squib?40:25)-defAdv*9+roll*8,15,65));game.yardLine=yards;game.phase='defense';title=`Opponent starts at their ${yards}`;detail=squib?'The squib prevented a long return, at the cost of field position.':'Your coverage team made the tackle.';}break;}
 case 'defense':{
  const theirPlay:FootballPlay=roll<.34?'slants':roll<.67?'verticals':'power';play=theirPlay;const counter=(call==='zone'&&theirPlay==='verticals')||(call==='man'&&theirPlay==='slants')||(call==='stack'&&theirPlay==='power');
  const stopChance=bounded(.4+defAdv*.3+(counter?.24:-.08)+r.readiness*.001,.05,.97),stopped=random()<stopChance;
  if(stopped){const kickDistance=Math.max(25,117-(game.yardLine+22));const kickMade=random()<bounded(.92-(kickDistance-25)*.014,.08,.9);if(kickMade)game.away+=3;game.phase='final';title=kickMade?'You force a field goal':'Defensive stop · their kick misses';detail=`${call} against ${theirPlay==='verticals'?'four verticals':FOOTBALL_PLAYS[theirPlay].name}. ${counter?'The call took away their first option.':'Your defenders won their assignments.'}`;}
  else{game.away+=6;game.phase='defend-finish';title='Opponent touchdown';detail=`They called ${theirPlay==='verticals'?'four verticals':FOOTBALL_PLAYS[theirPlay].name} against your ${call}. Defense ${r.defense} vs ${opponent.power}.`;}break;
 }
 case 'defend-finish':{const two=game.away+1<game.home&&game.away+2>=game.home;const made=roll<bounded(two?.5-defAdv*.2-(call==='contain'?.12:0):.94-(call==='block'?.08:0),.05,.98);if(made)game.away+=two?2:1;title=made?(two?'They convert for two':'Their extra point is good'):'Conversion denied';detail='Both teams have now completed one possession. Equal scores stay tied.';game.phase='final';break;}
 }
 if(game.phase==='final')game.reward=game.home>game.away?opponent.reward:game.home===game.away?Math.round(opponent.reward*.5):20;
 game.events=[...old.events,{turn:old.turn,phase:old.phase,call,title,detail,home:game.home,away:game.away,play,yards}];
 return {...club,stadiumFootball:{...state,game}};
}
export const legacyCollectReward=(club:GameState,now:number,state:StadiumFootballState,old:StadiumFootballGame):GameState=>{
 const next={...old,collected:true};
 const collected:GameState={...club,resources:{...club.resources,COINS:club.resources.COINS+old.reward},stadiumFootball:{game:next,history:[{id:old.id,opponent:old.opponent,home:old.home,away:old.away,reward:old.reward,at:now},...state.history].slice(0,20)}};
 return old.home>old.away?progressClubDaily(collected,'win_attack'):collected;
};
void FOOTBALL_PLAYS; void STADIUM_OPPONENTS;
