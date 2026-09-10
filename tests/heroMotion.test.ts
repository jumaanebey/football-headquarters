import {describe,it,expect}from'vitest';import{advanceHeroMotion}from'../game/heroMotion';import{HERO_MOTION_BOUNDS}from'../game/heroMotionBounds';import{firstMatchLesson}from'../game/firstMatchLesson';import sharp from'sharp';
describe('authored hero motion',()=>{
 it('uses a directional brace on contact and returns to idle after the hit',()=>{const idle=advanceHeroMotion(undefined,{x:4,y:4},0,'qb');expect(advanceHeroMotion(idle.state,{x:4,y:4},.05,'qb').frame).toBe(0);const hit=advanceHeroMotion(idle.state,{x:4,y:4,hitFlash:.1},1,'qb');expect(hit.frame).toBe(32);expect(advanceHeroMotion(hit.state,{x:4,y:4,hitFlash:0},1.2,'qb').frame).toBe(0);});
 it('selects four projected directions without flipping the artwork',()=>{const origin={x:50,y:50,moving:false,direction:0,changedAt:0};for(const [x,y,direction] of [[49,51,0],[51,49,1],[49,49.2,2],[49.2,49,3]]){const sample=advanceHeroMotion(origin,{x,y,moving:true},1,'enforcer');expect(sample.state.direction).toBe(direction);expect(Math.floor(sample.frame/8)).toBe(direction);}});
 it('plants into a direction change before resuming the stride',()=>{const previous={x:50,y:50,moving:true,direction:0,changedAt:0};const turned=advanceHeroMotion(previous,{x:51,y:49,moving:true},1,'enforcer');expect(turned.frame).toBe(14);expect(advanceHeroMotion(turned.state,{x:52,y:48,moving:true,stridePhase:.6},1.2,'enforcer').frame).toBe(12);});
 it('starts, strides, plants and keeps facing when stopped',()=>{const start=advanceHeroMotion(undefined,{x:0,y:0,moving:true},0,'enforcer');expect(start.frame%8).toBe(1);const run=advanceHeroMotion(start.state,{x:1,y:2,moving:true,stridePhase:.6},.2,'enforcer');expect(run.frame%8).toBe(4);const plant=advanceHeroMotion(run.state,{x:1,y:2,moving:false},.3,'enforcer');expect(plant.frame%8).toBe(6);expect(plant.state.direction).toBe(run.state.direction);});
 it('has 32 complete registered source regions per hero',async()=>{for(const key of ['qb','enforcer']){const meta=await sharp(`public/assets/heroes/motion/${key}.webp`).metadata();const bounds=HERO_MOTION_BOUNDS[key];expect(bounds).toHaveLength(32);for(const [x,y,r,b]of bounds){expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);expect(r).toBeLessThanOrEqual(meta.width!);expect(b).toBeLessThanOrEqual(meta.height!);expect(r-x).toBeGreaterThan(50);expect(b-y).toBeGreaterThan(100);}}});
});
describe('first match guidance',()=>{it('only advances after player deployment and signature command',()=>{expect(firstMatchLesson(false,false,false).step).toBe(1);expect(firstMatchLesson(true,false,false).step).toBe(2);expect(firstMatchLesson(true,true,false).step).toBe(3);expect(firstMatchLesson(true,false,true).title).toContain('practice');});});
describe('complete roster movement',()=>{
 for(const key of ['coach','kicker','burner','medic','captain','playmaker','legend']) {
  it(`${key} has four independently authored directions and reactions`,async()=>{
   const meta=await sharp(`public/assets/heroes/motion/${key}.webp`).metadata();
   expect(HERO_MOTION_BOUNDS[key]).toHaveLength(36);
   for(const [x,y,r,b] of HERO_MOTION_BOUNDS[key]) {expect(r-x).toBeGreaterThan(50);expect(b-y).toBeGreaterThan(100);expect(r).toBeLessThanOrEqual(meta.width!);expect(b).toBeLessThanOrEqual(meta.height!);}
   for(let direction=0;direction<4;direction++){
    const prior={x:50,y:50,moving:true,direction,changedAt:0};
    expect(advanceHeroMotion(prior,{x:50,y:50,moving:true,stridePhase:.5},1,key).frame).toBe(direction*9+4);
    expect(advanceHeroMotion(prior,{x:50,y:50,hitFlash:.1},1,key).frame).toBe(direction*9+8);
    const stopped=advanceHeroMotion(prior,{x:50,y:50},1,key);
    expect(stopped.frame).toBe(direction*9+6);
    expect(advanceHeroMotion(stopped.state,{x:50,y:50},1.2,key).frame).toBe(direction*9);
   }
  });
 }
});
