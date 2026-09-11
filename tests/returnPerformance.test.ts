import {describe,it,expect} from 'vitest';
import {returnPerformance} from '../game/presentation/returnPerformance';
describe('return presentation',()=>{
 it('finishes at the specified spot in either direction',()=>{
  for(const [start,end,d] of [[20,47,1],[80,53,-1],[20,100,1]] as const){
   const frame=returnPerformance(start,end,'left',1,d);
   expect(frame.actors.find(a=>a.id==='returner')?.x).toBe(end);
   expect(frame.actors).toHaveLength(22);
  }
 });
 it('uses the selected side and does not move all players with the ball',()=>{
  expect(returnPerformance(20,47,'left',.6).ball.y).toBeLessThan(returnPerformance(20,47,'right',.6).ball.y);
  const a=returnPerformance(20,47,'left',.7),b=returnPerformance(20,47,'left',1);
  expect(a.actors.find(p=>p.id==='block-1')?.x).toBe(b.actors.find(p=>p.id==='block-1')?.x);
  expect(a.ball.x).not.toBe(b.ball.x);
 });
 it('is deterministic and keeps all players within field width',()=>{
  for(const lane of ['left','middle','right'] as const)for(let i=0;i<=100;i++){
   const a=returnPerformance(20,100,lane,i/100);
   expect(a).toEqual(returnPerformance(20,100,lane,i/100));
   expect(a.actors.every(p=>p.y>=0&&p.y<=53.333)).toBe(true);
  }
 });
});
