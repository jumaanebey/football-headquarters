import {describe,it,expect} from 'vitest';
import {stadiumPerformance} from '../game/presentation/stadiumPerformance';
import type {FootballEvent,StadiumFootballGame} from '../game/stadiumFootball';
const event:FootballEvent={turn:1,phase:'offense',call:'zone',title:'They gain 12 yards',detail:'',home:0,away:0,yards:12,play:'slants',action:'stop',possession:'away',direction:-1,startYard:60,endYard:48,scored:0};
const game=(e:FootballEvent)=>({id:'presentation',opponent:'harbor',phase:'finish',turn:2,startedAt:0,home:0,away:0,yardLine:e.endYard,ratings:{attack:40,defense:40,speed:15,power:15,iq:15,readiness:0,mastery:{}},events:[e],collected:false,reward:0,possession:e.possession,v:2} as StadiumFootballGame);
describe('Stadium performance',()=>{
 it('renders 11 per side and respects persisted direction and finish',()=>{
  const s=stadiumPerformance(game(event),1);
  expect(s.actors).toHaveLength(22);expect(s.actors.filter(a=>a.away)).toHaveLength(11);
  expect(s.actors.find(a=>a.id==='wr0')?.x).toBe(48);
  expect(s.actors.find(a=>a.id==='wr0')?.facing).toBe(-1);
 });
 it('stages defensive calls differently without modifying the event',()=>{
  const source=game(event),before=JSON.stringify(source);
  const zone=stadiumPerformance(source,.8),man=stadiumPerformance(game({...event,call:'man'}),.8);
  expect(zone.actors.find(a=>a.id==='db5')).not.toEqual(man.actors.find(a=>a.id==='db5'));
  expect(JSON.stringify(source)).toBe(before);
 });
 it('uses different kick paths for made and missed kicks',()=>{
  const e={...event,action:'field-goal' as const,phase:'finish' as const,play:undefined};
  const good=stadiumPerformance(game({...e,scored:3}),1),miss=stadiumPerformance(game({...e,scored:0}),1);
  expect(good.ball.x).toBe(-10);expect(good.ball.y).not.toBe(miss.ball.y);
 });
 it('keeps kick protection in place and the holder seven yards deep',()=>{
  const e={...event,action:'field-goal' as const,phase:'finish' as const,play:undefined};
  const first=stadiumPerformance(game(e),0),last=stadiumPerformance(game(e),1);
  expect(last.actors.find(a=>a.id==='qb')?.x).toBe(67);
  expect(first.actors.find(a=>a.id==='wr0')?.x).toBe(last.actors.find(a=>a.id==='wr0')?.x);
 });
 it('holds legacy events rather than inventing animated geometry',()=>{
  const s=stadiumPerformance(game({...event,startYard:undefined,endYard:undefined}),.5);
  expect(s.animated).toBe(false);
 });
 it('uses the return choreography for kickoff touchdowns too',()=>{
  const s=stadiumPerformance(game({...event,phase:'return',action:'touchdown',startYard:80,endYard:0,scored:6}),1);
  expect(s.actors.find(a=>a.id==='returner')?.x).toBe(0);
  expect(s.ball.visible).toBe(false);
 });
});
