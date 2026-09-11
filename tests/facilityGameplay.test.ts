import {describe,it,expect} from 'vitest';
import {createInitialState} from '../game/initialState';
import {applyClubAction,parseClubAction,settleClubState,type ClubAction} from '../game/authority/clubActions';
import {advanceCampus} from '../game/campus';
import {parseSavedClub} from '../game/saveValidation';
import {BuildingType,type GameState} from '../types';
import {footballCalls} from '../game/stadiumFootball';
const NOW=1789128000000;
const initial=()=>{const s=createInitialState(NOW);s.resources.ENERGY=40;s.resources.COINS=10000;return s;};
function act(s:GameState,a:ClubAction,at=s.lastTick,roll=.4){const r=applyClubAction(s,a,{now:at,random:()=>roll});if(!r.ok)throw new Error(r.message);return r.state;}
const steps=[{station:'weights',play:'slants'},{station:'film',play:'slants'},{station:'practice',play:'power'},{station:'rehab',play:'slants'}] as const;
describe('connected facility development',()=>{
 it('runs the finite schedule through all rooms across a reload, applies distinct growth once',()=>{
  const s=initial(),before=s.roster[0];let state=act(s,{type:'development.start',unit:'ALL',steps:[...steps]});
  expect(state.resources.ENERGY).toBe(19);expect(state.development!.schedule!.blocks).toHaveLength(4);
  const end=state.development!.schedule!.blocks.at(-1)!.finishTime;
  state=settleClubState(parseSavedClub(JSON.stringify(state)),end);
  expect(state.development!.schedule).toBeNull();expect(state.development!.reports).toHaveLength(4);
  expect(state.roster[0].stats).toEqual({strength:before.stats.strength+2,speed:before.stats.speed+2,iq:before.stats.iq+1});
  expect(state.roster[0].level).toBe(before.level+1);expect(state.teamReadiness).toBe(18);expect(state.development!.mastery.slants).toBe(1);
  expect(settleClubState(state,end).development).toEqual(state.development);
  expect(settleClubState(state,end+86400000).roster.map(p=>p.stats)).toEqual(state.roster.map(p=>p.stats));
  expect(parseSavedClub(JSON.stringify(state)).development).toEqual(state.development);
 });
 it('has identical final balances and growth for incremental and one-shot completion',()=>{
  const start=act(initial(),{type:'development.start',unit:'ALL',steps:[...steps]});let incremental=start;
  const end=start.development!.schedule!.blocks.at(-1)!.finishTime;
  for(let t=NOW+1000;t<=end;t+=1000)incremental=settleClubState(incremental,t);
  const offline=settleClubState(start,end);expect(incremental.resources).toEqual(offline.resources);expect(incremental.roster.map(p=>p.stats)).toEqual(offline.roster.map(p=>p.stats));expect(incremental.teamReadiness).toBe(offline.teamReadiness);
 });
 it('prevents overlapping jobs and cutting an assigned player; refunds no completed gains',()=>{
  const s=act(initial(),{type:'development.start',unit:'ALL',steps:[steps[0]]});
  for(const a of [{type:'development.start',unit:'ALL',steps:[steps[0]]},{type:'training.start',unit:s.roster[0].unit,drillId:'sled_push'},{type:'recruit.cut',playerId:s.roster[0].id},{type:'stadium.start',opponent:'harbor'}])expect(applyClubAction(s,a,{now:NOW,random:()=>.4}).ok).toBe(false);
 });
 it('keeps protected player gains unchanged until a server confirmation',()=>{
  const s=act(initial(),{type:'development.start',unit:'ALL',steps:[steps[0]]}),end=s.development!.schedule!.blocks[0].finishTime;
  const predicted=advanceCampus(s,end,undefined,false);expect(predicted.roster.map(p=>p.stats)).toEqual(s.roster.map(p=>p.stats));expect(predicted.development!.schedule).not.toBeNull();
  expect(settleClubState(s,end).development!.schedule).toBeNull();
 });
 it('caps growth at player potential and recovery at full Energy',()=>{
  const s=initial();s.resources.ENERGY=100;s.roster=s.roster.map(p=>({...p,stats:{...p.stats,strength:p.maxStat}}));
  const start=act(s,{type:'development.start',unit:'ALL',steps:[steps[0],steps[3]]}),end=start.development!.schedule!.blocks.at(-1)!.finishTime,done=settleClubState(start,end);
  expect(done.roster[0].stats.strength).toBe(s.roster[0].maxStat);expect(done.roster[0].level).toBe(s.roster[0].level);expect(done.resources.ENERGY).toBe(100);
 });
 it('rejects forged schedule data, unknown stations, unbounded queues and extra keys',()=>{
  for(const steps of [[],[{station:'stadium',play:'slants'}],Array(7).fill({station:'rehab',play:'slants'}),[{station:'rehab',play:'slants',reward:999}]])expect(parseClubAction({type:'development.start',unit:'ALL',steps})).toBeNull();
  expect(()=>parseSavedClub(JSON.stringify({...initial(),development:{schedule:{blocks:[null]},reports:[],mastery:{}}}))).toThrow();
 });
});
describe('recruiting relationships and agent network',()=>{
 it('finds different prospects through the paid network and timed scouting pool',()=>{
  const s=initial(),paid=act(s,{type:'scouting.search',tier:'local',pace:'coins'}),free=act(s,{type:'scouting.search',tier:'local',pace:'time'});
  const a=settleClubState(paid,NOW+15000).scouting!.prospects[0],b=settleClubState(free,NOW+120000).scouting!.prospects[0];
  expect(paid.resources.COINS).toBe(s.resources.COINS-120);expect(free.resources.COINS).toBe(s.resources.COINS);
  expect(a.source).toBe('agent');expect(a.interest).toBe(100);expect(b.interest).toBe(0);expect(a.player.stats.strength).toBeGreaterThan(b.player.stats.strength);expect(b.player.maxStat).toBeGreaterThan(a.player.maxStat);
 });
 it('requires each relationship activity once then signs for no Coins',()=>{
  let s=act(initial(),{type:'scouting.search',tier:'local',pace:'time'});s=settleClubState(s,NOW+120000);const id=s.scouting!.prospects[0].player.id;
  for(const contact of ['call','praise','visit','tour'] as const){s=act(s,{type:'scouting.contact',playerId:id,contact});const job=s.scouting!.prospects[0].job!;expect(applyClubAction(s,{type:'scouting.contact',playerId:id,contact},{now:s.lastTick,random:()=>.4}).ok).toBe(false);s=settleClubState(s,job.finishTime);expect(applyClubAction(s,{type:'scouting.contact',playerId:id,contact},{now:s.lastTick,random:()=>.4}).ok).toBe(false);}
  expect(s.scouting!.prospects[0].interest).toBe(100);const count=s.roster.length,coins=s.resources.COINS;s=act(s,{type:'scouting.sign',playerId:id});expect(s.roster).toHaveLength(count+1);expect(s.resources.COINS).toBe(coins);expect(applyClubAction(s,{type:'scouting.sign',playerId:id},{now:s.lastTick,random:()=>.4}).ok).toBe(false);
 });
 it('locks tiers to building progress, preserves trips and respects roster capacity',()=>{
  let s=initial();expect(applyClubAction(s,{type:'scouting.search',tier:'national',pace:'coins'},{now:NOW,random:()=>.4}).ok).toBe(false);
  s.buildings=s.buildings.map(b=>({...b,level:5}));s=act(s,{type:'scouting.search',tier:'national',pace:'coins'});expect(parseSavedClub(JSON.stringify(s)).scouting).toEqual(s.scouting);
  const done=settleClubState(s,NOW+15000);expect(done.scouting!.prospects[0].player.rarity).toBe('LEGENDARY');
  expect(settleClubState(done,NOW+30000).scouting!.prospects).toHaveLength(1);
 });
});
describe('player-present Stadium football',()=>{
 it('never advances a possession from elapsed time alone',()=>{
  const s=act(initial(),{type:'stadium.start',opponent:'harbor'});expect(s.resources.ENERGY).toBe(30);expect(settleClubState(s,NOW+86400000).stadiumFootball).toEqual(s.stadiumFootball);
  expect(applyClubAction(s,{type:'facility.upgrade',buildingId:'stadium-1'},{now:NOW,random:()=>.4}).ok).toBe(false);
 });
 it('completes two possessions, permits ties, restores the exact next decision and rewards once',()=>{
  const outcomes=new Set<string>();
  for(const roll of [.01,.15,.3,.4,.5,.6,.7,.85,.99]){
   let s=act(initial(),{type:'stadium.start',opponent:'harbor'});let n=0;
   while(s.stadiumFootball!.game!.phase!=='final'&&n++<12){const g=s.stadiumFootball!.game!,call=footballCalls(g)[0].key;const action={type:'stadium.call' as const,gameId:g.id,turn:String(g.turn),call};s=act(parseSavedClub(JSON.stringify(s)),action,s.lastTick,roll);expect(applyClubAction(s,action,{now:s.lastTick,random:()=>roll}).ok).toBe(false);}
   const g=s.stadiumFootball!.game!;expect(g.phase).toBe('final');expect(new Set(g.events.map(e=>e.possession))).toEqual(new Set(['home','away']));expect(g.possessionIndex).toBe(1);outcomes.add(g.home===g.away?'tie':g.home>g.away?'win':'loss');
   const coins=s.resources.COINS;s=act(s,{type:'stadium.collect',gameId:g.id});expect(s.resources.COINS).toBe(coins+g.reward);expect(s.stadiumFootball!.history).toHaveLength(1);expect(applyClubAction(s,{type:'stadium.collect',gameId:g.id},{now:s.lastTick,random:()=>.4}).ok).toBe(false);
  }
  expect(outcomes.has('tie')).toBe(true);
 });
 it('lets an overwhelmingly better return team break a kickoff when it receives',()=>{
  // random 0.8 wins the toss for the home club, so the first decision really is a return lane.
  const s=initial();s.roster=s.roster.map(p=>({...p,level:40,stats:{strength:80,speed:80,iq:80}}));
  const started=applyClubAction(s,{type:'stadium.start',opponent:'harbor'},{now:NOW,random:()=>.8});
  expect(started.ok).toBe(true);if(!started.ok)return;
  const g=started.state.stadiumFootball!.game!;expect(g.receivesFirst).toBe('home');expect(g.possession).toBe('home');
  const next=applyClubAction(started.state,{type:'stadium.call',gameId:g.id,turn:'0',call:footballCalls(g)[0].key},{now:NOW,random:()=>.001});
  expect(next.ok).toBe(true);if(!next.ok)return;
  const after=next.state.stadiumFootball!.game!;
  expect(after.home).toBe(6);expect(after.phase).toBe('conversion');
  expect(after.events[0].title).toContain('return touchdown');
  expect(after.events[0].action).toBe('touchdown');expect(after.events[0].endYard).toBe(100);
 });
 it('charges forfeits, produces no reward, rejects forged calls/results',()=>{
  let s=act(initial(),{type:'stadium.start',opponent:'harbor'}),id=s.stadiumFootball!.game!.id;
  expect(parseClubAction({type:'stadium.call',gameId:id,turn:'0',call:'touchdown',reward:999})).toBeNull();
  expect(applyClubAction(s,{type:'stadium.call',gameId:id,turn:'0',call:'touchdown'},{now:NOW,random:()=>.4}).ok).toBe(false);
  s=act(s,{type:'stadium.abandon',gameId:id});expect(s.stadiumFootball!.game!.reward).toBe(0);expect(s.resources.ENERGY).toBe(30);expect(parseSavedClub(JSON.stringify(s)).stadiumFootball).toEqual(s.stadiumFootball);
 });
});

describe('ending a schedule deliberately',()=>{
 it('returns only prepaid future Energy and cannot refund twice',()=>{
  const s=act(initial(),{type:'development.start',unit:'ALL',steps:[...steps]}),schedule=s.development!.schedule!;
  const stopped=act(s,{type:'development.stop',scheduleId:schedule.id});expect(stopped.resources.ENERGY).toBe(32);expect(stopped.roster[0].stats).toEqual(initial().roster[0].stats);expect(stopped.development!.schedule).toBeNull();
  expect(applyClubAction(stopped,{type:'development.stop',scheduleId:schedule.id},{now:NOW,random:()=>.4}).ok).toBe(false);
 });
});
