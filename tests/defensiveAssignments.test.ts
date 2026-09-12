import {describe,it,expect} from 'vitest';
import {defensiveAssignments,type DefensiveContext} from '../game/presentation/defensiveAssignments';
const c:DefensiveContext={start:40,end:52,direction:1,away:false,time:1,active:true,kind:'run',call:'stack',target:{x:52,y:29},receivers:[{x:52,y:20},{x:55,y:20},{x:55,y:32},{x:55,y:44}],scored:false,complete:true};
describe('Defensive assignments',()=>{
 it('mirrors every assignment when possession changes ends',()=>{
  for(const time of [0,.2,.5,.8,1]){
   const a=defensiveAssignments({...c,time});
   const b=defensiveAssignments({...c,time,start:60,end:48,direction:-1,target:{x:48,y:29}});
   a.forEach((p,i)=>{expect(p.x+b[i].x).toBeCloseTo(100);expect(p.y).toBe(b[i].y);});
  }
 });
 it('finishes a stopped run with one tackler and a score with none',()=>{
  expect(defensiveAssignments(c).filter(p=>p.pose===23)).toHaveLength(1);
  expect(defensiveAssignments({...c,scored:true}).filter(p=>p.pose===23)).toHaveLength(0);
 });
 it('holds deep zone defenders until the throw while man defenders follow their receiver',()=>{
  const zone=defensiveAssignments({...c,kind:'pass',call:'zone',time:.65});
  const man=defensiveAssignments({...c,kind:'pass',call:'man',time:.65});
  expect(zone.find(p=>p.id==='db5')?.x).toBe(63);
  expect(man.find(p=>p.id==='db3')?.y).not.toBe(zone.find(p=>p.id==='db3')?.y);
 });
 it('keeps dense samples continuous instead of teleporting at phase changes',()=>{
  for(const kind of ['run','pass','kick'] as const){
   let previous=defensiveAssignments({...c,kind,time:0});
   for(let i=1;i<=520;i++){
    const next=defensiveAssignments({...c,kind,time:i/520});
    next.forEach((p,j)=>expect(Math.hypot(p.x-previous[j].x,p.y-previous[j].y)).toBeLessThan(.8));
    previous=next;
   }
  }
 });
});
