import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {keyIndoorMatte,indoorPlayerColumn} from '../game/indoorPlayers';
import bounds from '../art/players/indoor-atlas-v1.json';
import {UnitGroup} from '../types';

describe('indoor art composition',()=>{
 it('keys the production matte without touching skin, neutral equipment or navy cloth',()=>{
  const pixels=new Uint8ClampedArray([255,0,255,255,241,172,119,255,30,52,80,255,65,65,65,255]);
  keyIndoorMatte(pixels);
  expect(pixels[3]).toBe(0);expect([...pixels.slice(4)]).toEqual([241,172,119,255,30,52,80,255,65,65,65,255]);
 });
 it('all four groups have complete, bounded, aligned poses with transparent margins',async()=>{
  expect(new Set(Object.values(indoorPlayerColumn)).size).toBe(Object.values(UnitGroup).length);
  const {data,info}=await sharp(readFileSync(new URL('../art/players/indoor-atlas-v1.webp',import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(const poses of bounds){
   expect(poses).toHaveLength(3);expect(new Set(poses.map(p=>`${p.w}:${p.h}`)).size).toBe(1);
   for(const p of poses){
    expect(p.x).toBeGreaterThanOrEqual(0);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.x+p.w).toBeLessThanOrEqual(info.width);expect(p.y+p.h).toBeLessThanOrEqual(info.height);
    const pixels=new Uint8ClampedArray(p.w*p.h*4);
    for(let y=0;y<p.h;y++)pixels.set(data.subarray(((y+p.y)*info.width+p.x)*4,((y+p.y)*info.width+p.x+p.w)*4),y*p.w*4);
    keyIndoorMatte(pixels);
    for(let x=0;x<p.w;x++){expect(pixels[x*4+3]).toBe(0);expect(pixels[((p.h-1)*p.w+x)*4+3]).toBe(0);}
    let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>200)opaque++;
    expect(opaque/(p.w*p.h)).toBeGreaterThan(.3);expect(opaque/(p.w*p.h)).toBeLessThan(.9);
   }
  }
 });
});
