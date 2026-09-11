import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
import {readFileSync} from 'node:fs';
import {keyIndoorMatte} from '../game/indoorPlayers';

describe('room activity artwork',()=>{
 for(const [name,poses]of [['squat',2],['mobility',2],['recovery',3],['film',1]] as const)it(`${name} has complete keyed figures for all four groups`,async()=>{
  const version=name==='recovery'?2:1;
  const bounds=JSON.parse(readFileSync(new URL(`../art/players/indoor-${name}-v${version}.json`,import.meta.url),'utf8'));
  const {data,info}=await sharp(new URL(`../art/players/indoor-${name}-v${version}.webp`,import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  expect(bounds).toHaveLength(4);
  for(const frames of bounds){expect(frames).toHaveLength(poses);for(const p of frames){
   expect(p.x+p.w).toBeLessThanOrEqual(info.width);expect(p.y+p.h).toBeLessThanOrEqual(info.height);
   const pixels=new Uint8ClampedArray(p.w*p.h*4);for(let y=0;y<p.h;y++)pixels.set(data.subarray(((p.y+y)*info.width+p.x)*4,((p.y+y)*info.width+p.x+p.w)*4),y*p.w*4);keyIndoorMatte(pixels);
   let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>200)opaque++;expect(opaque).toBeGreaterThan(7000);
   for(let x=0;x<p.w;x++){expect(pixels[x*4+3]).toBe(0);expect(pixels[((p.h-1)*p.w+x)*4+3]).toBe(0);}
   for(let y=0;y<p.h;y++){expect(pixels[(y*p.w)*4+3]).toBe(0);expect(pixels[(y*p.w+p.w-1)*4+3]).toBe(0);}
  }}
 });
});
