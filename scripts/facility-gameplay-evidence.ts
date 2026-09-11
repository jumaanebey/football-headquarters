// Creates one named anonymous QA club. Public URL/key are supplied at runtime;
// the session token stays in memory. No service-role key or player club is used.
import {footballCalls} from '../game/stadiumFootball';
import type {GameState} from '../types';
const base=process.env.VITE_SUPABASE_URL,anon=process.env.VITE_SUPABASE_ANON_KEY;
if(!base||!anon)throw new Error('Supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at runtime.');
const lines:string[]=[];
const check=(ok:unknown,label:string)=>{const line=`${ok?'PASS':'FAIL'} ${label}`;lines.push(line);console.log(line);if(!ok)throw new Error(label);};
const signup=await fetch(`${base}/auth/v1/signup`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:'{}'});
if(!signup.ok)throw new Error(`QA signup returned HTTP ${signup.status}`);
const session=await signup.json();
console.log(`Facility gameplay evidence ${new Date().toISOString()} · account ${session.user.id}`);
let revision=0;
const call=async(body:Record<string,unknown>)=>{
 const res=await fetch(`${base}/functions/v1/club-authority`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const answer=await res.json();if(answer.club?.owner===session.user.id)revision=answer.club.revision;
 return {status:res.status,...answer};
};
const op=(action:Record<string,unknown>)=>({kind:'action',operationId:crypto.randomUUID(),expectedRevision:revision,action});
const waitUntil=async(at:number)=>{while(Date.now()<at){const remaining=at-Date.now();console.log(`Waiting for server timer: ${Math.ceil(remaining/1000)} seconds`);await new Promise(r=>setTimeout(r,Math.min(45000,remaining)));}};
let answer=await call({kind:'bootstrap'});check(answer.ok&&answer.club.origin==='new','fresh protected club');
answer=await call(op({type:'club.rename',name:'Facility Loop QA'}));check(answer.ok,'QA club named');
// Spend entry Energy through two explicit, conceded QA games so recovery has room
// to restore Energy rather than reaching the passive cap before the timed check.
for(let i=0;i<2;i++){
 answer=await call(op({type:'stadium.start',opponent:'harbor'}));check(answer.ok,'QA warmup entry');
 const id=answer.club.state.stadiumFootball.game.id;
 answer=await call(op({type:'stadium.abandon',gameId:id}));check(answer.ok,'QA warmup explicitly conceded');
 answer=await call(op({type:'stadium.collect',gameId:id}));check(answer.ok,'QA warmup has no reward');
}
const initial:GameState=answer.club.state;
const start=op({type:'development.start',unit:'ALL',steps:[{station:'film',play:'slants'},{station:'rehab',play:'slants'},{station:'practice',play:'slants'}]});
answer=await call(start);check(answer.ok&&answer.club.state.resources.ENERGY===initial.resources.ENERGY-13,'three-stop schedule prepaid 13 Energy');
const scheduled=answer.club.state as GameState,end=scheduled.development!.schedule!.blocks.at(-1)!.finishTime;
const duplicate=await call(start);check(duplicate.ok&&duplicate.club.revision===answer.club.revision,'duplicate schedule returns original receipt');
answer=await call(op({type:'sync'}));check(answer.ok&&!answer.club.state.development.reports.length,'early sync awards no session growth');
const blocked=await call({kind:'match.reserve',operationId:crypto.randomUUID(),expectedRevision:revision,choice:{kind:'campaign',stage:1}});check(!blocked.ok,'team cannot raid while assigned to development');
answer=await call(op({type:'scouting.search',tier:'local',pace:'coins'}));check(answer.ok,'paid agent search starts during team development');
await waitUntil(answer.club.state.scouting.trip.finishTime+1200);
answer=await call(op({type:'sync'}));const paid=answer.club.state.scouting.prospects[0];check(paid.source==='agent'&&paid.interest===100,'agent report reveals a ready-to-sign athlete');
const signing=op({type:'scouting.sign',playerId:paid.player.id});answer=await call(signing);check(answer.ok&&answer.club.state.roster.length===initial.roster.length+1,'agent athlete signs');
const signedAgain=await call(signing);check(signedAgain.ok&&signedAgain.club.state.roster.length===initial.roster.length+1,'duplicate signing adds no second player');
answer=await call(op({type:'scouting.search',tier:'local',pace:'time'}));check(answer.ok,'free scouting starts');
await waitUntil(answer.club.state.scouting.trip.finishTime+1200);
answer=await call(op({type:'sync'}));const academy=answer.club.state.scouting.prospects[0];check(academy.source==='academy'&&academy.interest===0&&academy.player.maxStat>paid.player.maxStat,'free scout reveals a different, higher-potential pool');
answer=await call(op({type:'scouting.contact',playerId:academy.player.id,contact:'call'}));check(answer.ok,'relationship phone call starts');
await waitUntil(Math.max(end,answer.club.state.scouting.prospects[0].job.finishTime)+1200);
const settle=op({type:'sync'});answer=await call(settle);check(answer.ok,'elapsed activities settle on return');
const developed=answer.club.state as GameState;
check(developed.development?.schedule===null&&developed.development.reports.length===3,'all three schedule stops finish once');
check(developed.roster[0].stats.iq===initial.roster[0].stats.iq+1&&developed.roster[0].stats.speed===initial.roster[0].stats.speed+2,'Film IQ and Practice Speed reach the roster');
check(developed.development!.reports.some(r=>r.station==='rehab'&&r.energy>0),'Rehab restores Energy');
check(developed.development!.mastery.slants===1&&developed.scouting!.prospects[0].interest===20,'play mastery and recruiting interest persist');
check(developed.roster.find(p=>p.id===paid.player.id)!.stats.iq===paid.player.stats.iq,'new signing does not inherit a schedule it never joined');
const repeated=await call(settle);check(repeated.ok&&repeated.club.revision===answer.club.revision&&repeated.club.state.development.reports.length===3,'duplicate return does not repeat growth');
answer=await call({kind:'status'});check(answer.ok&&answer.club.state.development.mastery.slants===1,'fresh status restores completed development');
answer=await call(op({type:'stadium.start',opponent:'harbor'}));check(answer.ok,'Stadium game starts from developed club');
let game=answer.club.state.stadiumFootball.game;
const raid=await call({kind:'match.reserve',operationId:crypto.randomUUID(),expectedRevision:revision,choice:{kind:'campaign',stage:1}});check(!raid.ok,'a Stadium possession blocks simultaneous raids');
const status=await call({kind:'status'});check(status.club.state.stadiumFootball.game.turn===game.turn,'status does not play the next decision');
let first=true;
while(game.phase!=='final'){
 const command=op({type:'stadium.call',gameId:game.id,turn:String(game.turn),call:footballCalls(game)[0].key});
 answer=await call(command);check(answer.ok,`football call ${game.turn}: ${game.phase}`);game=answer.club.state.stadiumFootball.game;
 if(first){const retry=await call(command);check(retry.ok&&retry.club.state.stadiumFootball.game.turn===game.turn,'lost-answer retry never runs a second play');const stale=await call(op(command.action));check(!stale.ok,'stale football turn is rejected');first=false;}
 if(game.turn>10)throw new Error('Unbounded football game');
}
check(game.events.some((e:any)=>e.phase==='kickoff'),'both teams receive a possession');
const before=answer.club.state.resources.COINS,collect=op({type:'stadium.collect',gameId:game.id});answer=await call(collect);check(answer.ok&&answer.club.state.resources.COINS===before+game.reward,'visible final result collects exact Coins');
const again=await call(collect);check(again.ok&&again.club.state.resources.COINS===answer.club.state.resources.COINS&&again.club.state.stadiumFootball.history.length===3,'duplicate result collection credits once');
console.log(`RESULT: ${lines.length} checks passed · account ${session.user.id} · Stadium ${game.home}–${game.away} · ${game.reward} Coins`);
