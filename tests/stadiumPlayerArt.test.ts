import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
import manifest from '../art/players/stadium/poses-v1.json';
describe('Stadium action atlas',()=>{
 it('contains 32 isolated transparent poses with clear cell margins',async()=>{
  const {data,info}=await sharp('art/players/stadium/poses-v1.webp').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  expect(info.width).toBe(1024);expect(info.height).toBe(640);expect(manifest.frames).toHaveLength(32);
  for(let frame=0;frame<32;frame++){
   let opaque=0;
   for(let y=0;y<160;y++)for(let x=0;x<128;x++){
    const alpha=data[((Math.floor(frame/8)*160+y)*info.width+(frame%8)*128+x)*4+3];
    if(alpha)opaque++;
    if(x===0||x===127||y===0||y===159)expect(alpha).toBe(0);
   }
   expect(opaque).toBeGreaterThan(500);
  }
 });
});
