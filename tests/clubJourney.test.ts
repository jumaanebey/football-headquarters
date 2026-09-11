import {describe,it,expect} from 'vitest';
import {createInitialState} from '../game/initialState';
import {applyClubAction,settleClubState,type ClubAction} from '../game/authority/clubActions';
import {clubNextStep,playerWork,journeyTime} from '../game/presentation/clubJourney';
const now=1789140000000;
const act=(s:ReturnType<typeof createInitialState>,action:ClubAction)=>{const r=applyClubAction(s,action,{now,random:()=>.4});if(!r.ok)throw Error(r.message);return r.state;};
describe('connected campus activity',()=>{
 it('does not claim ambient attendance is a scheduled player activity',()=>{
  const s=createInitialState(now);
  for(const p of s.roster)expect(playerWork(s,p.id)).toMatchObject({state:'available',title:'Available'});
 });
 it('follows only the assigned group and keeps an elapsed unconfirmed timer pending',()=>{
  let s=createInitialState(now);const group=s.roster[0].unit;
  s=act(s,{type:'development.start',unit:group,steps:[{station:'film',play:'slants'}]});
  const end=s.development!.schedule!.blocks[0].finishTime;
  expect(clubNextStep(s)).toMatchObject({destination:'film',state:'active'});
  expect(journeyTime(end,end+1000)).toBe('Awaiting confirmation');
  for(const p of s.roster)expect(playerWork(s,p.id).state).toBe(p.unit===group?'active':'available');
  const done=settleClubState(s,end);
  expect(clubNextStep(done)).toMatchObject({destination:'film',state:'ready',title:'Film Room results'});
  expect(done.roster.filter(p=>p.stats.iq>10).length).toBe(s.roster.filter(p=>p.unit===group).length);
 });
 it('routes reports to their own room and moves on after all reports are read',()=>{
  const s=act(createInitialState(now),{type:'development.start',unit:'ALL',steps:[{station:'practice',play:'slants'}]});
  const done=settleClubState(s,s.development!.schedule!.blocks[0].finishTime);
  expect(clubNextStep(done).destination).toBe('practice');
  const read=applyClubAction(done,{type:'development.read',reportId:done.development!.reports[0].id},{now:done.lastTick,random:()=>.4});
  expect(read.ok).toBe(true);expect(clubNextStep(read.state).state).toBe('available');
 });
 it('prioritizes a pending Stadium game over preparation prompts',()=>{
  const s=act(createInitialState(now),{type:'stadium.start',opponent:'harbor'});
  expect(clubNextStep(s)).toMatchObject({destination:'stadium',state:'active',action:'Resume game'});
  const conceded=act(s,{type:'stadium.abandon',gameId:s.stadiumFootball!.game!.id});
  expect(clubNextStep(conceded)).toMatchObject({destination:'stadium',state:'ready',action:'Review result'});
 });
 it('shows scouting as active until settlement creates the prospect',()=>{
  const s=act(createInitialState(now),{type:'scouting.search',tier:'local',pace:'coins'});
  expect(clubNextStep({...s,teamReadiness:100})).toMatchObject({destination:'scouting',state:'active'});
  const done=settleClubState(s,s.scouting!.trip!.finishTime);
  expect(clubNextStep(done)).toMatchObject({destination:'scouting',state:'ready',action:'Meet prospect'});
 });
});
