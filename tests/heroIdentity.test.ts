import {describe,it,expect} from 'vitest';
import {HERO_MOVEMENT_STYLE,heroMovementStyle,heroLocomotionPose} from '../game/heroMovementStyle';
import {advanceHeroMotion} from '../game/heroMotion';
import {heroPatrol} from '../game/heroPatrol';
describe('cosmetic hero identity',()=>{
 it('settles actors that report moving without displacement and holds facing',()=>{
  const start=advanceHeroMotion(undefined,{x:1,y:1,moving:true,stridePhase:0},0,'burner');
  const stalled=advanceHeroMotion(start.state,{x:1,y:1,moving:true,stridePhase:.3},.1,'burner');
  expect(stalled.state.moving).toBe(false);expect(stalled.state.direction).toBe(start.state.direction);
  const idle=advanceHeroMotion(stalled.state,{x:1,y:1,moving:true},1,'burner');expect(idle.frame%9).toBe(0);
 });
 it('does not advance transitions or cadence when the simulation clock is paused',()=>{
  const start=advanceHeroMotion(undefined,{x:1,y:1,moving:true},0,'qb');
  const actor={x:2,y:2,moving:true,stridePhase:.25};
  const a=advanceHeroMotion(start.state,actor,.1,'qb');const b=advanceHeroMotion(a.state,actor,.1,'qb');
  expect(b).toEqual(a);
 });
 it('different heroes cover the same path with distinct foot cadence without changing actor data',()=>{
  const actor={x:2,y:2,moving:true,stridePhase:.3};const copy={...actor};
  const phases=Object.keys(HERO_MOVEMENT_STYLE).map(key=>{
   const initial=advanceHeroMotion(undefined,{x:1,y:1,moving:true,stridePhase:0},0,key);
   return advanceHeroMotion(initial.state,actor,.3,key).state.visualPhase;
  });expect(new Set(phases).size).toBe(9);expect(actor).toEqual(copy);
 });
 it('has nine campus rhythms without requiring battle sheets',()=>{
  const cycles=Object.keys(HERO_MOVEMENT_STYLE).map(key=>heroPatrol(1,0,false,key).cycle);
  expect(new Set(cycles).size).toBe(9);
 });
 it('keeps reduced motion planted and handles legacy hero keys',()=>{
  expect(heroMovementStyle('old-save')).toBe(HERO_MOVEMENT_STYLE.qb);
  for(const key of Object.keys(HERO_MOVEMENT_STYLE)){
   expect(heroLocomotionPose(key,'walk',.2,0,true)).toEqual({lean:0,scaleY:1});
   expect(heroPatrol(4,0,true,key).mode).toBe('idle');
  }
 });
});
