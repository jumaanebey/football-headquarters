// One explicitly named QA club; public project credentials at runtime, session only in memory.
import {readFile,writeFile} from 'node:fs/promises';
import {lineupOf,lineupView,compareLineupChange} from '../game/lineup';
import {footballCalls,footballRatings} from '../game/stadiumFootball';
const base=process.env.VITE_SUPABASE_URL,anon=process.env.VITE_SUPABASE_ANON_KEY;
if(!base||!anon)throw new Error('Provide project URL and anon key at runtime');
const fourDowns=process.argv.includes('--four-downs');
let checks=0;const check=(ok:unknown,label:string)=>{console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)throw new Error(label);checks++};
const signup=await fetch(`${base}/auth/v1/signup`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:'{}'});
if(!signup.ok)throw new Error(`Signup HTTP ${signup.status}`);const session=await signup.json();
const inventory=JSON.parse(await readFile('scripts/qa-accounts.json','utf8'));inventory.accounts.push({id:session.user.id,purpose:fourDowns?'Four Downs QA · v10 live evidence; retained for deferred cleanup':'Connected Lineup QA · v9 integration evidence; retained for deferred cleanup'});await writeFile('scripts/qa-accounts.json',JSON.stringify(inventory,null,2)+'\n');
console.log(`Connected club evidence ${new Date().toISOString()} · account ${session.user.id}`);
let revision=0;
const call=async(body:Record<string,unknown>)=>{const response=await fetch(`${base}/functions/v1/club-authority`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const answer=await response.json();if(answer.club)revision=answer.club.revision;return answer};
const op=(action:Record<string,unknown>)=>({kind:'action',operationId:crypto.randomUUID(),expectedRevision:revision,action});
let answer=await call({kind:'bootstrap'});check(answer.ok,'fresh protected club');
answer=await call(op({type:'club.rename',name:fourDowns?'Four Downs QA':'Connected Lineup QA'}));check(answer.ok,'named QA club');
const initial=answer.club.state,view=lineupView(initial),reserve=view.reserves[0];check(view.filled===9&&!!reserve,'nine starters plus reserve');
const slot=view.slots.find(s=>s.unit===reserve.unit)!;const preview=compareLineupChange(initial,slot.slot,reserve.playerId);
const request=op({type:'lineup.set',lineup:preview.assignment});answer=await call(request);check(answer.ok,'lineup change accepted');
check(JSON.stringify(lineupView(answer.club.state).ratings)===JSON.stringify(preview.after),'confirmed ratings equal preview');
const expectedRevision=revision;const duplicate=await call(request);check(duplicate.ok&&duplicate.club.revision===expectedRevision,'duplicate lineup operation applied once');
answer=await call({kind:'status'});check(lineupOf(answer.club.state)[slot.slot]===reserve.playerId,'lineup survives fresh status');
const invalid=await call(op({type:'lineup.set',lineup:{...preview.assignment,QB:'not-on-this-club'}}));check(!invalid.ok,'foreign or unknown athlete refused');
answer=await call(op({type:'stadium.start',opponent:'harbor',...(fourDowns?{format:'four-downs'}:{})}));check(answer.ok,'new Stadium starts');
let game=answer.club.state.stadiumFootball.game;check(game.v===(fourDowns?3:2)&&!!game.lineup,'requested rules version snapshots starters');
const snapshot=JSON.stringify(game.lineup);answer=await call(op({type:'lineup.set',lineup:lineupOf(initial)}));check(!answer.ok,'pending Stadium locks lineup changes');
const status=await call({kind:'status'});check(status.club.state.stadiumFootball.game.turn===game.turn,'status never advances a possession');check(JSON.stringify(status.club.state.stadiumFootball.game.lineup)===snapshot,'pending game keeps kickoff lineup');
for(let turn=0;game.phase!=='final'&&turn<(fourDowns?96:12);turn++){
 const request=op({type:'stadium.call',gameId:game.id,turn:String(game.turn),call:footballCalls(game)[0].key});answer=await call(request);check(answer.ok,`call ${game.turn} confirmed`);game=answer.club.state.stadiumFootball.game;
 if(fourDowns&&game.phase==='offense')check(game.down>=1&&game.down<=4&&Math.abs(game.lineToGain-game.yardLine)>0&&Math.abs(game.lineToGain-game.yardLine)<=10,'server retains legal down and distance');
 const retry=await call(request);check(retry.ok&&retry.club.state.stadiumFootball.game.turn===game.turn,`call ${turn} retry stays once`);
}
check(game.phase==='final','bounded two-possession game reaches final');
check(new Set(game.events.map((e:{possession:string})=>e.possession)).size===2,'both sides possessed the ball');
check(game.events.every((e:{direction:number;startYard:number;endYard:number})=>Math.abs(e.direction)===1&&e.startYard>=0&&e.endYard<=100),'events retain field geometry');
const coins=answer.club.state.resources.COINS,collect=op({type:'stadium.collect',gameId:game.id});answer=await call(collect);check(answer.ok&&answer.club.state.resources.COINS===coins+game.reward,'result credits exact Coins');
const repeat=await call(collect);check(repeat.ok&&repeat.club.state.resources.COINS===answer.club.state.resources.COINS,'reward retry does not credit twice');
console.log(`RESULT: ${checks} checks passed · account ${session.user.id} · ${game.home}–${game.away} · reward ${game.reward} Coins`);
