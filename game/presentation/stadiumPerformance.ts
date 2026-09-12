import type {FootballEvent,StadiumFootballGame} from '../stadiumFootball';
import {returnPerformance} from './returnPerformance';
import {defensiveAssignments} from './defensiveAssignments';
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
 const homeName=(slot:string)=>game.lineup?.players.find(p=>p.id===game.lineup?.slots[slot as keyof typeof game.lineup.slots])?.name;
 const name=(slot:string)=>!away?homeName(slot):undefined;
 if((active&&kind==='return')||(!e&&game.phase==='return')){
  const lane=e?.call.includes('left')?'left':e?.call.includes('right')?'right':'middle';
  const s=returnPerformance(start,end,lane,t,d,!!e?.scored);
  const actors=s.actors.map((a,i):StageActor=>({id:a.id,x:a.x,y:a.y,away:a.side==='return'?away:!away,facing:a.side==='return'?d:(-d as 1|-1),large:a.role==='Blocker',
   pose:!active?(a.id==='returner'?12:a.side==='return'?16:20):a.id==='returner'?(t<.1?14:t<.18?15:t>.4&&t<.5?9:t===1?11:cycle(t)):a.role==='Blocker'?(t<.15?16:t<.45?17:18+Math.floor(t*8+i)%2):a.role==='Pursuit'?(t>.94&&a.id==='cover-4'&&!e?.scored?23:4+cycle(t,i)):(t<.3?21:22),label:a.id==='returner'?name('RECEIVER')??'Returner':undefined}));
  return {actors,ball:active&&t<.12?{x:lerp(start+35*d,start,at(t,0,.12)),y:26.667-Math.sin(at(t,0,.12)*Math.PI)*8,visible:true}:{...s.ball,visible:false},focus:s.ball,beat:!active?'Kickoff unit set · awaiting your call':t===1?e!.title:s.beat,animated:active};
 }
 const isKick=kind==='kick',isRun=kind==='run',a=active?at(t,.14,.9):0;
 const targetY=isRun?29:e?.play==='flood'?43:e?.play==='verticals'?12:20;
 const complete=isRun||!!e?.scored||(e?.yards??0)>0;
 const targetX=!isRun&&!isKick&&!complete?start+12*d:end;
 const runnerX=isRun?lerp(start-4*d,targetX,a):lerp(start,targetX,at(t,.15,.78));
 const receiverY=lerp(isRun?30:8,targetY,isRun?at(t,.35,.6):at(t,.4,.66));
 const qb={x:start-(isKick?7:5)*d,y:27};
 const actors:StageActor[]=[];
 for(let i=0;i<5;i++){
  const climb=active&&isRun&&(i===1||i===3)?at(t,.48,.88):0;
  actors.push({id:`ol${i}`,x:start-d+Math.min(a*2,1.8)*d+climb*Math.min(5,Math.max(0,(end-start)*d-2))*d,y:20+i*3.2+climb*(i===1?2:-2),away,facing:d,pose:active?(t<.15?16:t<.3?17:18+Math.floor(t*8+i)%2):16,large:true,label:i===1?name('LINE1'):undefined});
 }
 actors.push({id:'qb',...qb,away,facing:d,pose:isKick?16:!active?24:t<.28?24:t<.5?25:t<.64?26:27,label:isKick?'Holder':name('QB')??'QB'});
 actors.push({id:'rb',x:isKick?lerp(start-10*d,start-7*d,at(t,.3,.53)):isRun?runnerX:start-7*d,y:isRun?receiverY:isKick?29:31,away,facing:d,pose:isKick?(t<.3?28:t<.53?29:t<.72?30:31):isRun?(t<.15?11:t>.42&&t<.51?9:t===1?11:cycle(t)):12,label:isKick?'Kicker':isRun?name('BACK')??'Runner':undefined});
 for(let i=0;i<4;i++){
  const targeted=i===0&&!isRun&&!isKick;
  const route=receiverRoute(start,d,i,e?.play??'slants',active?t:0,{x:targetX,y:targetY},targeted);
  const y=isKick?15+i*7:isRun?8+i*12:route.y;
  const x=isKick?start-1.5*d:isRun?start+Math.min(10,a*12)*d:route.x;
  actors.push({id:`wr${i}`,x,y,away,facing:d,pose:isKick?(t<.15?16:18):targeted&&active?(t<.15?12:t<.58?4+cycle(t,i):t<.7?13:t<.78?14:!complete?12:t<.87?15:cycle(t)):active?4+cycle(t,i):12,label:targeted?name('RECEIVER')??'Receiver':undefined});
 }
 actors.push(...defensiveAssignments({start,end:targetX,direction:d,away,time:t,active,kind:isKick?'kick':isRun?'run':'pass',call:e?.call??'',target:{x:targetX,y:targetY},receivers:actors.filter(a=>a.id.startsWith('wr')),scored:!!e?.scored,complete}));
 if(away){for(const actor of actors){const slot=actor.id==='dl0'?'RUSHER':actor.id==='db1'?'BACKER':actor.id==='db3'?'COVER':actor.id==='db5'?'SAFETY':undefined;if(slot)actor.label=homeName(slot)??actor.label;}}
 const throwT=at(t,.61,.78),kickT=at(t,.53,.92);
 const ball=isKick?{x:lerp(qb.x,away?-10:110,kickT),y:lerp(27,e?.scored?20:39,kickT)-Math.sin(kickT*Math.PI)*14,visible:active}:
 isRun?{x:runnerX,y:receiverY,visible:false}:{x:lerp(qb.x,targetX,throwT),y:lerp(qb.y,targetY,throwT)-Math.sin(throwT*Math.PI)*5+(!complete?at(t,.78,.92)*2:0),visible:active&&t>=.61&&(t<.78||!complete)};
 return {actors,ball,focus:isKick?{x:lerp(start,away?0:100,kickT),y:27}:isRun?{x:runnerX,y:receiverY}:{x:lerp(start,targetX,at(t,.4,.85)),y:lerp(27,targetY,at(t,.4,.85))},beat:!active?'Set · awaiting your call':t<.15?'Set · read the formation':t<.4?'Snap · execute assignments':t<.7?isKick?'Plant · strike the ball':isRun?'Press the gap · plant and cut':'Release · track the pass':t<1?'Finish the play':e!.title,animated:active};
}
function eventKind(e:FootballEvent|undefined){
 if(e?.phase==='return'||e?.action==='return'||e?.action==='kick')return 'return';
 if(e?.action==='field-goal'||(e?.action==='conversion'&&!/two|goal.line/i.test(e.title)))return 'kick';
 if(e?.play==='power'||e?.action==='run'||e?.action==='conversion')return 'run';
 return 'pass';
}

/** Stem first, then break: receivers do not all drift laterally with the ball. */
function receiverRoute(start:number,d:1|-1,index:number,play:string,t:number,target:{x:number;y:number},targeted:boolean){
 const origin={x:start,y:8+index*12};
 const stem={x:start+(play==='verticals'?8:4)*d,y:origin.y};
 const breakPoint=play==='flood'?{x:start+(index===0?9:index===1?3:17)*d,y:Math.min(47,origin.y+12)}:
 play==='verticals'?{x:start+20*d,y:origin.y+(index%2?2:-2)}:
 {x:start+10*d,y:origin.y+(index<2?9:-9)};
 const x=lerp(origin.x,stem.x,at(t,.14,.34)),y=origin.y;
 const bx=lerp(x,breakPoint.x,at(t,.34,.6)),by=lerp(y,breakPoint.y,at(t,.34,.6));
 return targeted?{x:lerp(bx,target.x,at(t,.6,.78)),y:lerp(by,target.y,at(t,.6,.78))}:{x:bx,y:by};
}
