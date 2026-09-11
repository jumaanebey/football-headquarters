import {describe,it,expect} from 'vitest';
import {tintUniformPixels} from '../game/teamKit';
import {CLUB_STYLES} from '../game/clubStyle';
describe('uniform material palettes',()=>{
 it('preserves skin, leather, orange trim, whites, outlines and transparency',()=>{const p=new Uint8ClampedArray([210,140,85,255,95,43,19,255,248,124,22,255,245,245,245,255,8,9,12,255,20,40,65,0]);const before=p.slice();tintUniformPixels(p,'#7c3aed');expect(p).toEqual(before);});
 it('recolors navy cloth differently for every kit without changing alpha',()=>{const outputs=CLUB_STYLES.map(kit=>{const p=new Uint8ClampedArray([25,40,65,220]);tintUniformPixels(p,kit.primary);expect(p[3]).toBe(220);expect([...p.slice(0,3)]).not.toEqual([25,40,65]);return [...p].join(',')});expect(new Set(outputs).size).toBe(4);});
 it('keeps light cloth brighter than shaded cloth and rejects malformed colors',()=>{const p=new Uint8ClampedArray([20,35,60,255,65,85,115,255]);tintUniformPixels(p,'#2563eb');expect(p[6]).toBeGreaterThan(p[2]);const old=p.slice();tintUniformPixels(p,'bad');expect(p).toEqual(old);});
});

import {vi,afterEach} from 'vitest';
import {teamKitFrame,teamKitCacheStats,clearTeamKitFrames} from '../game/teamKit';
afterEach(()=>{clearTeamKitFrames();vi.unstubAllGlobals();});
it('keeps native frame dimensions and evicts by bytes without shrinking the art',()=>{
 vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:(_x:number,_y:number,w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})})});
 const source={width:384,height:384} as HTMLCanvasElement;
 const frame=teamKitFrame(source,CLUB_STYLES[0]);
 expect([frame.width,frame.height]).toEqual([384,384]);
 expect(teamKitFrame(source,CLUB_STYLES[0])).toBe(frame);
 for(let i=0;i<65;i++)teamKitFrame({width:384,height:384} as HTMLCanvasElement,CLUB_STYLES[1]);
 expect(teamKitCacheStats().bytes).toBeLessThanOrEqual(teamKitCacheStats().maxBytes);
 expect(teamKitCacheStats().frames).toBeLessThan(65);
 clearTeamKitFrames();expect(teamKitCacheStats().bytes).toBe(0);
});
