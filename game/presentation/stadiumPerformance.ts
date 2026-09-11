import type {FootballEvent,StadiumFootballGame} from '../stadiumFootball';
import {returnPerformance} from './returnPerformance';
export interface StageActor {id:string;x:number;y:number;pose:number;away:boolean;facing:1|-1;large?:boolean;label?:string}
export interface StadiumStage {actors:StageActor[];ball:{x:number;y:number;visible:boolean};focus:{x:number;y:number};beat:string;animated:boolean}
const clamp=(v:number)=>Math.max(0,Math.min(1,v)),lerp=(a:number,b:number,t:number)=>a+(b-a)*clamp(t);
const at=(t:number,a:number,b:number)=>clamp((t-a)/(b-a));
const cycle=(t:number,offset=0)=>Math.floor(t*24+offset)%4;
/** Pure choreography of a confirmed event, never an alternate outcome simulator. */
export function stadiumPerformance(game:StadiumFootballGame,time:number):StadiumStage{
 const e=game.events.at(-1),t=clamp(time),away=(e?.possession??game.possession)==='away',d:1|-1=e?.direction??(away?-1:1);
 const start=e?.startYard??game.yardLine,end=e?.endYard??start,valid=e?.startYard!==undefined&&e?.endYard!==undefined;
 const kind=eventKind(e),active=!!e&&valid;
 const name=(slot:string)=>!away?game.lineup?.players.find(p=>p.id===game.lineup?.slots[slot as keyof typeof game.lineup.slots])?.name:undefined;
 if(active&&kind==='return'){
  const lane=e.call.includes('left')?'left':e.call.includes('right')?'right':'middle';
  const s=returnPerformance(start,end,lane,t,d);
  const actors=s.actors.map((a,i):StageActor=>({id:a.id,x:a.x,y:a.y,away:a.side==='return'?away:!away,facing:a.side==='return'?d:(-d as 1|-1),large:a.role==='Blocker',
   pose:a.id==='returner'?(t<.1?14:t<.18?15:t>.4&&t<.5?9:t===1?11:cycle(t)):a.role==='Blocker'?(t<.15?16:t<.45?17:18+Math.floor(t*8+i)%2):a.role==='Pursuit'?(t===1?23:4+cycle(t,i)):(t<.3?21:22),label:a.id==='returner'?name('RECEIVER')??'Returner':undefined}));
  return {actors,ball:t<.12?{x:lerp(start+35*d,start,at(t,0,.12)),y:26.667-Math.sin(at(t,0,.12)*Math.PI)*8,visible:true}:{...s.ball,visible:false},focus:s.ball,beat:t===1?e.title:s.beat,animated:true};
 }
 const isKick=kind==='kick',isRun=kind==='run',a=active?at(t,.14,.9):0;
 const targetY=isRun?29:e?.play==='flood'?43:e?.play==='verticals'?12:20;
 const targetX=end;
 const runnerX=lerp(start-4*d,targetX,isRun?a:at(t,.15,.68));
 const receiverY=lerp(isRun?30:8,targetY,isRun?at(t,.35,.6):at(t,.4,.66));
 const qb={x:start-5*d,y:27};
 const actors:StageActor[]=[];
 for(let i=0;i<5;i++)actors.push({id:`ol${i}`,x:start-d+Math.min(a*2,1.8)*d,y:20+i*3.2,away,facing:d,pose:active?(t<.15?16:t<.3?17:18+Math.floor(t*8+i)%2):16,large:true,label:i===1?name('LINE1'):undefined});
 actors.push({id:'qb',...qb,away,facing:d,pose:isKick?16:!active?24:t<.28?24:t<.5?25:t<.64?26:27,label:isKick?'Holder':name('QB')??'QB'});
 actors.push({id:'rb',x:isRun?runnerX:start-7*d,y:isRun?receiverY:31,away,facing:d,pose:isKick?(t<.3?28:t<.53?29:t<.72?30:31):isRun?(t<.15?11:t>.42&&t<.51?9:t===1?11:cycle(t)):12,label:isKick?'Kicker':isRun?name('BACK')??'Runner':undefined});
 for(let i=0;i<4;i++){
  const targeted=i===0&&!isRun&&!isKick;
  const y=targeted?receiverY:8+i*12;
  const x=targeted?runnerX:start+(active?Math.min(18,a*22):0)*d;
  actors.push({id:`wr${i}`,x,y,away,facing:d,pose:targeted&&active?(t<.15?12:t<.58?4+cycle(t,i):t<.7?13:t<.78?14:t<.87?15:cycle(t)):active?4+cycle(t,i):12,label:targeted?name('RECEIVER')??'Receiver':undefined});
 }
 for(let i=0;i<4;i++)actors.push({id:`dl${i}`,x:start+2*d,y:21+i*4,away:!away,facing:-d as 1|-1,large:true,pose:active?(t<.3?21:22):20});
 for(let i=0;i<7;i++){
  const close=active&&!isKick?at(t,.42+i*.025,.97):0;
  const y=8+i*6.8,x=start+(i>4?18:8)*d;
  const pursuit=i===2;
  const coverage=e?.call==='zone'?'zone':e?.call==='man'?'man':e?.call==='stack'?'stack':'balanced';
  const routeIndex=i%4,routeY=routeIndex===0?targetY:8+routeIndex*12;
  const coverY=coverage==='man'?routeY+(i%2?2:-2):coverage==='zone'?y:isRun?targetY+(i-3)*2:y;
  const coverX=coverage==='zone'?start+(i>3?24:10)*d:coverage==='stack'&&i<4?start+3*d:targetX+(pursuit?1.6:4+i)*d;
  actors.push({id:`db${i}`,x:lerp(x,coverX,close),y:lerp(y,coverY+(pursuit?1.2:0),close),away:!away,facing:-d as 1|-1,pose:!active?20:close>.92&&pursuit?23:close>0?4+cycle(t,i):21});
 }
 const throwT=at(t,.61,.78),kickT=at(t,.53,.92);
 const ball=isKick?{x:lerp(qb.x,away?-10:110,kickT),y:lerp(27,e?.scored?20:39,kickT)-Math.sin(kickT*Math.PI)*14,visible:active}:
 isRun?{x:runnerX,y:receiverY,visible:false}:{x:lerp(qb.x,targetX,throwT),y:lerp(qb.y,targetY,throwT)-Math.sin(throwT*Math.PI)*5,visible:active&&t>=.61&&t<.78};
 return {actors,ball,focus:isKick?{x:lerp(start,away?0:100,kickT),y:27}:isRun?{x:runnerX,y:receiverY}:{x:lerp(start,targetX,at(t,.4,.85)),y:lerp(27,targetY,at(t,.4,.85))},beat:!active?'Set · awaiting your call':t<.15?'Set · read the formation':t<.4?'Snap · execute assignments':t<.7?isKick?'Plant · strike the ball':isRun?'Press the gap · plant and cut':'Release · track the pass':t<1?'Finish the play':e!.title,animated:active};
}
function eventKind(e:FootballEvent|undefined){
 if(e?.phase==='return'||e?.action==='return'||e?.action==='kick')return 'return';
 if(e?.action==='field-goal'||(e?.action==='conversion'&&!/two|goal.line/i.test(e.title)))return 'kick';
 if(e?.play==='power'||e?.action==='run'||e?.action==='conversion')return 'run';
 return 'pass';
}
